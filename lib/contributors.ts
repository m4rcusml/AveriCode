import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ContributorIdentityInput = {
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
  return cleanString(value)?.replace(/^@/, "").toLowerCase() ?? null;
}

function normalizeEmail(value: string | null | undefined) {
  return cleanString(value)?.toLowerCase() ?? null;
}

function normalizedIdentity(input: ContributorIdentityInput) {
  return {
    githubUserId: cleanString(input.githubUserId),
    username: normalizeUsername(input.username),
    name: cleanString(input.name),
    avatarUrl: cleanString(input.avatarUrl),
    email: normalizeEmail(input.email)
  };
}

function identityConditions(input: ReturnType<typeof normalizedIdentity>): Prisma.ContributorWhereInput[] {
  const conditions: Prisma.ContributorWhereInput[] = [];

  if (input.githubUserId) {
    conditions.push({ githubUserId: input.githubUserId });
  }

  if (input.username) {
    conditions.push({
      username: {
        equals: input.username,
        mode: "insensitive"
      }
    });
  }

  if (input.email) {
    conditions.push({
      email: {
        equals: input.email,
        mode: "insensitive"
      }
    });
  }

  return conditions;
}

async function findCandidates(input: ReturnType<typeof normalizedIdentity>) {
  const conditions = identityConditions(input);

  if (conditions.length === 0) {
    return [];
  }

  return prisma.contributor.findMany({
    where: {
      OR: conditions
    }
  });
}

function canonicalContributor(
  candidates: Awaited<ReturnType<typeof findCandidates>>,
  input: ReturnType<typeof normalizedIdentity>
) {
  return (
    (input.githubUserId
      ? candidates.find((candidate) => candidate.githubUserId === input.githubUserId)
      : undefined) ??
    (input.username
      ? candidates.find((candidate) => candidate.username?.toLowerCase() === input.username)
      : undefined) ??
    (input.email
      ? candidates.find((candidate) => candidate.email?.toLowerCase() === input.email)
      : undefined) ??
    null
  );
}

function safeWriteData(
  canonicalId: string,
  candidates: Awaited<ReturnType<typeof findCandidates>>,
  input: ReturnType<typeof normalizedIdentity>
) {
  const githubIdOwner = input.githubUserId
    ? candidates.find((candidate) => candidate.githubUserId === input.githubUserId)
    : null;
  const usernameOwner = input.username
    ? candidates.find((candidate) => candidate.username?.toLowerCase() === input.username)
    : null;
  const emailOwner = input.email
    ? candidates.find((candidate) => candidate.email?.toLowerCase() === input.email)
    : null;

  return {
    githubUserId:
      !githubIdOwner || githubIdOwner.id === canonicalId ? input.githubUserId ?? undefined : undefined,
    username:
      !usernameOwner || usernameOwner.id === canonicalId ? input.username ?? undefined : undefined,
    email: !emailOwner || emailOwner.id === canonicalId ? input.email ?? undefined : undefined,
    name: input.name ?? undefined,
    avatarUrl: input.avatarUrl ?? undefined
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  ) || Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function findOrCreateContributor(input: ContributorIdentityInput) {
  const normalized = normalizedIdentity(input);

  if (!normalized.githubUserId && !normalized.username && !normalized.email) {
    throw new Error("Contributor requires a GitHub username, GitHub user id, or email.");
  }

  let candidates = await findCandidates(normalized);
  let canonical = canonicalContributor(candidates, normalized);

  if (!canonical) {
    try {
      return await prisma.contributor.create({
        data: {
          githubUserId: normalized.githubUserId ?? undefined,
          username: normalized.username ?? undefined,
          email: normalized.email ?? undefined,
          name: normalized.name ?? undefined,
          avatarUrl: normalized.avatarUrl ?? undefined
        }
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      candidates = await findCandidates(normalized);
      canonical = canonicalContributor(candidates, normalized);

      if (!canonical) {
        throw error;
      }
    }
  }

  try {
    return await prisma.contributor.update({
      where: { id: canonical.id },
      data: safeWriteData(canonical.id, candidates, normalized)
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const refreshedCandidates = await findCandidates(normalized);
    const refreshedCanonical = canonicalContributor(refreshedCandidates, normalized) ?? canonical;

    return prisma.contributor.update({
      where: { id: refreshedCanonical.id },
      data: safeWriteData(refreshedCanonical.id, refreshedCandidates, normalized)
    });
  }
}

export async function addExpectedContributorsToRepository(
  repositoryId: string,
  inputs: ContributorIdentityInput[]
) {
  const repositoryContributors = [];

  for (const input of inputs) {
    const contributor = await findOrCreateContributor(input);
    repositoryContributors.push(
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

  return repositoryContributors;
}
