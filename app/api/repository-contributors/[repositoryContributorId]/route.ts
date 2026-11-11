import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { updateRepositoryContributor } from "@/lib/repository-config";

type RouteContext = {
  params: Promise<{
    repositoryContributorId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { repositoryContributorId } = await context.params;
  let body: { isExpected?: boolean; isIgnored?: boolean };

  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid contributor update.");
    }
    const input = parsed as Record<string, unknown>;
    if (
      (input.isExpected === undefined && input.isIgnored === undefined) ||
      (input.isExpected !== undefined && typeof input.isExpected !== "boolean") ||
      (input.isIgnored !== undefined && typeof input.isIgnored !== "boolean")
    ) {
      throw new Error("Invalid contributor update.");
    }
    body = input as typeof body;
  } catch {
    return NextResponse.json({ error: "Provide isExpected or isIgnored as a JSON boolean." }, { status: 400 });
  }

  try {
    const repositoryContributor = await updateRepositoryContributor(session.user.id, repositoryContributorId, {
      isExpected: typeof body.isExpected === "boolean" ? body.isExpected : undefined,
      isIgnored: typeof body.isIgnored === "boolean" ? body.isIgnored : undefined
    });
    return NextResponse.json({ repositoryContributor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contributor update failed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { repositoryContributorId } = await context.params;

  try {
    const repositoryContributor = await updateRepositoryContributor(session.user.id, repositoryContributorId, {
      isExpected: false
    });
    return NextResponse.json({ repositoryContributor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contributor update failed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
