import { ExternalLink } from "lucide-react";
import { RepositoryCard } from "@/components/dashboard/repository-card";
import type { DashboardInstallation } from "@/lib/dashboard/queries";
import { getGitHubInstallationSettingsUrl } from "@/lib/github/install-url";

type RepositoryListProps = {
  returnTo: string;
  selectedInstallation: DashboardInstallation | null;
};

export function RepositoryList({ returnTo, selectedInstallation }: RepositoryListProps) {
  return (
    <section className="repository-card-grid" aria-label="Repositories">
      {selectedInstallation?.repositories.length ? (
        selectedInstallation.repositories.map((repository) => (
          <RepositoryCard key={repository.id} repository={repository} returnTo={returnTo} />
        ))
      ) : (
        <div className="empty-state dashboard-empty">
          <div>
            <h2>No repositories imported for this account</h2>
            <p>Refresh repository access after selecting repositories in the GitHub App installation.</p>
            {selectedInstallation ? (
              <a
                className="button button-primary"
                href={getGitHubInstallationSettingsUrl(selectedInstallation)}
                rel="noreferrer"
                target="_blank"
              >
                Configure access
                <ExternalLink aria-hidden size={14} />
              </a>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
