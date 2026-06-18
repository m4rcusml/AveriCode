import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess, getPrimaryWorkspaceForUser } from "@/lib/workspaces";

const ACTIVE_WORKSPACE_COOKIE = "avericode_active_workspace_id";
const PENDING_GITHUB_SETUP_WORKSPACE_COOKIE = "avericode_pending_github_setup_workspace_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const PENDING_COOKIE_MAX_AGE = 60 * 15;

export async function getWorkspaceOptionsForUser(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          _count: {
            select: {
              repositories: true
            }
          }
        }
      }
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
}

export async function getSelectedWorkspaceForUser(userId: string) {
  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  if (selectedWorkspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: selectedWorkspaceId,
          userId
        }
      },
      include: {
        workspace: true
      }
    });

    if (membership) {
      return membership.workspace;
    }
  }

  return getPrimaryWorkspaceForUser(userId);
}

export async function setSelectedWorkspaceForUser(userId: string, workspaceId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax"
  });
}

export async function getPendingGitHubSetupWorkspaceId() {
  const cookieStore = await cookies();
  return cookieStore.get(PENDING_GITHUB_SETUP_WORKSPACE_COOKIE)?.value ?? null;
}

export async function setPendingGitHubSetupWorkspaceForUser(userId: string, workspaceId: string) {
  await assertWorkspaceAccess(userId, workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(PENDING_GITHUB_SETUP_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    maxAge: PENDING_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax"
  });
}

export async function clearPendingGitHubSetupWorkspace() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_GITHUB_SETUP_WORKSPACE_COOKIE);
}
