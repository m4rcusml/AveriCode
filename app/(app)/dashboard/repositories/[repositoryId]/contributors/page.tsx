import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CircleSlash, Plus, Trash2, Users } from "lucide-react";
import {
  addExpectedContributorAction,
  confirmExpectedContributorsAction,
  removeExpectedContributorAction,
  toggleIgnoredContributorAction
} from "@/app/actions";
import { ManualSyncToast } from "@/components/manual-sync-toast";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SyncControl } from "@/components/sync-control";
import { getAuthSession } from "@/lib/auth";
import { getRepositoryPeopleSuggestions, type GitHubPersonSuggestion } from "@/lib/github/people";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

type RepositoryContributorSetupPageProps = {
  params: Promise<{
    repositoryId: string;
  }>;
  searchParams?: Promise<{
    imported?: string | string[];
    contributors_saved?: string | string[];
    suggestions?: string | string[];
    manual_sync_error?: string | string[];
    retry_after_ms?: string | string[];
  }>;
};

function suggestionValue(person: GitHubPersonSuggestion) {
  return JSON.stringify(person);
}

function contributorName(person: GitHubPersonSuggestion) {
  return `@${person.username}`;
}

function SuggestionTable({
  alreadyExpectedIds,
  defaultChecked,
  people
}: {
  alreadyExpectedIds: Set<string>;
  defaultChecked: boolean;
  people: GitHubPersonSuggestion[];
}) {
  if (people.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <h3>Nenhum autor encontrado</h3>
          <p>Adicione pelo usuário GitHub.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Selecionar</th>
            <th>Usuário</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const alreadyExpected = alreadyExpectedIds.has(person.githubUserId);

            return (
              <tr key={person.githubUserId}>
                <td>
                  {alreadyExpected ? (
                    <span className="pill">Adicionado</span>
                  ) : (
                    <input
                      aria-label={`Selecionar ${person.username}`}
                      defaultChecked={defaultChecked}
                      name="selectedContributor"
                      type="checkbox"
                      value={suggestionValue(person)}
                    />
                  )}
                </td>
                <td>
                  <div className="cell-title">{contributorName(person)}</div>
                </td>
                <td>
                  <span className={`status-badge ${alreadyExpected ? "status-active" : "status-unknown"}`}>
                    <Users aria-hidden size={16} />
                    {alreadyExpected ? "Esperado" : "Sugerido"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContributorSuggestionsFallback() {
  return (
    <section className="section skeleton-section" aria-busy="true" aria-label="Carregando sugestões de pessoas">
      <div className="skeleton-line skeleton-line-short" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </section>
  );
}

async function ContributorSuggestions({
  alreadyExpectedIds,
  repositoryId
}: {
  alreadyExpectedIds: string[];
  repositoryId: string;
}) {
  const suggestions = await getRepositoryPeopleSuggestions(repositoryId);
  const alreadyExpectedIdSet = new Set(alreadyExpectedIds);

  return (
    <>
      {suggestions.errors.map((error) => (
        <div className="notice notice-warning" key={error}>
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>As sugestões do GitHub estão incompletas</strong>
            <p>{error}</p>
          </div>
        </div>
      ))}

      <form action={confirmExpectedContributorsAction}>
        <input name="repositoryId" type="hidden" value={repositoryId} />
        <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repositoryId}/contributors`} />

        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Autores de commits no GitHub</h2>
              <p className="section-copy">
                Autores com histórico de commits neste projeto.
              </p>
            </div>
          </div>
          <SuggestionTable
            alreadyExpectedIds={alreadyExpectedIdSet}
            defaultChecked
            people={suggestions.suggestedContributors}
          />
        </section>

        <section className="section action-section">
          <div>
            <p className="section-copy">Adicione os autores selecionados à equipe esperada.</p>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Adicionando…">
            <Users aria-hidden size={16} />
            Adicionar seleção
          </PendingSubmitButton>
        </section>
      </form>
    </>
  );
}

export default async function RepositoryContributorSetupPage({
  params,
  searchParams
}: RepositoryContributorSetupPageProps) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { repositoryId } = await params;
  const resolvedSearchParams = await searchParams;
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: {
      installation: true,
      contributors: {
        where: {
          isExpected: true
        },
        include: {
          contributor: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!repository) {
    notFound();
  }

  const membership = await assertWorkspaceAccess(session.user.id, repository.workspaceId);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const showSuggestions = (Array.isArray(resolvedSearchParams?.suggestions) ? resolvedSearchParams.suggestions[0] : resolvedSearchParams?.suggestions) === "1";

  const alreadyExpectedIds = repository.contributors
    .map((repositoryContributor) => repositoryContributor.contributor.githubUserId)
    .filter((githubUserId): githubUserId is string => Boolean(githubUserId));

  return (
    <main className="page" id="main-content">
      <ManualSyncToast
        dismissHref={`/dashboard/repositories/${repository.id}/contributors`}
        error={resolvedSearchParams?.manual_sync_error}
        retryAfterMs={resolvedSearchParams?.retry_after_ms}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Contribuidores</h1>
          <p className="page-copy">
            {repository.fullName}
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/dashboard">
            Portfólio
          </Link>
          <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/branches`}>
            Branches
          </Link>
        </div>
      </div>

      {resolvedSearchParams?.contributors_saved ? <div className="notice notice-success"><div><strong>Equipe esperada salva.</strong><p>Sincronize para recalcular a atividade.</p></div>{canManage ? <SyncControl repositoryId={repository.id} className="button button-secondary" label="Sincronizar projeto" /> : null}</div> : null}

      {resolvedSearchParams?.imported ? (
        <div className="notice notice-success">
          <Users aria-hidden size={18} />
          <div>
            <strong>Projeto conectado.</strong>
            <p>Revise os contribuidores esperados.</p>
          </div>
        </div>
      ) : null}

      <section className="repo-item">
        <div className="repo-item-header">
          <div>
            <h2 className="section-title">Adicionar contribuidor</h2>
          </div>
        </div>
        <form action={addExpectedContributorAction} className="manual-contributor-form">
          <input name="repositoryId" type="hidden" value={repository.id} />
          <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/contributors`} />
          <div className="field">
            <label htmlFor={`username-${repository.id}`}>Usuário GitHub</label>
            <input id={`username-${repository.id}`} name="username" placeholder="octocat" required />
          </div>
          <PendingSubmitButton disabled={!canManage} className="button button-primary" pendingLabel="Adicionando…">
            <Plus aria-hidden size={16} />
            Adicionar
          </PendingSubmitButton>
        </form>
      </section>

      {canManage ? showSuggestions ? <Suspense fallback={<ContributorSuggestionsFallback />}>
        <ContributorSuggestions alreadyExpectedIds={alreadyExpectedIds} repositoryId={repository.id} />
      </Suspense> : <section className="section"><h2 className="section-title">Autores de commits no GitHub</h2><p className="section-copy">Inclusão automática por histórico de commits. Adicione outras pessoas pelo usuário GitHub.</p><Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/contributors?suggestions=1`}>Buscar autores no GitHub</Link></section> : <p className="notice">Somente responsáveis e administradores podem alterar a equipe esperada.</p>}

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Contribuidores esperados</h2>
            <p className="section-copy">{repository.contributors.length} pessoas</p>
          </div>
        </div>

        {repository.contributors.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>Nenhum contribuidor configurado</h3>
              <p>Adicione pelo usuário GitHub ou busque autores.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contribuidor</th>
                  <th>Origem</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {repository.contributors.map((repositoryContributor) => (
                  <tr key={repositoryContributor.id}>
                    <td>
                      <div className="cell-title">
                        {repositoryContributor.contributor.username ? `@${repositoryContributor.contributor.username}` : "Conta sem vínculo"}
                      </div>
                    </td>
                    <td>{repositoryContributor.source === "GITHUB" ? "GitHub" : repositoryContributor.source === "MANUAL" ? "Manual" : "Lista anterior"}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          repositoryContributor.isIgnored ? "status-unknown" : "status-active"
                        }`}
                      >
                        <Users aria-hidden size={16} />
                        {repositoryContributor.isIgnored ? "Ignorado" : "Esperado"}
                      </span>
                    </td>
                    <td>
                      <div className="button-row">
                        <form action={toggleIgnoredContributorAction}>
                          <input name="repositoryContributorId" type="hidden" value={repositoryContributor.id} />
                          <input
                            name="isIgnored"
                            type="hidden"
                            value={repositoryContributor.isIgnored ? "false" : "true"}
                          />
                          <input
                            name="returnTo"
                            type="hidden"
                            value={`/dashboard/repositories/${repository.id}/contributors`}
                          />
                          <PendingSubmitButton disabled={!canManage} className="button button-secondary" pendingLabel="Salvando…">
                            <CircleSlash aria-hidden size={16} />
                            {repositoryContributor.isIgnored ? "Restaurar" : "Ignorar"}
                          </PendingSubmitButton>
                        </form>
                        <form action={removeExpectedContributorAction}>
                          <input name="repositoryContributorId" type="hidden" value={repositoryContributor.id} />
                          <input
                            name="returnTo"
                            type="hidden"
                            value={`/dashboard/repositories/${repository.id}/contributors`}
                          />
                          <PendingSubmitButton disabled={!canManage} className="button button-danger" pendingLabel="Removendo…">
                            <Trash2 aria-hidden size={16} />
                            Remover
                          </PendingSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
