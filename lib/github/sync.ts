import { ActivityStatus, Prisma, SyncTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateContributor } from "@/lib/contributors";
import { getLastSevenDayPeriod } from "@/lib/dates";
import { getInstallationAccessToken } from "@/lib/github/app-auth";
import { fetchRepositoryCommits, type GitHubCommitWithBranch } from "@/lib/github/commits";
import { isScheduledSyncDue, syncScheduleIntervalMs } from "@/lib/sync-schedule";

export const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const RUNNING_SYNC_STALE_MS = 30 * 60 * 1000;

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
  const date = commit.commit.author?.date;

  if (!date) {
    return null;
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function getManualSyncCooldown(repositoryId: string) {
  const cooldownStart = new Date(Date.now() - MANUAL_SYNC_COOLDOWN_MS);
  const recentSync = await prisma.syncRun.findFirst({
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

  const staleBefore = new Date(Date.now() - RUNNING_SYNC_STALE_MS);

  await prisma.syncRun.updateMany({
    where: {
      repositoryId: repository.id,
      status: "RUNNING",
      startedAt: {
        lt: staleBefore
      }
    },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      error: "Sync was marked as failed after exceeding the running timeout."
    }
  });

  const runningSync = await prisma.syncRun.findFirst({
    where: {
      repositoryId: repository.id,
      status: "RUNNING"
    }
  });

  if (runningSync) {
    throw new Error("A sync is already running for this repository.");
  }

  let syncRun;

  try {
    syncRun = await prisma.syncRun.create({
      data: {
        workspaceId: repository.workspaceId,
        repositoryId: repository.id,
        trigger: input.trigger,
        status: "RUNNING"
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("A sync is already running for this repository.");
    }

    throw error;
  }

  try {
    const { periodStart, periodEnd } = getLastSevenDayPeriod();
    const token = await getInstallationAccessToken(repository.installation.installationId);
    const commits = await fetchRepositoryCommits({
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.defaultBranch,
      branches: repository.branches.map((branch) => branch.name),
      token,
      since: periodStart,
      until: periodEnd
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
            isExpected: false
          }
        });
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

    const snapshotRows: Prisma.CommitActivitySnapshotCreateManyInput[] = repository.contributors.map(
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
          status: commitCount > 0 ? ActivityStatus.ACTIVE : ActivityStatus.INACTIVE
        };
      }
    );

    if (snapshotRows.length > 0) {
      await prisma.commitActivitySnapshot.createMany({
        data: snapshotRows
      });
    }

    await prisma.repository.update({
      where: { id: repository.id },
      data: {
        lastSyncedAt: periodEnd
      }
    });

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date()
      }
    });

    return {
      repositoryId: repository.id,
      fullName: repository.fullName,
      commitCount: commits.length,
      expectedContributorCount: repository.contributors.length,
      snapshotCount: snapshotRows.length
    };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
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
  const workspaces = await prisma.workspace.findMany({
    where: {
      repositories: {
        some: {
          isActive: true
        }
      }
    },
    select: {
      id: true,
      syncSchedule: true,
      lastScheduledSyncAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const results = [];

  for (const workspace of workspaces) {
    if (!isScheduledSyncDue(workspace.syncSchedule, workspace.lastScheduledSyncAt, now)) {
      continue;
    }

    const dueBefore = new Date(now.getTime() - syncScheduleIntervalMs(workspace.syncSchedule));
    const claimed = await prisma.workspace.updateMany({
      where: {
        id: workspace.id,
        syncSchedule: workspace.syncSchedule,
        OR: [
          { lastScheduledSyncAt: null },
          {
            lastScheduledSyncAt: {
              lte: dueBefore
            }
          }
        ]
      },
      data: {
        lastScheduledSyncAt: now
      }
    });

    if (claimed.count === 0) {
      continue;
    }

    results.push({
      workspaceId: workspace.id,
      schedule: workspace.syncSchedule,
      result: await syncActiveRepositories({
        workspaceId: workspace.id,
        trigger: "CRON"
      })
    });
  }

  return {
    checkedWorkspaces: workspaces.length,
    syncedWorkspaces: results.length,
    results
  };
}
