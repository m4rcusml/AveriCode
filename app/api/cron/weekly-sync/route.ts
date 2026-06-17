import { NextRequest, NextResponse } from "next/server";
import { syncActiveRepositories } from "@/lib/github/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await syncActiveRepositories({
    trigger: "CRON"
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
