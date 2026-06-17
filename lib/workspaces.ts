import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugs";

const WRITE_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN"];

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
