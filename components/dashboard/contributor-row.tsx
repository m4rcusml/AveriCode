import Image from "next/image";
import { CircleSlash, RotateCcw, UserMinus } from "lucide-react";
import { removeExpectedContributorAction, toggleIgnoredContributorAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { StatusBadge } from "@/components/status-badge";
import type { DashboardContributorActivityRow } from "@/lib/dashboard/queries";
import { formatDateTime } from "@/lib/dates";

export function ContributorRow({ contributor, returnTo, canManage = false }: { contributor: DashboardContributorActivityRow; returnTo: string; canManage?: boolean }) {
  const initials = contributor.name.split(/\s+/).map((part) => part[0]).join("").slice(0,2).toUpperCase();
  return <div className={`contributor-row ${contributor.isIgnored ? "contributor-row-ignored" : ""}`}>
    <div className="contributor-person">{contributor.avatarUrl ? <Image alt="" className="avatar" height={30} width={30} src={contributor.avatarUrl} /> : <span className="avatar-placeholder">{initials}</span>}<div className="contributor-copy"><strong>{contributor.name}</strong><span>{contributor.username ? `@${contributor.username}` : "Sem usuário associado"}</span></div></div>
    <StatusBadge status={contributor.isIgnored ? "UNKNOWN" : contributor.status} />
    <div className="contributor-commit"><span>{contributor.isIgnored ? "Fora dos indicadores" : `${contributor.commitCount} commits na janela salva`}</span><small title={formatDateTime(contributor.lastCommitAt)}>{contributor.lastCommitAt ? formatDateTime(contributor.lastCommitAt) : "Sem commit registrado"}{contributor.lastCommitBranch ? <code className="branch-chip">{contributor.lastCommitBranch}</code> : null}</small></div>
    {canManage ? <div className="contributor-actions"><form action={toggleIgnoredContributorAction}><input name="repositoryContributorId" type="hidden" value={contributor.id} /><input name="isIgnored" type="hidden" value={contributor.isIgnored ? "false" : "true"} /><input name="returnTo" type="hidden" value={returnTo} /><PendingSubmitButton aria-label={`${contributor.isIgnored ? "Restaurar" : "Ignorar"} ${contributor.name}`} className="button button-quiet" pendingLabel="Salvando…">{contributor.isIgnored ? <RotateCcw aria-hidden size={13} /> : <CircleSlash aria-hidden size={13} />}{contributor.isIgnored ? "Restaurar" : "Ignorar"}</PendingSubmitButton></form><form action={removeExpectedContributorAction}><input name="repositoryContributorId" type="hidden" value={contributor.id} /><input name="returnTo" type="hidden" value={returnTo} /><PendingSubmitButton aria-label={`Retirar ${contributor.name} dos esperados`} className="icon-button" pendingLabel="…" title="Retirar dos contribuidores esperados"><UserMinus aria-hidden size={15} /></PendingSubmitButton></form></div> : null}
  </div>;
}
