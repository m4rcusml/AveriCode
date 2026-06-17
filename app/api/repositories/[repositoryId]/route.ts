import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { setRepositoryMonitoring } from "@/lib/repository-config";

type RouteContext = {
  params: Promise<{
    repositoryId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { repositoryId } = await context.params;
  const body = (await request.json()) as {
    isActive?: boolean;
  };

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean." }, { status: 400 });
  }

  try {
    const repository = await setRepositoryMonitoring(session.user.id, repositoryId, body.isActive);
    return NextResponse.json({ repository });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository update failed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
