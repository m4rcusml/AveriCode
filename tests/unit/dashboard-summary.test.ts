import { describe, expect, test } from "vitest";
import { activityDistribution, aggregatePeople, commitCategory, snapshotIsFresh, syncDistribution, syncState } from "@/lib/dashboard/summary";
import type { DashboardContributorActivityRow } from "@/lib/dashboard/queries";

const now = new Date("2026-11-11T12:00:00Z");
const row = (id: string, status: DashboardContributorActivityRow["status"], isIgnored = false): DashboardContributorActivityRow => ({
  id: `membership-${id}-${status}`, contributorId: id, name: id, username: id, avatarUrl: null, email: null,
  status, isIgnored, commitCount: status === "ACTIVE" ? 1 : 0, lastCommitAt: null, lastCommitBranch: null
});

describe("leadership portfolio evidence", () => {
  test("counts a person once across projects and retains activity elsewhere", () => {
    const people = aggregatePeople([
      { id: "a", fullName: "org/a", contributorRows: [row("ana", "INACTIVE"), row("bruno", "INACTIVE"), row("bot", "ACTIVE", true)] },
      { id: "b", fullName: "org/b", contributorRows: [row("ana", "ACTIVE"), row("bruno", "UNKNOWN")] }
    ]);
    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({ id: "ana", status: "ACTIVE" });
    expect(people[0].projects).toHaveLength(2);
    expect(people[1]).toMatchObject({ id: "bruno", status: "UNKNOWN" });
  });
  test("does not classify an old or future snapshot as current evidence", () => {
    expect(snapshotIsFresh(new Date("2026-11-11T09:00:00Z"), now)).toBe(true);
    expect(snapshotIsFresh(new Date("2026-11-09T09:00:00Z"), now)).toBe(false);
    expect(snapshotIsFresh(new Date("2026-11-12T09:00:00Z"), now)).toBe(false);
  });
  test("exposes failed, suspended and never-synced integrations instead of healthy projects", () => {
    const yesterday = new Date("2026-11-10T09:00:00Z");
    expect(syncState(yesterday, "FAILED", null, now)).toBe("FAILED");
    expect(syncState(yesterday, "SUCCESS", now, now)).toBe("SUSPENDED");
    expect(syncState(null, undefined, null, now)).toBe("NEVER");
    expect(syncState(yesterday, "RUNNING", null, now)).toBe("RUNNING");
    expect(syncState(yesterday, "RUNNING", null, now, new Date(now.getTime() - 31 * 60 * 1000))).toBe("FAILED");
  });
  test("visual participation includes every expected person and keeps unknown separate from absence", () => {
    const people = [
      ...Array.from({ length: 18 }, (_, index) => row(`active-${index}`, "ACTIVE")),
      row("no-commit", "INACTIVE"), row("missing-capture", "UNKNOWN"), row("bot", "ACTIVE", true)
    ];
    expect(activityDistribution(people)).toEqual({ active: 18, inactive: 1, unknown: 1, total: 20 });
    expect(activityDistribution([])).toEqual({ active: 0, inactive: 0, unknown: 0, total: 0 });
  });
  test("the portfolio graphic distinguishes integration failures from missing or old evidence", () => {
    expect(syncDistribution([
      { syncState: "CURRENT" }, { syncState: "CURRENT" }, { syncState: "FAILED" }, { syncState: "SUSPENDED" },
      { syncState: "NEVER" }, { syncState: "STALE" }, { syncState: "NEEDS_REVIEW" }
    ])).toEqual({ current: 2, failed: 2, waiting: 3, total: 7 });
  });
  test("feed categories reflect only an explicit conventional prefix", () => {
    expect(commitCategory("feat(checkout)!: revisa o fluxo de cobrança")).toBe("feat");
    expect(commitCategory("FIX: corrige o retry")).toBe("fix");
    expect(commitCategory("Melhora o checkout")).toBeNull();
    expect(commitCategory("release: versão nova")).toBeNull();
  });
});
