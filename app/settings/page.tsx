import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Database, ExternalLink, Github, KeyRound, ShieldCheck } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function ConfigRow({
  label,
  isConfigured
}: {
  label: string;
  isConfigured: boolean;
}) {
  return (
    <li>
      <span>{label}</span>
      <span className={`status-badge ${isConfigured ? "status-active" : "status-unknown"}`}>
        <ShieldCheck aria-hidden size={16} />
        {isConfigured ? "Configured" : "Missing"}
      </span>
    </li>
  );
}

export default async function SettingsPage() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const [installations, members] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { workspaceId: workspace.id },
      include: {
        _count: {
          select: {
            repositories: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: true
      },
      orderBy: {
        createdAt: "asc"
      }
    })
  ]);
  const installUrl = getGitHubAppInstallUrl(workspace.id);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">
            Workspace, GitHub App, and cron configuration for <strong>{workspace.name}</strong>.
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
            <Link className="button button-secondary" href="/onboarding">
              Onboarding
            </Link>
          )}
        </div>
      </div>

      <section className="metric-grid" aria-label="Settings summary">
        <div className="metric-card">
          <div className="metric-label">
            <Database aria-hidden size={16} />
            Workspace slug
          </div>
          <div className="metric-value">{workspace.slug}</div>
          <div className="metric-note">Default personal workspace is created on login</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Github aria-hidden size={16} />
            Installations
          </div>
          <div className="metric-value">{installations.length}</div>
          <div className="metric-note">GitHub App connections</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <KeyRound aria-hidden size={16} />
            Members
          </div>
          <div className="metric-value">{members.length}</div>
          <div className="metric-note">Workspace membership records</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <CalendarClock aria-hidden size={16} />
            Weekly cron
          </div>
          <div className="metric-value">0 9 * * 1</div>
          <div className="metric-note">Monday 06:00 America/Sao_Paulo</div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Environment readiness</h2>
            <p className="section-copy">Values are not shown here; only presence is checked.</p>
          </div>
        </div>
        <ul className="checklist">
          <ConfigRow label="DATABASE_URL" isConfigured={configured(process.env.DATABASE_URL)} />
          <ConfigRow
            label="NEXTAUTH_SECRET or AUTH_SECRET"
            isConfigured={configured(process.env.NEXTAUTH_SECRET) || configured(process.env.AUTH_SECRET)}
          />
          <ConfigRow
            label="GitHub OAuth client id"
            isConfigured={configured(process.env.GITHUB_OAUTH_CLIENT_ID) || configured(process.env.GITHUB_APP_CLIENT_ID)}
          />
          <ConfigRow
            label="GitHub OAuth client secret"
            isConfigured={
              configured(process.env.GITHUB_OAUTH_CLIENT_SECRET) || configured(process.env.GITHUB_APP_CLIENT_SECRET)
            }
          />
          <ConfigRow label="GITHUB_APP_ID" isConfigured={configured(process.env.GITHUB_APP_ID)} />
          <ConfigRow label="GITHUB_APP_SLUG" isConfigured={configured(process.env.GITHUB_APP_SLUG)} />
          <ConfigRow
            label="GitHub App private key"
            isConfigured={
              configured(process.env.GITHUB_APP_PRIVATE_KEY) || configured(process.env.GITHUB_APP_PRIVATE_KEY_PATH)
            }
          />
        </ul>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">GitHub installations</h2>
            <p className="section-copy">Installations persist repository access for cron and manual sync.</p>
          </div>
        </div>
        {installations.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No GitHub App installation saved</h3>
              <p>Install the GitHub App to import repositories and run scheduled syncs.</p>
              {installUrl ? (
                <a className="button button-primary" href={installUrl}>
                  <Github aria-hidden size={16} />
                  Install GitHub App
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Selection</th>
                  <th>Repositories</th>
                </tr>
              </thead>
              <tbody>
                {installations.map((installation) => (
                  <tr key={installation.id}>
                    <td>{installation.accountLogin}</td>
                    <td>{installation.accountType}</td>
                    <td>{installation.repositorySelection}</td>
                    <td>{installation._count.repositories}</td>
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
