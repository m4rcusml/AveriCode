"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  addExpectedContributor,
  addExpectedContributors,
  addRepositoryBranches,
  removeRepositoryBranch,
  setRepositoryMonitoring,
  updateRepositoryContributor
} from "@/lib/repository-config";
import { importInstallationRepositories } from "@/lib/github/installations";
import { getManualSyncCooldown, syncRepositoryActivity } from "@/lib/github/sync";
import { prisma } from "@/lib/prisma";
import { setSelectedWorkspaceForUser, getSelectedWorkspaceForUser } from "@/lib/workspace-selection";
import {
  addWorkspaceMember,
  assertRepositoryWriteAccess,
  assertWorkspaceWriteAccess,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  workspaceMemberRole
} from "@/lib/workspaces";

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function returnTo(formData: FormData, fallback: string) {
  const value = stringValue(formData, "returnTo");
  return value.startsWith("/") ? value : fallback;
}

function safeWorkspaceSwitchPath(pathname: string) {
  if (pathname === "/settings") {
    return "/settings";
  }

  if (pathname === "/dashboard") {
    return "/dashboard";
  }

  return "/dashboard";
}

async function workspaceSwitchDestination(formData: FormData) {
  const explicit = stringValue(formData, "returnTo");

  if (explicit.startsWith("/")) {
    return safeWorkspaceSwitchPath(explicit);
  }

  const referer = (await headers()).get("referer");

  if (!referer) {
    return "/dashboard";
  }

  try {
    const url = new URL(referer);
    return safeWorkspaceSwitchPath(url.pathname);
  } catch {
    return "/dashboard";
  }
}

function redirectWithSyncError(
  destination: string,
  error: string,
  params: Record<string, number | string | undefined> = {}
) {
  const url = new URL(destination, "http://avericode.local");
  url.searchParams.set("manual_sync_error", error);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  redirect(`${url.pathname}${url.search}`);
}

function redirectWithSettingsStatus(destination: string, params: Record<string, string>) {
  const url = new URL(destination, "http://avericode.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  redirect(`${url.pathname}${url.search}`);
}

function workspaceMemberErrorCode(error: unknown) {
  if (!(error instanceof Error)) {
    return "workspace_member_failed";
  }

  if (error.message === "Workspace user not found.") {
    return "workspace_member_not_found";
  }

  if (
    error.message === "Workspace owner cannot be removed." ||
    error.message === "Workspace owner role cannot be changed."
  ) {
    return "workspace_owner_protected";
  }

  if (error.message === "Owner or admin role required.") {
    return "workspace_permission_denied";
  }

  if (error.message === "User identifier is required.") {
    return "workspace_member_identifier_required";
  }

  return "workspace_member_failed";
}

function isRunningSyncError(error: unknown) {
  return error instanceof Error && error.message === "A sync is already running for this repository.";
}

function parseSuggestedContributor(value: FormDataEntryValue) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      githubUserId?: unknown;
      username?: unknown;
      avatarUrl?: unknown;
    };
    const username = typeof parsed.username === "string" ? parsed.username : null;

    if (!username) {
      return null;
    }

    return {
      githubUserId: typeof parsed.githubUserId === "string" ? parsed.githubUserId : null,
      username,
      name: username,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null
    };
  } catch {
    return null;
  }
}

async function syncAfterContributorAdded(repositoryId: string) {
  await syncRepositoryActivity({
    repositoryId,
    trigger: "MANUAL"
  });
}

export async function toggleRepositoryMonitoringAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const isActive = stringValue(formData, "isActive") === "true";
  const destination = returnTo(formData, "/dashboard");

  await setRepositoryMonitoring(user.id, repositoryId, isActive);
  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function switchWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const workspaceId = stringValue(formData, "workspaceId");
  const destination = await workspaceSwitchDestination(formData);

  await setSelectedWorkspaceForUser(user.id, workspaceId);

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect(destination);
}

export async function addExpectedContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, "/dashboard");

  await addExpectedContributor(user.id, repositoryId, {
    username: stringValue(formData, "username"),
    name: stringValue(formData, "name"),
    email: stringValue(formData, "email")
  });
  await syncAfterContributorAdded(repositoryId);

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function confirmExpectedContributorsAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, `/dashboard/repositories/${repositoryId}/contributors`);
  const contributors = formData
    .getAll("selectedContributor")
    .map(parseSuggestedContributor)
    .filter((contributor): contributor is NonNullable<typeof contributor> => contributor !== null);

  if (contributors.length > 0) {
    await addExpectedContributors(user.id, repositoryId, contributors);
    await syncAfterContributorAdded(repositoryId);
  } else {
    await assertRepositoryWriteAccess(user.id, repositoryId);
  }

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function removeExpectedContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryContributorId = stringValue(formData, "repositoryContributorId");
  const destination = returnTo(formData, "/dashboard");

  await updateRepositoryContributor(user.id, repositoryContributorId, {
    isExpected: false
  });

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function toggleIgnoredContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryContributorId = stringValue(formData, "repositoryContributorId");
  const isIgnored = stringValue(formData, "isIgnored") === "true";
  const destination = returnTo(formData, "/dashboard");

  await updateRepositoryContributor(user.id, repositoryContributorId, {
    isIgnored
  });

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function addRepositoryBranchesAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, `/dashboard/repositories/${repositoryId}/branches`);
  const branches = formData
    .getAll("selectedBranch")
    .filter((value): value is string => typeof value === "string");

  if (branches.length > 0) {
    await addRepositoryBranches(user.id, repositoryId, branches);
  } else {
    await assertRepositoryWriteAccess(user.id, repositoryId);
  }

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function removeRepositoryBranchAction(formData: FormData) {
  const user = await requireUser();
  const repositoryBranchId = stringValue(formData, "repositoryBranchId");
  const destination = returnTo(formData, "/dashboard");

  await removeRepositoryBranch(user.id, repositoryBranchId);

  revalidatePath("/dashboard");
  revalidatePath(destination);
  redirect(destination);
}

export async function syncRepositoryNowAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, "/dashboard");

  await assertRepositoryWriteAccess(user.id, repositoryId);
  const retryAfterMs = await getManualSyncCooldown(repositoryId);

  if (retryAfterMs > 0) {
    redirectWithSyncError(destination, "rate_limited", {
      retry_after_ms: retryAfterMs
    });
  }

  try {
    await syncRepositoryActivity({
      repositoryId,
      trigger: "MANUAL"
    });
  } catch (error) {
    if (isRunningSyncError(error)) {
      redirectWithSyncError(destination, "already_running");
    }

    throw error;
  }

  revalidatePath("/dashboard");
  redirect(destination);
}

export async function syncWorkspaceRepositoriesNowAction(formData: FormData) {
  const user = await requireUser();
  const destination = returnTo(formData, "/dashboard");
  const requestedWorkspaceId = stringValue(formData, "workspaceId");
  const workspace = requestedWorkspaceId ? { id: requestedWorkspaceId } : await getSelectedWorkspaceForUser(user.id);

  await assertWorkspaceWriteAccess(user.id, workspace.id);

  const repositories = await prisma.repository.findMany({
    where: {
      workspaceId: workspace.id,
      isActive: true
    },
    select: {
      id: true,
      fullName: true
    },
    orderBy: {
      fullName: "asc"
    }
  });

  if (repositories.length === 0) {
    redirectWithSyncError(destination, "no_active_repositories");
  }

  let succeededCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const repository of repositories) {
    const retryAfterMs = await getManualSyncCooldown(repository.id);

    if (retryAfterMs > 0) {
      skippedCount += 1;
      continue;
    }

    try {
      await syncRepositoryActivity({
        repositoryId: repository.id,
        trigger: "MANUAL"
      });
      succeededCount += 1;
    } catch (error) {
      if (isRunningSyncError(error)) {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  if (succeededCount > 0) {
    await prisma.syncRun.create({
      data: {
        workspaceId: workspace.id,
        trigger: "MANUAL",
        status: failedCount > 0 ? "FAILED" : "SUCCESS",
        finishedAt: new Date(),
        error:
          skippedCount > 0 || failedCount > 0
            ? `Manual workspace sync: ${succeededCount} succeeded, ${skippedCount} skipped, ${failedCount} failed.`
            : null
      }
    });
  }

  revalidatePath("/dashboard");

  if (succeededCount === 0) {
    redirectWithSyncError(destination, skippedCount > 0 ? "batch_skipped" : "batch_failed", {
      failed_count: failedCount,
      skipped_count: skippedCount
    });
  }

  if (skippedCount > 0 || failedCount > 0) {
    redirectWithSyncError(destination, "batch_partial", {
      failed_count: failedCount,
      skipped_count: skippedCount,
      synced_count: succeededCount
    });
  }

  redirect(destination);
}

export async function refreshInstallationRepositoriesAction(formData: FormData) {
  const user = await requireUser();
  const installationId = stringValue(formData, "installationId");
  const destination = returnTo(formData, "/dashboard");
  const installation = await prisma.gitHubInstallation.findUnique({
    where: { id: installationId },
    select: {
      id: true,
      workspaceId: true
    }
  });

  if (!installation) {
    throw new Error("GitHub installation not found.");
  }

  await assertWorkspaceWriteAccess(user.id, installation.workspaceId);
  await importInstallationRepositories(installation.id);

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect(destination);
}

export async function addWorkspaceMemberAction(formData: FormData) {
  const user = await requireUser();
  const workspaceId = stringValue(formData, "workspaceId");
  const destination = returnTo(formData, "/settings");

  try {
    await addWorkspaceMember(
      user.id,
      workspaceId,
      stringValue(formData, "identifier"),
      workspaceMemberRole(stringValue(formData, "role"))
    );
  } catch (error) {
    redirectWithSettingsStatus(destination, {
      settings_error: workspaceMemberErrorCode(error)
    });
  }

  revalidatePath("/settings");
  redirectWithSettingsStatus(destination, {
    settings_success: "workspace_member_added"
  });
}

export async function updateWorkspaceMemberRoleAction(formData: FormData) {
  const user = await requireUser();
  const workspaceMemberId = stringValue(formData, "workspaceMemberId");
  const destination = returnTo(formData, "/settings");

  try {
    await updateWorkspaceMemberRole(user.id, workspaceMemberId, workspaceMemberRole(stringValue(formData, "role")));
  } catch (error) {
    redirectWithSettingsStatus(destination, {
      settings_error: workspaceMemberErrorCode(error)
    });
  }

  revalidatePath("/settings");
  redirectWithSettingsStatus(destination, {
    settings_success: "workspace_member_updated"
  });
}

export async function removeWorkspaceMemberAction(formData: FormData) {
  const user = await requireUser();
  const workspaceMemberId = stringValue(formData, "workspaceMemberId");
  const destination = returnTo(formData, "/settings");

  try {
    await removeWorkspaceMember(user.id, workspaceMemberId);
  } catch (error) {
    redirectWithSettingsStatus(destination, {
      settings_error: workspaceMemberErrorCode(error)
    });
  }

  revalidatePath("/settings");
  redirectWithSettingsStatus(destination, {
    settings_success: "workspace_member_removed"
  });
}
