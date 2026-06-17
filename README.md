# AveriCode

AveriCode monitors expected GitHub contributors for a workspace and shows who committed to each monitored repository during the last seven days.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- NextAuth/Auth.js with GitHub OAuth
- GitHub App installation tokens for repository access
- Vercel Cron at `0 9 * * 1`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill the required values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/avericode?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-secret"

GITHUB_APP_ID=""
GITHUB_APP_SLUG=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_PRIVATE_KEY_PATH="C:\\path\\to\\github-app.private-key.pem"
```

`GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` can be used if OAuth should use a separate OAuth App. If they are omitted, AveriCode falls back to the GitHub App client id and secret.

3. Create and apply the database schema:

```bash
npm run prisma:migrate
```

4. Run the app:

```bash
npm run dev
```

5. Configure the GitHub App:

- Callback URL: `http://localhost:3000/api/auth/callback/github`
- Setup URL: `http://localhost:3000/api/github/setup`
- Repository permissions: Metadata read-only, Contents read-only
- Organization permissions: Members read-only if organization comparison is needed later
- Webhooks can stay disabled for the MVP

## Product flow

1. Sign in with GitHub OAuth.
2. AveriCode creates a default personal workspace.
3. Install the AveriCode GitHub App from onboarding or settings.
4. GitHub redirects to `/api/github/setup?installation_id=...`.
5. AveriCode persists the installation and imports repositories.
6. Activate repositories to monitor.
7. Configure expected contributors per repository.
8. Run manual sync or wait for the weekly Vercel Cron.
9. Dashboard reads saved PostgreSQL snapshots only.

## Important routes

- `/dashboard` - saved activity snapshots
- `/dashboard/repositories` - repository activation and manual sync
- `/dashboard/contributors` - expected contributor configuration
- `/onboarding` - setup checklist
- `/api/github/sync-now` - protected manual sync API
- `/api/cron/weekly-sync` - scheduled sync endpoint
