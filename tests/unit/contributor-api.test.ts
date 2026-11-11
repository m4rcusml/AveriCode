import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(), addExpectedContributor: vi.fn(), updateRepositoryContributor: vi.fn(), syncRepositoryActivity: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/repository-config", () => ({ addExpectedContributor: mocks.addExpectedContributor, updateRepositoryContributor: mocks.updateRepositoryContributor }));
vi.mock("@/lib/github/sync", () => ({ syncRepositoryActivity: mocks.syncRepositoryActivity }));
import { POST } from "@/app/api/repositories/[repositoryId]/contributors/route";
import { PATCH, DELETE } from "@/app/api/repository-contributors/[repositoryContributorId]/route";

const postContext = { params: Promise.resolve({ repositoryId: "repo-1" }) };
const patchContext = { params: Promise.resolve({ repositoryContributorId: "rc-1" }) };
function request(method: string, body?: string) {
  return new NextRequest("http://localhost/api/contributors", { method, body, headers: { "Content-Type": "application/json" } });
}

describe("contributor API validation", () => {
  beforeEach(() => {
    mocks.getAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.addExpectedContributor.mockResolvedValue({
      id: "rc-1", repositoryId: "repo-1", isExpected: true, isIgnored: false, contributor: { username: "octocat" }
    });
    mocks.updateRepositoryContributor.mockResolvedValue({ id: "rc-1" });
    mocks.syncRepositoryActivity.mockResolvedValue({});
  });

  test.each(["{", "null", "[]", '{"username":12}', '{"username":null}', '{"email":"private@example.test"}', '{"username":"alice","githubUserId":"42","name":"poisoned"}', '{"username":"alice","avatarUrl":"https://example.invalid/tracker"}'])(
    "rejects invalid contributor body %j without mutation", async (body) => {
      const response = await POST(request("POST", body), postContext);
      expect(response.status).toBe(400);
      expect(mocks.addExpectedContributor).not.toHaveBeenCalled();
    }
  );

  test.each(["{", "null", "[]", "{}", '{"isExpected":"true"}'])(
    "rejects invalid contributor update %j without mutation", async (body) => {
      const response = await PATCH(request("PATCH", body), patchContext);
      expect(response.status).toBe(400);
      expect(mocks.updateRepositoryContributor).not.toHaveBeenCalled();
    }
  );

  test("reports a saved contributor even when synchronization fails", async () => {
    mocks.syncRepositoryActivity.mockRejectedValue(new Error("Unavailable"));
    const response = await POST(request("POST", '{"username":"octocat"}'), postContext);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      repositoryContributor: {
        id: "rc-1", repositoryId: "repo-1", isExpected: true, isIgnored: false, contributor: { username: "octocat" }
      },
      syncError: "Contributor saved. Run sync again to update activity."
    });
  });

  test("does not serialize a global contributor's private metadata from another workspace", async () => {
    mocks.addExpectedContributor.mockResolvedValue({
      id: "rc-1", repositoryId: "repo-1", isExpected: true, isIgnored: false,
      contributor: { username: "alice", email: "private-in-another-workspace@example.test", name: "Private author name", githubUserId: "42", avatarUrl: "private-avatar" }
    });
    const response = await POST(request("POST", '{"username":"alice"}'), postContext);
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.repositoryContributor.contributor).toEqual({ username: "alice" });
    expect(JSON.stringify(result)).not.toContain("private-in-another-workspace");
    expect(JSON.stringify(result)).not.toContain("Private author name");
  });

  test("rejects unauthenticated updates before reading input", async () => {
    mocks.getAuthSession.mockResolvedValue(null);
    expect((await PATCH(request("PATCH", "{"), patchContext)).status).toBe(401);
    expect(mocks.updateRepositoryContributor).not.toHaveBeenCalled();
  });

  test("cross-workspace contributor mutations remain forbidden", async () => {
    mocks.updateRepositoryContributor.mockRejectedValue(new Error("Workspace access denied."));
    expect((await DELETE(request("DELETE"), patchContext)).status).toBe(403);
    expect(mocks.updateRepositoryContributor).toHaveBeenCalledWith("user-1", "rc-1", { isExpected: false });
  });
});
