import { Prisma, type ActivityStatus, type GitHubAccountType, type RepositorySelection, type SyncRunStatus } from "@prisma/client";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { firstSearchParamValue, type SearchParamValue } from "@/lib/search-params";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";
import { aggregatePeople, snapshotIsFresh, syncState, type PortfolioSyncState } from "@/lib/dashboard/summary";

export type DashboardSearchParams = { installationId?: SearchParamValue; q?: SearchParamValue; focus?: SearchParamValue; view?: SearchParamValue };
export type DashboardWorkspace = { id: string; name: string; slug: string };
export type DashboardContributorActivityRow = {
  id: string; contributorId: string; avatarUrl: string | null; commitCount: number; email: string | null;
  isIgnored: boolean; lastCommitAt: Date | null; lastCommitBranch: string | null; name: string;
  status: ActivityStatus; username: string | null;
};
export type DashboardUpdate = {
  id: string; sha: string; message: string; url: string; authorUsername: string | null; authorAvatarUrl: string | null;
  committedAt: Date; branch: string; repositoryId: string; repositoryName: string;
};
export type DashboardRepository = {
  id: string; defaultBranch: string | null; fullName: string; lastSyncedAt: Date | null; private: boolean;
  contributorRows: DashboardContributorActivityRow[]; branches: string[]; updates: DashboardUpdate[];
  syncState: PortfolioSyncState; latestSyncStatus: SyncRunStatus | null; syncError: string | null;
  periodStart: Date | null; periodEnd: Date | null; suspendedAt: Date | null; isActive: boolean; configurationError: string | null;
};
export type DashboardInstallation = {
  id: string; accountLogin: string; accountType: GitHubAccountType; installationId: string;
  repositorySelection: RepositorySelection; repositories: DashboardRepository[];
};
export type DashboardMetrics = {
  activeContributorCount: number; inactiveContributorCount: number; unknownContributorCount: number;
  latestSyncStartedAt: Date | null; latestSyncTarget: string; monitoredRepositoryCount: number; totalRepositoryCount: number;
  attentionRepositoryCount: number; failedRepositoryCount: number; expectedContributorCount: number;
};
export type DashboardData = {
  installUrl: string | null; installations: DashboardInstallation[]; metrics: DashboardMetrics; selectedDashboardHref: string;
  selectedInstallation: DashboardInstallation | null; tabInstallations: DashboardInstallation[]; workspace: DashboardWorkspace;
  repositories: DashboardRepository[]; allRepositories: DashboardRepository[]; updates: DashboardUpdate[];
  canManageWorkspace: boolean; pendingRequestCount: number; query: string; focus: string; view: string;
  people: ReturnType<typeof aggregatePeople>; syncSchedule: string;
};

export function dashboardHref(installationId: string | null | undefined) {
  return installationId ? `/dashboard?installationId=${encodeURIComponent(installationId)}` : "/dashboard";
}

type Snapshot = { repositoryId: string; contributorId: string; commitCount: number; lastCommitAt: Date | null; lastCommitBranch: string | null; status: ActivityStatus; periodStart: Date; periodEnd: Date };

export async function getDashboardData(userId: string, searchParams?: DashboardSearchParams): Promise<DashboardData> {
  const workspace = await getSelectedWorkspaceForUser(userId);
  const now = new Date();
  const [rawInstallations, membership, pendingRequestCount, snapshots] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { workspaceId: workspace.id },
      include: { repositories: { include: {
        contributors: { where: { isExpected: true }, include: { contributor: { select: { id: true, username: true, avatarUrl: true } } } },
        branches: { orderBy: { name: "asc" } },
        updates: { orderBy: { committedAt: "desc" }, take: 5 },
        syncRuns: { orderBy: { startedAt: "desc" }, take: 1 }
      }, orderBy: { fullName: "asc" } } },
      orderBy: [{ accountType: "asc" }, { accountLogin: "asc" }]
    }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } }, select: { role: true } }),
    prisma.repositoryAccessRequest.count({ where: { workspaceId: workspace.id, items: { some: { status: "PENDING" } } } }),
    // Return the latest saved window per person/project without loading its history into React.
    prisma.$queryRaw<Snapshot[]>(Prisma.sql`
      SELECT DISTINCT ON (s."repositoryId", s."contributorId")
        s."repositoryId", s."contributorId", s."commitCount", s."lastCommitAt", s."lastCommitBranch", s."status", s."periodStart", s."periodEnd"
      FROM "CommitActivitySnapshot" s
      JOIN "Repository" r ON r.id = s."repositoryId"
      WHERE r."workspaceId" = ${workspace.id}
      ORDER BY s."repositoryId", s."contributorId", s."periodEnd" DESC, s."createdAt" DESC
    `)
  ]);
  const snapshotByPair = new Map(snapshots.map((s) => [`${s.repositoryId}:${s.contributorId}`, s]));
  const installations: DashboardInstallation[] = rawInstallations.map((installation) => ({
    id: installation.id, accountLogin: installation.accountLogin, accountType: installation.accountType,
    installationId: installation.installationId, repositorySelection: installation.repositorySelection,
    repositories: installation.repositories.map((repository) => {
      const latestRun = repository.syncRuns[0];
      const state = repository.configurationError && latestRun?.status !== "FAILED" && !installation.suspendedAt ? "NEEDS_REVIEW" as const : syncState(repository.lastSyncedAt, latestRun?.status, installation.suspendedAt, now);
      const period = repository.contributors.map((rc) => snapshotByPair.get(`${repository.id}:${rc.contributorId}`)).find(Boolean);
      return {
        id: repository.id, fullName: repository.fullName, defaultBranch: repository.defaultBranch,
        private: repository.private, lastSyncedAt: repository.lastSyncedAt, isActive: repository.isActive, configurationError: repository.configurationError,
        suspendedAt: installation.suspendedAt, syncState: state, latestSyncStatus: latestRun?.status ?? null,
        syncError: latestRun?.status === "FAILED" ? latestRun.error : null,
        periodStart: period?.periodStart ?? null, periodEnd: period?.periodEnd ?? null,
        branches: [...new Set([repository.defaultBranch, ...repository.branches.map((b) => b.name)].filter((name): name is string => Boolean(name)))],
        updates: repository.updates.map((update) => ({ ...update, repositoryName: repository.fullName })),
        contributorRows: repository.contributors.map((rc): DashboardContributorActivityRow => {
          const s = snapshotByPair.get(`${repository.id}:${rc.contributorId}`);
          return { id: rc.id, contributorId: rc.contributorId, avatarUrl: rc.contributor.avatarUrl, email: null,
            isIgnored: rc.isIgnored, name: rc.contributor.username ?? "Conta sem vínculo",
            username: rc.contributor.username, status: s && snapshotIsFresh(s.periodEnd, now) && !installation.suspendedAt && !repository.configurationError ? s.status : "UNKNOWN",
            commitCount: s?.commitCount ?? 0, lastCommitAt: s?.lastCommitAt ?? null, lastCommitBranch: s?.lastCommitBranch ?? null };
        }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      };
    })
  }));
  const priority: Record<PortfolioSyncState,number> = { FAILED: 0, SUSPENDED: 1, NEEDS_REVIEW: 2, NEVER: 3, STALE: 4, RUNNING: 5, CURRENT: 6 };
  const allRepositories = installations.flatMap((i) => i.repositories).sort((a,b) => priority[a.syncState]-priority[b.syncState] || a.fullName.localeCompare(b.fullName,"pt-BR"));
  const requestedId = firstSearchParamValue(searchParams?.installationId);
  const selectedInstallation = installations.find((i) => i.id === requestedId) ?? null;
  const query = (firstSearchParamValue(searchParams?.q) ?? "").trim().slice(0, 200);
  const focus = firstSearchParamValue(searchParams?.focus) === "attention" ? "attention" : "all";
  const view = firstSearchParamValue(searchParams?.view) === "people" ? "people" : "projects";
  const scopedRepositories = selectedInstallation ? [...selectedInstallation.repositories].sort((a,b) => priority[a.syncState]-priority[b.syncState] || a.fullName.localeCompare(b.fullName,"pt-BR")) : allRepositories;
  const repositories = scopedRepositories.filter((r) => (!query || `${r.fullName} ${r.contributorRows.map((c) => `${c.name} ${c.username ?? ""}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) && (focus !== "attention" || r.syncState !== "CURRENT"));
  const people = aggregatePeople(scopedRepositories);
  const latestSync = allRepositories.map((r) => r.lastSyncedAt).filter((d): d is Date => Boolean(d)).sort((a,b) => b.getTime()-a.getTime())[0] ?? null;
  return {
    installUrl: getGitHubAppInstallUrl(workspace.id), installations, selectedInstallation, tabInstallations: installations,
    selectedDashboardHref: dashboardHref(selectedInstallation?.id), workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    canManageWorkspace: membership?.role === "OWNER" || membership?.role === "ADMIN", pendingRequestCount,
    repositories, allRepositories, updates: repositories.flatMap((r) => r.updates).sort((a,b) => b.committedAt.getTime()-a.committedAt.getTime()).slice(0, 20),
    people, query, focus, view, syncSchedule: workspace.syncSchedule,
    metrics: { activeContributorCount: people.filter((p) => p.status === "ACTIVE").length,
      inactiveContributorCount: people.filter((p) => p.status === "INACTIVE").length,
      unknownContributorCount: people.filter((p) => p.status === "UNKNOWN").length, expectedContributorCount: people.length,
      latestSyncStartedAt: latestSync, latestSyncTarget: "Última sincronização concluída",
      monitoredRepositoryCount: scopedRepositories.filter((r) => r.isActive).length, totalRepositoryCount: scopedRepositories.length,
      attentionRepositoryCount: scopedRepositories.filter((r) => r.syncState !== "CURRENT").length,
      failedRepositoryCount: scopedRepositories.filter((r) => r.syncState === "FAILED" || r.syncState === "SUSPENDED").length }
  };
}
