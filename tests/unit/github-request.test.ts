import { afterEach, describe, expect, test, vi } from "vitest";
import { githubRequest } from "@/lib/github/app-auth";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub API boundary", () => {
  test("sets required headers and a timeout without forwarding the token as a fetch option", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetch);
    expect(await githubRequest("/user", { bearerToken: "token" })).toEqual({ id: 1 });
    const options = fetch.mock.calls[0][1];
    expect(options.headers.get("Authorization")).toBe("Bearer token");
    expect(options.headers.get("User-Agent")).toBe("AveriCode");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options).not.toHaveProperty("bearerToken");
  });

  test("exposes retry-after for rate limits and does not keep retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("rate limit exceeded", { status: 403, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(githubRequest("/user", { bearerToken: "token" })).rejects.toMatchObject({
      status: 403, retryAfterMs: 120_000, message: expect.stringContaining("rate limit")
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("supports no-content responses from empty repositories", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await githubRequest("/repos/owner/empty/contributors", { bearerToken: "token" })).toBeUndefined();
  });
});
