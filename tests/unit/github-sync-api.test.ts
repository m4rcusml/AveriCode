import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(), assertRepositoryWriteAccess: vi.fn(), assertWorkspaceWriteAccess: vi.fn(),
  getSelectedWorkspaceForUser: vi.fn(), getManualSyncCooldown: vi.fn(), syncRepositoryActivity: vi.fn(),
  prisma: { repository: { findMany: vi.fn() } }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/workspaces", () => ({ assertRepositoryWriteAccess: mocks.assertRepositoryWriteAccess, assertWorkspaceWriteAccess: mocks.assertWorkspaceWriteAccess }));
vi.mock("@/lib/workspace-selection", () => ({ getSelectedWorkspaceForUser: mocks.getSelectedWorkspaceForUser }));
vi.mock("@/lib/github/sync", () => ({ getManualSyncCooldown: mocks.getManualSyncCooldown, syncRepositoryActivity: mocks.syncRepositoryActivity }));
import { POST } from "@/app/api/github/sync-now/route";

function request(body: unknown) {
  return new NextRequest("https://avericode.test/api/github/sync-now", { method: "POST", body: JSON.stringify(body) });
}

describe("manual sync API boundaries", () => {
  beforeEach(() => {
    mocks.getAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.assertRepositoryWriteAccess.mockResolvedValue({});
    mocks.getManualSyncCooldown.mockResolvedValue(0);
    mocks.syncRepositoryActivity.mockResolvedValue({ repositoryId: "repo-1" });
  });

  test("requires authentication", async () => {
    mocks.getAuthSession.mockResolvedValue(null);
    expect((await POST(request({ repositoryId: "repo-1" }))).status).toBe(401);
    expect(mocks.syncRepositoryActivity).not.toHaveBeenCalled();
  });

  test.each([null, [], { repositoryId: {} }, { workspaceId: 4 }, { repositoryId: "" }])("rejects malformed identifiers: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.syncRepositoryActivity).not.toHaveBeenCalled();
  });

  test("denies a repository in an unauthorized workspace before syncing", async () => {
    mocks.assertRepositoryWriteAccess.mockRejectedValue(new Error("Workspace access denied"));
    expect((await POST(request({ repositoryId: "repo-1" }))).status).toBe(403);
    expect(mocks.getManualSyncCooldown).not.toHaveBeenCalled();
    expect(mocks.syncRepositoryActivity).not.toHaveBeenCalled();
  });

  test("still returns 429 if another request wins the cooldown race", async () => {
    mocks.getManualSyncCooldown.mockResolvedValueOnce(0).mockResolvedValueOnce(240_000);
    mocks.syncRepositoryActivity.mockRejectedValue(new Error("Manual sync is rate limited. Try again in 4 minute(s)."));
    const response = await POST(request({ repositoryId: "repo-1" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("240");
  });
});
