import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchRepositoryCommits: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  prisma: {
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
      upsert: vi.fn()
    },
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

import { syncRepositoryActivity, syncScheduledWorkspaces } from "@/lib/github/sync";

describe("syncRepositoryActivity", () => {
  beforeEach(() => {
    mocks.prisma.syncRun.findFirst.mockResolvedValue(null);
    mocks.prisma.syncRun.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.syncRun.create.mockResolvedValue({ id: "sync-1" });
    mocks.prisma.syncRun.update.mockResolvedValue({});
    mocks.prisma.repository.update.mockResolvedValue({});
    mocks.prisma.repositoryContributor.upsert.mockResolvedValue({});
    mocks.prisma.commitActivitySnapshot.createMany.mockResolvedValue({ count: 1 });
    mocks.getInstallationAccessToken.mockResolvedValue("installation-token");
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
    expect(mocks.prisma.workspace.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "workspace-daily", syncSchedule: "DAILY" })
      })
    );
  });
});
