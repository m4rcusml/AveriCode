import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CircleSlash, Plus, Trash2, Users } from "lucide-react";
import {
  addExpectedContributorAction,
  confirmExpectedContributorsAction,
  removeExpectedContributorAction,
  toggleIgnoredContributorAction,
  toggleRepositoryMonitoringAction
} from "@/app/actions";
import { ManualSyncToast } from "@/components/manual-sync-toast";
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
  people,
  title
}: {
  alreadyExpectedIds: Set<string>;
  defaultChecked: boolean;
  people: GitHubPersonSuggestion[];
  title: string;
}) {
  if (people.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <h3>No {title.toLowerCase()} found</h3>
          <p>GitHub did not return users for this group.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>User</th>
            <th>GitHub ID</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const alreadyExpected = alreadyExpectedIds.has(person.githubUserId);

            return (
              <tr key={person.githubUserId}>
                <td>
                  {alreadyExpected ? (
                    <span className="pill">Added</span>
                  ) : (
                    <input
                      aria-label={`Select ${person.username}`}
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
                <td>{person.githubUserId}</td>
                <td>
                  <span className={`status-badge ${alreadyExpected ? "status-active" : "status-unknown"}`}>
                    <Users aria-hidden size={16} />
                    {alreadyExpected ? "Expected" : "Suggested"}
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
    <section className="section skeleton-section" aria-busy="true" aria-label="Loading contributor suggestions">
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
            <strong>GitHub suggestion warning</strong>
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
              <h2 className="section-title">AveriCode suggestions</h2>
              <p className="section-copy">
                Users with repository access who have already committed to this repository. They are selected by
                default.
              </p>
            </div>
          </div>
          <SuggestionTable
            alreadyExpectedIds={alreadyExpectedIdSet}
            defaultChecked
            people={suggestions.suggestedContributors}
            title="AveriCode suggestions"
          />
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Access without contributions</h2>
              <p className="section-copy">
                Users with repository access who are not listed in the repository contributor history. Select any
                additional people who should be expected.
              </p>
            </div>
          </div>
          <SuggestionTable
            alreadyExpectedIds={alreadyExpectedIdSet}
            defaultChecked={false}
            people={suggestions.accessWithoutContributions}
            title="Access without contributions"
          />
        </section>

        <section className="section action-section">
          <div>
            <h2 className="section-title">Confirm selected contributors</h2>
            <p className="section-copy">Selections from both lists will be added as expected contributors.</p>
          </div>
          <button className="button button-primary" type="submit">
            <Users aria-hidden size={16} />
            Add selected
          </button>
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

  await assertWorkspaceAccess(session.user.id, repository.workspaceId);

  const alreadyExpectedIds = repository.contributors
    .map((repositoryContributor) => repositoryContributor.contributor.githubUserId)
    .filter((githubUserId): githubUserId is string => Boolean(githubUserId));

  return (
    <main className="page">
      <ManualSyncToast
        dismissHref={`/dashboard/repositories/${repository.id}/contributors`}
        error={resolvedSearchParams?.manual_sync_error}
        retryAfterMs={resolvedSearchParams?.retry_after_ms}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Configure contributors</h1>
          <p className="page-copy">
            Repository: <strong>{repository.fullName}</strong>. Confirm who should be expected to commit each
            week.
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/dashboard">
            Dashboard
          </Link>
          <Link className="button button-secondary" href={`/dashboard/repositories/${repository.id}/branches`}>
            Branches
          </Link>
          <form action={toggleRepositoryMonitoringAction}>
            <input name="repositoryId" type="hidden" value={repository.id} />
            <input name="isActive" type="hidden" value={repository.isActive ? "false" : "true"} />
            <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/contributors`} />
            <button className="button button-primary" type="submit">
              {repository.isActive ? "Deactivate monitoring" : "Activate monitoring"}
            </button>
          </form>
        </div>
      </div>

      {resolvedSearchParams?.imported ? (
        <div className="notice notice-success">
          <Users aria-hidden size={18} />
          <div>
            <strong>Repository imported.</strong>
            <p>Review the suggested contributors below and confirm who should be expected.</p>
          </div>
        </div>
      ) : null}

      <section className="repo-item">
        <div className="repo-item-header">
          <div>
            <h2 className="section-title">Add by username</h2>
            <p className="section-copy">Type a GitHub username to add someone manually as an expected contributor.</p>
          </div>
        </div>
        <form action={addExpectedContributorAction} className="manual-contributor-form">
          <input name="repositoryId" type="hidden" value={repository.id} />
          <input name="returnTo" type="hidden" value={`/dashboard/repositories/${repository.id}/contributors`} />
          <div className="field">
            <label htmlFor={`username-${repository.id}`}>GitHub username</label>
            <input id={`username-${repository.id}`} name="username" placeholder="octocat" />
          </div>
          <button className="button button-primary" type="submit">
            <Plus aria-hidden size={16} />
            Add
          </button>
        </form>
      </section>

      <Suspense fallback={<ContributorSuggestionsFallback />}>
        <ContributorSuggestions alreadyExpectedIds={alreadyExpectedIds} repositoryId={repository.id} />
      </Suspense>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Expected contributors</h2>
            <p className="section-copy">{repository.contributors.length} contributor(s) currently expected.</p>
          </div>
        </div>

        {repository.contributors.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No expected contributors configured</h3>
              <p>Select suggested users above or add a contributor manually.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contributor</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {repository.contributors.map((repositoryContributor) => (
                  <tr key={repositoryContributor.id}>
                    <td>
                      <div className="cell-title">
                        {repositoryContributor.contributor.name ??
                          repositoryContributor.contributor.username ??
                          "Unnamed contributor"}
                      </div>
                    </td>
                    <td>
                      {repositoryContributor.contributor.username ? (
                        `@${repositoryContributor.contributor.username}`
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td>{repositoryContributor.contributor.email ?? <span className="muted">None</span>}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          repositoryContributor.isIgnored ? "status-unknown" : "status-active"
                        }`}
                      >
                        <Users aria-hidden size={16} />
                        {repositoryContributor.isIgnored ? "Ignored" : "Expected"}
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
                          <button className="button button-secondary" type="submit">
                            <CircleSlash aria-hidden size={16} />
                            {repositoryContributor.isIgnored ? "Restore" : "Ignore"}
                          </button>
                        </form>
                        <form action={removeExpectedContributorAction}>
                          <input name="repositoryContributorId" type="hidden" value={repositoryContributor.id} />
                          <input
                            name="returnTo"
                            type="hidden"
                            value={`/dashboard/repositories/${repository.id}/contributors`}
                          />
                          <button className="button button-danger" type="submit">
                            <Trash2 aria-hidden size={16} />
                            Remove
                          </button>
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
