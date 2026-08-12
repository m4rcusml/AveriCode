import { prisma } from "@/lib/prisma";
import {
  addExpectedContributorsToRepository,
  type ContributorIdentityInput
} from "@/lib/contributors";
import { assertRepositoryWriteAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";

export async function addExpectedContributor(
  userId: string,
  repositoryId: string,
  input: ContributorIdentityInput
) {
  await assertRepositoryWriteAccess(userId, repositoryId);
  const [repositoryContributor] = await addExpectedContributorsToRepository(repositoryId, [input]);
  return repositoryContributor;
}

export async function addExpectedContributors(
  userId: string,
  repositoryId: string,
  inputs: ContributorIdentityInput[]
) {
  await assertRepositoryWriteAccess(userId, repositoryId);
  return addExpectedContributorsToRepository(repositoryId, inputs);
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
