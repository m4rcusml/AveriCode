import { redirect } from "next/navigation";
import {
  Building2,
  CalendarClock,
  Database,
  ExternalLink,
  Github,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users
} from "lucide-react";
import {
  addWorkspaceMemberAction,
  refreshInstallationRepositoriesAction,
  removeWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction
} from "@/app/actions";
import { getAuthSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { getGitHubAppInstallUrl, getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type SettingsPageProps = {
  searchParams?: Promise<{
    settings_error?: string | string[];
    settings_success?: string | string[];
  }>;
};

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function userLabel(user: { email: string | null; githubUsername: string | null; name: string | null }) {
  return user.name ?? user.githubUsername ?? user.email ?? "Unknown user";
}

function latestDate(values: Array<Date | null>) {
  const timestamps = values
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function settingsMessage(params: Awaited<SettingsPageProps["searchParams"]>) {
  const success = firstValue(params?.settings_success);
  const error = firstValue(params?.settings_error);

  if (success) {
    const messages: Record<string, string> = {
      workspace_member_added: "Workspace member added.",
      workspace_member_removed: "Workspace member removed.",
      workspace_member_updated: "Workspace member role updated."
    };

    return {
      className: "notice notice-success",
      title: "Settings updated.",
      body: messages[success] ?? "The workspace settings were updated."
    };
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    workspace_member_failed: "Could not update the workspace member.",
    workspace_member_identifier_required: "Enter a GitHub username or email.",
    workspace_member_not_found: "This user has not signed in to AveriCode yet.",
    workspace_owner_protected: "The workspace owner cannot be removed or downgraded.",
    workspace_permission_denied: "Only workspace owners and admins can manage members."
  };

  return {
    className: "notice notice-warning",
    title: "Action needed.",
    body: messages[error] ?? "Could not update settings."
  };
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

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const notice = settingsMessage(resolvedSearchParams);
  const workspace = await getSelectedWorkspaceForUser(session.user.id);
  const [installations, members] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { workspaceId: workspace.id },
      include: {
        repositories: {
          select: {
            id: true,
            isActive: true,
            lastSyncedAt: true,
            owner: true
          }
        }
      },
      orderBy: [{ accountType: "asc" }, { accountLogin: "asc" }]
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: true
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    })
  ]);
  const installUrl = getGitHubAppInstallUrl(workspace.id);
  const repositories = installations.flatMap((installation) => installation.repositories);
  const monitoredRepositoryCount = repositories.filter((repository) => repository.isActive).length;
  const organizationCount = installations.filter((installation) => installation.accountType === "ORGANIZATION").length;
  const currentMembership = members.find((member) => member.userId === session.user.id);
  const canManageWorkspace = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const repositoriesByOwner = new Map<string, number>();

  for (const repository of repositories) {
    const owner = repository.owner.toLowerCase();
    repositoriesByOwner.set(owner, (repositoriesByOwner.get(owner) ?? 0) + 1);
  }

  return (
    <main className="page">
      {notice ? (
        <div className={notice.className}>
          <ShieldCheck aria-hidden size={18} />
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
          </div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">
            Workspace, members, GitHub accounts, and system configuration for <strong>{workspace.name}</strong>.
          </p>
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

      <section className="metric-grid" aria-label="Settings summary">
        <div className="metric-card">
          <div className="metric-label">
            <Database aria-hidden size={16} />
            Workspace slug
          </div>
          <div className="metric-value metric-value-compact">{workspace.slug}</div>
          <div className="metric-note">Primary workspace identifier</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Users aria-hidden size={16} />
            Members
          </div>
          <div className="metric-value">{members.length}</div>
          <div className="metric-note">{canManageWorkspace ? "Management enabled" : "View only"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Building2 aria-hidden size={16} />
            GitHub accounts
          </div>
          <div className="metric-value">{installations.length}</div>
          <div className="metric-note">{organizationCount} organization(s)</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Github aria-hidden size={16} />
            Repositories
          </div>
          <div className="metric-value">{repositories.length}</div>
          <div className="metric-note">{monitoredRepositoryCount} monitored</div>
        </div>
      </section>

      {canManageWorkspace ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Add workspace member</h2>
              <p className="section-copy">
                Add users who have already signed in to AveriCode with GitHub OAuth.
              </p>
            </div>
          </div>
          <form action={addWorkspaceMemberAction} className="settings-form-row">
            <input name="workspaceId" type="hidden" value={workspace.id} />
            <input name="returnTo" type="hidden" value="/settings" />
            <div className="field">
              <label htmlFor="workspace-member-identifier">GitHub username or email</label>
              <input id="workspace-member-identifier" name="identifier" placeholder="octocat or user@example.com" />
            </div>
            <div className="field">
              <label htmlFor="workspace-member-role">Role</label>
              <select defaultValue="MEMBER" id="workspace-member-role" name="role">
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <button className="button button-primary" type="submit">
              <UserPlus aria-hidden size={16} />
              Add member
            </button>
          </form>
        </section>
      ) : null}

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Workspace members</h2>
            <p className="section-copy">People who can access this workspace and its monitored repository data.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>GitHub</th>
                <th>Email</th>
                <th>Role</th>
                <th>Owned repos</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isOwner = member.userId === workspace.ownerId;
                const ownedRepositoryCount = member.user.githubUsername
                  ? repositoriesByOwner.get(member.user.githubUsername.toLowerCase()) ?? 0
                  : 0;

                return (
                  <tr key={member.id}>
                    <td>
                      <div className="cell-title">{userLabel(member.user)}</div>
                      {member.userId === session.user.id ? <div className="cell-subtitle">Current user</div> : null}
                    </td>
                    <td>
                      {member.user.githubUsername ? (
                        `@${member.user.githubUsername}`
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td>{member.user.email ?? <span className="muted">None</span>}</td>
                    <td>
                      <span className={`status-badge ${isOwner ? "status-active" : "status-unknown"}`}>
                        <ShieldCheck aria-hidden size={16} />
                        {member.role}
                      </span>
                    </td>
                    <td>{ownedRepositoryCount}</td>
                    <td>{formatDateTime(member.createdAt)}</td>
                    <td>
                      {canManageWorkspace && !isOwner ? (
                        <div className="button-row">
                          <form action={updateWorkspaceMemberRoleAction} className="inline-form">
                            <input name="workspaceMemberId" type="hidden" value={member.id} />
                            <input name="returnTo" type="hidden" value="/settings" />
                            <select defaultValue={member.role} name="role">
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <button className="button button-secondary" type="submit">
                              <Save aria-hidden size={16} />
                              Save
                            </button>
                          </form>
                          <form action={removeWorkspaceMemberAction}>
                            <input name="workspaceMemberId" type="hidden" value={member.id} />
                            <input name="returnTo" type="hidden" value="/settings" />
                            <button className="button button-danger" type="submit">
                              <Trash2 aria-hidden size={16} />
                              Remove
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="muted">{isOwner ? "Owner protected" : "No access"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">GitHub accounts in this workspace</h2>
            <p className="section-copy">
              Organizations and personal installations that provide repository access for syncs.
            </p>
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
                  Add repositories
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
                  <th>Repos</th>
                  <th>Monitored</th>
                  <th>Last repo sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {installations.map((installation) => {
                  const AccountIcon = installation.accountType === "ORGANIZATION" ? Building2 : UserRound;
                  const monitoredCount = installation.repositories.filter((repository) => repository.isActive).length;
                  const lastSync = latestDate(
                    installation.repositories.map((repository) => repository.lastSyncedAt)
                  );

                  return (
                    <tr key={installation.id}>
                      <td>
                        <div className="cell-title">
                          <AccountIcon aria-hidden size={16} />
                          {installation.accountLogin}
                        </div>
                      </td>
                      <td>{installation.accountType}</td>
                      <td>{installation.repositorySelection}</td>
                      <td>{installation.repositories.length}</td>
                      <td>{monitoredCount}</td>
                      <td>{formatDateTime(lastSync)}</td>
                      <td>
                        <div className="button-row">
                          <a
                            className="button button-secondary"
                            href={getGitHubInstallationSettingsUrl(installation)}
                          >
                            <Github aria-hidden size={16} />
                            Configure access
                            <ExternalLink aria-hidden size={14} />
                          </a>
                          <form action={refreshInstallationRepositoriesAction}>
                            <input name="installationId" type="hidden" value={installation.id} />
                            <input name="returnTo" type="hidden" value="/settings" />
                            <button className="button button-secondary" type="submit">
                              <RefreshCw aria-hidden size={16} />
                              Refresh repos
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">System configuration</h2>
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
        <div className="notice notice-warning settings-cron-note">
          <CalendarClock aria-hidden size={18} />
          <div>
            <strong>Weekly cron</strong>
            <p>Configured for Monday 06:00 America/Sao_Paulo using Vercel UTC expression 0 9 * * 1.</p>
          </div>
        </div>
        <div className="notice settings-cron-note">
          <Mail aria-hidden size={18} />
          <div>
            <strong>Member invitations</strong>
            <p>Users must sign in once before they can be added to a workspace.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
