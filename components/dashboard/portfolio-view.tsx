import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Clock3, GitBranch, LockKeyhole, RefreshCw, Users } from "lucide-react";
import { syncRepositoryNowAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ContributorRow } from "@/components/dashboard/contributor-row";
import type { DashboardRepository, DashboardUpdate } from "@/lib/dashboard/queries";
import { formatDateTime, formatRelativeTime } from "@/lib/dates";

const states = {
  CURRENT: { label: "Atualizado", className: "status-active" },
  STALE: { label: "Dados antigos", className: "status-inactive" },
  FAILED: { label: "Falha no sync", className: "status-failed" },
  RUNNING: { label: "Sincronizando", className: "status-unknown" },
  NEVER: { label: "Sem sincronização", className: "status-unknown" },
  SUSPENDED: { label: "Acesso suspenso", className: "status-failed" },
  NEEDS_REVIEW: { label: "Revisar equipe", className: "status-inactive" }
};

export function RepositorySyncStatus({ repository }: { repository: DashboardRepository }) {
  const state = states[repository.syncState];
  return <span className={`status-badge ${state.className}`} title={`Último sucesso: ${formatDateTime(repository.lastSyncedAt)}`}>
    {repository.syncState === "CURRENT" ? <CircleCheck aria-hidden size={13} /> : <Clock3 aria-hidden size={13} />}{state.label}
  </span>;
}

export function PortfolioRow({ repository, returnTo, canManage }: { repository: DashboardRepository; returnTo: string; canManage: boolean }) {
  const expected = repository.contributorRows.filter((c) => !c.isIgnored);
  const active = expected.filter((c) => c.status === "ACTIVE").length;
  const unknown = expected.filter((c) => c.status === "UNKNOWN").length;
  const latest = repository.updates[0];
  const presenceLabel = !expected.length ? "Definir contribuidores" : unknown === expected.length ? `Sem dado atual · ${expected.length} pessoas` : `${active} de ${expected.length} com commits${unknown ? ` · ${unknown} sem dado atual` : ""}`;
  return <article className="portfolio-project" id={`project-${repository.id}`}>
    <details className="project-details">
      <summary className="project-summary">
        <span className="project-name"><span className="project-expand" aria-hidden><ArrowDownLeft size={16} /></span><span>
          <strong>{repository.fullName.split("/").at(-1)}</strong>
          <span className="project-owner">{repository.fullName.split("/").slice(0,-1).join("/")}{repository.private ? <LockKeyhole aria-label="Privado" size={11} /> : null}</span>
        </span></span>
        <span className="project-state"><RepositorySyncStatus repository={repository} /><small>{formatRelativeTime(repository.lastSyncedAt)}</small></span>
        <span className="project-presence"><span className="presence-ruler" role="img" aria-label={presenceLabel}>
          {expected.slice(0,16).map((person) => <span className={`presence-dot presence-${person.status.toLowerCase()}`} key={person.id} title={`${person.name}: ${person.status === "ACTIVE" ? "com commits" : person.status === "INACTIVE" ? "sem commits" : "sem dado atual"}`} />)}
        </span><small>{presenceLabel}</small></span>
        <span className="project-last-change"><span>{latest?.message.split("\n")[0] ?? "Nenhuma atualização salva"}</span><small>{latest ? `${latest.authorUsername ?? "Autor não associado"} · ${formatRelativeTime(latest.committedAt)}` : "Sincronize para obter contexto"}</small></span>
      </summary>
      <div className="project-detail-body">
        <div className="project-detail-toolbar"><div className="branch-summary"><GitBranch aria-hidden size={14} /><span>{repository.branches.length} {repository.branches.length === 1 ? "branch monitorada" : "branches monitoradas"}</span>{repository.branches.map((branch) => <code className="branch-chip" key={branch}>{branch}</code>)}</div><div className="button-row">
          <Link className="button button-quiet" href={`/dashboard/repositories/${repository.id}/contributors`}><Users aria-hidden size={14} />Configurar pessoas</Link>
          <Link className="button button-quiet" href={`/dashboard/repositories/${repository.id}/branches`}><GitBranch aria-hidden size={14} />Configurar branches</Link>
        </div></div>
        <p className="snapshot-note">{repository.periodStart && repository.periodEnd ? `Janela salva: ${formatDateTime(repository.periodStart)} até ${formatDateTime(repository.periodEnd)}.` : "Ainda não há uma janela de atividade salva."} Dados com mais de 36 horas aparecem como sem dado atual.</p>
        {repository.configurationError ? <div className="notice notice-warning"><div><strong>A configuração da equipe precisa de revisão.</strong><p>As sugestões do GitHub ficaram incompletas. Confira as pessoas esperadas antes de interpretar a participação.</p><Link className="text-link" href={`/dashboard/repositories/${repository.id}/contributors`}>Revisar equipe esperada <ArrowUpRight size={13} /></Link></div></div> : null}
        {repository.syncError ? <div className="notice notice-error" role="status"><strong>A última tentativa falhou.</strong><p>{repository.syncError}</p></div> : null}
        {repository.suspendedAt ? <p className="notice notice-error">A instalação do GitHub App está suspensa. Reative o acesso no GitHub para retomar as sincronizações.</p> : null}
        {repository.contributorRows.length ? <div className="contributor-list">{repository.contributorRows.map((contributor) => <ContributorRow contributor={contributor} key={contributor.id} returnTo={returnTo} canManage={canManage} />)}</div> : <div className="empty-state"><div><h3>Quem participa deste projeto?</h3><p>Defina as pessoas esperadas para comparar a atividade registrada.</p><Link className="text-link" href={`/dashboard/repositories/${repository.id}/contributors`}>Configurar contribuidores <ArrowUpRight size={14} /></Link></div></div>}
      </div>
    </details>
    <div className="project-sync-action"><form action={syncRepositoryNowAction}><input name="repositoryId" type="hidden" value={repository.id} /><input name="returnTo" type="hidden" value={returnTo} /><PendingSubmitButton aria-label={`Sincronizar ${repository.fullName}`} className="icon-button" disabled={!canManage || repository.syncState === "RUNNING" || repository.syncState === "SUSPENDED"} pendingLabel={<RefreshCw aria-hidden className="spin" size={16} />} title={canManage ? "Sincronizar projeto" : "Apenas responsáveis e administradores podem sincronizar"}><RefreshCw aria-hidden size={16} /></PendingSubmitButton></form></div>
  </article>;
}

export function UpdatesFeed({ updates }: { updates: DashboardUpdate[] }) {
  return <aside className="updates-panel" id="updates" aria-labelledby="updates-title"><div className="panel-heading"><div><h2 id="updates-title">Últimas atualizações</h2><p>Mudanças nas branches monitoradas</p></div><ArrowUpRight aria-hidden size={18} /></div>
    {updates.length ? <ol className="updates-feed">{updates.map((update) => <li key={update.id}><div className="update-meta"><span>{update.repositoryName.split("/").at(-1)}</span><time dateTime={update.committedAt.toISOString()} title={formatDateTime(update.committedAt)}>{formatRelativeTime(update.committedAt)}</time></div><a className="update-message" href={update.url} rel="noreferrer" target="_blank">{update.message.split("\n")[0]}<ArrowUpRight aria-hidden size={12} /></a><div className="update-details"><span>{update.authorUsername ?? "Autor não associado"}</span><code>{update.branch}</code><code>{update.sha.slice(0,7)}</code></div></li>)}</ol> : <div className="feed-empty"><GitBranch aria-hidden size={24} /><h3>O contexto começa no próximo sync</h3><p>As mensagens dos commits aparecerão aqui depois de sincronizar os projetos conectados.</p></div>}
    <p className="feed-footnote">Atualizações de código registradas. Entregas, revisões e impacto de negócio precisam de contexto da equipe.</p></aside>;
}
