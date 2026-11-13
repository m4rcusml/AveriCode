import { Building2, ExternalLink, Github, RefreshCw, UserRound } from "lucide-react";
import { refreshInstallationRepositoriesAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import { getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";
import type { SettingsInstallation } from "@/lib/settings/queries";

type GitHubAccountsSectionProps = {
  installUrl: string | null;
  installations: SettingsInstallation[];
  canManageWorkspace: boolean;
};

export function GitHubAccountsSection({ installUrl, installations, canManageWorkspace }: GitHubAccountsSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Contas GitHub</h2>
        </div>
      </div>
      {installations.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>Nenhuma conta conectada</h3>
            <p>Conecte repositórios pelo GitHub App.</p>
            {installUrl ? (
              <a className="button button-primary" href={installUrl}>
                <Github aria-hidden size={16} />
                Conectar projetos
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Tipo</th>
                <th>Seleção</th>
                <th>Projetos</th>
                <th>Monitorados</th>
                <th>Último sync</th>
                <th>Ações</th>
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
                    <td>{installation.accountType === "ORGANIZATION" ? "Organização" : "Pessoal"}</td>
                    <td>{installation.repositorySelection === "ALL" ? "Todos" : "Selecionados"}</td>
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
                          Configurar acesso
                          <ExternalLink aria-hidden size={14} />
                        </a>
                        <form action={refreshInstallationRepositoriesAction}>
                          <input name="installationId" type="hidden" value={installation.id} />
                          <input name="returnTo" type="hidden" value="/settings" />
                          <PendingSubmitButton disabled={!canManageWorkspace} className="button button-secondary" pendingLabel="Atualizando…">
                            <RefreshCw aria-hidden size={16} />
                            Atualizar acesso
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
