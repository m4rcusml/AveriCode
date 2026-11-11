import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchRepositoryCommits: vi.fn(),
  prisma: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    workspace: { findMany: vi.fn(), updateMany: vi.fn() },
    repository: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    syncRun: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    repositoryUpdate: { deleteMany: vi.fn() },
    repositoryContributor: { findMany: vi.fn().mockResolvedValue([]) }
  }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/github/app-auth", () => ({ getInstallationAccessToken: vi.fn().mockResolvedValue("token") }));
vi.mock("@/lib/github/commits", () => ({ fetchRepositoryCommits: mocks.fetchRepositoryCommits }));
vi.mock("@/lib/github/installations", () => ({ configureNewRepository: vi.fn() }));
vi.mock("@/lib/github/people", () => ({ fetchRepositoryPeopleSuggestions: vi.fn().mockResolvedValue({ allPeople: [], errors: [] }) }));
vi.mock("@/lib/contributors", () => ({ findOrCreateContributor: vi.fn(), reconcileRepositoryContributors: vi.fn().mockResolvedValue([]) }));
import { syncScheduledWorkspaces } from "@/lib/github/sync";

type Workspace = {
  id: string; syncSchedule: "DAILY" | "WEEKLY"; lastScheduledSyncAt: Date | null;
  scheduledSyncStartedAt: Date | null; scheduledSyncLeaseAt: Date | null;
};
type Run = {
  id: string; repositoryId: string; workspaceId: string; trigger: string; status: string; startedAt: Date; error?: string;
};
let workspace: Workspace;
let repositories: Array<{ id: string; fullName: string; workspaceId: string; owner: string; name: string; defaultBranch: string; installation: { installationId: string; suspendedAt?: Date }; contributors: []; branches: [] }>;
let runs: Run[];

function matchingRun(run: Run, where: Record<string, unknown>) {
  if (where.id && run.id !== where.id) return false;
  if (where.repositoryId && run.repositoryId !== where.repositoryId) return false;
  if (where.trigger && run.trigger !== where.trigger) return false;
  const status = where.status as string | { in: string[] } | undefined;
  if (typeof status === "string" && run.status !== status) return false;
  if (status && typeof status === "object" && !status.in.includes(run.status)) return false;
  const dates = where.startedAt as { gte?: Date; lt?: Date } | undefined;
  return !(dates?.gte && run.startedAt < dates.gte) && !(dates?.lt && run.startedAt >= dates.lt);
}

describe("recoverable scheduled dispatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T09:00:00Z"));
    workspace = { id: "workspace-1", syncSchedule: "WEEKLY", lastScheduledSyncAt: null, scheduledSyncStartedAt: null, scheduledSyncLeaseAt: null };
    repositories = ["one", "two", "three"].map((name) => ({
      id: name, fullName: `team/${name}`, workspaceId: workspace.id, owner: "team", name, defaultBranch: "main",
      installation: { installationId: "123" }, contributors: [], branches: []
    }));
    runs = [];
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.workspace.findMany.mockImplementation(async () => [{ ...workspace }]);
    mocks.prisma.workspace.updateMany.mockImplementation(async ({ where, data }) => {
      for (const field of ["id", "syncSchedule", "lastScheduledSyncAt", "scheduledSyncStartedAt", "scheduledSyncLeaseAt"] as const) {
        if (where[field] !== undefined && String(where[field]) !== String(workspace[field])) return { count: 0 };
      }
      if (where.OR && workspace.scheduledSyncLeaseAt && workspace.scheduledSyncLeaseAt > where.OR[1].scheduledSyncLeaseAt.lte) return { count: 0 };
      Object.assign(workspace, data);
      return { count: 1 };
    });
    mocks.prisma.repository.findMany.mockImplementation(async ({ where }) => {
      const terminal = where.syncRuns?.none;
      return repositories.filter((repository) => repository.workspaceId === where.workspaceId &&
        !runs.some((run) => terminal && matchingRun(run, { ...terminal, repositoryId: repository.id })));
    });
    mocks.prisma.repository.findUnique.mockImplementation(async ({ where }) => repositories.find((repository) => repository.id === where.id));
    mocks.prisma.repository.update.mockResolvedValue({});
    mocks.prisma.syncRun.findFirst.mockImplementation(async ({ where }) => runs.find((run) => matchingRun(run, where)) ?? null);
    mocks.prisma.syncRun.create.mockImplementation(async ({ data }) => {
      const run = { id: `run-${runs.length + 1}`, startedAt: new Date(), ...data };
      runs.push(run);
      return run;
    });
    mocks.prisma.syncRun.updateMany.mockImplementation(async ({ where, data }) => {
      const matches = runs.filter((run) => matchingRun(run, where));
      matches.forEach((run) => Object.assign(run, data));
      return { count: matches.length };
    });
    mocks.fetchRepositoryCommits.mockResolvedValue([]);
  });
  afterEach(() => { vi.useRealTimers(); });

  test("keeps the checkpoint across the runtime budget and resumes only repositories not attempted", async () => {
    const cycleStart = new Date();
    mocks.fetchRepositoryCommits.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + (mocks.fetchRepositoryCommits.mock.calls.length === 1 ? 170_000 : 75_000));
      return [];
    });
    const first = await syncScheduledWorkspaces();

    expect(first.results[0]).toMatchObject({ completed: false, result: { total: 3, succeeded: 1, failed: 1, deferred: 1 } });
    expect(workspace.lastScheduledSyncAt).toBeNull();
    expect(workspace.scheduledSyncStartedAt).toEqual(cycleStart);
    expect(workspace.scheduledSyncLeaseAt).toBeNull();
    expect(runs.map((run) => [run.repositoryId, run.status])).toEqual([["one", "SUCCESS"], ["two", "FAILED"]]);

    vi.setSystemTime(new Date("2026-11-12T09:00:00Z"));
    mocks.fetchRepositoryCommits.mockResolvedValue([]);
    const resumed = await syncScheduledWorkspaces();

    expect(resumed.results[0]).toMatchObject({ completed: true, cycleStartedAt: cycleStart, result: { total: 1, succeeded: 1 } });
    expect(mocks.fetchRepositoryCommits).toHaveBeenCalledTimes(3);
    expect(workspace.scheduledSyncStartedAt).toBeNull();
    expect(workspace.lastScheduledSyncAt).toEqual(cycleStart);
  });

  test("does not take over a recent lease but recovers a terminated dispatch after lease expiry", async () => {
    workspace.scheduledSyncStartedAt = new Date("2026-11-11T08:00:00Z");
    workspace.scheduledSyncLeaseAt = new Date("2026-11-11T08:59:00Z");
    expect((await syncScheduledWorkspaces()).syncedWorkspaces).toBe(0);
    expect(mocks.fetchRepositoryCommits).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-11T09:10:00Z"));
    expect((await syncScheduledWorkspaces()).results[0].completed).toBe(true);
    expect(runs).toHaveLength(3);
    expect(workspace.scheduledSyncLeaseAt).toBeNull();
  });

  test("a permanently failing project does not prevent healthy projects in the next daily cycle", async () => {
    workspace.syncSchedule = "DAILY";
    repositories[0].installation.suspendedAt = new Date();
    const first = await syncScheduledWorkspaces();
    expect(first.results[0]).toMatchObject({ completed: true, result: { succeeded: 2, failed: 1 } });
    expect(runs[0]).toMatchObject({ repositoryId: "one", status: "FAILED", error: expect.stringContaining("suspended") });
    expect(workspace.scheduledSyncStartedAt).toBeNull();

    vi.setSystemTime(new Date("2026-11-12T09:00:00Z"));
    const second = await syncScheduledWorkspaces();
    expect(second.results[0]).toMatchObject({ completed: true, result: { succeeded: 2, failed: 1 } });
    expect(mocks.fetchRepositoryCommits).toHaveBeenCalledTimes(4);
    expect(runs.filter((run) => run.repositoryId === "two" && run.status === "SUCCESS")).toHaveLength(2);
  });

  test.each([
    ["DAILY", "2026-11-12T09:00:00Z"],
    ["WEEKLY", "2026-11-18T09:00:00Z"]
  ] as const)("keeps the %s dispatch anchored to its start when sync takes a minute", async (schedule, nextDispatch) => {
    workspace.syncSchedule = schedule;
    mocks.fetchRepositoryCommits.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 20_000);
      return [];
    });
    await syncScheduledWorkspaces();

    expect(new Date()).toEqual(new Date("2026-11-11T09:01:00Z"));
    expect(workspace.lastScheduledSyncAt).toEqual(new Date("2026-11-11T09:00:00Z"));
    vi.setSystemTime(new Date(nextDispatch));
    mocks.fetchRepositoryCommits.mockResolvedValue([]);

    expect((await syncScheduledWorkspaces()).syncedWorkspaces).toBe(1);
    expect(mocks.fetchRepositoryCommits).toHaveBeenCalledTimes(6);
  });
});
