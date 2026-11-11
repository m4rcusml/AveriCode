# AveriCode

AveriCode gives engineering leadership a saved view of its GitHub project portfolio: recent project changes, expected contributors, branch coverage, and integration health. Commit activity is evidence for a conversation, not a measure of productivity or completed deliveries.

It uses GitHub OAuth for user login and a GitHub App for persistent repository access, scheduled syncs, manual syncs, branch monitoring, collaborator suggestions, and installation webhooks.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- NextAuth/Auth.js with GitHub OAuth
- GitHub App installation tokens for repository access
- Daily Vercel Cron dispatcher at `0 9 * * *`, with per-workspace frequency controls
- GitHub App webhooks for installation/repository access changes

## Local Setup

Use Node.js 20.9 or newer. Next.js 16 requires this minimum runtime.

1. Install dependencies:

```bash
npm install
```

For E2E testing, install the Playwright Chromium browser once:

```bash
npx playwright install chromium
```

2. Copy `.env.example` to `.env` and fill the required values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/avericode?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/avericode?schema=public"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-secret"

GITHUB_OAUTH_CLIENT_ID=""
GITHUB_OAUTH_CLIENT_SECRET=""

GITHUB_APP_ID=""
GITHUB_APP_SLUG=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_APP_PRIVATE_KEY_PATH="C:\\path\\to\\github-app.private-key.pem"
GITHUB_APP_WEBHOOK_SECRET=""

CRON_SECRET=""
```

`GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are preferred for login. If they are omitted, AveriCode falls back to the GitHub App client id and secret.

For local development, `GITHUB_APP_PRIVATE_KEY_PATH` is usually the least error-prone option. If using `GITHUB_APP_PRIVATE_KEY` directly in `.env`, keep the full PEM as one quoted value with escaped line breaks:

```env
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

3. Create and apply the database schema:

```bash
npm run prisma:migrate
```

4. Run the app:

```bash
npm run dev
```

5. Configure GitHub OAuth:

```txt
Homepage URL:
http://localhost:3000

Authorization callback URL:
http://localhost:3000/api/auth/callback/github
```

6. Configure the GitHub App:

```txt
Setup URL:
http://localhost:3000/api/github/setup

Webhook URL:
http://localhost:3000/api/github/webhook
```

Enable **Redirect on update** for the Setup URL. This returns users to AveriCode after they add or remove repositories from an existing GitHub App installation.

For local webhook testing, expose the local app with a tunnel such as ngrok and use the tunnel URL:

```txt
https://your-tunnel.ngrok-free.app/api/github/webhook
```

Required GitHub App permissions:

- Repository permissions:
  - Metadata: read-only
  - Contents: read-only
- Organization permissions:
  - Members: read-only

Recommended webhook events:

- Installation
- Installation repositories
- Repository

## Vercel And Supabase Notes

The current deployment uses **Neon PostgreSQL through the Vercel Marketplace**, on the Free plan in São Paulo (`gru1`). The integration supplies `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`; set AveriCode's `DIRECT_URL` to the unpooled value for migrations. Keep GitHub and Auth.js credentials in Vercel Secrets. The Supabase connection examples below remain applicable to alternative deployments.

For Vercel + Supabase, use the Supabase poolers as two separate URLs:

```env
# Runtime connection. Use transaction-mode pooler with pgbouncer=true.
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"

# Migration connection. Use session-mode pooler or direct database URL.
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
```

Deploy-time and runtime environment variables should include:

```env
NEXTAUTH_URL="https://your-domain"
NEXTAUTH_SECRET=""
GITHUB_OAUTH_CLIENT_ID=""
GITHUB_OAUTH_CLIENT_SECRET=""
GITHUB_APP_ID=""
GITHUB_APP_SLUG=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_APP_WEBHOOK_SECRET=""
CRON_SECRET=""
```

Apply database migrations before or during deployment using your chosen migration workflow. The project currently keeps Prisma migrations under `prisma/migrations` and also has Supabase migration files under `supabase/migrations`.

## Product Flow

1. User signs in with GitHub OAuth.
2. AveriCode creates a default personal workspace.
3. User clicks Add repositories and AveriCode verifies existing GitHub App installations:
   - personal installations where the installation account matches the user's GitHub username;
   - organization installations where the user is an active organization admin.
4. The user reuses an eligible installation or configures one through `/api/github/install?workspaceId=...`.
5. GitHub returns through `/api/github/setup?installation_id=...` with a signed, one-time setup state.
6. The user explicitly selects repositories for the current workspace.
7. OWNER and ADMIN selections connect immediately; MEMBER selections create a request for the workspace owner.
8. Approved repositories are monitored and receive expected contributor and recent branch defaults.
9. User removes people who should not be expected and can add more branches when needed.
10. User runs manual sync or waits for the configured workspace schedule.
11. Workspace owners can choose daily, weekly, biweekly, or monthly scheduled syncs in Settings.
12. Dashboard reads saved PostgreSQL snapshots only.

## Multi-Workspace Installation Behavior

GitHub App installations can appear in more than one AveriCode workspace when GitHub ownership/admin rules allow it.

Example:

```txt
1. Account A installs the AveriCode GitHub App and explicitly connects repositories to workspace A.
2. Later, an eligible user opens Add repositories in workspace B.
3. The existing installation is reused and only the repositories explicitly selected for workspace B are connected.
4. If that user is a workspace MEMBER, the repositories remain pending until workspace B's owner approves them.
```

Inside a single workspace, duplicate repositories are still prevented by:

```txt
unique(workspaceId, githubRepoId)
```

## Monitoring Rules

Inactive means:

```txt
An expected repository contributor had zero commits in the last 7 days.
```

Expected contributors are configured explicitly. New repositories start with GitHub collaborators and contributors selected automatically; users can remove people who should not be expected.

Manual contributor configuration accepts a GitHub login only. It does not trust submitted profile metadata or expose private email addresses shared by the global contributor identity table. Commit attribution requires GitHub's verified `author.id`; anonymous commit email text cannot impersonate a configured GitHub account.

Incomplete automatic contributor/branch configuration is persisted as a review warning and remains visible until configuration succeeds. Retrying setup preserves the workspace's existing expected/ignored choices. Suspended installations and stale snapshots remain distinct from a current activity window.

Scheduled sync stores a resumable workspace cycle and a lease. A dispatcher that reaches its time budget leaves unfinished repositories for a later dispatcher; completed attempts are skipped on resume. A failed project records its own error and does not stop the remaining portfolio or future schedule cycles.

By default, sync monitors the repository default branch plus up to five non-default branches with changes in the previous two weeks. Users can configure additional branches per repository. Dashboard snapshots include the branch of the latest commit when available.

## Important Routes

- `/dashboard` - saved activity snapshots, repository controls, and manual sync
- `/dashboard/repositories/[repositoryId]/contributors` - expected contributor configuration per repository
- `/dashboard/repositories/[repositoryId]/branches` - monitored branch configuration per repository
- `/settings` - workspace members, GitHub accounts, repository counts, and scheduled sync frequency
- `/api/github/install` - internal GitHub App install redirect that remembers the workspace
- `/api/github/setup` - GitHub App setup callback
- `/api/github/sync-now` - protected manual sync API
- `/api/github/webhook` - GitHub App webhook endpoint
- `/api/cron/scheduled-sync` - daily dispatcher for due workspace syncs

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

`npm run test:e2e` builds the app, starts `next start` on `http://127.0.0.1:3100`, and runs Playwright tests. Set `E2E_BASE_URL` to test an already running AveriCode server. Authenticated tests require `E2E_AUTH_STATE`; member permission tests also use `E2E_MEMBER_AUTH_STATE`.

For disposable **local PostgreSQL only**, `npm run seed:qa` creates a clearly labeled fictional portfolio and real expiring OWNER, ADMIN and MEMBER sessions under ignored `.playwright/`. It refuses remote/production databases. Supply `DATABASE_URL` explicitly when running the seed. It never creates a production authentication bypass.

Run `npm run test:integration` with `INTEGRATION_DATABASE_URL` pointing to a local PostgreSQL database after applying migrations. These tests cover real database locks, tenant isolation, unique sync claims and contributor privacy; they are separate from the ordinary unit suite.
