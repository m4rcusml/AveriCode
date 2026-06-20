# AveriCode

AveriCode monitors expected GitHub contributors for a workspace and shows who committed to each monitored repository during the last seven days.

It uses GitHub OAuth for user login and a GitHub App for persistent repository access, scheduled syncs, manual syncs, branch monitoring, collaborator suggestions, and installation webhooks.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- NextAuth/Auth.js with GitHub OAuth
- GitHub App installation tokens for repository access
- Vercel Cron at `0 9 * * 1`
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
3. On sign-in, AveriCode imports existing GitHub App installations owned by the user:
   - personal installations where the installation account matches the user's GitHub username;
   - organization installations where the user is an active organization admin.
4. User clicks Add repositories.
5. AveriCode routes through `/api/github/install?workspaceId=...` to remember the target workspace.
6. GitHub redirects to `/api/github/setup?installation_id=...`.
7. AveriCode persists the installation and imports repositories.
8. User activates repositories to monitor.
9. User configures expected contributors per repository.
10. User optionally configures extra monitored branches.
11. User runs manual sync or waits for the weekly Vercel Cron.
12. Dashboard reads saved PostgreSQL snapshots only.

## Multi-Workspace Installation Behavior

GitHub App installations can appear in more than one AveriCode workspace when GitHub ownership/admin rules allow it.

Example:

```txt
1. Account A installs the AveriCode GitHub App on organization B and imports repositories into workspace A.
2. Later, account B signs in to AveriCode.
3. If account B is the owner/admin of organization B, AveriCode imports that existing GitHub App installation into workspace B automatically.
4. Workspace B can then see repositories from organization B without reinstalling the GitHub App.
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

Therefore each monitored repository needs explicit expected contributors. AveriCode does not infer inactivity only from recent commit authors.

By default, sync monitors the repository default branch. Users can configure additional branches per repository. Dashboard snapshots include the branch of the latest commit when available.

## Important Routes

- `/dashboard` - saved activity snapshots, repository controls, and manual sync
- `/dashboard/repositories/[repositoryId]/contributors` - expected contributor configuration per repository
- `/dashboard/repositories/[repositoryId]/branches` - monitored branch configuration per repository
- `/settings` - workspace members, GitHub accounts, repository counts, and system configuration checks
- `/api/github/install` - internal GitHub App install redirect that remembers the workspace
- `/api/github/setup` - GitHub App setup callback
- `/api/github/sync-now` - protected manual sync API
- `/api/github/webhook` - GitHub App webhook endpoint
- `/api/cron/weekly-sync` - scheduled sync endpoint

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test:e2e
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

`npm run test:e2e` builds the app, starts `next start` on `http://127.0.0.1:3000`, and runs Playwright smoke tests. Public unauthenticated tests run by default. Authenticated dashboard/settings tests are skipped unless `E2E_AUTH_STATE` points to a Playwright storage state file for a seeded signed-in user.
