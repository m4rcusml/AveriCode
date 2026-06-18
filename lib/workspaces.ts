import { Prisma, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugs";

const WRITE_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN"];
const MEMBER_MANAGEMENT_ROLES: WorkspaceRole[] = ["ADMIN", "MEMBER"];

function cleanString(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeUsername(value: string | null | undefined) {
  return cleanString(value)?.replace(/^@/, "") ?? null;
}

function normalizeEmail(value: string | null | undefined) {
  return cleanString(value)?.toLowerCase() ?? null;
}

export function workspaceMemberRole(value: string | null | undefined): WorkspaceRole {
  return value === "ADMIN" ? "ADMIN" : "MEMBER";
}

export async function ensureDefaultWorkspaceForUser(userId: string, displayName?: string | null) {
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" }
  });

  if (existingMembership) {
    return existingMembership.workspace;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      githubUsername: true,
      email: true
    }
  });

  const ownerName =
    displayName ??
    user.name ??
    user.githubUsername ??
    user.email?.split("@")[0] ??
    "Personal";
  const workspaceName = `${ownerName} Workspace`;
  const workspaceSlug = slugify(`${ownerName}-${user.id.slice(0, 8)}`) || `workspace-${user.id.slice(0, 8)}`;

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      slug: workspaceSlug,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: "OWNER"
        }
      }
    }
  });
}

export async function getPrimaryWorkspaceForUser(userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });

  if (membership) {
    return membership.workspace;
  }

  return ensureDefaultWorkspaceForUser(userId);
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId
      }
    }
  });
}

export async function assertWorkspaceAccess(userId: string, workspaceId: string) {
  const membership = await getWorkspaceMembership(userId, workspaceId);

  if (!membership) {
    throw new Error("Workspace access denied.");
  }

  return membership;
}

export async function assertWorkspaceWriteAccess(userId: string, workspaceId: string) {
  const membership = await assertWorkspaceAccess(userId, workspaceId);

  if (!WRITE_ROLES.includes(membership.role)) {
    throw new Error("Owner or admin role required.");
  }

  return membership;
}

export async function addWorkspaceMember(
  actorUserId: string,
  workspaceId: string,
  identifier: string,
  role: WorkspaceRole
) {
  await assertWorkspaceWriteAccess(actorUserId, workspaceId);

  if (!MEMBER_MANAGEMENT_ROLES.includes(role)) {
    throw new Error("Only admin or member roles can be assigned from settings.");
  }

  const cleanedIdentifier = cleanString(identifier);

  if (!cleanedIdentifier) {
    throw new Error("User identifier is required.");
  }

  const username = normalizeUsername(cleanedIdentifier);
  const email = normalizeEmail(cleanedIdentifier);
  const userSearchConditions: Prisma.UserWhereInput[] = [];

  if (username) {
    userSearchConditions.push({
      githubUsername: {
        equals: username,
        mode: "insensitive"
      }
    });
  }

  if (email) {
    userSearchConditions.push({
      email: {
        equals: email,
        mode: "insensitive"
      }
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: userSearchConditions
    }
  });

  if (!user) {
    throw new Error("Workspace user not found.");
  }

  return prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id
      }
    },
    update: {
      role
    },
    create: {
      workspaceId,
      userId: user.id,
      role
    }
  });
}

export async function updateWorkspaceMemberRole(
  actorUserId: string,
  workspaceMemberId: string,
  role: WorkspaceRole
) {
  if (!MEMBER_MANAGEMENT_ROLES.includes(role)) {
    throw new Error("Only admin or member roles can be assigned from settings.");
  }

  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { id: workspaceMemberId },
    include: {
      workspace: {
        select: {
          id: true,
          ownerId: true
        }
      }
    }
  });

  if (!workspaceMember) {
    throw new Error("Workspace member not found.");
  }

  await assertWorkspaceWriteAccess(actorUserId, workspaceMember.workspace.id);

  if (workspaceMember.userId === workspaceMember.workspace.ownerId) {
    throw new Error("Workspace owner role cannot be changed.");
  }

  return prisma.workspaceMember.update({
    where: { id: workspaceMemberId },
    data: { role }
  });
}

export async function removeWorkspaceMember(actorUserId: string, workspaceMemberId: string) {
  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { id: workspaceMemberId },
    include: {
      workspace: {
        select: {
          id: true,
          ownerId: true
        }
      }
    }
  });

  if (!workspaceMember) {
    throw new Error("Workspace member not found.");
  }

  await assertWorkspaceWriteAccess(actorUserId, workspaceMember.workspace.id);

  if (workspaceMember.userId === workspaceMember.workspace.ownerId) {
    throw new Error("Workspace owner cannot be removed.");
  }

  return prisma.workspaceMember.delete({
    where: { id: workspaceMemberId }
  });
}

export async function assertRepositoryWriteAccess(userId: string, repositoryId: string) {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: {
      id: true,
      workspaceId: true
    }
  });

  if (!repository) {
    throw new Error("Repository not found.");
  }

  await assertWorkspaceWriteAccess(userId, repository.workspaceId);

  return repository;
}
