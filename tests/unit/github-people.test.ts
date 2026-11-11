import { beforeEach, describe, expect, test, vi } from "vitest";

const githubRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/github/app-auth", () => ({
  GitHubApiError: class GitHubApiError extends Error { status = 403; }, githubRequest,
  getInstallationAccessToken: vi.fn()
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { fetchRepositoryPeopleSuggestions } from "@/lib/github/people";

describe("automatic project contributors", () => {
  beforeEach(() => { githubRequest.mockReset(); });

  test("uses historical commit authors without including people who only have repository access", async () => {
    githubRequest.mockImplementation(async (path: string) => path.includes("/collaborators?")
      ? [{ id: 1, login: "access-only", avatar_url: null }]
      : [{ id: 2, login: "former-author", avatar_url: null, contributions: 5 }]);

    const people = await fetchRepositoryPeopleSuggestions({ owner: "team", name: "project", token: "token" });

    expect(people.allPeople.map((person) => person.username)).toEqual(["former-author"]);
    expect(people.suggestedContributors.map((person) => person.username)).toEqual(["former-author"]);
    expect(githubRequest.mock.calls.every(([path]) => !path.includes("/collaborators"))).toBe(true);
    expect(githubRequest.mock.calls[0][0]).not.toContain("since=");
  });

  test("ignores contributor entries without commits and paginates historical authors", async () => {
    githubRequest.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ id: index + 1, login: `author-${index}`, contributions: 2 })))
      .mockResolvedValueOnce([{ id: 200, login: "access-only", contributions: 0 }, { id: 201, login: "last-author", contributions: 1 }]);
    const people = await fetchRepositoryPeopleSuggestions({ owner: "team", name: "project", token: "token" });
    expect(people.allPeople).toHaveLength(101);
    expect(people.allPeople.some((person) => person.username === "access-only")).toBe(false);
    expect(githubRequest.mock.calls[1][0]).toContain("page=2");
  });

  test("reports an unavailable author list distinctly from a successfully empty repository", async () => {
    githubRequest.mockRejectedValue(new Error("GitHub unavailable"));
    const failed = await fetchRepositoryPeopleSuggestions({ owner: "team", name: "project", token: "token" });
    expect(failed.errors).toHaveLength(1);
    githubRequest.mockResolvedValue(undefined);
    const empty = await fetchRepositoryPeopleSuggestions({ owner: "team", name: "project", token: "token" });
    expect(empty).toMatchObject({ allPeople: [], suggestedContributors: [], errors: [] });
  });
});
