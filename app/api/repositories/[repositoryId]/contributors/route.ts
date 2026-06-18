import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { syncRepositoryActivity } from "@/lib/github/sync";
import { addExpectedContributor } from "@/lib/repository-config";

type RouteContext = {
  params: Promise<{
    repositoryId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { repositoryId } = await context.params;
  const body = (await request.json()) as {
    githubUserId?: string;
    username?: string;
    name?: string;
    email?: string;
  };

  try {
    const repositoryContributor = await addExpectedContributor(session.user.id, repositoryId, body);
    const syncResult = await syncRepositoryActivity({
      repositoryId,
      trigger: "MANUAL"
    });

    return NextResponse.json({ repositoryContributor, syncResult }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contributor creation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
