import { CheckCircle2, Clock3, GitPullRequestArrow, XCircle } from "lucide-react";
import { resolveRepositoryAccessRequestAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import type { SettingsRepositoryAccessRequest } from "@/lib/settings/queries";

type RepositoryAccessRequestsSectionProps = {
  isWorkspaceOwner: boolean;
  requests: SettingsRepositoryAccessRequest[];
};

const statusLabels: Record<string, string> = { PENDING: "Pendente", APPROVED: "Aprovada", PARTIALLY_APPROVED: "Parcialmente aprovada", REJECTED: "Rejeitada" };

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
    <section className="section" id="requests">
      <div className="section-header">
        <div>
          <h2 className="section-title">Solicitações de projetos</h2>
          <p className="section-copy">
            Membros podem solicitar projetos. O responsável pelo workspace aprova ou rejeita a seleção.
          </p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>Nenhuma solicitação pendente</h3>
            <p>As solicitações de membros do workspace aparecerão aqui.</p>
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
                    Conta GitHub {request.accountLogin} · solicitada em {formatDateTime(request.createdAt)}
                  </p>
                </div>
                <span className="pill"><StatusIcon status={request.status} /> {statusLabels[request.status]}</span>
              </div>
              {request.status === "PENDING" && isWorkspaceOwner ? (
                <form action={resolveRepositoryAccessRequestAction}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <div className="request-items">
                    {request.items.map((item) => (
                      <label className="request-item" key={item.id}>
                        <input name="approvedItemId" type="checkbox" value={item.id} />
                        <span><strong>{item.fullName}</strong><small>{item.private ? "Privado" : "Público"}</small></span>
                      </label>
                    ))}
                  </div>
                  <p className="section-copy">Os projetos marcados serão aprovados; os demais serão rejeitados.</p>
                  <PendingSubmitButton className="button button-primary" pendingLabel="Salvando decisão…">
                    Aprovar seleção e rejeitar demais
                  </PendingSubmitButton>
                </form>
              ) : (
                <div className="request-items">
                  {request.items.map((item) => (
                    <div className="request-item" key={item.id}>
                      <StatusIcon status={item.status === "PENDING" ? "PENDING" : item.status} />
                      <span><strong>{item.fullName}</strong><small>{statusLabels[item.status]}</small></span>
                    </div>
                  ))}
                </div>
              )}
              {request.reviewedAt ? (
                <p className="section-copy">Resolvida em {formatDateTime(request.reviewedAt)} por {request.reviewerLabel ?? "uma pessoa removida do workspace"}.</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
