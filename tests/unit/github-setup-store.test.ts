import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  $transaction: vi.fn(), verificationToken: { create: vi.fn(), deleteMany: vi.fn() }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks }));
import { createGitHubSetupState } from "@/lib/github/setup-state";
import { consumeGitHubSetupState, rememberGitHubSetupState } from "@/lib/github/setup-state-store";

describe("single-use installation setup", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-state-secret");
    mocks.$transaction.mockImplementation(async (callback) => callback(mocks));
    mocks.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
  });

  test("stores a hash and expiry rather than the browser state token", async () => {
    const token = createGitHubSetupState("user-1", "workspace-1");
    await rememberGitHubSetupState(token, "user-1");
    const { data } = mocks.verificationToken.create.mock.calls[0][0];
    expect(data.identifier).toBe("github-setup:user-1");
    expect(data.token).not.toBe(token);
    expect(data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(data.expires.getTime()).toBeGreaterThan(Date.now());
  });

  test("only one concurrent callback can consume the state even if its cookie is replayed", async () => {
    const token = createGitHubSetupState("user-1", "workspace-1");
    mocks.verificationToken.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.allSettled([
      consumeGitHubSetupState(token, "user-1"), consumeGitHubSetupState(token, "user-1")
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  test("rejects a different signed-in user before attempting database consumption", async () => {
    const token = createGitHubSetupState("user-1", "workspace-1");
    await expect(consumeGitHubSetupState(token, "user-2")).rejects.toThrow("Invalid");
    expect(mocks.verificationToken.deleteMany).not.toHaveBeenCalled();
  });
});
