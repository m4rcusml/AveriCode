import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Building2,
  CircleSlash,
  Clock,
  ExternalLink,
  GitBranch,
  Github,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
  Users,
  UserRound
} from "lucide-react";
import { GitHubSetupNotice } from "@/components/github-setup-notice";
import type { ActivityStatus } from "@prisma/client";
import { ManualSyncToast } from "@/components/manual-sync-toast";
import { StatusBadge } from "@/components/status-badge";
import { getAuthSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { getGitHubAppInstallUrl, getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";
import {
  refreshInstallationRepositoriesAction,
  removeExpectedContributorAction,
  syncRepositoryNowAction,
  syncWorkspaceRepositoriesNowAction,
  toggleRepositoryMonitoringAction,
  toggleIgnoredContributorAction
} from "@/app/actions";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type DashboardPageProps = {
  searchParams?: Promise<{
    failed_count?: string | string[];
    imported?: string | string[];
    installationId?: string | string[];
    manual_sync_error?: string | string[];
    retry_after_ms?: string | string[];
    setup_action?: string | string[];
    setup_error?: string | string[];
    skipped_count?: string | string[];
    synced_count?: string | string[];
  }>;
};

type ContributorActivityRow = {
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

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  INACTIVE: 1,
  UNKNOWN: 2
};

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function dashboardHref(installationId: string | null | undefined) {
  return installationId ? `/dashboard?installationId=${installationId}` : "/dashboard";
}

function contributorName(contributor: { email: string | null; name: string | null; username: string | null }) {
  return contributor.name ?? contributor.username ?? contributor.email ?? "Unknown contributor";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const installUrl = getGitHubAppInstallUrl(workspace.id);
  const [installations, latestSyncRun] = await Promise.all([
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
  const requestedInstallationId = firstValue(resolvedSearchParams?.installationId);
  const tabInstallations = installations.filter(
    (installation) => installation.accountType === "ORGANIZATION" || installation.repositories.length > 0
  );
  const selectedInstallation =
    tabInstallations.find((installation) => installation.id === requestedInstallationId) ??
    tabInstallations[0] ??
    null;
  const selectedDashboardHref = dashboardHref(selectedInstallation?.id);
  const repositories = installations.flatMap((installation) => installation.repositories);
  const activeRepositories = repositories.filter((repository) => repository.isActive);
  const repositoryContributors = repositories.flatMap((repository) => repository.contributors);
  const repositoryIds = [...new Set(repositoryContributors.map((item) => item.repositoryId))];
  const contributorIds = [...new Set(repositoryContributors.map((item) => item.contributorId))];
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

  function contributorRowsForRepository(repository: (typeof repositories)[number]) {
    return repository.contributors
      .map((repositoryContributor): ContributorActivityRow => {
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

  const allContributorRows = activeRepositories
    .flatMap(contributorRowsForRepository)
    .filter((row) => !row.isIgnored);
  const activeContributorCount = allContributorRows.filter((row) => row.status === "ACTIVE").length;
  const inactiveContributorCount = allContributorRows.filter((row) => row.status === "INACTIVE").length;
  const unknownContributorCount = allContributorRows.filter((row) => row.status === "UNKNOWN").length;

  return (
    <main className="page">
      <ManualSyncToast
        dismissHref={selectedDashboardHref}
        error={resolvedSearchParams?.manual_sync_error}
        failedCount={resolvedSearchParams?.failed_count}
        retryAfterMs={resolvedSearchParams?.retry_after_ms}
        skippedCount={resolvedSearchParams?.skipped_count}
        syncedCount={resolvedSearchParams?.synced_count}
      />
      <GitHubSetupNotice
        imported={resolvedSearchParams?.imported}
        setupAction={resolvedSearchParams?.setup_action}
        setupError={resolvedSearchParams?.setup_error}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">{workspace.name}</h1>
          <p className="page-copy">Repository activity dashboard for the last 7 days.</p>
        </div>
        <div className="button-row">
          {installUrl ? (
            <a className="button button-primary" href={installUrl}>
              <Github aria-hidden size={16} />
              Add repositories
              <ExternalLink aria-hidden size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <section className="metric-grid" aria-label="Workspace activity metrics">
        <div className="metric-card">
          <div className="metric-label">
            <GitBranch aria-hidden size={16} />
            Monitored repositories
          </div>
          <div className="metric-value">{activeRepositories.length}</div>
          <div className="metric-note">{repositories.length} imported total</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Activity aria-hidden size={16} />
            Active contributors
          </div>
          <div className="metric-value">{activeContributorCount}</div>
          <div className="metric-note">Expected contributors with commits</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <AlertCircle aria-hidden size={16} />
            Inactive contributors
          </div>
          <div className="metric-value">{inactiveContributorCount}</div>
          <div className="metric-note">
            {unknownContributorCount > 0 ? `${unknownContributorCount} without snapshot` : "Snapshots available"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Clock aria-hidden size={16} />
            Last sync
          </div>
          <div className="metric-value metric-value-compact">{formatDateTime(latestSyncRun?.startedAt)}</div>
          <div className="metric-note">{latestSyncTarget(latestSyncRun)}</div>
        </div>
      </section>

      {tabInstallations.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <div>
            <h2>No repositories connected</h2>
            <p>Add a personal or organization repository to start monitoring expected contributors.</p>
            {installUrl ? (
              <a className="button button-primary" href={installUrl}>
                <Github aria-hidden size={16} />
                Add repositories
              </a>
            ) : (
              <Link className="button button-secondary" href="/settings">
                Configure GitHub App
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <section className="dashboard-toolbar" aria-label="GitHub account filters">
            <div className="tab-bar" role="tablist">
              {tabInstallations.map((installation) => {
                const selected = installation.id === selectedInstallation?.id;
                const AccountIcon = installation.accountType === "USER" ? UserRound : Building2;

                return (
                  <Link
                    aria-selected={selected}
                    className={`tab-item ${selected ? "tab-item-active" : ""}`}
                    href={dashboardHref(installation.id)}
                    key={installation.id}
                    role="tab"
                  >
                    <AccountIcon aria-hidden size={16} />
                    <span>{installation.accountLogin}</span>
                    <span className="pill">{installation.repositories.length}</span>
                  </Link>
                );
              })}
            </div>
            <div className="button-row">
              {selectedInstallation ? (
                <>
                  <a
                    className="button button-secondary"
                    href={getGitHubInstallationSettingsUrl(selectedInstallation)}
                  >
                    <Github aria-hidden size={16} />
                    Configure access
                    <ExternalLink aria-hidden size={14} />
                  </a>
                  <form action={refreshInstallationRepositoriesAction}>
                    <input name="installationId" type="hidden" value={selectedInstallation.id} />
                    <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                    <button className="button button-secondary" type="submit">
                      <RefreshCw aria-hidden size={16} />
                      Refresh repos
                    </button>
                  </form>
                </>
              ) : null}
              <form action={syncWorkspaceRepositoriesNowAction}>
                <input name="workspaceId" type="hidden" value={workspace.id} />
                <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                <button className="button button-primary" type="submit">
                  <RefreshCw aria-hidden size={16} />
                  Sync all repositories
                </button>
              </form>
            </div>
          </section>

          <section className="repository-card-grid" aria-label="Repositories">
            {selectedInstallation?.repositories.length ? (
              selectedInstallation.repositories.map((repository) => {
                const contributorRows = contributorRowsForRepository(repository);

                return (
                  <article className="repository-card" key={repository.id}>
                    <div className="repository-card-header">
                      <div className="repository-card-title">
                        <div className="repository-title-line">
                          <h2>{repository.fullName}</h2>
                          <form action={toggleRepositoryMonitoringAction}>
                            <input name="repositoryId" type="hidden" value={repository.id} />
                            <input name="isActive" type="hidden" value={repository.isActive ? "false" : "true"} />
                            <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                            <button className="button button-secondary" type="submit">
                              <GitBranch aria-hidden size={16} />
                              {repository.isActive ? "Stop monitoring" : "Monitor"}
                            </button>
                          </form>
                        </div>
                        <p>
                          {repository.private ? "Private" : "Public"}
                          {repository.defaultBranch ? ` / ${repository.defaultBranch}` : ""}
                        </p>
                      </div>
                      <div className="repository-card-actions">
                        <span className={`status-badge ${repository.isActive ? "status-active" : "status-unknown"}`}>
                          <GitBranch aria-hidden size={16} />
                          {repository.isActive ? "Monitored" : "Not monitored"}
                        </span>
                        <span className="repository-sync-date">Last sync: {formatDateTime(repository.lastSyncedAt)}</span>
                        <form action={syncRepositoryNowAction}>
                          <input name="repositoryId" type="hidden" value={repository.id} />
                          <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                          <button className="button button-secondary" type="submit">
                            <RefreshCw aria-hidden size={16} />
                            Sync
                          </button>
                        </form>
                        <Link
                          className="button button-secondary"
                          href={`/dashboard/repositories/${repository.id}/branches`}
                        >
                          <GitBranch aria-hidden size={16} />
                          Branches
                        </Link>
                      </div>
                    </div>

                    {contributorRows.length === 0 ? (
                      <div className="empty-state repository-empty">
                        <div>
                          <h3>No expected contributors</h3>
                          <p>Add expected contributors before this repository can show activity.</p>
                          <Link
                            className="button button-secondary"
                            href={`/dashboard/repositories/${repository.id}/contributors`}
                          >
                            Configure contributors
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="button-row contributor-list-toolbar">
                          <Link
                            className="button button-secondary"
                            href={`/dashboard/repositories/${repository.id}/contributors`}
                          >
                            <Users aria-hidden size={16} />
                            Configure contributors
                          </Link>
                        </div>
                        <div className="contributor-list">
                          {contributorRows.map((contributor) => (
                            <div
                              className={`contributor-row ${contributor.isIgnored ? "contributor-row-ignored" : ""}`}
                              key={contributor.id}
                            >
                              <StatusBadge status={contributor.status} />
                              <div className="contributor-person">
                                {contributor.avatarUrl ? (
                                  <Image
                                    alt=""
                                    className="avatar"
                                    height={38}
                                    src={contributor.avatarUrl}
                                    width={38}
                                  />
                                ) : (
                                  <span className="avatar-placeholder">{initials(contributor.name)}</span>
                                )}
                                <div className="contributor-copy">
                                  <strong>{contributor.name}</strong>
                                  <span>{contributor.username ? `@${contributor.username}` : "No username"}</span>
                                  {contributor.isIgnored ? (
                                    <span className="pill contributor-inline-pill">Ignored</span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="contributor-field">
                                <span className="contributor-label">Email</span>
                                <span className="contributor-value">{contributor.email ?? "None"}</span>
                              </div>
                              <div className="contributor-field">
                                <span className="contributor-label">Commits</span>
                                <span className="contributor-value">{contributor.commitCount}</span>
                              </div>
                              <div className="contributor-field">
                                <span className="contributor-label">Last commit</span>
                                <span className="contributor-value">
                                  {formatDateTime(contributor.lastCommitAt)}
                                  {contributor.lastCommitBranch ? (
                                    <span className="branch-chip">{contributor.lastCommitBranch}</span>
                                  ) : null}
                                </span>
                              </div>
                              <details className="row-action-menu">
                                <summary
                                  aria-label={`Open actions for ${contributor.name}`}
                                  className="icon-button"
                                  title="Contributor actions"
                                >
                                  <MoreHorizontal aria-hidden size={18} />
                                </summary>
                                <div className="action-menu" role="menu">
                                  <form action={toggleIgnoredContributorAction}>
                                    <input name="repositoryContributorId" type="hidden" value={contributor.id} />
                                    <input
                                      name="isIgnored"
                                      type="hidden"
                                      value={contributor.isIgnored ? "false" : "true"}
                                    />
                                    <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                                    <button className="action-menu-item" role="menuitem" type="submit">
                                      {contributor.isIgnored ? (
                                        <RotateCcw aria-hidden size={16} />
                                      ) : (
                                        <CircleSlash aria-hidden size={16} />
                                      )}
                                      {contributor.isIgnored ? "Restore" : "Ignore"}
                                    </button>
                                  </form>
                                  <form action={removeExpectedContributorAction}>
                                    <input name="repositoryContributorId" type="hidden" value={contributor.id} />
                                    <input name="returnTo" type="hidden" value={selectedDashboardHref} />
                                    <button
                                      className="action-menu-item action-menu-item-danger"
                                      role="menuitem"
                                      type="submit"
                                    >
                                      <Trash2 aria-hidden size={16} />
                                      Delete
                                    </button>
                                  </form>
                                </div>
                              </details>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="empty-state dashboard-empty">
                <div>
                  <h2>No repositories imported for this account</h2>
                  <p>Refresh repository access after selecting repositories in the GitHub App installation.</p>
                  {selectedInstallation ? (
                    <a
                      className="button button-primary"
                      href={getGitHubInstallationSettingsUrl(selectedInstallation)}
                    >
                      Configure access
                      <ExternalLink aria-hidden size={14} />
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
