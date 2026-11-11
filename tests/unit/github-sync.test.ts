import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchRepositoryCommits: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  configureNewRepository: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    repositoryUpdate: { createMany: vi.fn(), deleteMany: vi.fn() },
    commitActivitySnapshot: {
      createMany: vi.fn()
    },
    contributor: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    repository: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    repositoryContributor: {
      upsert: vi.fn(),
      findMany: vi.fn()
    },
    repositoryBranch: { findMany: vi.fn() },
    syncRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    workspace: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/github/app-auth", () => ({
  getInstallationAccessToken: mocks.getInstallationAccessToken
}));
vi.mock("@/lib/github/commits", () => ({
  fetchRepositoryCommits: mocks.fetchRepositoryCommits
}));
vi.mock("@/lib/github/installations", () => ({ configureNewRepository: mocks.configureNewRepository }));

import { syncRepositoryActivity, syncScheduledWorkspaces } from "@/lib/github/sync";

describe("syncRepositoryActivity", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "repository-1" }]);
    mocks.prisma.syncRun.findFirst.mockResolvedValue(null);
    mocks.prisma.syncRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.syncRun.create.mockResolvedValue({ id: "sync-1" });
    mocks.prisma.syncRun.update.mockResolvedValue({});
    mocks.prisma.repository.update.mockResolvedValue({});
    mocks.prisma.repositoryContributor.upsert.mockResolvedValue({});
    mocks.prisma.commitActivitySnapshot.createMany.mockResolvedValue({ count: 1 });
    mocks.getInstallationAccessToken.mockResolvedValue("installation-token");
    mocks.configureNewRepository.mockResolvedValue({ warnings: [] });
    mocks.prisma.repository.findUnique.mockResolvedValue({
      id: "repository-1",
      workspaceId: "workspace-1",
      owner: "avericode",
      name: "app",
      fullName: "avericode/app",
      defaultBranch: "main",
      installation: { installationId: "123" },
      branches: [{ name: "feature/recent-work" }],
      contributors: [
        {
          contributorId: "contributor-1",
          contributor: {
            id: "contributor-1",
            githubUserId: "10",
            username: "octocat",
            email: "old@example.com"
          }
        }
      ]
    });
  });

  test("does not fail after adding a branch when GitHub returns an author email owned by another contributor", async () => {
    mocks.fetchRepositoryCommits.mockResolvedValue([
      {
        sha: "abc123",
        branchName: "feature/recent-work",
        author: {
          id: 10,
          login: "octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/10"
        },
        commit: {
          author: {
            name: "Octo Cat",
            email: "shared@example.com",
            date: "2026-08-10T12:00:00.000Z"
          }
        }
      }
    ]);
    mocks.prisma.contributor.findMany.mockResolvedValue([
      {
        id: "contributor-1",
        githubUserId: "10",
        username: "octocat",
        email: "old@example.com"
      },
      {
        id: "contributor-2",
        githubUserId: null,
        username: null,
        email: "shared@example.com"
      }
    ]);
    mocks.prisma.contributor.update.mockImplementation(({ data }) => {
      if (data.email === "shared@example.com") {
        return Promise.reject(
          Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
            code: "P2002"
          })
        );
      }

      return Promise.resolve({
        id: "contributor-1",
        githubUserId: "10",
        username: "octocat",
        email: "old@example.com",
        ...data
      });
    });

    await expect(
      syncRepositoryActivity({
        repositoryId: "repository-1",
        trigger: "MANUAL"
      })
    ).resolves.toMatchObject({
      repositoryId: "repository-1",
      snapshotCount: 1
    });
  });

  test("runs only workspaces whose selected schedule is due", async () => {
    const now = new Date("2026-08-12T09:00:00.000Z");
    mocks.prisma.workspace.findMany.mockResolvedValue([
      {
        id: "workspace-daily",
        syncSchedule: "DAILY",
        lastScheduledSyncAt: new Date("2026-08-11T09:00:00.000Z")
      },
      {
        id: "workspace-weekly",
        syncSchedule: "WEEKLY",
        lastScheduledSyncAt: new Date("2026-08-10T09:00:00.000Z")
      }
    ]);
    mocks.prisma.workspace.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.repository.findMany.mockResolvedValue([]);

    const result = await syncScheduledWorkspaces(now);

    expect(result).toMatchObject({
      checkedWorkspaces: 2,
      syncedWorkspaces: 1
    });
    expect(mocks.prisma.workspace.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "workspace-daily", syncSchedule: "DAILY" })
      })
    );
  });

  test("rejects manual cooldown under the repository lock before contacting GitHub", async () => {
    mocks.prisma.syncRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ startedAt: new Date() });

    await expect(syncRepositoryActivity({ repositoryId: "repository-1", trigger: "MANUAL" }))
      .rejects.toThrow("rate limited");
    expect(mocks.prisma.$queryRaw).toHaveBeenCalled();
    expect(mocks.prisma.syncRun.create).not.toHaveBeenCalled();
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  test("does not publish snapshots after its running claim was expired", async () => {
    mocks.fetchRepositoryCommits.mockResolvedValue([]);
    mocks.prisma.syncRun.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });

    await expect(syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" }))
      .rejects.toThrow("Sync expired");
    expect(mocks.prisma.commitActivitySnapshot.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.update).not.toHaveBeenCalled();
  });

  test("saves anonymous updates with real messages in the same transaction as the snapshots", async () => {
    mocks.fetchRepositoryCommits.mockResolvedValue([{
      sha: "abc123", branchName: "main", author: null,
      commit: { message: "fix: restore customer import\n\nHandle empty files.", author: { name: "A contributor", email: null, date: "2026-11-11T12:00:00Z" } }
    }]);

    await syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" });

    expect(mocks.prisma.repositoryUpdate.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [expect.objectContaining({
        repositoryId: "repository-1", sha: "abc123", message: "fix: restore customer import\n\nHandle empty files.",
        url: "https://github.com/avericode/app/commit/abc123", authorUsername: "A contributor", branch: "main"
      })]
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.commitActivitySnapshot.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ contributorId: "contributor-1", status: "INACTIVE", commitCount: 0 })]
    });
  });

  test("preserves installation data and avoids GitHub calls while suspended", async () => {
    const repository = await mocks.prisma.repository.findUnique();
    mocks.prisma.repository.findUnique.mockResolvedValue({
      ...repository, installation: { installationId: "123", suspendedAt: new Date() }
    });

    await expect(syncRepositoryActivity({ repositoryId: "repository-1", trigger: "MANUAL" }))
      .rejects.toThrow("suspended");
    expect(mocks.prisma.syncRun.create).not.toHaveBeenCalled();
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  test("retries incomplete configuration and records UNKNOWN while its warnings persist", async () => {
    const repository = await mocks.prisma.repository.findUnique();
    mocks.prisma.repository.findUnique.mockResolvedValue({ ...repository, configurationError: "Members permission missing" });
    mocks.configureNewRepository.mockResolvedValue({ warnings: ["Members permission missing"] });
    mocks.prisma.repositoryContributor.findMany.mockResolvedValue(repository.contributors);
    mocks.prisma.repositoryBranch.findMany.mockResolvedValue(repository.branches);
    mocks.fetchRepositoryCommits.mockResolvedValue([]);

    await syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" });

    expect(mocks.configureNewRepository).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.commitActivitySnapshot.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: "UNKNOWN" })]
    });
  });

  test("uses contributors and branches recovered by onboarding in the same sync", async () => {
    const repository = await mocks.prisma.repository.findUnique();
    mocks.prisma.repository.findUnique.mockResolvedValue({ ...repository, configurationError: "Setup incomplete", contributors: [], branches: [] });
    mocks.prisma.repositoryContributor.findMany.mockResolvedValue(repository.contributors);
    mocks.prisma.repositoryBranch.findMany.mockResolvedValue([{ name: "feature/recovered" }]);
    mocks.fetchRepositoryCommits.mockResolvedValue([]);

    await syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" });

    expect(mocks.fetchRepositoryCommits).toHaveBeenCalledWith(expect.objectContaining({ branches: ["feature/recovered"] }));
    expect(mocks.prisma.commitActivitySnapshot.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ contributorId: "contributor-1", status: "INACTIVE" })]
    });
  });

  test("does not mistake authors discovered during failed setup for manual roster exclusions on retry", async () => {
    const repository = await mocks.prisma.repository.findUnique();
    const contributor = { id: "contributor-1", githubUserId: "10", username: "octocat", email: null };
    const roster = new Map<string, { contributorId: string; isExpected: boolean; isIgnored: boolean; contributor: typeof contributor }>();
    const expected = () => [...roster.values()].filter((row) => row.isExpected && !row.isIgnored);
    mocks.prisma.repository.findUnique.mockImplementation(async () => ({
      ...repository, configurationError: "Collaborators unavailable", contributors: expected()
    }));
    mocks.prisma.repositoryContributor.findMany.mockImplementation(async () => expected());
    mocks.prisma.repositoryBranch.findMany.mockResolvedValue([]);
    mocks.prisma.contributor.findMany.mockResolvedValue([contributor]);
    mocks.prisma.contributor.update.mockResolvedValue(contributor);
    mocks.prisma.repositoryContributor.upsert.mockImplementation(async ({ create }) => {
      if (!roster.has(create.contributorId)) {
        roster.set(create.contributorId, { ...create, isIgnored: false, contributor });
      }
      return roster.get(create.contributorId);
    });
    mocks.configureNewRepository
      .mockResolvedValueOnce({ warnings: ["Collaborators unavailable"] })
      .mockImplementationOnce(async () => {
        // Retry follows preserveExisting: create missing entries, preserve explicit choices.
        if (!roster.has(contributor.id)) {
          roster.set(contributor.id, { contributorId: contributor.id, isExpected: true, isIgnored: false, contributor });
        }
        return { warnings: [] };
      });
    mocks.fetchRepositoryCommits.mockResolvedValue([{
      sha: "retry-commit", branchName: "main", author: { id: 10, login: "octocat", avatar_url: null },
      commit: { message: "fix: recover project access", author: { name: "Octocat", email: null, date: "2026-11-11T12:00:00Z" } }
    }]);

    await syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" });
    expect(roster.size).toBe(0);
    expect(mocks.prisma.repositoryContributor.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryUpdate.createMany).toHaveBeenCalled();

    await syncRepositoryActivity({ repositoryId: "repository-1", trigger: "CRON" });
    expect(roster.get(contributor.id)).toMatchObject({ isExpected: true, isIgnored: false });
    expect(mocks.prisma.commitActivitySnapshot.createMany).toHaveBeenLastCalledWith({
      data: [expect.objectContaining({ contributorId: contributor.id, status: "ACTIVE", commitCount: 1 })]
    });
  });
});
