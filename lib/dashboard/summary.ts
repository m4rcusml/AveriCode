import type { ActivityStatus, SyncRunStatus } from "@prisma/client";
import type { DashboardContributorActivityRow } from "@/lib/dashboard/queries";

const FRESH_WINDOW_MS = 36 * 60 * 60 * 1000;
export type PortfolioSyncState = "CURRENT" | "STALE" | "FAILED" | "RUNNING" | "NEVER" | "SUSPENDED" | "NEEDS_REVIEW";

export function snapshotIsFresh(periodEnd: Date, now = new Date()) {
  const age = now.getTime() - periodEnd.getTime();
  return age >= -60_000 && age <= FRESH_WINDOW_MS;
}

export function syncState(lastSyncedAt: Date | null, latestStatus?: SyncRunStatus, suspendedAt?: Date | null, now = new Date()): PortfolioSyncState {
  if (suspendedAt) return "SUSPENDED";
  if (latestStatus === "RUNNING" || latestStatus === "PENDING") return "RUNNING";
  if (latestStatus === "FAILED") return "FAILED";
  if (!lastSyncedAt) return "NEVER";
  return snapshotIsFresh(lastSyncedAt, now) ? "CURRENT" : "STALE";
}

export type PortfolioPerson = {
  id: string; name: string; username: string | null; avatarUrl: string | null; status: ActivityStatus;
  projects: Array<{ id: string; name: string; status: ActivityStatus; branch: string | null }>;
};

export function aggregatePeople(repositories: Array<{ id: string; fullName: string; contributorRows: DashboardContributorActivityRow[] }>) {
  const people = new Map<string, PortfolioPerson>();
  for (const repository of repositories) {
    for (const row of repository.contributorRows) {
      if (row.isIgnored) continue;
      const person = people.get(row.contributorId) ?? { id: row.contributorId, name: row.name, username: row.username, avatarUrl: row.avatarUrl, status: "INACTIVE" as ActivityStatus, projects: [] };
      person.projects.push({ id: repository.id, name: repository.fullName, status: row.status, branch: row.lastCommitBranch });
      person.status = person.projects.some((p) => p.status === "ACTIVE") ? "ACTIVE" : person.projects.some((p) => p.status === "UNKNOWN") ? "UNKNOWN" : "INACTIVE";
      people.set(person.id, person);
    }
  }
  return [...people.values()].sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
}
