import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  importInstallationRepositories: vi.fn(), revalidatePath: vi.fn(),
  prisma: { gitHubInstallation: { findMany: vi.fn(), deleteMany: vi.fn() } }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/github/installations", () => ({ importInstallationRepositories: mocks.importInstallationRepositories }));
import { POST } from "@/app/api/github/webhook/route";

function request(event: string, payload: unknown, valid = true) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
  return new NextRequest("https://avericode.test/api/github/webhook", {
    method: "POST", body,
    headers: { "x-github-event": event, "x-hub-signature-256": valid ? `sha256=${signature}` : "sha256=bad" }
  });
}

describe("GitHub webhook lifecycle", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_APP_WEBHOOK_SECRET", "webhook-secret");
    mocks.prisma.gitHubInstallation.findMany.mockResolvedValue([{ id: "record-1" }, { id: "record-2" }]);
    mocks.prisma.gitHubInstallation.deleteMany.mockResolvedValue({ count: 2 });
    mocks.importInstallationRepositories.mockResolvedValue([]);
  });

  test("rejects bad signatures before reading installations", async () => {
    expect((await POST(request("installation", { action: "deleted", installation: { id: 123 } }, false))).status).toBe(401);
    expect(mocks.prisma.gitHubInstallation.deleteMany).not.toHaveBeenCalled();
  });

  test("rejects signed JSON that is not an object", async () => {
    expect((await POST(request("installation", null))).status).toBe(400);
    expect((await POST(request("installation", []))).status).toBe(400);
  });

  test("refreshes suspension for every workspace linked to the same installation", async () => {
    const response = await POST(request("installation", { action: "suspend", installation: { id: 123 } }));
    expect(response.status).toBe(200);
    expect(mocks.importInstallationRepositories.mock.calls.map(([id]) => id)).toEqual(["record-1", "record-2"]);
  });

  test("handles repeated deletion deliveries idempotently", async () => {
    mocks.prisma.gitHubInstallation.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
    const payload = { action: "deleted", installation: { id: 123 } };
    expect((await POST(request("installation", payload))).status).toBe(200);
    expect((await POST(request("installation", payload))).status).toBe(200);
    expect(mocks.prisma.gitHubInstallation.deleteMany).toHaveBeenLastCalledWith({ where: { installationId: "123" } });
  });

  test("returns a failure for refresh errors rather than acknowledging lost access as success", async () => {
    mocks.importInstallationRepositories.mockRejectedValue(new Error("GitHub access unavailable"));
    expect((await POST(request("installation_repositories", { action: "removed", installation: { id: 123 } }))).status).toBe(500);
  });
});
