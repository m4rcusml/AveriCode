# AveriCode Planning

## Product Summary

AveriCode is a GitHub repository monitoring product. It shows which expected contributors made commits in a repository during the last 7 days and which expected contributors did not.

The product is designed as a SaaS-style application for teams and organizations, but it should still work for an individual user through a default personal workspace.

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
- Cron schedule: every Monday at 06:00 America/Sao_Paulo
- Cron expression for Vercel UTC: `0 9 * * 1`
- Manual sync: supported through a "Sync now" action
- Webhooks: deferred until after the MVP
- Dashboard data source: PostgreSQL only, not live GitHub API calls

## Authentication And GitHub Integration

Use both GitHub OAuth and GitHub App, because they solve different problems.

GitHub OAuth is used for:

- User login.
- Creating and maintaining the app session.
- Associating a GitHub identity with an AveriCode user.

GitHub App is used for:

- Persistent repository access.
- Reading repository metadata and commits.
- Supporting cron jobs without depending on a user's personal OAuth token.
- Future webhook support.

The cron and repository sync logic should use GitHub App installation tokens, not user OAuth tokens.

## GitHub App Configuration

Initial GitHub App permissions:

- Repository permissions:
  - Metadata: read-only
  - Contents: read-only
- Organization permissions:
  - Members: read-only, if organization member comparison is needed

Webhooks are not required for the MVP. They can be added later for installation changes, repository changes, and push events.

Important environment variables:

```env
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_APP_WEBHOOK_SECRET=
```

The GitHub App private key is used by the backend to create GitHub App JWTs and request installation access tokens. In development, it can be loaded from the downloaded `.pem` file through `GITHUB_APP_PRIVATE_KEY_PATH`. In production, prefer storing the key content in a secure environment variable such as `GITHUB_APP_PRIVATE_KEY`.

`GITHUB_APP_WEBHOOK_SECRET` is only required after webhooks are enabled. It is not needed for the initial MVP if the app only uses setup callbacks, manual sync, and Vercel Cron.

## Workspace Model

AveriCode should use workspace-based multi-tenancy from the beginning.

A workspace represents an isolated customer/team/account context. Users belong to workspaces through workspace memberships. Repositories, GitHub installations, snapshots, and sync runs belong to a workspace.

This avoids duplicate processing when several users want to monitor the same repository in the same team context. Instead of each user adding the same repository separately, they join the same workspace.

Example:

```txt
Workspace: Acme
Members:
- Ana
- Bruno
- Carla

Repository:
- acme/backend
```

The repository is synced once for the workspace and all members view the same snapshots.

Implementation rule:

```txt
unique(workspaceId, githubRepoId)
```

This prevents duplicate repositories inside the same workspace while still allowing the same GitHub repository to appear in different workspaces if those workspaces need separate configuration or visibility.

## User Onboarding Flow

```txt
1. User signs in with GitHub OAuth.
2. System creates or updates the User.
3. System creates a default Workspace if the user does not have one.
4. System creates a WorkspaceMember record with role OWNER.
5. User clicks to connect/install the AveriCode GitHub App.
6. GitHub redirects back to /api/github/setup with installation_id.
7. Backend saves the GitHubInstallation linked to the selected Workspace.
8. Backend imports repositories available to that installation.
9. User chooses which repositories should be monitored.
10. User configures expected contributors for each repository.
11. Dashboard becomes available.
```

## Repository Monitoring Rule

The product should not infer inactivity only from the list of people who appeared in recent commits.

Inactive means:

```txt
An expected repository contributor had zero commits in the last 7 days.
```

Therefore each monitored repository needs an explicit list of expected contributors.

Expected contributors are represented through a repository membership/configuration model, not only through commit authors discovered from GitHub.

## Sync Model

There are two ways to run sync:

- Scheduled weekly sync through Vercel Cron.
- Manual sync through a user-triggered "Sync now" button.

Both paths must call the same shared sync logic.

Recommended shape:

```txt
/api/cron/weekly-sync
  -> runs all active workspaces/repositories

/api/github/sync-now
  -> runs only the current workspace or selected repository
```

Shared implementation should live outside route handlers, for example:

```txt
lib/github/sync.ts
```

This makes it easier to migrate from Vercel Cron to Inngest or another job system later.

Manual sync should be protected:

- Require authenticated user.
- Require OWNER or ADMIN role in the workspace.
- Reject if a sync is already running for the same repository.
- Rate limit manual sync, for example one manual sync per repository every 5 to 10 minutes.

## Weekly Sync Flow

```txt
1. Cron starts every Monday at 06:00 America/Sao_Paulo.
2. Backend finds active repositories.
3. For each repository:
   - Load the linked GitHub installation.
   - Generate a GitHub App installation token.
   - Fetch commits since now - 7 days.
   - Group commits by GitHub author.
   - Upsert discovered contributors.
   - Compare commit activity against expected repository contributors.
   - Create CommitActivitySnapshot records.
   - Create or update SyncRun records.
4. Dashboard reads saved snapshots from PostgreSQL.
```

The dashboard must not call GitHub directly on page load.

## Initial Domain Model

Suggested core entities:

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
- installationId
- owner
- name
- fullName
- private
- defaultBranch
- isActive

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
- periodStart
- periodEnd
- commitCount
- lastCommitAt
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
```

## Suggested Project Structure

```txt
app/
├── dashboard/
│   ├── page.tsx
│   ├── repositories/
│   └── contributors/
├── api/
│   ├── auth/[...nextauth]/
│   ├── github/setup/
│   ├── github/sync-now/
│   └── cron/weekly-sync/
├── onboarding/
└── settings/

lib/
├── auth.ts
├── prisma.ts
├── dates.ts
└── github/
    ├── app-auth.ts
    ├── commits.ts
    ├── installations.ts
    └── sync.ts

prisma/
└── schema.prisma
```

## MVP Scope

Build first:

- GitHub OAuth login.
- Default workspace creation.
- GitHub App setup callback.
- GitHub installation persistence.
- Repository import for installed GitHub App repositories.
- Repository activation for monitoring.
- Expected contributor configuration.
- Manual "Sync now".
- Weekly Vercel Cron endpoint.
- Dashboard showing active and inactive expected contributors for the last 7 days.

Defer:

- GitHub webhooks.
- Billing.
- Advanced role management.
- Historical charts beyond basic weekly snapshots.
- Pull request and review monitoring.
- Multi-workspace switching polish, unless needed by the first UI.

## Implementation Principles

- Keep GitHub API calls out of dashboard rendering.
- Store snapshots in PostgreSQL and render from local data.
- Isolate sync logic so cron and manual sync share the same code path.
- Keep GitHub OAuth and GitHub App credentials conceptually separate.
- Treat workspace authorization as a first-class concern in every repository query.
- Avoid duplicating a GitHub repository inside the same workspace.
- Design for a simple MVP, but do not block future migration to Inngest or webhook-driven updates.
