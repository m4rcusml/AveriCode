import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyGitHubSetupState } from "@/lib/github/setup-state";

function stateHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function rememberGitHubSetupState(token: string, userId: string) {
  const state = verifyGitHubSetupState(token, userId);
  const identifier = `github-setup:${userId}`;
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({
      where: { OR: [{ identifier }, { identifier: { startsWith: "github-setup:" }, expires: { lte: new Date() } }] }
    });
    await tx.verificationToken.create({
      data: { identifier, token: stateHash(token), expires: new Date(state.exp * 1000) }
    });
  });
}

export async function consumeGitHubSetupState(token: string, userId: string) {
  const state = verifyGitHubSetupState(token, userId);
  const consumed = await prisma.verificationToken.deleteMany({
    where: { identifier: `github-setup:${userId}`, token: stateHash(token), expires: { gt: new Date() } }
  });
  if (consumed.count !== 1) throw new Error("Invalid or already used GitHub setup state.");
  return state;
}
