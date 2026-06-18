import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getGitHubAppExternalInstallUrl } from "@/lib/github/install-url";
import {
  getSelectedWorkspaceForUser,
  setPendingGitHubSetupWorkspaceForUser,
  setSelectedWorkspaceForUser
} from "@/lib/workspace-selection";
import { assertWorkspaceWriteAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

function redirectWithInstallError(request: NextRequest, error: string) {
  const redirectUrl = new URL("/dashboard", request.nextUrl.origin);
  redirectUrl.searchParams.set("setup_error", error);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const workspace = requestedWorkspaceId
    ? { id: requestedWorkspaceId }
    : await getSelectedWorkspaceForUser(session.user.id);

  try {
    await assertWorkspaceWriteAccess(session.user.id, workspace.id);

    const installUrl = getGitHubAppExternalInstallUrl(workspace.id);

    if (!installUrl) {
      return redirectWithInstallError(request, "missing_github_app_slug");
    }

    await setSelectedWorkspaceForUser(session.user.id, workspace.id);
    await setPendingGitHubSetupWorkspaceForUser(session.user.id, workspace.id);

    return NextResponse.redirect(installUrl);
  } catch {
    return redirectWithInstallError(request, "workspace_permission_denied");
  }
}
