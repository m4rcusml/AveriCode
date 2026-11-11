import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configureNewRepository: vi.fn(),
  fetchGitHubAppInstallations: vi.fn(),
  fetchGitHubInstallation: vi.fn(),
  fetchInstallationRepositories: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  getWorkspaceMembership: vi.fn(),
  githubRequest: vi.fn(),
  userOwnsGitHubInstallation: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    account: { findFirst: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
    repository: { count: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    repositoryAccessRequest: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    repositoryAccessRequestItem: { count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    gitHubInstallation: { upsert: vi.fn() }
  }
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/workspaces", () => ({ getWorkspaceMembership: mocks.getWorkspaceMembership }));
vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error {
    status = 500;
  },
  getInstallationAccessToken: mocks.getInstallationAccessToken,
  githubRequest: mocks.githubRequest
}));
vi.mock("@/lib/github/installations", () => ({
  configureNewRepository: mocks.configureNewRepository,
  fetchGitHubAppInstallations: mocks.fetchGitHubAppInstallations,
  fetchGitHubInstallation: mocks.fetchGitHubInstallation,
  fetchInstallationRepositories: mocks.fetchInstallationRepositories,
  userOwnsGitHubInstallation: mocks.userOwnsGitHubInstallation
}));

import {
  connectRepositoriesToWorkspace,
  resolveRepositoryAccessRequest
} from "@/lib/github/repository-access";

const installation = {
  id: 123,
  repository_selection: "selected" as const,
  account: { login: "octocat", type: "User" as const }
};
const repositories = [
  {
    id: 456,
    owner: { login: "octocat" },
    name: "app",
    full_name: "octocat/app",
    private: true,
    default_branch: "main"
  },
  {
    id: 789,
    owner: { login: "octocat" },
    name: "web",
    full_name: "octocat/web",
    private: false,
    default_branch: "main"
  }
];

describe("multitenant repository access", () => {
  beforeEach(() => {
    mocks.prisma.account.findFirst.mockResolvedValue({ access_token: "oauth-token" });
    mocks.prisma.user.findUniqueOrThrow.mockResolvedValue({ githubUserId: "10" });
    mocks.githubRequest.mockResolvedValue({ id: 10, login: "octocat" });
    mocks.fetchGitHubInstallation.mockResolvedValue(installation);
    mocks.fetchInstallationRepositories.mockResolvedValue(repositories);
    mocks.userOwnsGitHubInstallation.mockResolvedValue(true);
    mocks.prisma.repository.count.mockResolvedValue(0);
    mocks.prisma.repositoryAccessRequestItem.count.mockResolvedValue(0);
    mocks.prisma.repositoryAccessRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.gitHubInstallation.upsert.mockImplementation(async ({ create }) => ({
      id: `installation-${create.workspaceId}`,
      ...create
    }));
    mocks.prisma.repository.upsert.mockImplementation(async ({ create }) => ({
      id: `repository-${create.workspaceId}-${create.githubRepoId}`,
      ...create
    }));
    mocks.getInstallationAccessToken.mockResolvedValue("installation-token");
    mocks.configureNewRepository.mockResolvedValue({
      expectedContributorCount: 0,
      monitoredBranchCount: 0,
      warnings: []
    });
  });

  test("connects the same GitHub repository independently in two owner/admin workspaces", async () => {
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "ADMIN" });

    await connectRepositoriesToWorkspace({
      userId: "user-1",
      workspaceId: "workspace-1",
      installationId: "123",
      githubRepoIds: ["456"]
    });
    await connectRepositoriesToWorkspace({
      userId: "user-1",
      workspaceId: "workspace-2",
      installationId: "123",
      githubRepoIds: ["456"]
    });

    expect(mocks.prisma.repository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { workspaceId_githubRepoId: { workspaceId: "workspace-1", githubRepoId: "456" } }
      })
    );
    expect(mocks.prisma.repository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { workspaceId_githubRepoId: { workspaceId: "workspace-2", githubRepoId: "456" } }
      })
    );
  });

  test("creates one pending batch for a member without connecting repositories", async () => {
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.prisma.repositoryAccessRequest.create.mockResolvedValue({ id: "request-1", items: [] });

    const result = await connectRepositoriesToWorkspace({
      userId: "member-1",
      workspaceId: "workspace-1",
      installationId: "123",
      githubRepoIds: ["456", "789"]
    });

    expect(result.kind).toBe("request");
    expect(mocks.prisma.repositoryAccessRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        requesterId: "member-1",
        items: {
          create: expect.arrayContaining([
            expect.objectContaining({ githubRepoId: "456", pendingKey: "workspace-1:456" }),
            expect.objectContaining({ githubRepoId: "789", pendingKey: "workspace-1:789" })
          ])
        }
      }),
      include: { items: true }
    });
    expect(mocks.prisma.gitHubInstallation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.upsert).not.toHaveBeenCalled();
  });

  test("rejects a concurrent request for a repository that is already pending", async () => {
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.prisma.repositoryAccessRequestItem.count.mockResolvedValue(1);

    await expect(
      connectRepositoriesToWorkspace({
        userId: "member-1",
        workspaceId: "workspace-1",
        installationId: "123",
        githubRepoIds: ["456"]
      })
    ).rejects.toThrow("already has a pending request");
    expect(mocks.prisma.repositoryAccessRequest.create).not.toHaveBeenCalled();
  });

  test("allows only the workspace owner to partially approve a batch", async () => {
    const request = {
      id: "request-1",
      workspaceId: "workspace-1",
      requesterId: "member-1",
      installationId: "123",
      status: "PENDING",
      workspace: { ownerId: "owner-1" },
      requester: { id: "member-1" },
      items: [
        { id: "item-1", githubRepoId: "456" },
        { id: "item-2", githubRepoId: "789" }
      ]
    };
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue(request);
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });

    await expect(
      resolveRepositoryAccessRequest({
        reviewerUserId: "admin-1",
        requestId: "request-1",
        approvedItemIds: ["item-1"]
      })
    ).rejects.toThrow("Workspace owner role required");

    const result = await resolveRepositoryAccessRequest({
      reviewerUserId: "owner-1",
      requestId: "request-1",
      approvedItemIds: ["item-1"]
    });

    expect(result.status).toBe("PARTIALLY_APPROVED");
    expect(mocks.prisma.repository.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.repositoryAccessRequestItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ status: "APPROVED", pendingKey: null })
    });
    expect(mocks.prisma.repositoryAccessRequestItem.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: expect.objectContaining({ status: "REJECTED", pendingKey: null })
    });
    expect(mocks.prisma.repositoryAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "PENDING" },
      data: expect.objectContaining({ status: "PARTIALLY_APPROVED", reviewedById: "owner-1" })
    });
  });

  test("rejects the whole batch when the owner approves no items", async () => {
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue({
      id: "request-1",
      workspaceId: "workspace-1",
      requesterId: "member-1",
      installationId: "123",
      status: "PENDING",
      workspace: { ownerId: "owner-1" },
      requester: { id: "member-1" },
      items: [
        { id: "item-1", githubRepoId: "456" },
        { id: "item-2", githubRepoId: "789" }
      ]
    });
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });

    const result = await resolveRepositoryAccessRequest({
      reviewerUserId: "owner-1",
      requestId: "request-1",
      approvedItemIds: []
    });

    expect(result.status).toBe("REJECTED");
    expect(mocks.prisma.gitHubInstallation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryAccessRequestItem.update).toHaveBeenCalledTimes(2);
  });

  test("does not write anything when an approved repository lost GitHub access", async () => {
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue({
      id: "request-1",
      workspaceId: "workspace-1",
      requesterId: "member-1",
      installationId: "123",
      status: "PENDING",
      workspace: { ownerId: "owner-1" },
      requester: { id: "member-1" },
      items: [{ id: "item-1", githubRepoId: "456" }]
    });
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.fetchInstallationRepositories.mockResolvedValue([]);

    await expect(
      resolveRepositoryAccessRequest({
        reviewerUserId: "owner-1",
        requestId: "request-1",
        approvedItemIds: ["item-1"]
      })
    ).rejects.toThrow("no longer accessible");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.repository.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryAccessRequest.updateMany).not.toHaveBeenCalled();
  });

  test("rejects approval after the requester leaves the workspace", async () => {
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue({
      id: "request-1",
      workspaceId: "workspace-1",
      requesterId: "member-1",
      installationId: "123",
      status: "PENDING",
      workspace: { ownerId: "owner-1" },
      requester: { id: "member-1" },
      items: [{ id: "item-1", githubRepoId: "456" }]
    });
    mocks.getWorkspaceMembership.mockResolvedValue(null);

    await expect(
      resolveRepositoryAccessRequest({
        reviewerUserId: "owner-1",
        requestId: "request-1",
        approvedItemIds: ["item-1"]
      })
    ).rejects.toThrow("no longer a workspace member");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  test("lets the owner reject an orphaned request without calling GitHub", async () => {
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue({
      id: "request-1", workspaceId: "workspace-1", requesterId: "member-1", installationId: "123", status: "PENDING",
      workspace: { ownerId: "owner-1" }, requester: { id: "member-1" }, items: [{ id: "item-1", githubRepoId: "456" }]
    });
    mocks.getWorkspaceMembership.mockResolvedValue(null);
    mocks.prisma.account.findFirst.mockResolvedValue(null);

    const result = await resolveRepositoryAccessRequest({ reviewerUserId: "owner-1", requestId: "request-1", approvedItemIds: [] });

    expect(result.status).toBe("REJECTED");
    expect(mocks.githubRequest).not.toHaveBeenCalled();
    expect(mocks.fetchGitHubInstallation).not.toHaveBeenCalled();
  });

  test("does not connect repositories when another reviewer already claimed the request", async () => {
    mocks.prisma.repositoryAccessRequest.findUnique.mockResolvedValue({
      id: "request-1", workspaceId: "workspace-1", requesterId: "member-1", installationId: "123", status: "PENDING",
      workspace: { ownerId: "owner-1" }, requester: { id: "member-1" }, items: [{ id: "item-1", githubRepoId: "456" }]
    });
    mocks.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.prisma.repositoryAccessRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(resolveRepositoryAccessRequest({ reviewerUserId: "owner-1", requestId: "request-1", approvedItemIds: ["item-1"] }))
      .rejects.toThrow("Pending request not found");
    expect(mocks.prisma.repository.upsert).not.toHaveBeenCalled();
  });
});
