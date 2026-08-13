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
  connect_failed: "The selected repositories could not be connected. Confirm your GitHub access and try again.",
  github_reauthorization_required: "Your GitHub authorization is unavailable. Sign out and sign in with GitHub again.",
  repository_already_connected: "One of the selected repositories is already connected to this workspace.",
  request_already_pending: "One of the selected repositories already has a pending request.",
  invalid_setup_state: "The GitHub setup link is invalid or was already used. Start the connection again.",
  setup_state_expired: "The GitHub setup expired. Start the connection again.",
  installation_not_authorized: "That GitHub installation is not available to your signed-in GitHub identity."
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
    identityError = error instanceof Error ? error.message : "GitHub authorization could not be verified.";
  }

  const selectedInstallation = selectedInstallationId
    ? installations.find((installation) => String(installation.id) === selectedInstallationId) ?? null
    : null;
  const selection = selectedInstallation
    ? await listSelectableInstallationRepositories({
        userId: session.user.id,
        workspaceId,
        installationId: String(selectedInstallation.id)
      })
    : null;
  const canConnectDirectly = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="page">
      {connectSuccess ? (
        <div className="notice notice-success">
          <CircleCheck aria-hidden size={18} />
          <div>
            <strong>{connectSuccess === "request_created" ? "Request sent." : "Repositories connected."}</strong>
            <p>
              {connectSuccess === "request_created"
                ? "The workspace owner can now approve individual repositories in Settings."
                : "The selected repositories are now available in this workspace."}
            </p>
          </div>
        </div>
      ) : null}
      {connectError || identityError ? (
        <div className="notice notice-warning">
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>GitHub connection needs attention.</strong>
            <p>{identityError ?? errorMessages[connectError ?? ""] ?? "The repositories could not be connected."}</p>
          </div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">Add repositories</h1>
          <p className="page-copy">
            Choose repositories for <strong>{workspace.name}</strong>. {canConnectDirectly
              ? "They will be connected immediately."
              : "The workspace owner must approve your selection."}
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/settings">Back to settings</Link>
          <a className="button button-primary" href={`/api/github/install?workspaceId=${encodeURIComponent(workspaceId)}`}>
            <Github aria-hidden size={16} />
            Install or change access
            <ExternalLink aria-hidden size={14} />
          </a>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Available GitHub installations</h2>
            <p className="section-copy">Reuse an installation you own or an organization installation you administer.</p>
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
              <h3>No reusable installation found</h3>
              <p>Install AveriCode on your account or an organization you administer, then return here.</p>
            </div>
          </div>
        )}
      </section>

      {selection ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Repositories in {selection.installation.account.login}</h2>
              <p className="section-copy">Already connected or pending repositories are unavailable.</p>
            </div>
          </div>
          <form action={connectRepositoriesToWorkspaceAction}>
            <input name="workspaceId" type="hidden" value={workspaceId} />
            <input name="installationId" type="hidden" value={selectedInstallationId} />
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Select</th><th>Repository</th><th>Visibility</th><th>Status</th></tr></thead>
                <tbody>
                  {selection.repositories.map((repository) => (
                    <tr key={repository.id}>
                      <td>
                        <input
                          aria-label={`Select ${repository.full_name}`}
                          disabled={repository.unavailable}
                          name="githubRepoId"
                          type="checkbox"
                          value={repository.id}
                        />
                      </td>
                      <td><strong>{repository.full_name}</strong></td>
                      <td>{repository.private ? "Private" : "Public"}</td>
                      <td>{repository.unavailable ? "Connected or pending" : "Available"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row form-actions">
              <PendingSubmitButton className="button button-primary" pendingLabel="Saving...">
                {canConnectDirectly ? "Connect selected repositories" : "Send approval request"}
              </PendingSubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
