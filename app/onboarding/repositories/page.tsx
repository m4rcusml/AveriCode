import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Github, GitBranch, RefreshCw } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";
import { syncRepositoryNowAction, toggleRepositoryMonitoringAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OnboardingRepositoriesPage() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const installUrl = getGitHubAppInstallUrl(workspace.id);
  const repositories = await prisma.repository.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { fullName: "asc" },
    include: {
      installation: true
    }
  });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Repository onboarding</h1>
          <p className="page-copy">
            Activate the imported repositories that should participate in weekly contributor checks.
          </p>
        </div>
        <div className="button-row">
          {installUrl ? (
            <a className="button button-secondary" href={installUrl}>
              <Github aria-hidden size={16} />
              Reconnect GitHub App
              <ExternalLink aria-hidden size={14} />
            </a>
          ) : (
            <Link className="button button-secondary" href="/settings">
              Configure app slug
            </Link>
          )}
          <Link className="button button-primary" href="/dashboard/contributors">
            Next: contributors
          </Link>
        </div>
      </div>

      {repositories.length === 0 ? (
        <div className="empty-state">
          <div>
            <h2>No repositories imported</h2>
            <p>
              Install the GitHub App for this workspace. GitHub will redirect back and AveriCode will import
              the accessible repositories.
            </p>
            {installUrl ? (
              <a className="button button-primary" href={installUrl}>
                <Github aria-hidden size={16} />
                Install GitHub App
              </a>
            ) : (
              <Link className="button button-secondary" href="/settings">
                Configure GitHub App settings
              </Link>
            )}
          </div>
        </div>
      ) : (
        <section className="section">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Installation</th>
                  <th>Monitoring</th>
                  <th>Last sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {repositories.map((repository) => (
                  <tr key={repository.id}>
                    <td>
                      <div className="cell-title">{repository.fullName}</div>
                      <div className="cell-subtitle">{repository.private ? "Private" : "Public"}</div>
                    </td>
                    <td>{repository.installation.accountLogin}</td>
                    <td>
                      <span className={`status-badge ${repository.isActive ? "status-active" : "status-unknown"}`}>
                        <GitBranch aria-hidden size={16} />
                        {repository.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDateTime(repository.lastSyncedAt)}</td>
                    <td>
                      <div className="button-row">
                        <form action={toggleRepositoryMonitoringAction}>
                          <input name="repositoryId" type="hidden" value={repository.id} />
                          <input name="isActive" type="hidden" value={repository.isActive ? "false" : "true"} />
                          <input name="returnTo" type="hidden" value="/onboarding/repositories" />
                          <button className="button button-secondary" type="submit">
                            {repository.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                        {repository.isActive ? (
                          <form action={syncRepositoryNowAction}>
                            <input name="repositoryId" type="hidden" value={repository.id} />
                            <input name="returnTo" type="hidden" value="/onboarding/repositories" />
                            <button className="button button-secondary" type="submit">
                              <RefreshCw aria-hidden size={16} />
                              Sync
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
