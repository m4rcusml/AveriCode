import { beforeEach, describe, expect, test, vi } from "vitest";

const githubRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  githubRequest
}));
import { GitHubApiError } from "@/lib/github/app-auth";
import { fetchRepositoryCommits } from "@/lib/github/commits";

const input = {
  owner: "octocat", name: "project", defaultBranch: "main", branches: ["feature/work"], token: "installation-token",
  since: new Date("2026-11-04T09:00:00Z"), until: new Date("2026-11-11T09:00:00Z")
};
const commit = { sha: "shared", author: null, commit: { author: null } };

describe("repository commit collection", () => {
  beforeEach(() => { githubRequest.mockReset(); });

  test("deduplicates shared commits and prefers the default branch", async () => {
    githubRequest.mockResolvedValue([commit]);
    const result = await fetchRepositoryCommits({ ...input, branches: ["main", "feature/work", "feature/work"] });
    expect(result).toEqual([{ ...commit, branchName: "main" }]);
    expect(githubRequest).toHaveBeenCalledTimes(2);
    expect(githubRequest.mock.calls[0][0]).toContain("until=2026-11-11T09%3A00%3A00.000Z");
  });

  test("still fetches the default HEAD when repository metadata has no default branch name", async () => {
    githubRequest.mockResolvedValue([commit]);
    const result = await fetchRepositoryCommits({ ...input, defaultBranch: null });
    expect(result).toEqual([{ ...commit, branchName: null }]);
    expect(githubRequest).toHaveBeenCalledTimes(2);
    expect(githubRequest.mock.calls[0][0]).not.toContain("&sha=");
  });

  test("keeps default branch activity when an optional branch was deleted", async () => {
    githubRequest.mockImplementation((path: string) => {
      if (path.includes("/branches?")) return Promise.resolve([{ name: "main" }]);
      if (path.endsWith("sha=main")) return Promise.resolve([commit]);
      return Promise.reject(new GitHubApiError("Branch not found", 404, ""));
    });
    expect(await fetchRepositoryCommits(input)).toEqual([{ ...commit, branchName: "main" }]);
  });

  test("does not turn an inaccessible repository into zero-activity snapshots", async () => {
    githubRequest.mockRejectedValue(new GitHubApiError("Not found", 404, ""));
    await expect(fetchRepositoryCommits(input)).rejects.toThrow("Not found");
  });

  test("fails if branch lookup cannot establish that a missing branch was deleted", async () => {
    githubRequest.mockImplementation((path: string) => {
      if (path.includes("/branches?")) return Promise.reject(new GitHubApiError("Forbidden", 403, ""));
      if (path.endsWith("sha=main")) return Promise.resolve([commit]);
      return Promise.reject(new GitHubApiError("Not found", 404, ""));
    });
    await expect(fetchRepositoryCommits(input)).rejects.toThrow("Forbidden");
  });

  test("treats a genuinely empty repository as an empty activity period", async () => {
    githubRequest.mockRejectedValue(new GitHubApiError("Git Repository is empty", 409, ""));
    expect(await fetchRepositoryCommits(input)).toEqual([]);
  });

  test("does not publish a truncated page after a conflict mid-pagination", async () => {
    githubRequest.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ ...commit, sha: String(index) })))
      .mockRejectedValueOnce(new GitHubApiError("Conflict", 409, ""));
    await expect(fetchRepositoryCommits(input)).rejects.toThrow("Conflict");
  });
});
