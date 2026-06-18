import Link from "next/link";
import { GitBranch, RefreshCw, Users } from "lucide-react";
import {
  syncRepositoryNowAction,
  toggleRepositoryMonitoringAction
} from "@/app/actions";
import { ContributorRow } from "@/components/dashboard/contributor-row";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { DashboardRepository } from "@/lib/dashboard/queries";
import { formatDateTime } from "@/lib/dates";

type RepositoryCardProps = {
  repository: DashboardRepository;
  returnTo: string;
};

export function RepositoryCard({ repository, returnTo }: RepositoryCardProps) {
  return (
    <article className="repository-card">
      <div className="repository-card-header">
        <div className="repository-card-title">
          <div className="repository-title-line">
            <h2>{repository.fullName}</h2>
            <form action={toggleRepositoryMonitoringAction}>
              <input name="repositoryId" type="hidden" value={repository.id} />
              <input name="isActive" type="hidden" value={repository.isActive ? "false" : "true"} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <PendingSubmitButton className="button button-secondary" pendingLabel="Saving...">
                <GitBranch aria-hidden size={16} />
                {repository.isActive ? "Stop monitoring" : "Monitor"}
              </PendingSubmitButton>
            </form>
          </div>
          <p>
            {repository.private ? "Private" : "Public"}
            {repository.defaultBranch ? ` / ${repository.defaultBranch}` : ""}
          </p>
        </div>
        <div className="repository-card-actions">
          <span className={`status-badge ${repository.isActive ? "status-active" : "status-unknown"}`}>
            <GitBranch aria-hidden size={16} />
            {repository.isActive ? "Monitored" : "Not monitored"}
          </span>
          <span className="repository-sync-date">Last sync: {formatDateTime(repository.lastSyncedAt)}</span>
          <form action={syncRepositoryNowAction}>
            <input name="repositoryId" type="hidden" value={repository.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <PendingSubmitButton className="button button-secondary" pendingLabel="Syncing...">
              <RefreshCw aria-hidden size={16} />
              Sync
            </PendingSubmitButton>
          </form>
          <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/branches`}>
            <GitBranch aria-hidden size={16} />
            Branches
          </Link>
        </div>
      </div>

      {repository.contributorRows.length === 0 ? (
        <div className="empty-state repository-empty">
          <div>
            <h3>No expected contributors</h3>
            <p>Add expected contributors before this repository can show activity.</p>
            <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/contributors`}>
              Configure contributors
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="button-row contributor-list-toolbar">
            <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/contributors`}>
              <Users aria-hidden size={16} />
              Configure contributors
            </Link>
          </div>
          <div className="contributor-list">
            {repository.contributorRows.map((contributor) => (
              <ContributorRow contributor={contributor} key={contributor.id} returnTo={returnTo} />
            ))}
          </div>
        </>
      )}
    </article>
  );
}
