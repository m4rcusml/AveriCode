import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(), assertRepositoryWriteAccess: vi.fn(), assertWorkspaceWriteAccess: vi.fn(), assertWorkspaceAccess: vi.fn(),
  getSelectedWorkspaceForUser: vi.fn(), getManualSyncCooldown: vi.fn(), syncRepositoryActivity: vi.fn(),
  prisma: { repository: { findMany: vi.fn() } }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/workspaces", () => ({ assertRepositoryWriteAccess: mocks.assertRepositoryWriteAccess, assertWorkspaceWriteAccess: mocks.assertWorkspaceWriteAccess, assertWorkspaceAccess: mocks.assertWorkspaceAccess }));
vi.mock("@/lib/workspace-selection", () => ({ getSelectedWorkspaceForUser: mocks.getSelectedWorkspaceForUser }));
vi.mock("@/lib/github/sync", () => ({ getManualSyncCooldown: mocks.getManualSyncCooldown, syncRepositoryActivity: mocks.syncRepositoryActivity }));
import { GET, POST } from "@/app/api/github/sync-now/route";

function request(body: unknown) {
  return new NextRequest("https://avericode.test/api/github/sync-now", { method: "POST", body: JSON.stringify(body) });
}

describe("manual sync API boundaries", () => {
  beforeEach(() => {
    mocks.getAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.assertRepositoryWriteAccess.mockResolvedValue({});
    mocks.assertWorkspaceAccess.mockResolvedValue({ role: "MEMBER" });
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

  test("gives each manual repository sync an enforced deadline", async () => {
    const before = Date.now();
    expect((await POST(request({ repositoryId: "repo-1" }))).status).toBe(200);
    const input = mocks.syncRepositoryActivity.mock.calls[0][0];
    expect(input.deadline).toBeGreaterThanOrEqual(before + 60_000);
    expect(input.deadline).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  test("returns a partial result instead of starting more projects after the workspace budget", async () => {
    const initialTime = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(initialTime);
    mocks.prisma.repository.findMany.mockResolvedValue([{ id: "repo-1", fullName: "demo/one" }, { id: "repo-2", fullName: "demo/two" }]);
    mocks.syncRepositoryActivity.mockImplementation(async () => {
      clock.mockReturnValue(initialTime + 240_000);
      return { repositoryId: "repo-1" };
    });
    try {
      const response = await POST(request({ workspaceId: "workspace-1" }));
      expect(await response.json()).toMatchObject({ total: 2, succeeded: 1, failed: 0, skipped: 1 });
      expect(mocks.syncRepositoryActivity).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
    }
  });

  test("rejects cross-origin synchronization before running authentication or mutations", async () => {
    const incoming = new NextRequest("https://avericode.test/api/github/sync-now", {
      method: "POST", headers: { Origin: "https://attacker.test" }, body: JSON.stringify({ repositoryId: "repo-1" })
    });
    expect((await POST(incoming)).status).toBe(403);
    expect(mocks.getAuthSession).not.toHaveBeenCalled();
    expect(mocks.syncRepositoryActivity).not.toHaveBeenCalled();
  });

  test("allows a member to read only their workspace's saved synchronization state", async () => {
    mocks.prisma.repository.findMany.mockResolvedValue([
      { id: "repo-1", lastSyncedAt: new Date("2026-11-11T12:00:00Z"), configurationError: null, installation: { suspendedAt: null }, syncRuns: [{ status: "SUCCESS", startedAt: new Date() }] }
    ]);
    const response = await GET(new NextRequest("https://avericode.test/api/github/sync-now?workspaceId=workspace-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ repositories: [
      { id: "repo-1", lastSyncedAt: "2026-11-11T12:00:00.000Z", status: "SUCCESS", configurationError: null, suspendedAt: null }
    ] });
    expect(mocks.assertWorkspaceAccess).toHaveBeenCalledWith("user-1", "workspace-1");
    expect(mocks.prisma.repository.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "workspace-1" }, orderBy: { id: "asc" } }));
    expect(mocks.syncRepositoryActivity).not.toHaveBeenCalled();
  });

  test("does not disclose sync state to another tenant", async () => {
    mocks.assertWorkspaceAccess.mockRejectedValue(new Error("Workspace access denied."));
    const response = await GET(new NextRequest("https://avericode.test/api/github/sync-now?workspaceId=other-workspace"));
    expect(response.status).toBe(403);
    expect(mocks.prisma.repository.findMany).not.toHaveBeenCalled();
  });

  test("expired RUNNING claims are recoverable instead of permanently disabling synchronization", async () => {
    mocks.prisma.repository.findMany.mockResolvedValue([
      { id: "repo-1", lastSyncedAt: null, configurationError: null, installation: { suspendedAt: null }, syncRuns: [{ status: "RUNNING", startedAt: new Date(Date.now() - 31 * 60_000) }] }
    ]);
    const response = await GET(new NextRequest("https://avericode.test/api/github/sync-now?workspaceId=workspace-1"));
    expect(await response.json()).toMatchObject({ repositories: [{ id: "repo-1", status: "FAILED" }] });
  });
});
