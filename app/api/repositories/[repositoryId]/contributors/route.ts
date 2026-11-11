import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { addExpectedContributor } from "@/lib/repository-config";

type RouteContext = {
  params: Promise<{
    repositoryId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { repositoryId } = await context.params;
  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid contributor.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A JSON contributor object is required." }, { status: 400 });
  }

  if (Object.keys(body).some((key) => key !== "username") || typeof body.username !== "string") {
    return NextResponse.json({ error: "Contributor configuration accepts only a GitHub username." }, { status: 400 });
  }

  try {
    const repositoryContributor = await addExpectedContributor(session.user.id, repositoryId, {
      username: body.username
    });
    return NextResponse.json({
      repositoryContributor: {
        id: repositoryContributor.id,
        repositoryId: repositoryContributor.repositoryId,
        isExpected: repositoryContributor.isExpected,
        isIgnored: repositoryContributor.isIgnored,
        contributor: { username: repositoryContributor.contributor.username }
      },
      saved: true,
      activityPending: true
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contributor creation failed.";
    const denied = message === "Workspace access denied." || message === "Owner or admin role required.";
    return NextResponse.json({ error: message }, { status: denied ? 403 : 400 });
  }
}
