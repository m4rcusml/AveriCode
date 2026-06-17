import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { persistInstallationFromSetup } from "@/lib/github/installations";
import { getPrimaryWorkspaceForUser, assertWorkspaceWriteAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const installationId = request.nextUrl.searchParams.get("installation_id");

  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id." }, { status: 400 });
  }

  const stateWorkspaceId = request.nextUrl.searchParams.get("state");
  const workspace = stateWorkspaceId
    ? { id: stateWorkspaceId }
    : await getPrimaryWorkspaceForUser(session.user.id);

  try {
    await assertWorkspaceWriteAccess(session.user.id, workspace.id);
    const result = await persistInstallationFromSetup(workspace.id, installationId);
    const redirectUrl = new URL("/onboarding/repositories", request.nextUrl.origin);
    redirectUrl.searchParams.set("workspaceId", workspace.id);
    redirectUrl.searchParams.set("imported", String(result.importedCount));
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub setup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
