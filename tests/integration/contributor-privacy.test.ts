import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/lib/prisma";
import { addExpectedContributor } from "@/lib/repository-config";
import { findOrCreateContributor } from "@/lib/contributors";

const run = `privacy-${randomUUID()}`;
const owners = [`${run}-owner-a`, `${run}-owner-b`];
const repositoryIds = [`${run}-repo-a`, `${run}-repo-b`];
const username = `privacy-${randomUUID().slice(0, 8)}`;
const contributorId = `${run}-person`;
let anonymousContributorId: string | undefined;

describe("contributor privacy across real PostgreSQL workspaces", () => {
  beforeAll(async () => {
    for (const [index, ownerId] of owners.entries()) {
      await prisma.user.create({ data: { id: ownerId, name: "Privacy test fixture" } });
      const workspace = await prisma.workspace.create({
        data: {
          name: "Privacy test fixture", slug: `${run}-${index}`, ownerId,
          members: { create: { userId: ownerId, role: "OWNER" } },
          installations: { create: { installationId: `${run}-installation`, accountLogin: "privacy-fixture", accountType: "USER", repositorySelection: "SELECTED" } }
        },
        include: { installations: true }
      });
      await prisma.repository.create({ data: {
        id: repositoryIds[index], workspaceId: workspace.id, githubInstallationId: workspace.installations[0].id,
        githubRepoId: `${run}-${index}`, owner: "privacy-fixture", name: "private", fullName: "privacy-fixture/private"
      } });
    }
    await prisma.contributor.create({ data: {
      id: contributorId, username, githubUserId: `${run}-42`, name: "Private author name from workspace B",
      email: `${run}-private@example.test`, avatarUrl: "https://example.invalid/private-avatar"
    } });
    await prisma.repositoryContributor.create({ data: { repositoryId: repositoryIds[1], contributorId, isExpected: true } });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.contributor.deleteMany({ where: { id: contributorId } });
    if (anonymousContributorId) await prisma.contributor.deleteMany({ where: { id: anonymousContributorId } });
    await prisma.$disconnect();
  });

  test("linking the same public login does not expose private metadata or rewrite the shared identity", async () => {
    const before = await prisma.contributor.findUniqueOrThrow({ where: { id: contributorId } });
    const result = await addExpectedContributor(owners[0], repositoryIds[0], { username });
    const after = await prisma.contributor.findUniqueOrThrow({ where: { id: contributorId } });

    expect(result.contributor).toEqual({ username });
    expect(JSON.stringify(result)).not.toContain(before.email);
    expect(JSON.stringify(result)).not.toContain(before.name);
    expect(after).toEqual(before);
  });

  test("a workspace owner cannot rewrite another workspace's contributor by submitting a forged GitHub id", async () => {
    const attack = { username: "forged-login", githubUserId: `${run}-42`, name: "Poisoned identity", email: "poisoned@example.test" };
    await expect(addExpectedContributor(owners[0], repositoryIds[0], attack)).rejects.toThrow("only a GitHub username");
    const contributor = await prisma.contributor.findUniqueOrThrow({ where: { id: contributorId } });
    expect(contributor.username).toBe(username);
    expect(contributor.name).toBe("Private author name from workspace B");
    expect(contributor.email).toBe(`${run}-private@example.test`);
    expect(await prisma.contributor.count({ where: { username: "forged-login" } })).toBe(0);
  });

  test("an unlinked commit email cannot impersonate the named GitHub author", async () => {
    const before = await prisma.contributor.findUniqueOrThrow({ where: { id: contributorId } });
    const anonymous = await findOrCreateContributor({ email: before.email, name: "Forged private author", username });
    anonymousContributorId = anonymous.id;

    expect(anonymous.id).not.toBe(contributorId);
    expect(anonymous).toMatchObject({ githubUserId: null, username: null, email: null, name: null, avatarUrl: null });
    expect(await prisma.contributor.findUniqueOrThrow({ where: { id: contributorId } })).toEqual(before);
    const repeated = await findOrCreateContributor({ email: before.email });
    expect(repeated.id).toBe(anonymous.id);
  });
});
