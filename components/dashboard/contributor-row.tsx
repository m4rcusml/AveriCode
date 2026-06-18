import Image from "next/image";
import { CircleSlash, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import {
  removeExpectedContributorAction,
  toggleIgnoredContributorAction
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { StatusBadge } from "@/components/status-badge";
import type { DashboardContributorActivityRow } from "@/lib/dashboard/queries";
import { formatDateTime } from "@/lib/dates";

type ContributorRowProps = {
  contributor: DashboardContributorActivityRow;
  returnTo: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ContributorRow({ contributor, returnTo }: ContributorRowProps) {
  return (
    <div className={`contributor-row ${contributor.isIgnored ? "contributor-row-ignored" : ""}`}>
      <StatusBadge status={contributor.status} />
      <div className="contributor-person">
        {contributor.avatarUrl ? (
          <Image alt="" className="avatar" height={38} src={contributor.avatarUrl} width={38} />
        ) : (
          <span className="avatar-placeholder">{initials(contributor.name)}</span>
        )}
        <div className="contributor-copy">
          <strong>{contributor.name}</strong>
          <span>{contributor.username ? `@${contributor.username}` : "No username"}</span>
          {contributor.isIgnored ? <span className="pill contributor-inline-pill">Ignored</span> : null}
        </div>
      </div>
      <div className="contributor-field">
        <span className="contributor-label">Email</span>
        <span className="contributor-value">{contributor.email ?? "None"}</span>
      </div>
      <div className="contributor-field">
        <span className="contributor-label">Commits</span>
        <span className="contributor-value">{contributor.commitCount}</span>
      </div>
      <div className="contributor-field">
        <span className="contributor-label">Last commit</span>
        <span className="contributor-value">
          {formatDateTime(contributor.lastCommitAt)}
          {contributor.lastCommitBranch ? <span className="branch-chip">{contributor.lastCommitBranch}</span> : null}
        </span>
      </div>
      <details className="row-action-menu">
        <summary
          aria-label={`Open actions for ${contributor.name}`}
          className="icon-button"
          title="Contributor actions"
        >
          <MoreHorizontal aria-hidden size={18} />
        </summary>
        <div className="action-menu" role="menu">
          <form action={toggleIgnoredContributorAction}>
            <input name="repositoryContributorId" type="hidden" value={contributor.id} />
            <input name="isIgnored" type="hidden" value={contributor.isIgnored ? "false" : "true"} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <PendingSubmitButton className="action-menu-item" pendingLabel="Updating..." role="menuitem">
              {contributor.isIgnored ? (
                <RotateCcw aria-hidden size={16} />
              ) : (
                <CircleSlash aria-hidden size={16} />
              )}
              {contributor.isIgnored ? "Restore" : "Ignore"}
            </PendingSubmitButton>
          </form>
          <form action={removeExpectedContributorAction}>
            <input name="repositoryContributorId" type="hidden" value={contributor.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <PendingSubmitButton
              className="action-menu-item action-menu-item-danger"
              pendingLabel="Deleting..."
              role="menuitem"
            >
              <Trash2 aria-hidden size={16} />
              Delete
            </PendingSubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}
