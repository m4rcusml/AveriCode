"use server";

import { revalidatePath } from "next/cache";
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
import {
  assertRepositoryWriteAccess,
  assertWorkspaceWriteAccess,
  getPrimaryWorkspaceForUser
} from "@/lib/workspaces";

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function returnTo(formData: FormData, fallback: string) {
  const value = stringValue(formData, "returnTo");
  return value.startsWith("/") ? value : fallback;
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
  const workspace = requestedWorkspaceId ? { id: requestedWorkspaceId } : await getPrimaryWorkspaceForUser(user.id);

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
