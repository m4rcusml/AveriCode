import Image from "next/image";
import { ArrowRight, CircleCheck, CircleHelp, CircleMinus } from "lucide-react";
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard/queries";
import { activityDistribution, syncDistribution } from "@/lib/dashboard/summary";

type Person = { id: string; name: string; avatarUrl: string | null };
type Distribution = ReturnType<typeof activityDistribution>;

export function PersonAvatar({ person }: { person: Pick<Person, "name" | "avatarUrl"> }) {
  const initials = person.name.split(/[\s._-]+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const avatar = person.avatarUrl?.startsWith("https://avatars.githubusercontent.com/") ? person.avatarUrl : null;
  return <span className="person-portrait" title={person.name}>
    {avatar ? <Image alt="" height={26} width={26} src={avatar} /> : <span aria-hidden>{initials || "?"}</span>}
  </span>;
}

export function AvatarGroup({ people, limit = 3 }: { people: Person[]; limit?: number }) {
  if (!people.length) return null;
  return <span className="avatar-group" role="img" aria-label={`${people.length} pessoas: ${people.slice(0, limit).map((p) => p.name).join(", ")}${people.length > limit ? ` e mais ${people.length - limit}` : ""}`}>
    {people.slice(0, limit).map((person) => <PersonAvatar key={person.id} person={person} />)}
    {people.length > limit ? <span className="avatar-overflow" title={`${people.length - limit} outras pessoas`}>+{people.length - limit}</span> : null}
  </span>;
}

export function ParticipationBar({ counts, compact = false, compactLegend = false }: { counts: Distribution; compact?: boolean; compactLegend?: boolean }) {
  const label = !counts.total ? "Nenhuma pessoa esperada configurada" : counts.unknown === counts.total
    ? `Sem dado atual para ${counts.total} ${counts.total === 1 ? "pessoa esperada" : "pessoas esperadas"}`
    : `${counts.active} com commits, ${counts.inactive} sem commits e ${counts.unknown} sem dado atual, de ${counts.total} pessoas esperadas`;
  return <span className={`participation-visual ${compact ? "participation-compact" : ""}`}>
    <span className="participation-bar presence-ruler" role="img" aria-label={label}>
      {counts.active ? <span className="bar-active" style={{ flexGrow: counts.active }} aria-hidden /> : null}
      {counts.inactive ? <span className="bar-inactive" style={{ flexGrow: counts.inactive }} aria-hidden /> : null}
      {counts.unknown ? <span className="bar-unknown" style={{ flexGrow: counts.unknown }} aria-hidden /> : null}
    </span>
    <small className="participation-label">{!counts.total ? "Definir pessoas esperadas" : counts.unknown === counts.total ? `Sem dado atual · ${counts.total} ${counts.total === 1 ? "pessoa" : "pessoas"}` : counts.unknown ? `${counts.active} com commits confirmados` : `${counts.active} de ${counts.total} com commits`}</small>
    {!compact && counts.total ? <span className="participation-counts">
      <span title={`${counts.active} pessoas com commits`}><CircleCheck size={12} aria-hidden />{counts.active} {compactLegend ? "com" : "com commits"}</span>
      <span title={`${counts.inactive} pessoas sem commits`}><CircleMinus size={12} aria-hidden />{counts.inactive} {compactLegend ? "sem" : "sem commits"}</span>
      <span><CircleHelp size={12} aria-hidden />{counts.unknown} sem dado atual</span>
    </span> : compact && counts.unknown > 0 && counts.unknown < counts.total ? <small className="participation-unknown">{counts.unknown} sem dado atual</small> : null}
  </span>;
}

export function PortfolioBrief({ data, filterHref }: { data: DashboardData; filterHref: (values: Record<string, string>) => string }) {
  const repositories = data.selectedInstallation?.repositories ?? data.allRepositories;
  const sync = syncDistribution(repositories);
  const people = activityDistribution(data.people);
  return <section className="executive-brief visual-brief" aria-label="Resumo visual do portfólio">
    <div className="brief-projects">
      <div className="brief-heading"><span className="brief-number">{sync.total}</span><span>projetos<strong>{data.selectedInstallation?.accountLogin ?? "Todas as contas"}</strong></span></div>
      <div className="sync-overview-bar" role="img" aria-label={`${sync.current} projetos com dados atuais, ${sync.failed} com falha ou suspensão e ${sync.waiting} aguardando dados atuais`}>
        {sync.current ? <span className="bar-active" style={{ flexGrow: sync.current }} /> : null}
        {sync.failed ? <span className="bar-failed" style={{ flexGrow: sync.failed }} /> : null}
        {sync.waiting ? <span className="bar-unknown" style={{ flexGrow: sync.waiting }} /> : null}
      </div>
      <div className="sync-overview-legend">
        <Link href={filterHref({ focus: "current" })}><i className="presence-dot presence-active" />{sync.current} atuais</Link>
        <Link href={filterHref({ focus: "failed" })} title="Projetos com falha ou acesso suspenso"><i className="presence-dot presence-failed" />{sync.failed} {sync.failed === 1 ? "falha/acesso" : "falhas/acesso"}</Link>
        <Link href={filterHref({ focus: "waiting" })}><i className="presence-dot presence-unknown" />{sync.waiting} a atualizar</Link>
      </div>
    </div>
    <div className="brief-people">
      <div className="brief-heading"><span className="brief-number">{people.active}<small> / {people.total}</small></span><span>pessoas com commits<strong>Pessoas únicas · 7 dias</strong></span><AvatarGroup people={data.people} limit={4} /></div>
      <ParticipationBar counts={people} compactLegend />
    </div>
    <Link className={`brief-attention ${data.metrics.attentionRepositoryCount ? "has-attention" : ""}`} href={filterHref({ focus: "attention" })}>
      <span className="brief-heading"><span className="brief-number">{data.metrics.attentionRepositoryCount}</span><span>projetos a revisar<strong>{data.metrics.failedRepositoryCount ? `${data.metrics.failedRepositoryCount} com falha ou acesso suspenso` : "Verificar dados e acesso"}</strong></span></span>
      <span className="brief-review-link"><span className="review-desktop-label">Revisar agora</span><span className="review-mobile-label">Revisar {data.metrics.attentionRepositoryCount} projetos</span><ArrowRight aria-hidden size={15} /></span>
    </Link>
  </section>;
}
