import { beforeEach, describe, expect, test, vi } from "vitest";

const githubRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
  githubRequest
}));

import { fetchRecentlyUpdatedRepositoryBranches } from "@/lib/github/commits";

describe("fetchRecentlyUpdatedRepositoryBranches", () => {
  beforeEach(() => {
    const dates: Record<string, string> = {
      sha1: "2026-08-11T12:00:00.000Z",
      sha2: "2026-08-10T12:00:00.000Z",
      sha3: "2026-08-09T12:00:00.000Z",
      sha4: "2026-08-08T12:00:00.000Z",
      sha5: "2026-08-07T12:00:00.000Z",
      sha6: "2026-08-06T12:00:00.000Z",
      old: "2026-07-01T12:00:00.000Z",
      main: "2026-08-12T12:00:00.000Z"
    };

    githubRequest.mockImplementation((path: string) => {
      if (path.includes("/branches?")) {
        return Promise.resolve([
          { name: "main", commit: { sha: "main" } },
          { name: "feature/one", commit: { sha: "sha1" } },
          { name: "feature/two", commit: { sha: "sha2" } },
          { name: "feature/three", commit: { sha: "sha3" } },
          { name: "feature/four", commit: { sha: "sha4" } },
          { name: "feature/five", commit: { sha: "sha5" } },
          { name: "feature/six", commit: { sha: "sha6" } },
          { name: "feature/old", commit: { sha: "old" } }
        ]);
      }

      const sha = path.split("/").at(-1)!;
      return Promise.resolve({
        author: null,
        committer: { date: dates[sha] }
      });
    });
  });

  test("returns the five most recently changed non-default branches from the last two weeks", async () => {
    const branches = await fetchRecentlyUpdatedRepositoryBranches({
      owner: "avericode",
      name: "app",
      token: "token",
      defaultBranch: "main",
      since: new Date("2026-07-29T00:00:00.000Z"),
      limit: 5
    });

    expect(branches.map((branch) => branch.name)).toEqual([
      "feature/one",
      "feature/two",
      "feature/three",
      "feature/four",
      "feature/five"
    ]);
  });
});
