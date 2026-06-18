import { prisma } from "@/lib/prisma";
import { assertRepositoryWriteAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";

type ContributorConfigInput = {
  githubUserId?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
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
    avatarUrl: cleanString(input.avatarUrl) ?? undefined,
    email: normalizeEmail(input.email) ?? undefined
  };
}

async function findOrCreateConfiguredContributor(input: ContributorConfigInput) {
  const data = contributorData(input);

  if (!data.githubUserId && !data.username && !data.email) {
    throw new Error("Expected contributor requires a GitHub username, GitHub user id, or email.");
  }

  const existing = await prisma.contributor.findFirst({
    where: {
      OR: [
        data.githubUserId ? { githubUserId: data.githubUserId } : undefined,
        data.username ? { username: data.username } : undefined,
        data.email ? { email: data.email } : undefined
      ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
    }
  });

  if (existing) {
    return prisma.contributor.update({
      where: { id: existing.id },
      data
    });
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

export async function addExpectedContributors(
  userId: string,
  repositoryId: string,
  inputs: ContributorConfigInput[]
) {
  await assertRepositoryWriteAccess(userId, repositoryId);

  const results = [];

  for (const input of inputs) {
    const contributor = await findOrCreateConfiguredContributor(input);
    results.push(
      await prisma.repositoryContributor.upsert({
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
      })
    );
  }

  return results;
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

function normalizeBranchName(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export async function addRepositoryBranches(userId: string, repositoryId: string, branchNames: string[]) {
  const repository = await assertRepositoryWriteAccess(userId, repositoryId);
  const existingRepository = await prisma.repository.findUniqueOrThrow({
    where: { id: repository.id },
    select: {
      defaultBranch: true
    }
  });
  const defaultBranch = normalizeBranchName(existingRepository.defaultBranch);
  const uniqueBranchNames = [
    ...new Set(
      branchNames
        .map(normalizeBranchName)
        .filter((branchName): branchName is string => Boolean(branchName))
        .filter((branchName) => branchName !== defaultBranch)
    )
  ];

  for (const branchName of uniqueBranchNames) {
    await prisma.repositoryBranch.upsert({
      where: {
        repositoryId_name: {
          repositoryId,
          name: branchName
        }
      },
      update: {},
      create: {
        repositoryId,
        name: branchName
      }
    });
  }

  return uniqueBranchNames.length;
}

export async function removeRepositoryBranch(userId: string, repositoryBranchId: string) {
  const repositoryBranch = await prisma.repositoryBranch.findUnique({
    where: { id: repositoryBranchId },
    include: {
      repository: {
        select: {
          workspaceId: true
        }
      }
    }
  });

  if (!repositoryBranch) {
    throw new Error("Repository branch not found.");
  }

  await assertWorkspaceWriteAccess(userId, repositoryBranch.repository.workspaceId);

  return prisma.repositoryBranch.delete({
    where: { id: repositoryBranchId }
  });
}
