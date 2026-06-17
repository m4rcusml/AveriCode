import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertCircle, Clock, GitBranch, RefreshCw, Users } from "lucide-react";
import type { ActivityStatus } from "@prisma/client";
import { StatusBadge } from "@/components/status-badge";
import { getAuthSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";
import { syncRepositoryNowAction } from "@/app/actions";

export const dynamic = "force-dynamic";

type ActivityRow = {
  repositoryId: string;
  repositoryName: string;
  contributorId: string;
  contributorName: string;
  status: ActivityStatus | "UNKNOWN";
  commitCount: number;
  lastCommitAt: Date | null;
  periodEnd: Date | null;
};

export default async function DashboardPage() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const [repositories, expectedContributors, latestSyncRun] = await Promise.all([
    prisma.repository.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { fullName: "asc" }
    }),
    prisma.repositoryContributor.findMany({
      where: {
        isExpected: true,
        isIgnored: false,
        repository: {
          workspaceId: workspace.id,
          isActive: true
        }
      },
      include: {
        contributor: true,
        repository: true
      },
      orderBy: {
        repository: {
          fullName: "asc"
        }
      }
    }),
    prisma.syncRun.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { startedAt: "desc" }
    })
  ]);
  const repositoryIds = [...new Set(expectedContributors.map((item) => item.repositoryId))];
  const contributorIds = [...new Set(expectedContributors.map((item) => item.contributorId))];
  const snapshots =
    repositoryIds.length && contributorIds.length
      ? await prisma.commitActivitySnapshot.findMany({
          where: {
            repositoryId: { in: repositoryIds },
            contributorId: { in: contributorIds }
          },
          orderBy: {
            periodEnd: "desc"
          }
        })
      : [];
  const latestSnapshotByPair = new Map<string, (typeof snapshots)[number]>();

  for (const snapshot of snapshots) {
    const key = `${snapshot.repositoryId}:${snapshot.contributorId}`;

    if (!latestSnapshotByPair.has(key)) {
      latestSnapshotByPair.set(key, snapshot);
    }
  }

  const rows: ActivityRow[] = expectedContributors.map((repositoryContributor) => {
    const snapshot = latestSnapshotByPair.get(
      `${repositoryContributor.repositoryId}:${repositoryContributor.contributorId}`
    );

    return {
      repositoryId: repositoryContributor.repositoryId,
      repositoryName: repositoryContributor.repository.fullName,
      contributorId: repositoryContributor.contributorId,
      contributorName:
        repositoryContributor.contributor.name ??
        repositoryContributor.contributor.username ??
        repositoryContributor.contributor.email ??
        "Unknown contributor",
      status: snapshot?.status ?? "UNKNOWN",
      commitCount: snapshot?.commitCount ?? 0,
      lastCommitAt: snapshot?.lastCommitAt ?? null,
      periodEnd: snapshot?.periodEnd ?? null
    };
  });
  const activeRepositoryCount = repositories.filter((repository) => repository.isActive).length;
  const inactiveCount = rows.filter((row) => row.status === "INACTIVE").length;
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const unknownCount = rows.filter((row) => row.status === "UNKNOWN").length;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-copy">
            Workspace: <strong>{workspace.name}</strong>. Activity is rendered from PostgreSQL snapshots,
            not live GitHub calls.
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/onboarding">
            <GitBranch aria-hidden size={16} />
            Onboarding
          </Link>
          <Link className="button button-primary" href="/dashboard/contributors">
            <Users aria-hidden size={16} />
            Configure contributors
          </Link>
        </div>
      </div>

      <section className="metric-grid" aria-label="Workspace activity metrics">
        <div className="metric-card">
          <div className="metric-label">
            <GitBranch aria-hidden size={16} />
            Active repositories
          </div>
          <div className="metric-value">{activeRepositoryCount}</div>
          <div className="metric-note">{repositories.length} imported total</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Activity aria-hidden size={16} />
            Active contributors
          </div>
          <div className="metric-value">{activeCount}</div>
          <div className="metric-note">Expected contributors with commits</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <AlertCircle aria-hidden size={16} />
            Inactive contributors
          </div>
          <div className="metric-value">{inactiveCount}</div>
          <div className="metric-note">Expected contributors with zero commits</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Clock aria-hidden size={16} />
            Last sync
          </div>
          <div className="metric-value">{latestSyncRun ? formatDate(latestSyncRun.startedAt) : "None"}</div>
          <div className="metric-note">
            {unknownCount > 0 ? `${unknownCount} contributor(s) need a snapshot` : "Snapshots are current"}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Expected contributor activity</h2>
            <p className="section-copy">Latest saved 7-day snapshot per expected contributor.</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <div>
              <h2>No activity snapshots yet</h2>
              <p>
                Import repositories, activate monitoring, configure expected contributors, then run a manual
                sync.
              </p>
              <div className="button-row">
                <Link className="button button-primary" href="/onboarding">
                  Start onboarding
                </Link>
                <Link className="button button-secondary" href="/dashboard/repositories">
                  View repositories
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Contributor</th>
                  <th>Status</th>
                  <th>Commits</th>
                  <th>Last commit</th>
                  <th>Snapshot</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.repositoryId}:${row.contributorId}`}>
                    <td>
                      <div className="cell-title">{row.repositoryName}</div>
                    </td>
                    <td>{row.contributorName}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{row.commitCount}</td>
                    <td>{formatDateTime(row.lastCommitAt)}</td>
                    <td>{formatDateTime(row.periodEnd)}</td>
                    <td>
                      <form action={syncRepositoryNowAction}>
                        <input name="repositoryId" type="hidden" value={row.repositoryId} />
                        <input name="returnTo" type="hidden" value="/dashboard" />
                        <button className="button button-secondary" type="submit">
                          <RefreshCw aria-hidden size={16} />
                          Sync
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
