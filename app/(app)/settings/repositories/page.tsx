import Link from "next/link";
import { AlertTriangle, CircleCheck, ExternalLink, Github } from "lucide-react";
import { redirect } from "next/navigation";
import { connectRepositoriesToWorkspaceAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAuthSession } from "@/lib/auth";
import {
  listLinkableGitHubInstallations,
  listSelectableInstallationRepositories
} from "@/lib/github/repository-access";
import { prisma } from "@/lib/prisma";
import { firstSearchParamValue, type SearchParamValue } from "@/lib/search-params";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

type RepositoryConnectionPageProps = {
  searchParams?: Promise<{
    connect_error?: SearchParamValue;
    connect_success?: SearchParamValue;
    installationId?: SearchParamValue;
    setup?: SearchParamValue;
    setup_error?: SearchParamValue;
    workspaceId?: SearchParamValue;
  }>;
};

const errorMessages: Record<string, string> = {
  connect_failed: "Não foi possível conectar os projetos. Confira o acesso no GitHub e tente novamente.",
  github_reauthorization_required: "Sua autorização GitHub expirou. Saia e entre com GitHub novamente.",
  repository_already_connected: "Um dos projetos já está conectado a este workspace.",
  request_already_pending: "Um dos projetos já possui solicitação pendente.",
  invalid_setup_state: "Este link de conexão é inválido ou já foi usado. Inicie a conexão novamente.",
  setup_state_expired: "O link expirou. Inicie a conexão novamente.",
  installation_not_authorized: "Esta instalação não está disponível para sua conta GitHub atual."
};

export default async function RepositoryConnectionPage({ searchParams }: RepositoryConnectionPageProps) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/");
  const params = await searchParams;
  const selectedWorkspace = await getSelectedWorkspaceForUser(session.user.id);
  const workspaceId = firstSearchParamValue(params?.workspaceId) ?? selectedWorkspace.id;
  const membership = await assertWorkspaceAccess(session.user.id, workspaceId);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { id: true, name: true }
  });
  const selectedInstallationId = firstSearchParamValue(params?.installationId);
  const connectError =
    firstSearchParamValue(params?.connect_error) ?? firstSearchParamValue(params?.setup_error);
  const connectSuccess = firstSearchParamValue(params?.connect_success);
  let identityError: string | null = null;
  let installations: Awaited<ReturnType<typeof listLinkableGitHubInstallations>> = [];

  try {
    installations = await listLinkableGitHubInstallations(session.user.id);
  } catch (error) {
    identityError = error instanceof Error ? error.message : "Não foi possível verificar sua autorização GitHub.";
  }

  const selectedInstallation = selectedInstallationId
    ? installations.find((installation) => String(installation.id) === selectedInstallationId) ?? null
    : null;
  let selection: Awaited<ReturnType<typeof listSelectableInstallationRepositories>> | null = null;
  if (selectedInstallation) {
    try {
      selection = await listSelectableInstallationRepositories({
        userId: session.user.id,
        workspaceId,
        installationId: String(selectedInstallation.id)
      });
    } catch {
      identityError = "Não foi possível carregar os projetos desta instalação. Confira o acesso GitHub e tente novamente.";
    }
  }
  const canConnectDirectly = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="page" id="main-content">
      {connectSuccess ? (
        <div className="notice notice-success">
          <CircleCheck aria-hidden size={18} />
          <div>
            <strong>{connectSuccess === "request_created" ? "Solicitação enviada." : "Projetos conectados."}</strong>
            <p>
              {connectSuccess === "request_created"
                ? "O responsável pelo workspace pode aprovar a seleção em Configurações."
                : "Os projetos selecionados estão disponíveis neste workspace."}
            </p>
          </div>
        </div>
      ) : null}
      {connectError || identityError ? (
        <div className="notice notice-warning">
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>A conexão com o GitHub precisa de atenção.</strong>
            <p>{identityError ? "Não foi possível verificar o acesso GitHub. Saia e entre novamente se sua autorização expirou." : errorMessages[connectError ?? ""] ?? "Não foi possível conectar os projetos."}</p>
            <Link className="text-link" href="/api/auth/signout">Sair para renovar a autorização</Link>
          </div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">Conectar projetos</h1>
          <p className="page-copy">
            Escolha os projetos de <strong>{workspace.name}</strong>. {canConnectDirectly
              ? "Eles serão conectados imediatamente."
              : "O responsável pelo workspace deve aprovar sua seleção."}
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/settings">Voltar para configurações</Link>
          <a className="button button-primary" href={`/api/github/install?workspaceId=${encodeURIComponent(workspaceId)}`}>
            <Github aria-hidden size={16} />
            Instalar ou ajustar acesso
            <ExternalLink aria-hidden size={14} />
          </a>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Instalações GitHub disponíveis</h2>
            <p className="section-copy">Reutilize uma instalação pessoal ou de uma organização que você administra.</p>
          </div>
        </div>
        {installations.length ? (
          <div className="button-row">
            {installations.map((installation) => (
              <Link
                className={`button ${String(installation.id) === selectedInstallationId ? "button-primary" : "button-secondary"}`}
                href={`/settings/repositories?workspaceId=${encodeURIComponent(workspaceId)}&installationId=${installation.id}`}
                key={installation.id}
              >
                {installation.account.login} ({installation.account.type === "Organization" ? "organization" : "personal"})
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <h3>Nenhuma instalação disponível</h3>
              <p>Instale o AveriCode em sua conta ou organização e retorne para escolher os projetos.</p>
            </div>
          </div>
        )}
      </section>

      {selection ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Projetos em {selection.installation.account.login}</h2>
              <p className="section-copy">Projetos já conectados ou com solicitação pendente não podem ser selecionados.</p>
            </div>
          </div>
          <form action={connectRepositoriesToWorkspaceAction}>
            <input name="workspaceId" type="hidden" value={workspaceId} />
            <input name="installationId" type="hidden" value={selectedInstallationId} />
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Selecionar</th><th>Projeto</th><th>Visibilidade</th><th>Status</th></tr></thead>
                <tbody>
                  {selection.repositories.map((repository) => (
                    <tr key={repository.id}>
                      <td>
                        <input
                          aria-label={`Selecionar ${repository.full_name}`}
                          disabled={repository.unavailable}
                          name="githubRepoId"
                          type="checkbox"
                          value={repository.id}
                        />
                      </td>
                      <td><strong>{repository.full_name}</strong></td>
                      <td>{repository.private ? "Privado" : "Público"}</td>
                      <td>{repository.unavailable ? "Conectado ou pendente" : "Disponível"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row form-actions">
              <PendingSubmitButton className="button button-primary" pendingLabel="Salvando…">
                {canConnectDirectly ? "Conectar projetos selecionados" : "Solicitar aprovação"}
              </PendingSubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
