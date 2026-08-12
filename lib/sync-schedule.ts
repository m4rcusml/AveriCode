import type { SyncSchedule } from "@prisma/client";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const SYNC_SCHEDULE_OPTIONS: Array<{
  value: SyncSchedule;
  label: string;
  description: string;
}> = [
  {
    value: "DAILY",
    label: "Every day",
    description: "Runs once per day at approximately 06:00 America/Sao_Paulo."
  },
  {
    value: "WEEKLY",
    label: "Every week",
    description: "Runs every 7 days."
  },
  {
    value: "BIWEEKLY",
    label: "Every 2 weeks",
    description: "Runs every 14 days."
  },
  {
    value: "MONTHLY",
    label: "Every month",
    description: "Runs every 30 days."
  }
];

export function parseSyncSchedule(value: string | null | undefined): SyncSchedule | null {
  return SYNC_SCHEDULE_OPTIONS.some((option) => option.value === value)
    ? (value as SyncSchedule)
    : null;
}

export function syncScheduleIntervalMs(schedule: SyncSchedule) {
  switch (schedule) {
    case "DAILY":
      return DAY_IN_MS;
    case "BIWEEKLY":
      return 14 * DAY_IN_MS;
    case "MONTHLY":
      return 30 * DAY_IN_MS;
    case "WEEKLY":
    default:
      return 7 * DAY_IN_MS;
  }
}

export function isScheduledSyncDue(
  schedule: SyncSchedule,
  lastScheduledSyncAt: Date | null,
  now = new Date()
) {
  if (!lastScheduledSyncAt) {
    return true;
  }

  return now.getTime() - lastScheduledSyncAt.getTime() >= syncScheduleIntervalMs(schedule);
}
