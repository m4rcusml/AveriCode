import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    contributor: { findMany: vi.fn(), create: vi.fn() },
    repositoryContributor: { upsert: vi.fn() }
  }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
import { addExpectedContributorsToRepository } from "@/lib/contributors";

describe("recovering an incomplete expected-contributor roster", () => {
  beforeEach(() => {
    mocks.prisma.contributor.findMany.mockResolvedValue([]);
    mocks.prisma.contributor.create.mockImplementation(async ({ data }) => ({ id: data.githubUserId, ...data }));
  });

  test("adds missing people while preserving ignored and deselected contributors", async () => {
    const rows = new Map([
      ["10", { repositoryId: "repo", contributorId: "10", isExpected: false, isIgnored: true }],
      ["20", { repositoryId: "repo", contributorId: "20", isExpected: false, isIgnored: false }]
    ]);
    mocks.prisma.repositoryContributor.upsert.mockImplementation(async ({ where, update, create }) => {
      const key = where.repositoryId_contributorId.contributorId;
      const existing = rows.get(key);
      const result = existing ? { ...existing, ...update } : create;
      rows.set(key, result);
      return result;
    });

    await addExpectedContributorsToRepository("repo", [
      { githubUserId: "10", username: "ignored-person" },
      { githubUserId: "20", username: "deselected-person" },
      { githubUserId: "30", username: "new-teammate" }
    ], { preserveExisting: true });

    expect(rows.get("10")).toMatchObject({ isExpected: false, isIgnored: true });
    expect(rows.get("20")).toMatchObject({ isExpected: false, isIgnored: false });
    expect(rows.get("30")).toMatchObject({ isExpected: true, isIgnored: false });
  });

  test("stops onboarding before another contributor write after a cron deadline abort", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Time budget exhausted"));
    await expect(addExpectedContributorsToRepository("repo", [{ githubUserId: "10", username: "alice" }], {
      preserveExisting: true, signal: controller.signal
    })).rejects.toThrow("Time budget exhausted");
    expect(mocks.prisma.repositoryContributor.upsert).not.toHaveBeenCalled();
  });
});
