import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess, getPrimaryWorkspaceForUser } from "@/lib/workspaces";

const ACTIVE_WORKSPACE_COOKIE = "avericode_active_workspace_id";
const PENDING_GITHUB_SETUP_STATE_COOKIE = "avericode_pending_github_setup_state";
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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function getPendingGitHubSetupState() {
  const cookieStore = await cookies();
  return cookieStore.get(PENDING_GITHUB_SETUP_STATE_COOKIE)?.value ?? null;
}

export async function setPendingGitHubSetupStateForUser(
  userId: string,
  workspaceId: string,
  setupState: string
) {
  await assertWorkspaceAccess(userId, workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(PENDING_GITHUB_SETUP_STATE_COOKIE, setupState, {
    httpOnly: true,
    maxAge: PENDING_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function clearPendingGitHubSetupState() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_GITHUB_SETUP_STATE_COOKIE);
}
