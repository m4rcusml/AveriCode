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
      update: vi.fn()
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
    mocks.prisma.repository.update.mockResolvedValue({
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

  test("does not automatically add newly accessible repositories during refresh", async () => {
    const result = await importInstallationRepositories("installation-record-1");

    expect(mocks.prisma.repository.update).not.toHaveBeenCalled();
    expect(mocks.addExpectedContributorsToRepository).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryBranch.createMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  test("preserves contributor and branch choices when refreshing an existing repository", async () => {
    mocks.prisma.repository.findMany.mockResolvedValue([{ id: "repository-1", githubRepoId: "456" }]);

    const result = await importInstallationRepositories("installation-record-1");

    expect(mocks.fetchRepositoryPeopleSuggestions).not.toHaveBeenCalled();
    expect(mocks.fetchRecentlyUpdatedRepositoryBranches).not.toHaveBeenCalled();
    expect(mocks.addExpectedContributorsToRepository).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryBranch.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.update).toHaveBeenCalledWith({
      where: { id: "repository-1" },
      data: expect.objectContaining({ fullName: "avericode/app", isActive: true })
    });
    expect(result[0]).toMatchObject({
      wasExisting: true,
      setup: null
    });
  });
});
