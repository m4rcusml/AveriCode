import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { importInstallationRepositories } from "@/lib/github/installations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type GitHubWebhookPayload = {
  action?: string;
  installation?: {
    id?: number;
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function verifyGitHubWebhookSignature(payload: Buffer, signature: string | null) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing GITHUB_APP_WEBHOOK_SECRET.");
  }

  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  return (
    signatureBuffer.length === expectedSignatureBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  );
}

async function refreshLinkedInstallations(installationId: string) {
  const installations = await prisma.gitHubInstallation.findMany({
    where: {
      installationId
    },
    select: {
      id: true
    }
  });
  const results = [];

  for (const installation of installations) {
    const repositories = await importInstallationRepositories(installation.id);

    results.push({
      installationId: installation.id,
      importedRepositories: repositories.length
    });
  }

  return results;
}

async function deleteLinkedInstallations(installationId: string) {
  const result = await prisma.gitHubInstallation.deleteMany({
    where: {
      installationId
    }
  });

  return result.count;
}

async function handleWebhookEvent(eventName: string | null, payload: GitHubWebhookPayload) {
  const installationId = payload.installation?.id ? String(payload.installation.id) : null;

  if (eventName === "ping") {
    return {
      ok: true,
      event: eventName,
      action: payload.action ?? null,
      ignored: false
    };
  }

  if (!installationId) {
    return {
      ok: true,
      event: eventName,
      action: payload.action ?? null,
      ignored: true,
      reason: "missing_installation_id"
    };
  }

  if (eventName === "installation" && payload.action === "deleted") {
    return {
      ok: true,
      event: eventName,
      action: payload.action,
      deletedInstallations: await deleteLinkedInstallations(installationId)
    };
  }

  if (
    eventName === "installation_repositories" ||
    eventName === "repository" ||
    (eventName === "installation" &&
      ["created", "new_permissions_accepted", "unsuspend"].includes(payload.action ?? ""))
  ) {
    const results = await refreshLinkedInstallations(installationId);

    return {
      ok: true,
      event: eventName,
      action: payload.action ?? null,
      refreshedInstallations: results.length,
      results
    };
  }

  return {
    ok: true,
    event: eventName,
    action: payload.action ?? null,
    ignored: true
  };
}

export async function POST(request: NextRequest) {
  const payloadBuffer = Buffer.from(await request.arrayBuffer());
  const payloadText = payloadBuffer.toString("utf8");

  try {
    if (!verifyGitHubWebhookSignature(payloadBuffer, request.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }

  let payload: GitHubWebhookPayload;

  try {
    payload = JSON.parse(payloadText) as GitHubWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await handleWebhookEvent(request.headers.get("x-github-event"), payload);
    revalidatePath("/dashboard");
    revalidatePath("/settings");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
