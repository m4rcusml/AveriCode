import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertRepositoryWriteAccess: vi.fn(),
  prisma: {
    contributor: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    repositoryContributor: { upsert: vi.fn() }
  }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/workspaces", () => ({ assertRepositoryWriteAccess: mocks.assertRepositoryWriteAccess, assertWorkspaceWriteAccess: vi.fn() }));
import { addExpectedContributor, addExpectedContributors } from "@/lib/repository-config";

describe("untrusted contributor configuration", () => {
  beforeEach(() => {
    mocks.assertRepositoryWriteAccess.mockResolvedValue({ id: "my-repository", workspaceId: "my-workspace" });
    mocks.prisma.contributor.findFirst.mockResolvedValue({ id: "global-alice" });
    mocks.prisma.contributor.upsert.mockResolvedValue({ id: "new-contributor" });
    mocks.prisma.repositoryContributor.upsert.mockResolvedValue({ id: "expected-alice", contributor: { username: "alice" } });
  });

  test("links an existing public username without reading private fields or rewriting its profile", async () => {
    await addExpectedContributor("owner", "my-repository", { username: "@Alice" });
    expect(mocks.prisma.contributor.findFirst).toHaveBeenCalledWith({
      where: { username: { equals: "alice", mode: "insensitive" } }, select: { id: true }
    });
    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryContributor.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { repositoryId: "my-repository", contributorId: "global-alice", isExpected: true, isIgnored: false, source: "MANUAL" },
      update: { isExpected: true, isIgnored: false, source: "MANUAL" },
      select: expect.objectContaining({ contributor: { select: { username: true } } })
    }));
  });

  test("new configuration creates only a normalized username", async () => {
    mocks.prisma.contributor.findFirst.mockResolvedValue(null);
    await addExpectedContributor("owner", "my-repository", { username: "alice" });
    expect(mocks.prisma.contributor.upsert).toHaveBeenCalledWith({
      where: { username: "alice" }, update: {}, create: { username: "alice" }, select: { id: true }
    });
  });

  test("rejects arbitrary ids and profile metadata at the configuration boundary", async () => {
    const attack = { username: "alice", githubUserId: "42", name: "Poisoned", email: "private@example.test", avatarUrl: "https://example.invalid/tracker" };
    await expect(addExpectedContributor("owner", "my-repository", attack)).rejects.toThrow("only a GitHub username");
    expect(mocks.prisma.contributor.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
    expect(mocks.prisma.repositoryContributor.upsert).not.toHaveBeenCalled();
  });

  test.each(["", " ", "alice@example.test", "/alice", "-alice", "alice-", "a".repeat(40)])("rejects invalid login %j", async (username) => {
    await expect(addExpectedContributor("owner", "my-repository", { username })).rejects.toThrow("valid GitHub username");
    expect(mocks.prisma.repositoryContributor.upsert).not.toHaveBeenCalled();
  });

  test("validates all selections before writing any and deduplicates logins", async () => {
    await expect(addExpectedContributors("owner", "my-repository", [{ username: "alice" }, { username: "invalid@email" }])).rejects.toThrow("valid GitHub username");
    expect(mocks.prisma.repositoryContributor.upsert).not.toHaveBeenCalled();
    await addExpectedContributors("owner", "my-repository", [{ username: "alice" }, { username: "@ALICE" }]);
    expect(mocks.prisma.repositoryContributor.upsert).toHaveBeenCalledOnce();
  });
});
