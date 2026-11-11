import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SETUP_STATE_TTL_SECONDS = 15 * 60;

type GitHubSetupState = {
  exp: number;
  nonce: string;
  userId: string;
  workspaceId: string;
};

function setupStateSecret() {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing NEXTAUTH_SECRET or AUTH_SECRET.");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", setupStateSecret()).update(payload).digest("base64url");
}

export function createGitHubSetupState(userId: string, workspaceId: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      workspaceId,
      nonce: randomBytes(18).toString("base64url"),
      exp: Math.floor(now / 1000) + SETUP_STATE_TTL_SECONDS
    } satisfies GitHubSetupState)
  ).toString("base64url");

  return `${payload}.${signature(payload)}`;
}

export function verifyGitHubSetupState(token: string, expectedUserId: string, now = Date.now()) {
  const [payload, providedSignature, ...extra] = token.split(".");
  if (!payload || !providedSignature || extra.length > 0) throw new Error("Invalid GitHub setup state.");
  const expectedSignature = signature(payload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid GitHub setup state.");
  }

  let state: GitHubSetupState;
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GitHubSetupState;
  } catch {
    throw new Error("Invalid GitHub setup state.");
  }
  if (!state || typeof state.nonce !== "string" || !state.nonce ||
    typeof state.workspaceId !== "string" || !state.workspaceId || state.userId !== expectedUserId) {
    throw new Error("Invalid GitHub setup state.");
  }
  if (!Number.isFinite(state.exp) || state.exp <= Math.floor(now / 1000)) {
    throw new Error("GitHub setup state has expired.");
  }
  return state;
}
