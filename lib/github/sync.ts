import { ActivityStatus, Prisma, SyncTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateContributor, reconcileRepositoryContributors } from "@/lib/contributors";
import { getLastSevenDayPeriod } from "@/lib/dates";
import { getInstallationAccessToken } from "@/lib/github/app-auth";
import { fetchRepositoryCommits, type GitHubCommitWithBranch } from "@/lib/github/commits";
import { configureNewRepository } from "@/lib/github/installations";
import { fetchRepositoryPeopleSuggestions } from "@/lib/github/people";
import { isScheduledSyncDue } from "@/lib/sync-schedule";

export const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const RUNNING_SYNC_STALE_MS = 30 * 60 * 1000;
export const SCHEDULED_SYNC_BUDGET_MS = 250_000;
const SCHEDULED_REPOSITORY_BUDGET_MS = 180_000;
const SCHEDULED_SYNC_LEASE_MS = 10 * 60 * 1000;
const SCHEDULED_SYNC_RESERVE_MS = 10_000;

type ContributorInput = {
  githubUserId?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
};

type SyncRepositoryInput = {
  repositoryId: string;
  trigger: SyncTrigger;
  deadline?: number;
};

type SyncActiveRepositoriesInput = {
  workspaceId?: string;
  trigger: SyncTrigger;
};

function cleanString(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeEmail(value: string | null | undefined) {
  return cleanString(value)?.toLowerCase() ?? null;
}

function toContributorInput(commit: GitHubCommitWithBranch): ContributorInput | null {
  const githubUserId = commit.author?.id ? String(commit.author.id) : null;
  const username = cleanString(commit.author?.login);
  const email = normalizeEmail(commit.commit.author?.email);
  const name = cleanString(commit.commit.author?.name) ?? username;

  if (!githubUserId && !username && !email) {
    return null;
  }

  return {
    githubUserId,
    username,
    email,
    name,
    avatarUrl: cleanString(commit.author?.avatar_url)
  };
}

function contributorIdentity(input: ContributorInput) {
  if (input.githubUserId) {
    return `github:${input.githubUserId}`;
  }

  if (input.email) {
    return `email:${input.email}`;
  }

  if (input.username) {
    return `username:${input.username.toLowerCase()}`;
  }

  return null;
}

function getCommitDate(commit: GitHubCommitWithBranch) {
  for (const value of [commit.commit.committer?.date, commit.commit.author?.date]) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function getManualSyncCooldown(
  repositoryId: string,
  db: Pick<Prisma.TransactionClient, "syncRun"> = prisma
) {
  const cooldownStart = new Date(Date.now() - MANUAL_SYNC_COOLDOWN_MS);
  const recentSync = await db.syncRun.findFirst({
    where: {
      repositoryId,
      trigger: "MANUAL",
      startedAt: {
        gte: cooldownStart
      }
    },
    orderBy: {
      startedAt: "desc"
    }
  });

  if (!recentSync) {
    return 0;
  }

  const elapsed = Date.now() - recentSync.startedAt.getTime();
  return Math.max(0, MANUAL_SYNC_COOLDOWN_MS - elapsed);
}

export async function assertCanRunManualSync(repositoryId: string) {
  const remaining = await getManualSyncCooldown(repositoryId);

  if (remaining > 0) {
    const minutes = Math.ceil(remaining / 60000);
    throw new Error(`Manual sync is rate limited. Try again in ${minutes} minute(s).`);
  }
}

export async function syncRepositoryActivity(input: SyncRepositoryInput) {
  const signal = input.deadline ? AbortSignal.timeout(Math.max(1, input.deadline - Date.now())) : undefined;
  function assertTimeAvailable() {
    signal?.throwIfAborted();
    if (input.deadline && Date.now() >= input.deadline) {
      throw new Error("Scheduled sync reached its time budget. Retry sync to complete this project.");
    }
  }
  assertTimeAvailable();
  const repository = await prisma.repository.findUnique({
    where: { id: input.repositoryId },
    include: {
      installation: true,
      contributors: {
        where: {
          isExpected: true,
          isIgnored: false
        },
        include: {
          contributor: true
        }
      },
      branches: {
        orderBy: {
          name: "asc"
        }
      }
    }
  });

  if (!repository) {
    throw new Error("Repository not found.");
  }
  if (repository.installation.suspendedAt) {
    throw new Error("The GitHub App installation is suspended. Restore access on GitHub to sync this project.");
  }

  const staleBefore = new Date(Date.now() - RUNNING_SYNC_STALE_MS);

  const syncRun = await prisma.$transaction(async (tx) => {
    // Serialize the cooldown check and claim across cron, API, and server actions.
    await tx.$queryRaw`SELECT "id" FROM "Repository" WHERE "id" = ${repository.id} FOR UPDATE`;
    await tx.syncRun.updateMany({
      where: {
        repositoryId: repository.id,
        status: "RUNNING",
        startedAt: { lt: staleBefore }
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: "Sync was marked as failed after exceeding the running timeout."
      }
    });

    const runningSync = await tx.syncRun.findFirst({
      where: { repositoryId: repository.id, status: "RUNNING" }
    });

    if (runningSync) {
      throw new Error("A sync is already running for this repository.");
    }
    if (input.trigger === "MANUAL") {
      const remaining = await getManualSyncCooldown(repository.id, tx);
      if (remaining > 0) {
        throw new Error(`Manual sync is rate limited. Try again in ${Math.ceil(remaining / 60000)} minute(s).`);
      }
    }
    return tx.syncRun.create({
      data: {
        workspaceId: repository.workspaceId,
        repositoryId: repository.id,
        trigger: input.trigger,
        status: "RUNNING",
        startedAt: new Date()
      }
    });
  }).catch((error) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("A sync is already running for this repository.");
    }

    throw error;
  });

  try {
    const { periodStart, periodEnd } = getLastSevenDayPeriod();
    assertTimeAvailable();
    const token = await getInstallationAccessToken(repository.installation.installationId, { signal });
    let configurationError = repository.configurationError;
    let expectedContributors = repository.contributors;
    let monitoredBranches = repository.branches;
    if (configurationError) {
      const setup = await configureNewRepository(repository, token, { signal });
      configurationError = setup.warnings.length > 0 ? setup.warnings.join("\n") : null;
      [expectedContributors, monitoredBranches] = await Promise.all([
        prisma.repositoryContributor.findMany({
          where: { repositoryId: repository.id, isExpected: true, isIgnored: false },
          include: { contributor: true }
        }),
        prisma.repositoryBranch.findMany({ where: { repositoryId: repository.id }, orderBy: { name: "asc" } })
      ]);
    } else {
      const people = await fetchRepositoryPeopleSuggestions({
        owner: repository.owner, name: repository.name, token, signal
      });
      if (people.errors.length > 0) {
        configurationError = people.errors.join("\n");
      } else {
        try {
          expectedContributors = await reconcileRepositoryContributors(repository.id, people.allPeople, { signal });
        } catch (error) {
          configurationError = `Expected contributors could not be refreshed: ${errorMessage(error)}`;
        }
      }
      if (configurationError) {
        await prisma.repository.update({ where: { id: repository.id }, data: { configurationError } });
      }
    }
    assertTimeAvailable();
    const commits = await fetchRepositoryCommits({
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.defaultBranch,
      branches: monitoredBranches.map((branch) => branch.name),
      token,
      since: periodStart,
      until: periodEnd,
      signal
    });
    const contributorCache = new Map<string, string>();
    const activityByContributor = new Map<
      string,
      {
        commitCount: number;
        lastCommitAt: Date | null;
        lastCommitBranch: string | null;
      }
    >();

    for (const commit of commits) {
      assertTimeAvailable();
      const inputContributor = toContributorInput(commit);
      const identity = inputContributor ? contributorIdentity(inputContributor) : null;

      if (!inputContributor || !identity) {
        continue;
      }

      let contributorId = contributorCache.get(identity);

      if (!contributorId) {
        const contributor = await findOrCreateContributor(inputContributor);
        contributorId = contributor.id;
        contributorCache.set(identity, contributorId);

        // A real GitHub commit is evidence even before the cached historical author list updates.
        if (inputContributor.githubUserId) {
          await prisma.repositoryContributor.upsert({
            where: {
              repositoryId_contributorId: {
                repositoryId: repository.id,
                contributorId
              }
            },
            update: {},
            create: {
              repositoryId: repository.id,
              contributorId,
              isExpected: true,
              source: "GITHUB"
            }
          });
          await prisma.repositoryContributor.updateMany({
            where: { repositoryId: repository.id, contributorId, source: "GITHUB", isIgnored: false, isExpected: false },
            data: { isExpected: true }
          });
        }
      }

      const commitDate = getCommitDate(commit);
      const current = activityByContributor.get(contributorId) ?? {
        commitCount: 0,
        lastCommitAt: null,
        lastCommitBranch: null
      };

      current.commitCount += 1;

      if (commitDate && (!current.lastCommitAt || commitDate > current.lastCommitAt)) {
        current.lastCommitAt = commitDate;
        current.lastCommitBranch = commit.branchName;
      }

      activityByContributor.set(contributorId, current);
    }

    expectedContributors = await prisma.repositoryContributor.findMany({
      where: { repositoryId: repository.id, isExpected: true, isIgnored: false },
      include: { contributor: true }
    });

    const snapshotRows: Prisma.CommitActivitySnapshotCreateManyInput[] = expectedContributors.map(
      (repositoryContributor) => {
        const activity = activityByContributor.get(repositoryContributor.contributorId);
        const commitCount = activity?.commitCount ?? 0;

        return {
          repositoryId: repository.id,
          contributorId: repositoryContributor.contributorId,
          syncRunId: syncRun.id,
          periodStart,
          periodEnd,
          commitCount,
          lastCommitAt: activity?.lastCommitAt ?? null,
          lastCommitBranch: activity?.lastCommitBranch ?? null,
          status: configurationError ? ActivityStatus.UNKNOWN : commitCount > 0 ? ActivityStatus.ACTIVE : ActivityStatus.INACTIVE
        };
      }
    );
    const updateRows: Prisma.RepositoryUpdateCreateManyInput[] = commits.flatMap((commit) => {
      const committedAt = getCommitDate(commit);
      const message = commit.commit.message?.trim();
      if (!committedAt || !message) return [];
      return [{
        repositoryId: repository.id,
        sha: commit.sha,
        message,
        url: `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/commit/${encodeURIComponent(commit.sha)}`,
        authorUsername: cleanString(commit.author?.login) ?? cleanString(commit.commit.author?.name),
        authorAvatarUrl: cleanString(commit.author?.avatar_url),
        committedAt,
        branch: commit.branchName ?? "HEAD"
      }];
    });

    assertTimeAvailable();
    await prisma.$transaction(async (tx) => {
      // A timed-out worker must never publish after a newer sync claimed the repository.
      const completed = await tx.syncRun.updateMany({
        where: { id: syncRun.id, status: "RUNNING" },
        data: { status: "SUCCESS", finishedAt: new Date() }
      });
      if (completed.count === 0) throw new Error("Sync expired before its results could be saved. Try again.");
      if (snapshotRows.length > 0) {
        await tx.commitActivitySnapshot.createMany({ data: snapshotRows });
      }
      if (updateRows.length > 0) {
        await tx.repositoryUpdate.createMany({ data: updateRows, skipDuplicates: true });
      }
      await tx.repositoryUpdate.deleteMany({
        where: {
          repositoryId: repository.id,
          committedAt: { lt: new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000) }
        }
      });
      await tx.repository.update({
        where: { id: repository.id },
        data: { lastSyncedAt: periodEnd }
      });
    });

    return {
      repositoryId: repository.id,
      fullName: repository.fullName,
      commitCount: commits.length,
      expectedContributorCount: expectedContributors.length,
      snapshotCount: snapshotRows.length
    };
  } catch (error) {
    await prisma.syncRun.updateMany({
      where: { id: syncRun.id, status: "RUNNING" },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: errorMessage(error)
      }
    });

    throw error;
  }
}

export async function syncActiveRepositories(input: SyncActiveRepositoriesInput) {
  const repositories = await prisma.repository.findMany({
    where: {
      isActive: true,
      workspaceId: input.workspaceId
    },
    select: {
      id: true,
      fullName: true
    },
    orderBy: {
      fullName: "asc"
    }
  });

  const results = [];

  for (const repository of repositories) {
    try {
      results.push({
        ok: true,
        repository: repository.fullName,
        result: await syncRepositoryActivity({
          repositoryId: repository.id,
          trigger: input.trigger
        })
      });
    } catch (error) {
      results.push({
        ok: false,
        repository: repository.fullName,
        error: errorMessage(error)
      });
    }
  }

  return {
    total: repositories.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

export async function syncScheduledWorkspaces(now = new Date()) {
  const startedAt = Date.now();
  const deadline = startedAt + SCHEDULED_SYNC_BUDGET_MS;
  const currentTime = () => new Date(now.getTime() + Date.now() - startedAt);
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { repositories: { some: { isActive: true } } },
        { scheduledSyncStartedAt: { not: null } }
      ]
    },
    select: {
      id: true,
      syncSchedule: true,
      lastScheduledSyncAt: true,
      scheduledSyncStartedAt: true,
      scheduledSyncLeaseAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const results = [];

  for (const workspace of workspaces) {
    if (Date.now() >= deadline - SCHEDULED_SYNC_RESERVE_MS) break;
    if (!workspace.scheduledSyncStartedAt &&
      !isScheduledSyncDue(workspace.syncSchedule, workspace.lastScheduledSyncAt, now)) {
      continue;
    }

    const cycleStartedAt = workspace.scheduledSyncStartedAt ?? currentTime();
    const leaseAt = currentTime();
    const claimed = await prisma.workspace.updateMany({
      where: {
        id: workspace.id,
        syncSchedule: workspace.syncSchedule,
        lastScheduledSyncAt: workspace.lastScheduledSyncAt,
        scheduledSyncStartedAt: workspace.scheduledSyncStartedAt ?? null,
        OR: [
          { scheduledSyncLeaseAt: null },
          { scheduledSyncLeaseAt: { lte: new Date(leaseAt.getTime() - SCHEDULED_SYNC_LEASE_MS) } }
        ]
      },
      data: {
        scheduledSyncStartedAt: cycleStartedAt,
        scheduledSyncLeaseAt: leaseAt
      }
    });

    if (claimed.count === 0) {
      continue;
    }

    const leaseWhere = { id: workspace.id, scheduledSyncStartedAt: cycleStartedAt, scheduledSyncLeaseAt: leaseAt };
    try {
      // Terminal failures count as attempted; they stay visible without starving healthy projects.
      const pending = await prisma.repository.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
          syncRuns: { none: { trigger: "CRON", status: { in: ["SUCCESS", "FAILED"] }, startedAt: { gte: cycleStartedAt } } }
        },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" }
      });
      const attempts = [];
      for (const repository of pending) {
        if (Date.now() >= deadline - SCHEDULED_SYNC_RESERVE_MS) break;
        const attemptStartedAt = currentTime();
        try {
          const result = await syncRepositoryActivity({
            repositoryId: repository.id,
            trigger: "CRON",
            deadline: Math.min(Date.now() + SCHEDULED_REPOSITORY_BUDGET_MS, deadline - SCHEDULED_SYNC_RESERVE_MS)
          });
          attempts.push({ ok: true, repository: repository.fullName, result });
        } catch (error) {
          const message = errorMessage(error);
          const terminal = await prisma.syncRun.findFirst({
            where: { repositoryId: repository.id, trigger: "CRON", status: { in: ["SUCCESS", "FAILED"] }, startedAt: { gte: cycleStartedAt } }
          });
          // Failures before claiming (e.g. a suspended App) also need a durable attempt.
          if (!terminal) {
            await prisma.syncRun.create({
              data: {
                workspaceId: workspace.id, repositoryId: repository.id, trigger: "CRON", status: "FAILED",
                startedAt: attemptStartedAt, finishedAt: currentTime(), error: message
              }
            });
          }
          attempts.push({ ok: false, repository: repository.fullName, error: message });
        }
      }
      const completed = attempts.length === pending.length;
      await prisma.workspace.updateMany({
        where: leaseWhere,
        data: {
          scheduledSyncLeaseAt: null,
          ...(completed ? { lastScheduledSyncAt: cycleStartedAt, scheduledSyncStartedAt: null } : {})
        }
      });
      results.push({
        workspaceId: workspace.id, schedule: workspace.syncSchedule, cycleStartedAt, completed,
        result: {
          total: pending.length, succeeded: attempts.filter((attempt) => attempt.ok).length,
          failed: attempts.filter((attempt) => !attempt.ok).length, deferred: pending.length - attempts.length,
          results: attempts
        }
      });
    } catch (error) {
      await prisma.workspace.updateMany({ where: leaseWhere, data: { scheduledSyncLeaseAt: null } });
      throw error;
    }
  }

  return {
    checkedWorkspaces: workspaces.length,
    syncedWorkspaces: results.length,
    results
  };
}
