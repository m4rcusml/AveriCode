import { Github } from "lucide-react";
import { RepositoryCard } from "@/components/dashboard/repository-card";
import type { DashboardInstallation } from "@/lib/dashboard/queries";

type RepositoryListProps = {
  addRepositoriesUrl: string | null;
  returnTo: string;
  selectedInstallation: DashboardInstallation | null;
};

export function RepositoryList({ addRepositoriesUrl, returnTo, selectedInstallation }: RepositoryListProps) {
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
            <p>Select repositories explicitly to connect them to this workspace.</p>
            {addRepositoriesUrl ? (
              <a
                className="button button-primary"
                href={addRepositoriesUrl}
              >
                <Github aria-hidden size={16} />
                Add repositories
              </a>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
