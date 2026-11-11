import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ people: vi.fn(), commits: vi.fn() }));
vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error {},
  getInstallationAccessToken: vi.fn().mockResolvedValue("fixture-installation-token")
}));
vi.mock("@/lib/github/people", () => ({ fetchRepositoryPeopleSuggestions: mocks.people }));
vi.mock("@/lib/github/commits", () => ({
  fetchRepositoryCommits: mocks.commits,
  fetchRecentlyUpdatedRepositoryBranches: vi.fn().mockResolvedValue([])
}));
import { prisma } from "@/lib/prisma";
import { syncRepositoryActivity } from "@/lib/github/sync";
import { addExpectedContributor, updateRepositoryContributor } from "@/lib/repository-config";

const key = `roster-${randomUUID()}`;
const loginPrefix = `r${randomUUID().slice(0, 8)}`;
const repositoryId = `${key}-repo`;
const workspaceId = `${key}-workspace`;
const ownerId = `${key}-owner`;
const newHistoricalId = String(Date.now() * 100 + 11);
const newBranchAuthorId = String(Date.now() * 100 + 12);
const person = (suffix: string, githubUserId = `${key}-${suffix}`) => ({
  githubUserId, username: `${loginPrefix}-${suffix}`, avatarUrl: null
});
function people(suffixes: string[]) {
  const allPeople = suffixes.map((suffix) => person(suffix, suffix === "new" ? newHistoricalId : undefined));
  return { allPeople, suggestedContributors: allPeople, accessWithoutContributions: [], errors: [] };
}
async function expectedCount() {
  return prisma.repositoryContributor.count({ where: { repositoryId, isExpected: true, isIgnored: false } });
}

describe("historical authors and manual roster in PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: ownerId, email: `${key}@example.test` } });
    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId, name: "Roster fixture", slug: workspaceId, ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
        installations: { create: { installationId: key, accountLogin: loginPrefix, accountType: "USER", repositorySelection: "SELECTED" } }
      }, include: { installations: true }
    });
    await prisma.repository.create({ data: {
      id: repositoryId, workspaceId, githubInstallationId: workspace.installations[0].id,
      githubRepoId: key, owner: loginPrefix, name: "project", fullName: `${loginPrefix}/project`, defaultBranch: "main"
    } });
    for (const suffix of ["access", "former", "branchold", "manual", "known", "ignored", "excluded"]) {
      await prisma.repositoryContributor.create({ data: {
        repository: { connect: { id: repositoryId } }, source: suffix === "known" ? "MANUAL" : "LEGACY",
        isExpected: suffix !== "excluded", isIgnored: suffix === "ignored",
        contributor: { create: {
          id: `${key}-${suffix}`, username: `${loginPrefix}-${suffix}`,
          githubUserId: suffix === "manual" ? null : `${key}-${suffix}`
        } }
      } });
    }
    await prisma.commitActivitySnapshot.createMany({ data: ["branchold", "ignored", "excluded"].map((suffix) => ({
      repositoryId, contributorId: `${key}-${suffix}`, commitCount: 3, status: "ACTIVE" as const,
      periodStart: new Date(Date.now() - 32 * 86_400_000), periodEnd: new Date(Date.now() - 25 * 86_400_000),
      lastCommitAt: new Date(Date.now() - 25 * 86_400_000), lastCommitBranch: "feature/historical-work"
    })) });
    mocks.commits.mockResolvedValue([]);
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.contributor.deleteMany({ where: { OR: [
      { id: { startsWith: key } }, { githubUserId: { in: [newHistoricalId, newBranchAuthorId] } }
    ] } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  test("a failed historical author lookup does not rewrite legacy or manually configured people", async () => {
    mocks.people.mockResolvedValue({ allPeople: [], errors: ["GitHub contributors unavailable"] });
    expect(await expectedCount()).toBe(5);
    await syncRepositoryActivity({ repositoryId, trigger: "CRON" });
    expect(await expectedCount()).toBe(5);
    expect(await prisma.repositoryContributor.count({ where: { repositoryId, source: "LEGACY" } })).toBe(6);
  });

  test("repairs access-only legacy rows while keeping historical inactive authors and manual additions", async () => {
    mocks.people.mockResolvedValue(people(["former"]));
    const result = await syncRepositoryActivity({ repositoryId, trigger: "CRON" });
    expect(result.expectedContributorCount).toBe(4);
    expect(await expectedCount()).toBe(4);
    expect(await prisma.repositoryContributor.findUniqueOrThrow({
      where: { repositoryId_contributorId: { repositoryId, contributorId: `${key}-access` } }
    })).toMatchObject({ source: "GITHUB", isExpected: false });
    expect(await prisma.repositoryContributor.findUniqueOrThrow({
      where: { repositoryId_contributorId: { repositoryId, contributorId: `${key}-manual` } }
    })).toMatchObject({ source: "MANUAL", isExpected: true });
    const latest = await prisma.syncRun.findFirstOrThrow({ where: { repositoryId, status: "SUCCESS" }, orderBy: { startedAt: "desc" } });
    const snapshots = await prisma.commitActivitySnapshot.findMany({ where: { syncRunId: latest.id } });
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every((snapshot) => snapshot.status === "INACTIVE" && snapshot.commitCount === 0)).toBe(true);
    expect(snapshots.map((snapshot) => snapshot.contributorId)).toContain(`${key}-former`);
    expect(snapshots.map((snapshot) => snapshot.contributorId)).toContain(`${key}-branchold`);
  });

  test("allows a person without commits to be explicitly added and keeps that manual override", async () => {
    await addExpectedContributor(ownerId, repositoryId, { username: `${loginPrefix}-access` });
    await syncRepositoryActivity({ repositoryId, trigger: "CRON" });
    expect(await expectedCount()).toBe(5);
    expect(await prisma.repositoryContributor.findUniqueOrThrow({
      where: { repositoryId_contributorId: { repositoryId, contributorId: `${key}-access` } }
    })).toMatchObject({ source: "MANUAL", isExpected: true });
  });

  test("automatically adds new historical and monitored-branch commit authors without reimporting", async () => {
    mocks.people.mockResolvedValue(people(["former", "new"]));
    mocks.commits.mockResolvedValue([{
      sha: "branch-contribution", branchName: "feature/new-work",
      author: { id: Number(newBranchAuthorId), login: `${loginPrefix}-branch`, avatar_url: null },
      commit: { message: "feat: project update", author: { date: new Date().toISOString(), name: "Branch author", email: null } }
    }]);
    const result = await syncRepositoryActivity({ repositoryId, trigger: "CRON" });
    expect(result.expectedContributorCount).toBe(7);
    expect(await expectedCount()).toBe(7);
    expect(await prisma.repositoryContributor.count({ where: { repositoryId, source: "GITHUB", isExpected: true, isIgnored: false } })).toBe(4);
  });

  test("preserves manual exclusions and ignored authors across subsequent automatic reconciliation", async () => {
    const newAuthor = await prisma.repositoryContributor.findFirstOrThrow({ where: { repositoryId, contributor: { githubUserId: newHistoricalId } } });
    const branchAuthor = await prisma.repositoryContributor.findFirstOrThrow({ where: { repositoryId, contributor: { githubUserId: newBranchAuthorId } } });
    await updateRepositoryContributor(ownerId, newAuthor.id, { isExpected: false });
    await updateRepositoryContributor(ownerId, branchAuthor.id, { isIgnored: true });
    await syncRepositoryActivity({ repositoryId, trigger: "CRON" });
    expect(await expectedCount()).toBe(5);
    expect(await prisma.repositoryContributor.findUniqueOrThrow({ where: { id: newAuthor.id } })).toMatchObject({ source: "MANUAL", isExpected: false });
    expect(await prisma.repositoryContributor.findUniqueOrThrow({ where: { id: branchAuthor.id } })).toMatchObject({ source: "MANUAL", isIgnored: true });
    expect(await prisma.repositoryContributor.findFirstOrThrow({ where: { repositoryId, contributorId: `${key}-ignored` } })).toMatchObject({ source: "MANUAL", isIgnored: true });
    expect(await prisma.repositoryContributor.findFirstOrThrow({ where: { repositoryId, contributorId: `${key}-excluded` } })).toMatchObject({ source: "MANUAL", isExpected: false });
  });
});
