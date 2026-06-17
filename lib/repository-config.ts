import { prisma } from "@/lib/prisma";
import { assertRepositoryWriteAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";

type ContributorConfigInput = {
  githubUserId?: string | null;
  username?: string | null;
  name?: string | null;
  email?: string | null;
};

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

function contributorData(input: ContributorConfigInput) {
  return {
    githubUserId: cleanString(input.githubUserId) ?? undefined,
    username: normalizeUsername(input.username) ?? undefined,
    name: cleanString(input.name) ?? undefined,
    email: normalizeEmail(input.email) ?? undefined
  };
}

async function findOrCreateConfiguredContributor(input: ContributorConfigInput) {
  const data = contributorData(input);

  if (!data.githubUserId && !data.username && !data.email) {
    throw new Error("Expected contributor requires a GitHub username, GitHub user id, or email.");
  }

  if (data.githubUserId) {
    return prisma.contributor.upsert({
      where: { githubUserId: data.githubUserId },
      update: data,
      create: data
    });
  }

  if (data.username) {
    const existing = await prisma.contributor.findUnique({
      where: { username: data.username }
    });

    if (existing) {
      return prisma.contributor.update({
        where: { id: existing.id },
        data
      });
    }
  }

  if (data.email) {
    const existing = await prisma.contributor.findUnique({
      where: { email: data.email }
    });

    if (existing) {
      return prisma.contributor.update({
        where: { id: existing.id },
        data
      });
    }
  }

  return prisma.contributor.create({
    data
  });
}

export async function setRepositoryMonitoring(userId: string, repositoryId: string, isActive: boolean) {
  await assertRepositoryWriteAccess(userId, repositoryId);

  return prisma.repository.update({
    where: { id: repositoryId },
    data: { isActive }
  });
}

export async function addExpectedContributor(
  userId: string,
  repositoryId: string,
  input: ContributorConfigInput
) {
  await assertRepositoryWriteAccess(userId, repositoryId);
  const contributor = await findOrCreateConfiguredContributor(input);

  return prisma.repositoryContributor.upsert({
    where: {
      repositoryId_contributorId: {
        repositoryId,
        contributorId: contributor.id
      }
    },
    update: {
      isExpected: true,
      isIgnored: false
    },
    create: {
      repositoryId,
      contributorId: contributor.id,
      isExpected: true,
      isIgnored: false
    },
    include: {
      contributor: true
    }
  });
}

export async function updateRepositoryContributor(
  userId: string,
  repositoryContributorId: string,
  input: {
    isExpected?: boolean;
    isIgnored?: boolean;
  }
) {
  const repositoryContributor = await prisma.repositoryContributor.findUnique({
    where: { id: repositoryContributorId },
    include: {
      repository: {
        select: {
          workspaceId: true
        }
      }
    }
  });

  if (!repositoryContributor) {
    throw new Error("Repository contributor not found.");
  }

  await assertWorkspaceWriteAccess(userId, repositoryContributor.repository.workspaceId);

  return prisma.repositoryContributor.update({
    where: { id: repositoryContributorId },
    data: input
  });
}
