import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { verifyLinkableGitHubInstallation } from "@/lib/github/repository-access";
import { consumeGitHubSetupState } from "@/lib/github/setup-state-store";
import {
  clearPendingGitHubSetupState,
  getPendingGitHubSetupState,
  setSelectedWorkspaceForUser
} from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspaces";

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
    await clearPendingGitHubSetupState();
    return redirectWithSetupError(request, {
      setup_error: "missing_installation_id",
      setup_action: request.nextUrl.searchParams.get("setup_action") ?? "unknown"
    });
  }

  const stateToken = request.nextUrl.searchParams.get("state");
  const pendingState = await getPendingGitHubSetupState();

  try {
    await clearPendingGitHubSetupState();
    if (!stateToken || !pendingState || stateToken !== pendingState) {
      throw new Error("Invalid or already used GitHub setup state.");
    }
    const state = await consumeGitHubSetupState(stateToken, session.user.id);
    await assertWorkspaceAccess(session.user.id, state.workspaceId);
    await verifyLinkableGitHubInstallation(session.user.id, installationId);
    await setSelectedWorkspaceForUser(session.user.id, state.workspaceId);
    const redirectUrl = new URL("/settings/repositories", request.nextUrl.origin);
    redirectUrl.searchParams.set("workspaceId", state.workspaceId);
    redirectUrl.searchParams.set("installationId", installationId);
    redirectUrl.searchParams.set("setup", "github_complete");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await clearPendingGitHubSetupState();
    const redirectUrl = new URL("/settings/repositories", request.nextUrl.origin);
    const message = error instanceof Error ? error.message : "";
    redirectUrl.searchParams.set(
      "setup_error",
      message.includes("expired")
        ? "setup_state_expired"
        : message.includes("not available")
          ? "installation_not_authorized"
          : message.includes("authorization is missing")
            ? "github_reauthorization_required"
            : "invalid_setup_state"
    );
    return NextResponse.redirect(redirectUrl);
  }
}
