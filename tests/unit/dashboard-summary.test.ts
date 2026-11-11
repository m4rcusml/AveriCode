import { describe, expect, test } from "vitest";
import { aggregatePeople, snapshotIsFresh, syncState } from "@/lib/dashboard/summary";
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
  });
});
