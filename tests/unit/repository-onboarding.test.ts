import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addExpectedContributorsToRepository: vi.fn(),
  fetchRecentlyUpdatedRepositoryBranches: vi.fn(),
  fetchRepositoryPeopleSuggestions: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  githubAppRequest: vi.fn(),
  githubRequest: vi.fn(),
  prisma: {
    gitHubInstallation: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    repository: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn()
    },
    repositoryBranch: {
      createMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/contributors", () => ({
  addExpectedContributorsToRepository: mocks.addExpectedContributorsToRepository
}));
vi.mock("@/lib/github/commits", () => ({
  fetchRecentlyUpdatedRepositoryBranches: mocks.fetchRecentlyUpdatedRepositoryBranches
}));
vi.mock("@/lib/github/people", () => ({
  fetchRepositoryPeopleSuggestions: mocks.fetchRepositoryPeopleSuggestions
}));
vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error {},
  getInstallationAccessToken: mocks.getInstallationAccessToken,
  githubAppRequest: mocks.githubAppRequest,
  githubRequest: mocks.githubRequest
}));

import { importInstallationRepositories } from "@/lib/github/installations";

describe("repository onboarding", () => {
  beforeEach(() => {
    mocks.prisma.gitHubInstallation.findUniqueOrThrow.mockResolvedValue({
      id: "installation-record-1",
      installationId: "123",
      workspaceId: "workspace-1"
    });
    mocks.getInstallationAccessToken.mockResolvedValue("token");
    mocks.githubAppRequest.mockResolvedValue({
      id: 123,
      repository_selection: "selected",
      account: {
        login: "avericode",
        type: "Organization"
      }
    });
    mocks.githubRequest.mockResolvedValue({
      repositories: [
        {
          id: 456,
          owner: { login: "avericode" },
          name: "app",
          full_name: "avericode/app",
          private: true,
          default_branch: "main"
        }
      ]
    });
    mocks.prisma.gitHubInstallation.update.mockResolvedValue({});
    mocks.prisma.repository.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.repository.findMany.mockResolvedValue([]);
    mocks.prisma.repository.upsert.mockResolvedValue({
      id: "repository-1",
      githubRepoId: "456",
      owner: "avericode",
      name: "app",
      fullName: "avericode/app",
      defaultBranch: "main"
    });
    mocks.fetchRepositoryPeopleSuggestions.mockResolvedValue({
      allPeople: [
        {
          githubUserId: "10",
          username: "octocat",
          avatarUrl: null
        }
      ],
      suggestedContributors: [],
      accessWithoutContributions: [],
      errors: []
    });
    mocks.addExpectedContributorsToRepository.mockResolvedValue([{ id: "expected-1" }]);
    mocks.fetchRecentlyUpdatedRepositoryBranches.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        name: `feature/${index + 1}`,
        lastCommitAt: new Date(`2026-08-${String(11 - index).padStart(2, "0")}T12:00:00.000Z`)
      }))
    );
    mocks.prisma.repositoryBranch.createMany.mockResolvedValue({ count: 5 });
  });

  test("automatically monitors a new repository and configures contributors and recent branches", async () => {
    const result = await importInstallationRepositories("installation-record-1");

    expect(mocks.prisma.repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isActive: true }),
        update: expect.objectContaining({ isActive: true })
      })
    );
    expect(mocks.addExpectedContributorsToRepository).toHaveBeenCalledWith(
      "repository-1",
      expect.arrayContaining([expect.objectContaining({ username: "octocat" })])
    );
    expect(mocks.prisma.repositoryBranch.createMany).toHaveBeenCalledWith({
      data: [
        { repositoryId: "repository-1", name: "feature/1" },
        { repositoryId: "repository-1", name: "feature/2" },
        { repositoryId: "repository-1", name: "feature/3" },
        { repositoryId: "repository-1", name: "feature/4" },
        { repositoryId: "repository-1", name: "feature/5" }
      ],
      skipDuplicates: true
    });
    expect(result[0]).toMatchObject({
      wasExisting: false,
      setup: {
        expectedContributorCount: 1,
        monitoredBranchCount: 5,
        warnings: []
      }
    });
  });

  test("preserves contributor and branch choices when refreshing an existing repository", async () => {
    mocks.prisma.repository.findMany.mockResolvedValue([{ githubRepoId: "456" }]);

    const result = await importInstallationRepositories("installation-record-1");

    expect(mocks.fetchRepositoryPeopleSuggestions).not.toHaveBeenCalled();
    expect(mocks.fetchRecentlyUpdatedRepositoryBranches).not.toHaveBeenCalled();
    expect(mocks.addExpectedContributorsToRepository).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryBranch.createMany).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      wasExisting: true,
      setup: null
    });
  });
});
