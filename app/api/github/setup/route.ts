import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { persistInstallationFromSetup } from "@/lib/github/installations";
import {
  clearPendingGitHubSetupWorkspace,
  getPendingGitHubSetupWorkspaceId,
  getSelectedWorkspaceForUser,
  setSelectedWorkspaceForUser
} from "@/lib/workspace-selection";
import { assertWorkspaceWriteAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

function redirectWithSetupError(request: NextRequest, params: Record<string, string>) {
  const redirectUrl = new URL("/dashboard", request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const installationId = request.nextUrl.searchParams.get("installation_id");

  if (!installationId) {
    await clearPendingGitHubSetupWorkspace();
    return redirectWithSetupError(request, {
      setup_error: "missing_installation_id",
      setup_action: request.nextUrl.searchParams.get("setup_action") ?? "unknown"
    });
  }

  const stateWorkspaceId = request.nextUrl.searchParams.get("state");
  const pendingWorkspaceId = await getPendingGitHubSetupWorkspaceId();
  const setupWorkspaceId = stateWorkspaceId ?? pendingWorkspaceId;
  const workspace = setupWorkspaceId
    ? { id: setupWorkspaceId }
    : await getSelectedWorkspaceForUser(session.user.id);

  try {
    await assertWorkspaceWriteAccess(session.user.id, workspace.id);
    const result = await persistInstallationFromSetup(workspace.id, installationId);
    await setSelectedWorkspaceForUser(session.user.id, workspace.id);
    await clearPendingGitHubSetupWorkspace();
    const nextRepository =
      result.newRepositories.length === 1
        ? result.newRepositories[0]
        : result.importedRepositories.length === 1
          ? result.importedRepositories[0]
          : null;
    const redirectUrl = new URL(
      nextRepository
        ? `/dashboard/repositories/${nextRepository.id}/contributors`
        : "/dashboard",
      request.nextUrl.origin
    );

    redirectUrl.searchParams.set("workspaceId", workspace.id);
    redirectUrl.searchParams.set("imported", String(result.importedCount));
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await clearPendingGitHubSetupWorkspace();
    const message = error instanceof Error ? error.message : "GitHub setup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
