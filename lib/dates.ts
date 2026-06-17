const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getLastSevenDayPeriod(now = new Date()) {
  return {
    periodStart: new Date(now.getTime() - 7 * DAY_IN_MS),
    periodEnd: now
  };
}

export function formatDateTime(date: Date | null | undefined) {
  if (!date) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium"
  }).format(date);
}
