# AveriCode Planning

## Product Summary

AveriCode is a GitHub repository monitoring product. It shows which expected contributors made commits in a repository during the last 7 days and which expected contributors did not.

The product is designed as a SaaS-style application for teams and organizations, while still supporting individual users through a default personal workspace.

## Core Decisions

- Product name: AveriCode
- Framework: Next.js App Router
- Language: TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Authentication: Auth.js / NextAuth with GitHub OAuth
- GitHub repository access: GitHub App
- Tenant model: Workspace-based multi-tenancy
- Scheduled sync: Vercel Cron
- Cron dispatcher: every day at 06:00 America/Sao_Paulo
- Cron expression for Vercel UTC: `0 9 * * *`
- Workspace schedule: OWNER-selectable DAILY, WEEKLY, BIWEEKLY, or MONTHLY
- Manual sync: supported through "Sync now" actions
- Webhooks: implemented for GitHub App installation/repository access changes
- Dashboard data source: PostgreSQL only, not live GitHub API calls

## Authentication And GitHub Integration

Use both GitHub OAuth and GitHub App, because they solve different problems.

GitHub OAuth is used for:

- User login.
- Creating and maintaining the app session.
- Associating a GitHub identity with an AveriCode user.
- Creating a default personal workspace for each user.

GitHub App is used for:

- Persistent repository access.
- Reading repository metadata, collaborators, organization members, branches, and commits.
- Supporting cron jobs without depending on a user's personal OAuth token.
- Receiving installation/repository access webhooks.

The cron, repository sync, repository import, branch lookup, and contributor suggestion logic should use GitHub App installation tokens, not user OAuth tokens.

## GitHub App Configuration

GitHub App permissions:

- Repository permissions:
  - Metadata: read-only
  - Contents: read-only
- Organization permissions:
  - Members: read-only

Webhook events:

- Installation
- Installation repositories
- Repository, if repository metadata changes should trigger refreshes

Important environment variables:

```env
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_APP_WEBHOOK_SECRET=
CRON_SECRET=
```

`GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are preferred for user login. If omitted, the app falls back to the GitHub App client id/secret.

The GitHub App private key is used by the backend to create GitHub App JWTs and request installation access tokens. In development, it can be loaded from the downloaded `.pem` file through `GITHUB_APP_PRIVATE_KEY_PATH`. In production, prefer storing the key content in a secure environment variable such as `GITHUB_APP_PRIVATE_KEY`.

`GITHUB_APP_WEBHOOK_SECRET` must match the secret configured in the GitHub App webhook settings.

## Workspace Model

AveriCode uses workspace-based multi-tenancy.

A workspace represents an isolated customer/team/account context. Users belong to workspaces through workspace memberships. Repositories, GitHub installations, snapshots, sync runs, and monitored branches belong to a workspace.

The repository is synced once for the workspace and all workspace members view the same snapshots.

Implementation rule:

```txt
unique(workspaceId, githubRepoId)
```

This prevents duplicate repositories inside the same workspace while still allowing the same GitHub repository to appear in different workspaces if those workspaces need separate configuration or visibility.

## GitHub Installation Ownership Rule

GitHub App installations can be linked to multiple workspaces when ownership/admin rules allow it.

GitHub OAuth sign-in creates or loads the user's default workspace but does not import installations or repositories implicitly.

When connecting repositories, AveriCode verifies the stored OAuth identity, lists existing GitHub App installations, and allows reuse when:

1. A personal installation account login matches the user's verified GitHub username.
2. An organization installation belongs to an organization where the user is an active admin.
3. The user explicitly selects which accessible repositories should be connected to the current workspace.

This means if account A installed the GitHub App on organization B before account B joined AveriCode, account B's workspace can still receive organization B repositories after account B signs in, as long as account B is an admin/owner of that organization.

## GitHub App Setup Flow

The "Add repositories" UI should point to the internal selector:

```txt
/settings/repositories?workspaceId=...
```

The selector reuses eligible installations. Its "Install or change access" action points to `/api/github/install?workspaceId=...`, which:

1. Requires an authenticated user.
2. Requires membership in the target workspace.
3. Stores the selected workspace in the active workspace cookie.
4. Stores a short-lived signed GitHub setup state in an HTTP-only cookie.
5. Redirects to the GitHub App installation URL with the same signed state.

GitHub redirects back to:

```txt
/api/github/setup?installation_id=...
```

The setup callback requires the returned state to exactly match the pending cookie, verifies its signature, user, workspace, nonce, and expiration, consumes it once, validates that the installation is available to the signed-in GitHub identity, and redirects back to the repository selector. It does not import repositories automatically.

## User Onboarding Flow

```txt
1. User signs in with GitHub OAuth.
2. System creates or updates the User.
3. System creates a default Workspace if the user does not have one.
4. System creates a WorkspaceMember record with role OWNER.
5. User clicks Add repositories to reuse or configure GitHub App access.
6. User explicitly selects repositories for the current workspace.
7. OWNER and ADMIN selections are connected directly; MEMBER selections create a pending request.
8. The workspace OWNER can approve any subset of repositories in a member request.
9. Approved repositories are linked to the selected Workspace and monitored automatically.
10. Backend adds GitHub collaborators/contributors as expected contributors.
11. Backend adds up to five non-default branches changed during the previous two weeks.
12. User can remove expected contributors or add more branches.
13. Dashboard becomes available.
```

## Repository Monitoring Rule

The product must not infer inactivity only from people who appeared in recent commits.

Inactive means:

```txt
An expected repository contributor had zero commits in the last 7 days.
```

Therefore each monitored repository needs an explicit list of expected contributors.

Expected contributors are represented through repository contributor configuration, not only through commit authors discovered from GitHub.

## Branch Monitoring Rule

By default, AveriCode monitors the repository default branch.

New repositories automatically add up to five non-default branches changed during the previous two weeks. Users can add more branches from the branch configuration page. Sync reads the default branch plus configured extra branches. Dashboard commit activity includes the branch of the last commit when available.

## Sync Model

There are two ways to run sync:

- Scheduled sync through a daily Vercel Cron dispatcher and per-workspace frequency.
- Manual sync through user-triggered actions.

Both paths call shared sync logic in:

```txt
lib/github/sync.ts
```

Important routes:

```txt
/api/cron/scheduled-sync
  -> runs repositories for workspaces whose configured schedule is due

/api/github/sync-now
  -> runs the current workspace or a selected repository
```

Manual sync should be protected:

- Require authenticated user.
- Require OWNER or ADMIN role in the workspace.
- Reject if a sync is already running for the same repository.
- Rate limit manual sync per repository.

## Webhook Model

GitHub App webhooks are handled by:

```txt
/api/github/webhook
```

The route validates `X-Hub-Signature-256` using `GITHUB_APP_WEBHOOK_SECRET`.

Webhook behavior:

- `ping`: confirms delivery.
- `installation.deleted`: deletes matching local GitHubInstallation records and cascades repositories.
- `installation_repositories`: refreshes linked installations and imports/removes repositories according to current GitHub App access.
- `repository`: refreshes linked installations when repository metadata/access changes.
- selected `installation` actions such as `created`, `new_permissions_accepted`, and `unsuspend`: refresh linked installations.

## Scheduled Sync Flow

```txt
1. Cron dispatcher starts daily at 06:00 America/Sao_Paulo.
2. Backend claims workspaces due under their DAILY, WEEKLY, BIWEEKLY, or MONTHLY setting.
3. Backend finds automatically monitored repositories.
4. For each repository:
   - Load the linked GitHub installation.
   - Generate a GitHub App installation token.
   - Fetch commits from the default branch and configured extra branches since now - 7 days.
   - Group commits by GitHub author.
   - Upsert discovered contributors.
   - Compare commit activity against expected repository contributors.
   - Create CommitActivitySnapshot records.
   - Create or update SyncRun records.
5. Dashboard reads saved snapshots from PostgreSQL.
```

The dashboard must not call GitHub directly on page load.

## Domain Model

Core entities:

```txt
User
- id
- name
- email
- image
- githubUserId
- githubUsername

Account
- Auth.js account table

Session
- Auth.js session table

Workspace
- id
- name
- slug
- ownerId
- syncSchedule: DAILY | WEEKLY | BIWEEKLY | MONTHLY
- lastScheduledSyncAt

WorkspaceMember
- workspaceId
- userId
- role: OWNER | ADMIN | MEMBER

GitHubInstallation
- id
- installationId
- accountLogin
- accountType: USER | ORGANIZATION
- repositorySelection: ALL | SELECTED
- workspaceId

Repository
- id
- workspaceId
- githubRepoId
- githubInstallationId
- owner
- name
- fullName
- private
- defaultBranch
- isActive
- lastSyncedAt

RepositoryBranch
- id
- repositoryId
- name

Contributor
- id
- githubUserId
- username
- name
- avatarUrl
- email

RepositoryContributor
- repositoryId
- contributorId
- isExpected
- isIgnored

CommitActivitySnapshot
- id
- repositoryId
- contributorId
- syncRunId
- periodStart
- periodEnd
- commitCount
- lastCommitAt
- lastCommitBranch
- status: ACTIVE | INACTIVE | UNKNOWN

SyncRun
- id
- workspaceId
- repositoryId
- status: PENDING | RUNNING | SUCCESS | FAILED
- trigger: CRON | MANUAL
- startedAt
- finishedAt
- error

RepositoryAccessRequest
- workspaceId
- requesterId
- installationId
- accountLogin
- accountType
- repositorySelection
- status: PENDING | APPROVED | PARTIALLY_APPROVED | REJECTED
- reviewedById
- reviewedAt

RepositoryAccessRequestItem
- requestId
- githubRepoId
- repository metadata snapshot
- status: PENDING | APPROVED | REJECTED
- repositoryId
- pendingKey
```

## Project Structure

```txt
app/
  dashboard/
    page.tsx
    repositories/[repositoryId]/branches/
    repositories/[repositoryId]/contributors/
  api/
    auth/[...nextauth]/
    cron/scheduled-sync/
    github/install/
    github/setup/
    github/sync-now/
    github/webhook/
    repositories/
    repository-contributors/
  settings/

components/
  dashboard/
  settings/

lib/
  auth.ts
  prisma.ts
  dates.ts
  workspace-selection.ts
  workspaces.ts
  github/
    app-auth.ts
    commits.ts
    install-url.ts
    installations.ts
    repository-access.ts
    people.ts
    sync.ts

prisma/
  schema.prisma
```

## Implementation Principles

- Keep GitHub API calls out of dashboard rendering.
- Store snapshots in PostgreSQL and render from local data.
- Isolate sync logic so cron and manual sync share the same code path.
- Keep GitHub OAuth and GitHub App credentials conceptually separate.
- Treat workspace authorization as a first-class concern in every repository query.
- Avoid duplicating a GitHub repository inside the same workspace.
- Allow the same GitHub repository to appear in different workspaces when GitHub App installation ownership/admin rules allow it.
- Keep Server Components as the default rendering model and use Client Components only for local interaction state.
- Prefer idempotent imports for GitHub installations and repositories.
