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

export type GitHubCommitWithBranch = GitHubCommit & {
  branchName: string | null;
};

export type GitHubBranch = {
  name: string;
  commit?: {
    sha: string;
  };
};

export type RecentGitHubBranch = {
  name: string;
  lastCommitAt: Date;
};

type FetchRepositoryCommitsInput = {
  owner: string;
  name: string;
  defaultBranch?: string | null;
  branches?: string[];
  token: string;
  since: Date;
  until: Date;
};

type FetchBranchCommitsInput = FetchRepositoryCommitsInput & {
  branchName: string | null;
};

function uniqueBranchNames(branches: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const uniqueBranches: string[] = [];

  for (const branch of branches) {
    const cleanBranch = branch?.trim();

    if (!cleanBranch || seen.has(cleanBranch)) {
      continue;
    }

    seen.add(cleanBranch);
    uniqueBranches.push(cleanBranch);
  }

  return uniqueBranches;
}

async function fetchBranchCommits(input: FetchBranchCommitsInput) {
  const commits: GitHubCommit[] = [];
  const branchQuery = input.branchName ? `&sha=${encodeURIComponent(input.branchName)}` : "";

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

export async function fetchRepositoryCommits(input: FetchRepositoryCommitsInput) {
  const commitsBySha = new Map<string, GitHubCommitWithBranch>();
  const branches = uniqueBranchNames([input.defaultBranch, ...(input.branches ?? [])]);
  const branchNames = branches.length > 0 ? branches : [null];

  for (const branchName of branchNames) {
    const commits = await fetchBranchCommits({
      ...input,
      branchName
    });

    for (const commit of commits) {
      if (!commitsBySha.has(commit.sha)) {
        commitsBySha.set(commit.sha, {
          ...commit,
          branchName
        });
      }
    }
  }

  return [...commitsBySha.values()];
}

export async function fetchRepositoryBranches(input: {
  owner: string;
  name: string;
  token: string;
}) {
  const branches: GitHubBranch[] = [];

  for (let page = 1; ; page += 1) {
    const pageBranches = await githubRequest<GitHubBranch[]>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
        input.name
      )}/branches?per_page=100&page=${page}`,
      {
        bearerToken: input.token
      }
    );

    branches.push(...pageBranches);

    if (pageBranches.length < 100) {
      break;
    }
  }

  return branches;
}

type GitHubGitCommitResponse = {
  author: {
    date: string | null;
  } | null;
  committer: {
    date: string | null;
  } | null;
};

function parsedCommitDate(commit: GitHubGitCommitResponse) {
  const value = commit.committer?.date ?? commit.author?.date;

  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchRecentlyUpdatedRepositoryBranches(input: {
  owner: string;
  name: string;
  token: string;
  since: Date;
  defaultBranch?: string | null;
  limit?: number;
}) {
  const branches = await fetchRepositoryBranches(input);
  const candidates = branches.filter(
    (branch) => branch.name !== input.defaultBranch && Boolean(branch.commit?.sha)
  );
  const recentBranches: RecentGitHubBranch[] = [];
  const batchSize = 10;

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const dates = await Promise.all(
      batch.map(async (branch) => {
        try {
          const commit = await githubRequest<GitHubGitCommitResponse>(
            `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
              input.name
            )}/git/commits/${encodeURIComponent(branch.commit!.sha)}`,
            {
              bearerToken: input.token
            }
          );

          return parsedCommitDate(commit);
        } catch (error) {
          if (error instanceof GitHubApiError && [404, 409, 422].includes(error.status)) {
            return null;
          }

          throw error;
        }
      })
    );

    for (const [batchIndex, date] of dates.entries()) {
      if (date && date >= input.since) {
        recentBranches.push({
          name: batch[batchIndex].name,
          lastCommitAt: date
        });
      }
    }
  }

  return recentBranches
    .sort((left, right) => right.lastCommitAt.getTime() - left.lastCommitAt.getTime())
    .slice(0, input.limit ?? 5);
}
