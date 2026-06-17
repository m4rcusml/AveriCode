import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, CircleHelp, ExternalLink, Github, GitBranch, Users } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const [installationCount, repositoryCount, activeRepositoryCount, expectedContributorCount] =
    await Promise.all([
      prisma.gitHubInstallation.count({ where: { workspaceId: workspace.id } }),
      prisma.repository.count({ where: { workspaceId: workspace.id } }),
      prisma.repository.count({ where: { workspaceId: workspace.id, isActive: true } }),
      prisma.repositoryContributor.count({
        where: {
          isExpected: true,
          repository: {
            workspaceId: workspace.id
          }
        }
      })
    ]);
  const installUrl = getGitHubAppInstallUrl(workspace.id);

  const checklist = [
    {
      label: "Sign in with GitHub OAuth",
      done: true
    },
    {
      label: "Install the AveriCode GitHub App",
      done: installationCount > 0
    },
    {
      label: "Import repositories from the installation",
      done: repositoryCount > 0
    },
    {
      label: "Activate repositories to monitor",
      done: activeRepositoryCount > 0
    },
    {
      label: "Configure expected contributors",
      done: expectedContributorCount > 0
    }
  ];

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-copy">
            Connect a GitHub App installation to <strong>{workspace.name}</strong>, import repositories, and
            choose the expected contributors for weekly monitoring.
          </p>
        </div>
        <div className="button-row">
          {installUrl ? (
            <a className="button button-primary" href={installUrl}>
              <Github aria-hidden size={16} />
              Install GitHub App
              <ExternalLink aria-hidden size={14} />
            </a>
          ) : (
            <Link className="button button-secondary" href="/settings">
              Configure app slug
            </Link>
          )}
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Setup checklist</h2>
            <p className="section-copy">Each step unlocks the next part of the monitoring workflow.</p>
          </div>
        </div>
        <ul className="checklist">
          {checklist.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <span className={`status-badge ${item.done ? "status-active" : "status-unknown"}`}>
                {item.done ? <CircleCheck aria-hidden size={16} /> : <CircleHelp aria-hidden size={16} />}
                {item.done ? "Done" : "Pending"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="metric-grid" aria-label="Onboarding metrics">
        <div className="metric-card">
          <div className="metric-label">
            <Github aria-hidden size={16} />
            Installations
          </div>
          <div className="metric-value">{installationCount}</div>
          <div className="metric-note">GitHub App connections</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <GitBranch aria-hidden size={16} />
            Imported repositories
          </div>
          <div className="metric-value">{repositoryCount}</div>
          <div className="metric-note">{activeRepositoryCount} active</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Users aria-hidden size={16} />
            Expected contributors
          </div>
          <div className="metric-value">{expectedContributorCount}</div>
          <div className="metric-note">Configured for monitoring</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <CircleCheck aria-hidden size={16} />
            Dashboard source
          </div>
          <div className="metric-value">DB</div>
          <div className="metric-note">No live GitHub rendering</div>
        </div>
      </section>

      <section className="section">
        <div className="button-row">
          <Link className="button button-primary" href="/onboarding/repositories">
            Configure repositories
          </Link>
          <Link className="button button-secondary" href="/dashboard/contributors">
            Configure contributors
          </Link>
        </div>
      </section>
    </main>
  );
}
