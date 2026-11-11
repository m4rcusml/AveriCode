import { prisma } from "@/lib/prisma";
import { assertRepositoryWriteAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";

type ExpectedContributorInput = { username?: string | null };

function configuredUsername(input: ExpectedContributorInput) {
  if (Object.keys(input).some((key) => key !== "username")) {
    throw new Error("Contributor configuration accepts only a GitHub username.");
  }
  const username = typeof input.username === "string" ? input.username.trim().replace(/^@/, "").toLowerCase() : "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?(?:\[bot\])?$/.test(username)) {
    throw new Error("A valid GitHub username is required.");
  }
  return username;
}

async function configureExpectedContributors(repositoryId: string, inputs: ExpectedContributorInput[]) {
  const usernames = [...new Set(inputs.map(configuredUsername))];
  const result = [];
  for (const username of usernames) {
    // Configuration links a public login; only trusted GitHub sync may update its global profile.
    const existing = await prisma.contributor.findFirst({
      where: { username: { equals: username, mode: "insensitive" } }, select: { id: true }
    });
    const contributor = existing ?? await prisma.contributor.upsert({
      where: { username }, update: {}, create: { username }, select: { id: true }
    });
    result.push(await prisma.repositoryContributor.upsert({
      where: { repositoryId_contributorId: { repositoryId, contributorId: contributor.id } },
      update: { isExpected: true, isIgnored: false },
      create: { repositoryId, contributorId: contributor.id, isExpected: true, isIgnored: false },
      select: { id: true, repositoryId: true, contributorId: true, isExpected: true, isIgnored: true, contributor: { select: { username: true } } }
    }));
  }
  return result;
}

export async function addExpectedContributor(
  userId: string,
  repositoryId: string,
  input: ExpectedContributorInput
) {
  await assertRepositoryWriteAccess(userId, repositoryId);
  const [repositoryContributor] = await configureExpectedContributors(repositoryId, [input]);
  return repositoryContributor;
}

export async function addExpectedContributors(
  userId: string,
  repositoryId: string,
  inputs: ExpectedContributorInput[]
) {
  await assertRepositoryWriteAccess(userId, repositoryId);
  return configureExpectedContributors(repositoryId, inputs);
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
