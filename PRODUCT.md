# AveriCode

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: engineering directors overseeing a portfolio of teams and deliveries. Confirmed by the user on 2026-11-11. Technical leads and project managers support configuration and investigation.

## Product Purpose

Help leadership understand recent changes across GitHub projects, contributor participation, and where a conversation or an integration fix is needed. Reduce the clicks between a portfolio question and its supporting evidence or action.

## Operating Context

Multiple repositories and GitHub accounts inside an isolated workspace. GitHub OAuth identifies the user; a GitHub App grants persistent repository access. PostgreSQL stores the dashboard evidence. Deployment is on Vercel; the previous Supabase database was deleted by the owner and can be replaced.

## Capabilities and Constraints

- Next.js App Router, TypeScript, React, Prisma, PostgreSQL and Auth.js/NextAuth.
- Expected contributors are explicitly configured for each repository. Zero commits in the recorded seven-day window means no recorded commit activity, not low productivity.
- Monitor the default branch and configured extra branches. Scheduled and manual sync share one implementation.
- Workspace roles OWNER, ADMIN and MEMBER gate mutations. Adding repositories is an explicit selection and approval flow.
- Dashboard rendering reads saved data only. Latest project updates must be persisted during sync.
- Missing, failed, suspended or old synchronization must remain visible and must never imply healthy projects.
- The current integration does not know delivery dates, business impact, issues, review work or completed milestones. Do not invent these.

## Brand Commitments

The name AveriCode remains. The user requested a complete replacement of visual identity and layout, prioritizing information arrangement and fewer clicks. Portuguese is the working language of this redesign.

## Evidence on Hand

Existing source code, Prisma migrations and unit/E2E tests. UX personas are simulated hypotheses requested from AGY, not interviews or validated research. No production data is assumed available.

## Product Principles

- Start with the whole portfolio; show project and contributor detail in context.
- Make recent changes and data freshness as visible as activity counts.
- Bring primary actions to the project and portfolio surfaces.
- Use evidence with its time window and scope; never turn commits into employee performance scores.
- Keep customer workspaces isolated and repository selection explicit.
