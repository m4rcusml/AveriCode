import { Building2, ExternalLink, Github, RefreshCw, UserRound } from "lucide-react";
import { refreshInstallationRepositoriesAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import { getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";
import type { SettingsInstallation } from "@/lib/settings/queries";

type GitHubAccountsSectionProps = {
  installUrl: string | null;
  installations: SettingsInstallation[];
};

export function GitHubAccountsSection({ installUrl, installations }: GitHubAccountsSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">GitHub accounts in this workspace</h2>
          <p className="section-copy">Organizations and personal installations that provide repository access for syncs.</p>
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
                    <td>{installation.repositoryCount}</td>
                    <td>{installation.monitoredRepositoryCount}</td>
                    <td>{formatDateTime(installation.lastRepositorySyncAt)}</td>
                    <td>
                      <div className="button-row">
                        <a
                          className="button button-secondary"
                          href={getGitHubInstallationSettingsUrl(installation)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Github aria-hidden size={16} />
                          Configure access
                          <ExternalLink aria-hidden size={14} />
                        </a>
                        <form action={refreshInstallationRepositoriesAction}>
                          <input name="installationId" type="hidden" value={installation.id} />
                          <input name="returnTo" type="hidden" value="/settings" />
                          <PendingSubmitButton className="button button-secondary" pendingLabel="Refreshing...">
                            <RefreshCw aria-hidden size={16} />
                            Refresh repos
                          </PendingSubmitButton>
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
  );
}
