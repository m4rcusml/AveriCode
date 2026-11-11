import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    workspaceMember: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn() },
    workspace: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
    repository: { findUnique: vi.fn() }
  }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
import { addWorkspaceMember, assertRepositoryWriteAccess, ensureDefaultWorkspaceForUser } from "@/lib/workspaces";

describe("workspace authorization and onboarding", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.workspaceMember.findFirst.mockResolvedValue(null);
    mocks.prisma.workspaceMember.findUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "shared-prefix-unique-user-1", name: "Leader", githubUsername: "leader", email: "leader@example.test"
    });
    mocks.prisma.workspace.create.mockResolvedValue({ id: "new-workspace" });
    mocks.prisma.workspace.findUniqueOrThrow.mockResolvedValue({ ownerId: "owner" });
  });

  test("rechecks membership under a user row lock before creating a default workspace", async () => {
    await ensureDefaultWorkspaceForUser("shared-prefix-unique-user-1");

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.workspaceMember.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.workspaceMember.findFirst.mock.invocationCallOrder[1]
    );
    expect(mocks.prisma.workspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: "leader-shared-prefix-unique-user-1",
        ownerId: "shared-prefix-unique-user-1",
        members: { create: { userId: "shared-prefix-unique-user-1", role: "OWNER" } }
      })
    });
  });

  test("uses the workspace created by a concurrent sign-in after acquiring the lock", async () => {
    const workspace = { id: "concurrent-workspace" };
    mocks.prisma.workspaceMember.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ workspace });

    await expect(ensureDefaultWorkspaceForUser("user-1")).resolves.toEqual(workspace);
    expect(mocks.prisma.workspace.create).not.toHaveBeenCalled();
  });

  test("cannot demote the owner through the add-member upsert", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "owner" });

    await expect(addWorkspaceMember("admin", "workspace-1", "owner", "MEMBER"))
      .rejects.toThrow("Workspace owner role cannot be changed.");
    expect(mocks.prisma.workspaceMember.upsert).not.toHaveBeenCalled();
  });

  test("members cannot add teammates", async () => {
    mocks.prisma.workspaceMember.findUnique.mockResolvedValue({ role: "MEMBER" });

    await expect(addWorkspaceMember("member", "workspace-1", "someone", "ADMIN"))
      .rejects.toThrow("Owner or admin role required.");
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  test("repository mutations authorize against the repository workspace", async () => {
    mocks.prisma.repository.findUnique.mockResolvedValue({ id: "repo", workspaceId: "other-workspace" });
    mocks.prisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(assertRepositoryWriteAccess("user-1", "repo")).rejects.toThrow("Workspace access denied.");
    expect(mocks.prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "other-workspace", userId: "user-1" } }
    });
  });
});
