import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";
import { assertRepositoryWriteAccess, assertWorkspaceAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";
import { getManualSyncCooldown, syncRepositoryActivity } from "@/lib/github/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const REPOSITORY_BUDGET_MS = 60_000;
const WORKSPACE_BUDGET_MS = 240_000;

async function requestBody(request: NextRequest) {
  try {
    const text = await request.text();
    const body: unknown = text.trim() ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const { repositoryId, workspaceId } = body as Record<string, unknown>;
    if ((repositoryId !== undefined && (typeof repositoryId !== "string" || !repositoryId.trim())) ||
      (workspaceId !== undefined && (typeof workspaceId !== "string" || !workspaceId.trim()))) return null;
    return { repositoryId: repositoryId as string | undefined, workspaceId: workspaceId as string | undefined };
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requestedId = request.nextUrl.searchParams.get("workspaceId");
  const workspace = requestedId ? { id: requestedId } : await getSelectedWorkspaceForUser(session.user.id);
  try {
    await assertWorkspaceAccess(session.user.id, workspace.id);
  } catch {
    return NextResponse.json({ error: "Workspace access required." }, { status: 403 });
  }
  const repositories = await prisma.repository.findMany({
    where: { workspaceId: workspace.id },
    select: {
      id: true, lastSyncedAt: true, configurationError: true,
      installation: { select: { suspendedAt: true } },
      syncRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true } }
    },
    orderBy: { id: "asc" }
  });
  return NextResponse.json({ repositories: repositories.map((repository) => ({
    id: repository.id,
    lastSyncedAt: repository.lastSyncedAt,
    status: repository.syncRuns[0]?.status === "RUNNING" && repository.syncRuns[0].startedAt.getTime() < Date.now() - 30 * 60 * 1000
      ? "FAILED" : repository.syncRuns[0]?.status ?? null,
    configurationError: repository.configurationError,
    suspendedAt: repository.installation.suspendedAt
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await requestBody(request);
  if (!body) return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });

  if (body.repositoryId) {
    try {
      await assertRepositoryWriteAccess(session.user.id, body.repositoryId);
    } catch {
      return NextResponse.json({ error: "Repository write access required." }, { status: 403 });
    }
    try {
      const cooldown = await getManualSyncCooldown(body.repositoryId);

      if (cooldown > 0) {
        return NextResponse.json(
          { error: "Manual sync is rate limited.", retryAfterMs: cooldown },
          { status: 429 }
        );
      }

      const result = await syncRepositoryActivity({
        repositoryId: body.repositoryId,
        trigger: "MANUAL",
        deadline: Date.now() + REPOSITORY_BUDGET_MS
      });

      return NextResponse.json({ result });
    } catch (error) {
      if (errorMessage(error).startsWith("Manual sync is rate limited")) {
        const retryAfterMs = await getManualSyncCooldown(body.repositoryId);
        return NextResponse.json({ error: errorMessage(error), retryAfterMs }, {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
        });
      }
      return NextResponse.json({ error: errorMessage(error) }, { status: 409 });
    }
  }

  const workspace = body.workspaceId
    ? { id: body.workspaceId }
    : await getSelectedWorkspaceForUser(session.user.id);

  try {
    await assertWorkspaceWriteAccess(session.user.id, workspace.id);

    const repositories = await prisma.repository.findMany({
      where: {
        workspaceId: workspace.id,
        isActive: true
      },
      select: {
        id: true,
        fullName: true
      },
      orderBy: {
        fullName: "asc"
      }
    });
    const results = [];
    const deadline = Date.now() + WORKSPACE_BUDGET_MS;

    for (const repository of repositories) {
      if (Date.now() >= deadline - 1000) {
        results.push({ ok: false, repository: repository.fullName, skipped: true, error: "Sync time budget reached. Run sync again for remaining projects." });
        continue;
      }
      const cooldown = await getManualSyncCooldown(repository.id);

      if (cooldown > 0) {
        results.push({
          ok: false,
          repository: repository.fullName,
          skipped: true,
          retryAfterMs: cooldown
        });
        continue;
      }

      try {
        results.push({
          ok: true,
          repository: repository.fullName,
          result: await syncRepositoryActivity({
            repositoryId: repository.id,
            trigger: "MANUAL",
            deadline: Math.min(deadline, Date.now() + REPOSITORY_BUDGET_MS)
          })
        });
      } catch (error) {
        results.push({
          ok: false,
          repository: repository.fullName,
          error: errorMessage(error)
        });
      }
    }

    return NextResponse.json({
      total: repositories.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok && !result.skipped).length,
      skipped: results.filter((result) => result.skipped).length,
      results
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 403 });
  }
}
