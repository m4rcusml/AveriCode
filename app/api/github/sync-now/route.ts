import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";
import { assertRepositoryWriteAccess, assertWorkspaceWriteAccess } from "@/lib/workspaces";
import { getManualSyncCooldown, syncRepositoryActivity } from "@/lib/github/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function POST(request: NextRequest) {
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
        trigger: "MANUAL"
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

    for (const repository of repositories) {
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
            trigger: "MANUAL"
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
      failed: results.filter((result) => !result.ok).length,
      results
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 403 });
  }
}
