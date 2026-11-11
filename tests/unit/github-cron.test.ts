import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const syncScheduledWorkspaces = vi.hoisted(() => vi.fn());
vi.mock("@/lib/github/sync", () => ({ syncScheduledWorkspaces }));
import { GET } from "@/app/api/cron/scheduled-sync/route";

describe("scheduled dispatcher authorization", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    syncScheduledWorkspaces.mockResolvedValue({ checkedWorkspaces: 0, syncedWorkspaces: 0, results: [] });
  });

  test("does not run when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new NextRequest("https://avericode.test/api/cron/scheduled-sync"))).status).toBe(503);
    expect(syncScheduledWorkspaces).not.toHaveBeenCalled();
  });

  test("rejects an incorrect bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await GET(new NextRequest("https://avericode.test/api/cron/scheduled-sync", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(syncScheduledWorkspaces).not.toHaveBeenCalled();
  });

  test("runs an authorized dispatcher", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await GET(new NextRequest("https://avericode.test/api/cron/scheduled-sync", { headers: { authorization: "Bearer cron-secret" } }))).status).toBe(200);
    expect(syncScheduledWorkspaces).toHaveBeenCalledTimes(1);
  });
});
