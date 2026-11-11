import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Clock3, GitBranch, GitCommitHorizontal, LockKeyhole, Users } from "lucide-react";
import { SyncControl } from "@/components/sync-control";
import { ContributorRow } from "@/components/dashboard/contributor-row";
import type { DashboardRepository, DashboardUpdate } from "@/lib/dashboard/queries";
import { formatDateTime, formatRelativeTime } from "@/lib/dates";
import { activityDistribution, commitCategory } from "@/lib/dashboard/summary";
import { AvatarGroup, ParticipationBar, PersonAvatar } from "@/components/dashboard/portfolio-visuals";

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
  const participation = activityDistribution(expected);
  const latest = repository.updates[0];
  return <article className="portfolio-project" id={`project-${repository.id}`}>
    <details className="project-details">
      <summary className="project-summary">
        <span className="project-name"><span className="project-expand" aria-hidden><ArrowDownLeft size={16} /></span><span>
          <strong>{repository.fullName.split("/").at(-1)}</strong>
          <span className="project-owner">{repository.fullName.split("/").slice(0,-1).join("/")}{repository.private ? <LockKeyhole aria-label="Privado" size={11} /> : null}</span>
        </span></span>
        <span className="project-state"><RepositorySyncStatus repository={repository} /><small>{formatRelativeTime(repository.lastSyncedAt)}</small></span>
        <span className="project-presence"><ParticipationBar counts={participation} compact /><AvatarGroup people={expected} /></span>
        <span className="project-last-change"><span className="recorded-commits"><GitCommitHorizontal aria-hidden size={14} />{repository.syncState === "CURRENT" ? `${repository.recordedCommitCount} registrados em 7 dias` : "Captura a atualizar"}</span><span>{latest?.message.split("\n")[0] ?? "Nenhuma atualização salva"}</span><small>{latest ? `${latest.authorUsername ?? "Autor não associado"} · ${formatRelativeTime(latest.committedAt)}` : "Sincronize para obter contexto"}</small></span>
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
    <div className="project-sync-action"><SyncControl repositoryId={repository.id} className="icon-button" iconOnly ariaLabel={`Sincronizar ${repository.fullName}`} disabled={!canManage || repository.syncState === "RUNNING" || repository.syncState === "SUSPENDED"} title={canManage ? "Sincronizar projeto" : "Apenas responsáveis e administradores podem sincronizar"} /></div>
  </article>;
}

export function UpdatesFeed({ updates, emptyReason }: { updates: DashboardUpdate[]; emptyReason: "filtered" | "no-capture" | "no-updates" }) {
  return <aside className="updates-panel" id="updates" aria-labelledby="updates-title"><div className="panel-heading"><div><h2 id="updates-title">Últimas atualizações</h2><p>Mudanças nas branches monitoradas</p></div><ArrowUpRight aria-hidden size={18} /></div>
    {updates.length ? <ol className="updates-feed">{updates.map((update) => {
      const category = commitCategory(update.message);
      return <li key={update.id}>
        <div className="update-meta"><span><GitCommitHorizontal aria-hidden size={14} />{update.repositoryName.split("/").at(-1)}</span><time dateTime={update.committedAt.toISOString()} title={formatDateTime(update.committedAt)}>{formatRelativeTime(update.committedAt)}</time></div>
        <a className="update-message" href={update.url} rel="noreferrer" target="_blank">{category ? <code className="commit-prefix" title={`Prefixo informado na mensagem: ${category}`}>{category}</code> : null}{update.message.split("\n")[0]}<ArrowUpRight aria-hidden size={12} /></a>
        <div className="update-author"><PersonAvatar person={{ name: update.authorUsername ?? "Autor não associado", avatarUrl: update.authorAvatarUrl }} /><span>{update.authorUsername ?? "Autor não associado"}</span></div>
        <div className="update-details"><span className="update-branch"><GitBranch aria-hidden size={12} /><code>{update.branch}</code></span><code>{update.sha.slice(0,7)}</code></div>
      </li>;
    })}</ol> : <div className="feed-empty"><GitBranch aria-hidden size={24} />{emptyReason === "filtered" ? <><h3>Nenhuma atualização corresponde aos filtros</h3><p>Limpe os filtros para ver as mudanças registradas no portfólio.</p><Link className="text-link" href="/dashboard">Limpar filtros <ArrowUpRight aria-hidden size={13} /></Link></> : emptyReason === "no-capture" ? <><h3>O contexto começa no próximo sync</h3><p>As mensagens dos commits aparecerão aqui depois de sincronizar os projetos conectados.</p></> : <><h3>Sem atualizações registradas</h3><p>Quando houver commits nas branches monitoradas, as mudanças aparecerão aqui.</p></>}</div>}
    <p className="feed-footnote">Atualizações de código registradas. Entregas, revisões e impacto de negócio precisam de contexto da equipe.</p></aside>;
}
