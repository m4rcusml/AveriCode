import { describe, expect, test } from "vitest";
import { isScheduledSyncDue, parseSyncSchedule } from "@/lib/sync-schedule";

describe("workspace sync schedules", () => {
  const now = new Date("2026-08-12T09:00:00.000Z");

  test.each([
    ["DAILY", "2026-08-11T08:59:59.000Z", true],
    ["DAILY", "2026-08-11T12:00:00.000Z", false],
    ["WEEKLY", "2026-08-05T09:00:00.000Z", true],
    ["BIWEEKLY", "2026-07-29T09:00:00.000Z", true],
    ["MONTHLY", "2026-07-13T09:00:00.000Z", true]
  ] as const)("evaluates %s using its configured interval", (schedule, lastRun, expected) => {
    expect(isScheduledSyncDue(schedule, new Date(lastRun), now)).toBe(expected);
  });

  test("accepts only supported schedule values", () => {
    expect(parseSyncSchedule("BIWEEKLY")).toBe("BIWEEKLY");
    expect(parseSyncSchedule("HOURLY")).toBeNull();
  });
});
