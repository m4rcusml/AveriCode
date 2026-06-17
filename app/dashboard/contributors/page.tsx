import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleSlash, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrimaryWorkspaceForUser } from "@/lib/workspaces";
import {
  addExpectedContributorAction,
  removeExpectedContributorAction,
  syncRepositoryNowAction,
  toggleIgnoredContributorAction
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ContributorsPage() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspace = await getPrimaryWorkspaceForUser(session.user.id);
  const repositories = await prisma.repository.findMany({
    where: {
      workspaceId: workspace.id,
      isActive: true
    },
    include: {
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
    },
    orderBy: {
      fullName: "asc"
    }
  });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expected contributors</h1>
          <p className="page-copy">
            Inactivity is measured only for contributors explicitly expected on each active repository.
          </p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/dashboard/repositories">
            Repositories
          </Link>
          <Link className="button button-primary" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>

      {repositories.length === 0 ? (
        <div className="empty-state">
          <div>
            <h2>No active repositories</h2>
            <p>Activate at least one imported repository before configuring expected contributors.</p>
            <Link className="button button-primary" href="/dashboard/repositories">
              Configure repositories
            </Link>
          </div>
        </div>
      ) : (
        <div className="repo-list">
          {repositories.map((repository) => (
            <section className="repo-item" key={repository.id}>
              <div className="repo-item-header">
                <div>
                  <h2 className="section-title">{repository.fullName}</h2>
                  <p className="section-copy">
                    Last sync: {formatDateTime(repository.lastSyncedAt)}. {repository.contributors.length} expected
                    contributor(s).
                  </p>
                </div>
                <form action={syncRepositoryNowAction}>
                  <input name="repositoryId" type="hidden" value={repository.id} />
                  <input name="returnTo" type="hidden" value="/dashboard/contributors" />
                  <button className="button button-secondary" type="submit">
                    <RefreshCw aria-hidden size={16} />
                    Sync
                  </button>
                </form>
              </div>

              <form action={addExpectedContributorAction} className="form-grid">
                <input name="repositoryId" type="hidden" value={repository.id} />
                <input name="returnTo" type="hidden" value="/dashboard/contributors" />
                <div className="field">
                  <label htmlFor={`username-${repository.id}`}>GitHub username</label>
                  <input id={`username-${repository.id}`} name="username" placeholder="octocat" />
                </div>
                <div className="field">
                  <label htmlFor={`name-${repository.id}`}>Name</label>
                  <input id={`name-${repository.id}`} name="name" placeholder="Jane Doe" />
                </div>
                <div className="field">
                  <label htmlFor={`email-${repository.id}`}>Email</label>
                  <input id={`email-${repository.id}`} name="email" placeholder="jane@example.com" type="email" />
                </div>
                <div className="field">
                  <label htmlFor={`role-${repository.id}`}>Status</label>
                  <select id={`role-${repository.id}`} disabled>
                    <option>Expected</option>
                  </select>
                </div>
                <button className="button button-primary" type="submit">
                  <Plus aria-hidden size={16} />
                  Add
                </button>
              </form>

              {repository.contributors.length === 0 ? (
                <div className="empty-state">
                  <div>
                    <h3>No expected contributors configured</h3>
                    <p>Add the people who are expected to commit to this repository each week.</p>
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
                                <input
                                  name="repositoryContributorId"
                                  type="hidden"
                                  value={repositoryContributor.id}
                                />
                                <input
                                  name="isIgnored"
                                  type="hidden"
                                  value={repositoryContributor.isIgnored ? "false" : "true"}
                                />
                                <input name="returnTo" type="hidden" value="/dashboard/contributors" />
                                <button className="button button-secondary" type="submit">
                                  <CircleSlash aria-hidden size={16} />
                                  {repositoryContributor.isIgnored ? "Restore" : "Ignore"}
                                </button>
                              </form>
                              <form action={removeExpectedContributorAction}>
                                <input
                                  name="repositoryContributorId"
                                  type="hidden"
                                  value={repositoryContributor.id}
                                />
                                <input name="returnTo" type="hidden" value="/dashboard/contributors" />
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
          ))}
        </div>
      )}
    </main>
  );
}
