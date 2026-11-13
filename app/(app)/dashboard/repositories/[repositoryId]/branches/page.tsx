import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, GitBranch, Plus, Trash2, Users } from "lucide-react";
import { addRepositoryBranchesAction, removeRepositoryBranchAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAuthSession } from "@/lib/auth";
import { getInstallationAccessToken } from "@/lib/github/app-auth";
import { fetchRepositoryBranches } from "@/lib/github/commits";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

type RepositoryBranchesPageProps = {
  params: Promise<{
    repositoryId: string;
  }>;
  searchParams?: Promise<{
    branch_error?: string | string[];
    branch_success?: string | string[];
    load?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function BranchActionNotice({
  error,
  success
}: {
  error?: string | string[];
  success?: string | string[];
}) {
  const errorCode = firstValue(error);
  const successCode = firstValue(success);

  if (errorCode) {
    const messages: Record<string, string> = {
      workspace_permission_denied: "Somente responsáveis e administradores podem configurar branches.",
      branches_add_failed: "Não foi possível adicionar as branches. Atualize a lista do GitHub e tente novamente.",
      branch_remove_failed: "Não foi possível remover esta branch do monitoramento."
    };

    return (
      <div className="notice notice-warning">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>A configuração de branches não foi atualizada</strong>
          <p>{messages[errorCode] ?? "Não foi possível atualizar as branches monitoradas."}</p>
        </div>
      </div>
    );
  }

  if (!successCode) {
    return null;
  }

  const messages: Record<string, string> = {
    branches_added: "Branches selecionadas adicionadas ao monitoramento.",
    branch_removed: "Branch removida do monitoramento.",
    no_branches_selected: "Nenhuma branch adicional selecionada."
  };

  return (
    <div className="notice notice-success">
      <GitBranch aria-hidden size={18} />
      <div>
        <strong>Configuração de branches atualizada</strong>
        <p>{messages[successCode] ?? "Branches monitoradas atualizadas."}</p>
      </div>
    </div>
  );
}

type AvailableBranchesFormProps = {
  monitoredBranchNames: string[];
  repository: {
    id: string;
    installationId: string;
    name: string;
    owner: string;
  };
};

function normalizeBranchName(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function AvailableBranchesFallback() {
  return (
    <section className="section skeleton-section" aria-busy="true" aria-label="Carregando branches disponíveis">
      <div className="skeleton-line skeleton-line-short" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </section>
  );
}

async function AvailableBranchesForm({ monitoredBranchNames, repository }: AvailableBranchesFormProps) {
  let availableBranches: Array<{ name: string }> = [];
  let branchLoadError: string | null = null;
  const monitoredBranches = new Set(monitoredBranchNames);

  try {
    const token = await getInstallationAccessToken(repository.installationId);
    const githubBranches = await fetchRepositoryBranches({
      owner: repository.owner,
      name: repository.name,
      token
    });

    availableBranches = githubBranches.filter((branch) => !monitoredBranches.has(branch.name));
  } catch (error) {
    branchLoadError = error instanceof Error ? error.message : "Não foi possível carregar as branches do GitHub.";
  }

  if (branchLoadError) {
    return (
      <div className="notice notice-warning">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>Não foi possível carregar as branches</strong>
          <p>{branchLoadError}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={addRepositoryBranchesAction}>
      <input name="repositoryId" type="hidden" value={repository.id} />
      <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/branches`} />

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Branches disponíveis</h2>
            <p className="section-copy">Selecione as branches para adicionar.</p>
          </div>
        </div>

        {availableBranches.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>Nenhuma branch disponível</h3>
              <p>Todas as branches disponíveis já são monitoradas.</p>
            </div>
          </div>
        ) : (
          <div className="branch-list">
            {availableBranches.map((branch) => (
              <label className="branch-row branch-row-selectable" key={branch.name}>
                <div>
                  <div className="cell-title">{branch.name}</div>
                </div>
                <input name="selectedBranch" type="checkbox" value={branch.name} />
              </label>
            ))}
          </div>
        )}
      </section>

      {availableBranches.length > 0 ? (
        <section className="section action-section">
          <div>
            <p className="section-copy">Os commits serão incluídos na próxima sincronização.</p>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Adicionando…">
            <Plus aria-hidden size={16} />
            Adicionar seleção
          </PendingSubmitButton>
        </section>
      ) : null}
    </form>
  );
}

export default async function RepositoryBranchesPage({
  params,
  searchParams
}: RepositoryBranchesPageProps) {
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
      branches: {
        orderBy: {
          name: "asc"
        }
      }
    }
  });

  if (!repository) {
    notFound();
  }

  const membership = await assertWorkspaceAccess(session.user.id, repository.workspaceId);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const showAvailableBranches = firstValue(resolvedSearchParams?.load) === "1";

  const defaultBranch = normalizeBranchName(repository.defaultBranch);
  const monitoredBranchNames = [
    defaultBranch,
    ...repository.branches.map((branch) => branch.name)
  ].filter((branchName): branchName is string => Boolean(branchName));

  return (
    <main className="page" id="main-content">
      <BranchActionNotice
        error={resolvedSearchParams?.branch_error}
        success={resolvedSearchParams?.branch_success}
      />
      <div className="page-header">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-copy">
            {repository.fullName}
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/dashboard">
            Portfólio
          </Link>
          <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/contributors`}>
            <Users aria-hidden size={16} />
            Contribuidores
          </Link>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Branches monitoradas</h2>
          </div>
        </div>

        <div className="branch-list">
          {defaultBranch ? (
            <div className="branch-row">
              <div>
                <div className="cell-title">{defaultBranch}</div>
                <div className="cell-subtitle">Branch padrão</div>
              </div>
              <span className="status-badge status-active">
                <GitBranch aria-hidden size={16} />
                Sempre monitorada
              </span>
            </div>
          ) : null}

          {repository.branches.map((branch) => (
            <div className="branch-row" key={branch.id}>
              <div>
                <div className="cell-title">{branch.name}</div>
                <div className="cell-subtitle">Branch adicional</div>
              </div>
              <form action={removeRepositoryBranchAction}>
                <input name="repositoryBranchId" type="hidden" value={branch.id} />
                <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/branches`} />
                <PendingSubmitButton disabled={!canManage} className="button button-danger" pendingLabel="Removendo…">
                  <Trash2 aria-hidden size={16} />
                  Remover
                </PendingSubmitButton>
              </form>
            </div>
          ))}

          {!defaultBranch && repository.branches.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>Nenhuma branch monitorada</h3>
                <p>O GitHub não retornou uma branch padrão para este projeto.</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {canManage ? showAvailableBranches ? <Suspense fallback={<AvailableBranchesFallback />}>
        <AvailableBranchesForm
          monitoredBranchNames={monitoredBranchNames}
          repository={{
            id: repository.id,
            installationId: repository.installation.installationId,
            name: repository.name,
            owner: repository.owner
          }}
        />
      </Suspense> : <section className="section"><h2 className="section-title">Branches disponíveis</h2><p className="section-copy">Busque outras branches para monitorar.</p><Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/branches?load=1`}>Buscar branches no GitHub</Link></section> : <p className="notice">Somente responsáveis e administradores podem configurar branches.</p>}
    </main>
  );
}
