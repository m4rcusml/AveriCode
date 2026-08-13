import { CheckCircle2, Clock3, GitPullRequestArrow, XCircle } from "lucide-react";
import { resolveRepositoryAccessRequestAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import type { SettingsRepositoryAccessRequest } from "@/lib/settings/queries";

type RepositoryAccessRequestsSectionProps = {
  isWorkspaceOwner: boolean;
  requests: SettingsRepositoryAccessRequest[];
};

function StatusIcon({ status }: { status: SettingsRepositoryAccessRequest["status"] }) {
  if (status === "PENDING") return <Clock3 aria-hidden size={16} />;
  if (status === "REJECTED") return <XCircle aria-hidden size={16} />;
  return <CheckCircle2 aria-hidden size={16} />;
}

export function RepositoryAccessRequestsSection({
  isWorkspaceOwner,
  requests
}: RepositoryAccessRequestsSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Repository access requests</h2>
          <p className="section-copy">
            Members can request repositories. Only the workspace owner can resolve a request.
          </p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>No repository requests</h3>
            <p>Requests submitted by workspace members will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="request-list">
          {requests.map((request) => (
            <article className="request-card" key={request.id}>
              <div className="request-card-header">
                <div>
                  <div className="cell-title">
                    <GitPullRequestArrow aria-hidden size={17} />
                    <strong>{request.requesterLabel}</strong>
                  </div>
                  <p className="section-copy">
                    GitHub account {request.accountLogin} - requested {formatDateTime(request.createdAt)}
                  </p>
                </div>
                <span className="pill"><StatusIcon status={request.status} /> {request.status.replaceAll("_", " ")}</span>
              </div>
              {request.status === "PENDING" && isWorkspaceOwner ? (
                <form action={resolveRepositoryAccessRequestAction}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <div className="request-items">
                    {request.items.map((item) => (
                      <label className="request-item" key={item.id}>
                        <input name="approvedItemId" type="checkbox" value={item.id} />
                        <span><strong>{item.fullName}</strong><small>{item.private ? "Private" : "Public"}</small></span>
                      </label>
                    ))}
                  </div>
                  <p className="section-copy">Checked repositories will be approved; unchecked repositories will be rejected.</p>
                  <PendingSubmitButton className="button button-primary" pendingLabel="Resolving request...">
                    Resolve request
                  </PendingSubmitButton>
                </form>
              ) : (
                <div className="request-items">
                  {request.items.map((item) => (
                    <div className="request-item" key={item.id}>
                      <StatusIcon status={item.status === "PENDING" ? "PENDING" : item.status} />
                      <span><strong>{item.fullName}</strong><small>{item.status}</small></span>
                    </div>
                  ))}
                </div>
              )}
              {request.reviewedAt ? (
                <p className="section-copy">Resolved {formatDateTime(request.reviewedAt)} by {request.reviewerLabel ?? "a former user"}.</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
