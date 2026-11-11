import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertRepositoryWriteAccess, ensureDefaultWorkspaceForUser } from "@/lib/workspaces";

const run = `integration-${randomUUID()}`;
const users = [`${run}-onboarding`, `${run}-owner-a`, `${run}-owner-b`];
const workspaceIds = [`${run}-workspace-a`, `${run}-workspace-b`];
const repositoryIds = [`${run}-repository-a`, `${run}-repository-b`];

describe("PostgreSQL workspace invariants", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map((id) => ({ id, name: "Integration fixture", email: `${id}@example.test` })) });
    for (let index = 0; index < workspaceIds.length; index++) {
      const workspace = await prisma.workspace.create({
        data: {
          id: workspaceIds[index], name: "Integration fixture", slug: workspaceIds[index], ownerId: users[index + 1],
          members: { create: { userId: users[index + 1], role: "OWNER" } },
          installations: { create: { installationId: `${run}-github-installation`, accountLogin: "integration-fixture", accountType: "USER", repositorySelection: "SELECTED" } }
        },
        include: { installations: true }
      });
      await prisma.repository.create({
        data: {
          id: repositoryIds[index], workspaceId: workspace.id, githubInstallationId: workspace.installations[0].id,
          githubRepoId: `${run}-shared-github-repository`, owner: "integration-fixture", name: "shared", fullName: "integration-fixture/shared"
        }
      });
    }
  });

  afterAll(async () => {
    // Only this run's random fixture owners are selected; existing local data is preserved.
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test("concurrent first sign-ins create exactly one default workspace", async () => {
    const [first, second] = await Promise.all([
      ensureDefaultWorkspaceForUser(users[0], "Integration leader"),
      ensureDefaultWorkspaceForUser(users[0], "Integration leader")
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.workspace.count({ where: { ownerId: users[0] } })).toBe(1);
    expect(await prisma.workspaceMember.count({ where: { userId: users[0], role: "OWNER" } })).toBe(1);
  });

  test("the same GitHub repository is allowed in separate tenants without granting cross-tenant writes", async () => {
    await expect(assertRepositoryWriteAccess(users[1], repositoryIds[0])).resolves.toEqual({ id: repositoryIds[0], workspaceId: workspaceIds[0] });
    await expect(assertRepositoryWriteAccess(users[2], repositoryIds[0])).rejects.toThrow("Workspace access denied.");
    await expect(assertRepositoryWriteAccess(users[1], repositoryIds[1])).rejects.toThrow("Workspace access denied.");

    await expect(prisma.repository.create({
      data: {
        workspaceId: workspaceIds[0], githubInstallationId: (await prisma.repository.findUniqueOrThrow({ where: { id: repositoryIds[0] } })).githubInstallationId,
        githubRepoId: `${run}-shared-github-repository`, owner: "integration-fixture", name: "duplicate", fullName: "integration-fixture/duplicate"
      }
    })).rejects.toMatchObject({ code: "P2002" });
  });

  test("the partial index allows only one concurrent RUNNING sync per repository", async () => {
    const claims = await Promise.allSettled([1, 2].map(() => prisma.syncRun.create({
      data: { workspaceId: workspaceIds[0], repositoryId: repositoryIds[0], trigger: "MANUAL", status: "RUNNING" }
    })));

    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
    const rejected = claims.find((claim) => claim.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "P2002" });

    await expect(prisma.syncRun.create({
      data: { workspaceId: workspaceIds[1], repositoryId: repositoryIds[1], trigger: "MANUAL", status: "RUNNING" }
    })).resolves.toMatchObject({ repositoryId: repositoryIds[1] });
    await prisma.syncRun.updateMany({ where: { repositoryId: repositoryIds[0], status: "RUNNING" }, data: { status: "SUCCESS", finishedAt: new Date() } });
    await expect(prisma.syncRun.create({
      data: { workspaceId: workspaceIds[0], repositoryId: repositoryIds[0], trigger: "CRON", status: "RUNNING" }
    })).resolves.toMatchObject({ status: "RUNNING" });
  });
});
