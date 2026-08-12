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
      workspace_permission_denied: "Only workspace owners and admins can configure branches.",
      branches_add_failed: "The selected branches could not be added. Try refreshing the GitHub branch list.",
      branch_remove_failed: "This branch could not be removed from monitoring."
    };

    return (
      <div className="notice notice-warning">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>Branch configuration was not updated</strong>
          <p>{messages[errorCode] ?? "Could not update monitored branches."}</p>
        </div>
      </div>
    );
  }

  if (!successCode) {
    return null;
  }

  const messages: Record<string, string> = {
    branches_added: "Selected branches were added to monitoring.",
    branch_removed: "The branch was removed from monitoring.",
    no_branches_selected: "No additional branches were selected."
  };

  return (
    <div className="notice notice-success">
      <GitBranch aria-hidden size={18} />
      <div>
        <strong>Branch configuration updated</strong>
        <p>{messages[successCode] ?? "Monitored branches were updated."}</p>
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
    <section className="section skeleton-section" aria-busy="true" aria-label="Loading available branches">
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
    branchLoadError = error instanceof Error ? error.message : "Could not load branches from GitHub.";
  }

  if (branchLoadError) {
    return (
      <div className="notice notice-warning">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>Could not load available branches</strong>
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
            <h2 className="section-title">Available branches</h2>
            <p className="section-copy">Select branches that are not currently monitored.</p>
          </div>
        </div>

        {availableBranches.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No available branches</h3>
              <p>All GitHub branches returned for this repository are already monitored.</p>
            </div>
          </div>
        ) : (
          <div className="branch-list">
            {availableBranches.map((branch) => (
              <label className="branch-row branch-row-selectable" key={branch.name}>
                <div>
                  <div className="cell-title">{branch.name}</div>
                  <div className="cell-subtitle">Available on GitHub</div>
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
            <h2 className="section-title">Add selected branches</h2>
            <p className="section-copy">Future syncs will include commits from the selected branches.</p>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Adding...">
            <Plus aria-hidden size={16} />
            Add selected
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

  await assertWorkspaceAccess(session.user.id, repository.workspaceId);

  const defaultBranch = normalizeBranchName(repository.defaultBranch);
  const monitoredBranchNames = [
    defaultBranch,
    ...repository.branches.map((branch) => branch.name)
  ].filter((branchName): branchName is string => Boolean(branchName));

  return (
    <main className="page">
      <BranchActionNotice
        error={resolvedSearchParams?.branch_error}
        success={resolvedSearchParams?.branch_success}
      />
      <div className="page-header">
        <div>
          <h1 className="page-title">Monitor branches</h1>
          <p className="page-copy">
            Repository: <strong>{repository.fullName}</strong>. The default branch is always monitored; add
            additional branches only when they should count toward contributor activity.
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/dashboard">
            Dashboard
          </Link>
          <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/contributors`}>
            <Users aria-hidden size={16} />
            Contributors
          </Link>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Monitored branches</h2>
            <p className="section-copy">Commits from these branches are included during repository sync.</p>
          </div>
        </div>

        <div className="branch-list">
          {defaultBranch ? (
            <div className="branch-row">
              <div>
                <div className="cell-title">{defaultBranch}</div>
                <div className="cell-subtitle">Default branch</div>
              </div>
              <span className="status-badge status-active">
                <GitBranch aria-hidden size={16} />
                Always monitored
              </span>
            </div>
          ) : null}

          {repository.branches.map((branch) => (
            <div className="branch-row" key={branch.id}>
              <div>
                <div className="cell-title">{branch.name}</div>
                <div className="cell-subtitle">Additional branch</div>
              </div>
              <form action={removeRepositoryBranchAction}>
                <input name="repositoryBranchId" type="hidden" value={branch.id} />
                <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/branches`} />
                <PendingSubmitButton className="button button-danger" pendingLabel="Removing...">
                  <Trash2 aria-hidden size={16} />
                  Remove
                </PendingSubmitButton>
              </form>
            </div>
          ))}

          {!defaultBranch && repository.branches.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>No monitored branches</h3>
                <p>GitHub did not return a default branch for this repository.</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Suspense fallback={<AvailableBranchesFallback />}>
        <AvailableBranchesForm
          monitoredBranchNames={monitoredBranchNames}
          repository={{
            id: repository.id,
            installationId: repository.installation.installationId,
            name: repository.name,
            owner: repository.owner
          }}
        />
      </Suspense>
    </main>
  );
}
