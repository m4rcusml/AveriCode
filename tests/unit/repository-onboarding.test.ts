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

import { configureNewRepository, fetchGitHubAppInstallations, importInstallationRepositories } from "@/lib/github/installations";

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

  test("reads the array returned by the App installations endpoint, including pagination", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, account: { login: `user-${index}`, type: "User" } }));
    mocks.githubAppRequest.mockResolvedValueOnce(page).mockResolvedValueOnce([{ id: 101 }]);

    const result = await fetchGitHubAppInstallations();

    expect(result).toHaveLength(101);
    expect(mocks.githubAppRequest).toHaveBeenLastCalledWith("/app/installations?per_page=100&page=2");
  });

  test("does not mint tokens or delete repositories when the installation is suspended", async () => {
    mocks.githubAppRequest.mockResolvedValue({
      id: 123, repository_selection: "selected", suspended_at: "2026-11-11T09:00:00Z",
      account: { login: "avericode", type: "Organization" }
    });

    await importInstallationRepositories("installation-record-1");

    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.gitHubInstallation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ suspendedAt: new Date("2026-11-11T09:00:00Z") })
    }));
  });

  test("persists collaborator and branch failures rather than treating a partial roster as complete", async () => {
    mocks.fetchRepositoryPeopleSuggestions.mockResolvedValue({ allPeople: [], errors: ["Repository collaborators could not be loaded."] });
    mocks.fetchRecentlyUpdatedRepositoryBranches.mockRejectedValue(new Error("Branches unavailable"));

    const result = await configureNewRepository({ id: "repository-1", owner: "avericode", name: "app", defaultBranch: "main" }, "token");

    expect(result.warnings).toHaveLength(2);
    expect(mocks.prisma.repository.update).toHaveBeenLastCalledWith({
      where: { id: "repository-1" },
      data: { configurationError: expect.stringContaining("Repository collaborators could not be loaded.") }
    });
    expect(mocks.prisma.repository.update.mock.calls.at(-1)![0].data.configurationError).toContain("Branches unavailable");
  });

  test("retries only incomplete repositories on refresh and preserves prior roster choices", async () => {
    mocks.prisma.repository.findMany.mockResolvedValue([{ id: "repository-1", githubRepoId: "456", configurationError: "Permission missing" }]);

    const result = await importInstallationRepositories("installation-record-1");

    expect(mocks.addExpectedContributorsToRepository).toHaveBeenCalledWith("repository-1", expect.any(Array), { preserveExisting: true, signal: undefined });
    expect(mocks.prisma.repository.update).toHaveBeenLastCalledWith({ where: { id: "repository-1" }, data: { configurationError: null } });
    expect(result[0].setup?.warnings).toEqual([]);
  });
});
