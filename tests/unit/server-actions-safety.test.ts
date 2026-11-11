import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), updateRepositoryContributor: vi.fn(), addExpectedContributor: vi.fn(), addExpectedContributors: vi.fn(),
  assertRepositoryWriteAccess: vi.fn(), assertWorkspaceWriteAccess: vi.fn(),
  getManualSyncCooldown: vi.fn(), syncRepositoryActivity: vi.fn(), revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string): never => { throw new Error(`REDIRECT:${destination}`); })
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/repository-config", () => ({
  addExpectedContributor: mocks.addExpectedContributor, addExpectedContributors: mocks.addExpectedContributors,
  addRepositoryBranches: vi.fn(), removeRepositoryBranch: vi.fn(), updateRepositoryContributor: mocks.updateRepositoryContributor
}));
vi.mock("@/lib/github/installations", () => ({ importInstallationRepositories: vi.fn() }));
vi.mock("@/lib/github/repository-access", () => ({ connectRepositoriesToWorkspace: vi.fn(), resolveRepositoryAccessRequest: vi.fn() }));
vi.mock("@/lib/github/sync", () => ({ getManualSyncCooldown: mocks.getManualSyncCooldown, syncRepositoryActivity: mocks.syncRepositoryActivity }));
vi.mock("@/lib/workspace-selection", () => ({ setSelectedWorkspaceForUser: vi.fn(), getSelectedWorkspaceForUser: vi.fn() }));
vi.mock("@/lib/workspaces", () => ({
  addWorkspaceMember: vi.fn(), assertRepositoryWriteAccess: mocks.assertRepositoryWriteAccess,
  assertWorkspaceWriteAccess: mocks.assertWorkspaceWriteAccess, removeWorkspaceMember: vi.fn(),
  updateWorkspaceSyncSchedule: vi.fn(), updateWorkspaceMemberRole: vi.fn(), workspaceMemberRole: vi.fn()
}));

import { addExpectedContributorAction, confirmExpectedContributorsAction, removeExpectedContributorAction, syncRepositoryNowAction } from "@/app/actions";

function form(returnPath: string) {
  const data = new FormData();
  data.set("returnTo", returnPath);
  data.set("repositoryContributorId", "contributor-1");
  data.set("repositoryId", "repository-1");
  data.set("username", "octocat");
  return data;
}

describe("server action redirects and recovery", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.getManualSyncCooldown.mockResolvedValue(0);
    mocks.syncRepositoryActivity.mockResolvedValue({});
  });

  test.each(["//attacker.example", "/\\attacker.example", "/\t/attacker.example", "https://attacker.example"])(
    "rejects unsafe return destination %j", async (destination) => {
      await expect(removeExpectedContributorAction(form(destination))).rejects.toThrow("REDIRECT:/dashboard");
      expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    }
  );

  test("preserves a local filtered dashboard return destination", async () => {
    const destination = "/dashboard?installationId=installation-1";
    await expect(removeExpectedContributorAction(form(destination))).rejects.toThrow(`REDIRECT:${destination}`);
    expect(mocks.updateRepositoryContributor).toHaveBeenCalledWith("user-1", "contributor-1", { isExpected: false });
  });

  test("keeps a saved expected contributor when its automatic sync fails", async () => {
    mocks.syncRepositoryActivity.mockRejectedValue(new Error("GitHub unavailable"));

    await expect(addExpectedContributorAction(form("/dashboard")))
      .rejects.toThrow("REDIRECT:/dashboard?manual_sync_error=sync_failed");
    expect(mocks.addExpectedContributor).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("manual configuration forwards only a username even if the form includes metadata", async () => {
    const input = form("/dashboard");
    input.set("email", "private@example.test");
    input.set("name", "Poisoned name");
    input.set("githubUserId", "42");
    await expect(addExpectedContributorAction(input)).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.addExpectedContributor).toHaveBeenCalledWith("user-1", "repository-1", { username: "octocat" });
  });

  test("suggested user metadata from a tampered form cannot modify global identity", async () => {
    const input = form("/dashboard");
    input.append("selectedContributor", JSON.stringify({ username: "alice", githubUserId: "42", avatarUrl: "https://example.invalid/tracker", name: "Poisoned" }));
    await expect(confirmExpectedContributorsAction(input)).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.addExpectedContributors).toHaveBeenCalledWith("user-1", "repository-1", [{ username: "alice" }]);
  });

  test("handles a cooldown race detected inside the database claim", async () => {
    mocks.getManualSyncCooldown.mockResolvedValueOnce(0).mockResolvedValueOnce(60000);
    mocks.syncRepositoryActivity.mockRejectedValue(new Error("Manual sync is rate limited. Try again in 1 minute(s)."));

    await expect(syncRepositoryNowAction(form("/dashboard")))
      .rejects.toThrow("REDIRECT:/dashboard?manual_sync_error=rate_limited&retry_after_ms=60000");
  });

  test("returns a recoverable sync error instead of rendering an error page", async () => {
    mocks.syncRepositoryActivity.mockRejectedValue(new Error("Installation suspended"));

    await expect(syncRepositoryNowAction(form("/dashboard")))
      .rejects.toThrow("REDIRECT:/dashboard?manual_sync_error=sync_failed");
  });
});
