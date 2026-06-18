import Link from "next/link";
import { Building2, ExternalLink, Github, RefreshCw, UserRound } from "lucide-react";
import {
  refreshInstallationRepositoriesAction,
  syncWorkspaceRepositoriesNowAction
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { dashboardHref, type DashboardInstallation, type DashboardWorkspace } from "@/lib/dashboard/queries";
import { getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";

type InstallationToolbarProps = {
  selectedDashboardHref: string;
  selectedInstallation: DashboardInstallation | null;
  tabInstallations: DashboardInstallation[];
  workspace: DashboardWorkspace;
};

export function InstallationToolbar({
  selectedDashboardHref,
  selectedInstallation,
  tabInstallations,
  workspace
}: InstallationToolbarProps) {
  return (
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
              rel="noreferrer"
              target="_blank"
            >
              <Github aria-hidden size={16} />
              Configure access
              <ExternalLink aria-hidden size={14} />
            </a>
            <form action={refreshInstallationRepositoriesAction}>
              <input name="installationId" type="hidden" value={selectedInstallation.id} />
              <input name="returnTo" type="hidden" value={selectedDashboardHref} />
              <PendingSubmitButton className="button button-secondary" pendingLabel="Refreshing...">
                <RefreshCw aria-hidden size={16} />
                Refresh repos
              </PendingSubmitButton>
            </form>
          </>
        ) : null}
        <form action={syncWorkspaceRepositoriesNowAction}>
          <input name="workspaceId" type="hidden" value={workspace.id} />
          <input name="returnTo" type="hidden" value={selectedDashboardHref} />
          <PendingSubmitButton className="button button-primary" pendingLabel="Syncing...">
            <RefreshCw aria-hidden size={16} />
            Sync all repositories
          </PendingSubmitButton>
        </form>
      </div>
    </section>
  );
}
