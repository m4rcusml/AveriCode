import { GitHubApiError, githubRequest } from "@/lib/github/app-auth";

export type GitHubCommit = {
  sha: string;
  author: {
    id: number;
    login: string;
    avatar_url: string | null;
  } | null;
  commit: {
    author: {
      name: string | null;
      email: string | null;
      date: string | null;
    } | null;
  };
};

type FetchRepositoryCommitsInput = {
  owner: string;
  name: string;
  defaultBranch?: string | null;
  token: string;
  since: Date;
  until: Date;
};

export async function fetchRepositoryCommits(input: FetchRepositoryCommitsInput) {
  const commits: GitHubCommit[] = [];
  const branchQuery = input.defaultBranch ? `&sha=${encodeURIComponent(input.defaultBranch)}` : "";

  for (let page = 1; ; page += 1) {
    try {
      const pageCommits = await githubRequest<GitHubCommit[]>(
        `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/commits?since=${encodeURIComponent(
          input.since.toISOString()
        )}&until=${encodeURIComponent(input.until.toISOString())}&per_page=100&page=${page}${branchQuery}`,
        {
          bearerToken: input.token
        }
      );

      commits.push(...pageCommits);

      if (pageCommits.length < 100) {
        break;
      }
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 409) {
        return commits;
      }

      throw error;
    }
  }

  return commits;
}
