import type { ActivityStatus, GitHubAccountType, RepositorySelection } from "@prisma/client";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { firstSearchParamValue, type SearchParamValue } from "@/lib/search-params";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";

export type DashboardSearchParams = {
  installationId?: SearchParamValue;
};

export type DashboardWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export type DashboardContributorActivityRow = {
  id: string;
  avatarUrl: string | null;
  commitCount: number;
  email: string | null;
  isIgnored: boolean;
  lastCommitAt: Date | null;
  lastCommitBranch: string | null;
  name: string;
  status: ActivityStatus | "UNKNOWN";
  username: string | null;
};

export type DashboardRepository = {
  id: string;
  defaultBranch: string | null;
  fullName: string;
  isActive: boolean;
  lastSyncedAt: Date | null;
  private: boolean;
  contributorRows: DashboardContributorActivityRow[];
};

export type DashboardInstallation = {
  id: string;
  accountLogin: string;
  accountType: GitHubAccountType;
  installationId: string;
  repositorySelection: RepositorySelection;
  repositories: DashboardRepository[];
};

export type DashboardMetrics = {
  activeContributorCount: number;
  inactiveContributorCount: number;
  latestSyncStartedAt: Date | null;
  latestSyncTarget: string;
  monitoredRepositoryCount: number;
  totalRepositoryCount: number;
  unknownContributorCount: number;
};

export type DashboardData = {
  installUrl: string | null;
  installations: DashboardInstallation[];
  metrics: DashboardMetrics;
  selectedDashboardHref: string;
  selectedInstallation: DashboardInstallation | null;
  tabInstallations: DashboardInstallation[];
  workspace: DashboardWorkspace;
};

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  INACTIVE: 1,
  UNKNOWN: 2
};

export function dashboardHref(installationId: string | null | undefined) {
  return installationId ? `/dashboard?installationId=${installationId}` : "/dashboard";
}

function contributorName(contributor: { email: string | null; name: string | null; username: string | null }) {
  return contributor.name ?? contributor.username ?? contributor.email ?? "Unknown contributor";
}

function latestSyncTarget(
  syncRun: {
    repository: {
      fullName: string;
      installation: {
        accountLogin: string;
      };
    } | null;
  } | null
) {
  if (!syncRun) {
    return "No sync has run yet";
  }

  if (!syncRun.repository) {
    return "All monitored repositories";
  }

  return `${syncRun.repository.fullName} in ${syncRun.repository.installation.accountLogin}`;
}

export async function getDashboardData(
  userId: string,
  searchParams?: DashboardSearchParams
): Promise<DashboardData> {
  const workspace = await getSelectedWorkspaceForUser(userId);
  const installUrl = getGitHubAppInstallUrl(workspace.id);
  const [rawInstallations, latestSyncRun] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { workspaceId: workspace.id },
      include: {
        repositories: {
          include: {
            contributors: {
              where: {
                isExpected: true
              },
              include: {
                contributor: true
              },
              orderBy: {
                createdAt: "asc"
              }
            }
          },
          orderBy: {
            fullName: "asc"
          }
        }
      },
      orderBy: [{ accountType: "asc" }, { accountLogin: "asc" }]
    }),
    prisma.syncRun.findFirst({
      where: { workspaceId: workspace.id },
      include: {
        repository: {
          include: {
            installation: true
          }
        }
      },
      orderBy: {
        startedAt: "desc"
      }
    })
  ]);
  const rawRepositories = rawInstallations.flatMap((installation) => installation.repositories);
  const rawRepositoryContributors = rawRepositories.flatMap((repository) => repository.contributors);
  const repositoryIds = [...new Set(rawRepositoryContributors.map((item) => item.repositoryId))];
  const contributorIds = [...new Set(rawRepositoryContributors.map((item) => item.contributorId))];
  const snapshots =
    repositoryIds.length && contributorIds.length
      ? await prisma.commitActivitySnapshot.findMany({
          where: {
            contributorId: { in: contributorIds },
            repositoryId: { in: repositoryIds }
          },
          orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }]
        })
      : [];
  const latestSnapshotByPair = new Map<string, (typeof snapshots)[number]>();

  for (const snapshot of snapshots) {
    const key = `${snapshot.repositoryId}:${snapshot.contributorId}`;

    if (!latestSnapshotByPair.has(key)) {
      latestSnapshotByPair.set(key, snapshot);
    }
  }

  function contributorRowsForRepository(repository: (typeof rawRepositories)[number]) {
    return repository.contributors
      .map((repositoryContributor): DashboardContributorActivityRow => {
        const snapshot = latestSnapshotByPair.get(
          `${repositoryContributor.repositoryId}:${repositoryContributor.contributorId}`
        );
        const name = contributorName(repositoryContributor.contributor);

        return {
          id: repositoryContributor.id,
          avatarUrl: repositoryContributor.contributor.avatarUrl,
          commitCount: snapshot?.commitCount ?? 0,
          email: repositoryContributor.contributor.email,
          isIgnored: repositoryContributor.isIgnored,
          lastCommitAt: snapshot?.lastCommitAt ?? null,
          lastCommitBranch: snapshot?.lastCommitBranch ?? null,
          name,
          status: snapshot?.status ?? "UNKNOWN",
          username: repositoryContributor.contributor.username
        };
      })
      .sort((first, second) => {
        if (first.isIgnored !== second.isIgnored) {
          return first.isIgnored ? 1 : -1;
        }

        const statusSort = STATUS_ORDER[first.status] - STATUS_ORDER[second.status];
        return statusSort || first.name.localeCompare(second.name);
      });
  }

  const installations = rawInstallations.map((installation): DashboardInstallation => ({
    id: installation.id,
    accountLogin: installation.accountLogin,
    accountType: installation.accountType,
    installationId: installation.installationId,
    repositorySelection: installation.repositorySelection,
    repositories: installation.repositories.map((repository): DashboardRepository => ({
      id: repository.id,
      defaultBranch: repository.defaultBranch,
      fullName: repository.fullName,
      isActive: repository.isActive,
      lastSyncedAt: repository.lastSyncedAt,
      private: repository.private,
      contributorRows: contributorRowsForRepository(repository)
    }))
  }));
  const requestedInstallationId = firstSearchParamValue(searchParams?.installationId);
  const tabInstallations = installations.filter(
    (installation) => installation.accountType === "ORGANIZATION" || installation.repositories.length > 0
  );
  const selectedInstallation =
    tabInstallations.find((installation) => installation.id === requestedInstallationId) ??
    tabInstallations[0] ??
    null;
  const repositories = installations.flatMap((installation) => installation.repositories);
  const activeRepositories = repositories.filter((repository) => repository.isActive);
  const allContributorRows = activeRepositories
    .flatMap((repository) => repository.contributorRows)
    .filter((row) => !row.isIgnored);

  return {
    installUrl,
    installations,
    selectedDashboardHref: dashboardHref(selectedInstallation?.id),
    selectedInstallation,
    tabInstallations,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug
    },
    metrics: {
      activeContributorCount: allContributorRows.filter((row) => row.status === "ACTIVE").length,
      inactiveContributorCount: allContributorRows.filter((row) => row.status === "INACTIVE").length,
      latestSyncStartedAt: latestSyncRun?.startedAt ?? null,
      latestSyncTarget: latestSyncTarget(latestSyncRun),
      monitoredRepositoryCount: activeRepositories.length,
      totalRepositoryCount: repositories.length,
      unknownContributorCount: allContributorRows.filter((row) => row.status === "UNKNOWN").length
    }
  };
}
