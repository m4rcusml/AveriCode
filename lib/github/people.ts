import { GitHubApiError, getInstallationAccessToken, githubRequest } from "@/lib/github/app-auth";
import { prisma } from "@/lib/prisma";

type GitHubUserResponse = {
  id: number;
  login: string;
  avatar_url: string | null;
  contributions: number;
};

export type GitHubPersonSuggestion = {
  githubUserId: string;
  username: string;
  avatarUrl: string | null;
};

export type RepositoryPeopleSuggestions = {
  suggestedContributors: GitHubPersonSuggestion[];
  accessWithoutContributions: GitHubPersonSuggestion[];
  allPeople: GitHubPersonSuggestion[];
  errors: string[];
};

function toPerson(user: GitHubUserResponse): GitHubPersonSuggestion {
  return {
    githubUserId: String(user.id),
    username: user.login,
    avatarUrl: user.avatar_url
  };
}

async function fetchPaginatedUsers(token: string, path: string, signal?: AbortSignal) {
  const users: GitHubPersonSuggestion[] = [];

  for (let page = 1; ; page += 1) {
    signal?.throwIfAborted();
    const separator = path.includes("?") ? "&" : "?";
    const pageUsers = await githubRequest<GitHubUserResponse[] | undefined>(
      `${path}${separator}per_page=100&page=${page}`,
      {
        bearerToken: token,
        signal
      }
    );

    // GitHub returns 204 for contributors of an empty repository.
    if (!pageUsers) break;
    users.push(...pageUsers
      .filter((user) => Number.isSafeInteger(user.id) && user.id > 0 && user.login && user.contributions > 0)
      .map(toPerson));

    if (pageUsers.length < 100) {
      break;
    }
  }

  return users;
}

async function fetchRepositoryContributors(input: {
  token: string;
  owner: string;
  name: string;
  signal?: AbortSignal;
}) {
  return fetchPaginatedUsers(
    input.token,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/contributors?anon=false`,
    input.signal
  );
}

function suggestionKey(person: GitHubPersonSuggestion) {
  return person.githubUserId ? `id:${person.githubUserId}` : `login:${person.username.toLowerCase()}`;
}

function uniquePeople(people: GitHubPersonSuggestion[]) {
  const seen = new Set<string>();
  const unique: GitHubPersonSuggestion[] = [];

  for (const person of people) {
    const key = suggestionKey(person);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(person);
  }

  return unique.sort((left, right) => left.username.localeCompare(right.username));
}

function readableGitHubError(error: unknown, label: string) {
  if (error instanceof GitHubApiError && (error.status === 403 || error.status === 404)) {
    return `${label} could not be loaded from GitHub. Check the GitHub App permissions and organization access.`;
  }

  if (error instanceof Error) {
    return `${label} could not be loaded from GitHub: ${error.message}`;
  }

  return `${label} could not be loaded from GitHub.`;
}

export async function fetchRepositoryPeopleSuggestions(input: {
  token: string;
  owner: string;
  name: string;
  signal?: AbortSignal;
}): Promise<RepositoryPeopleSuggestions> {
  const errors: string[] = [];
  let repositoryContributors: GitHubPersonSuggestion[] = [];

  try {
    repositoryContributors = uniquePeople(
      await fetchRepositoryContributors({
        token: input.token,
        owner: input.owner,
        name: input.name,
        signal: input.signal
      })
    );
  } catch (error) {
    errors.push(readableGitHubError(error, "Repository contributors"));
  }

  return {
    suggestedContributors: repositoryContributors,
    accessWithoutContributions: [],
    allPeople: repositoryContributors,
    errors
  };
}

export async function getRepositoryPeopleSuggestions(repositoryId: string): Promise<RepositoryPeopleSuggestions> {
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id: repositoryId },
    include: {
      installation: true
    }
  });
  const token = await getInstallationAccessToken(repository.installation.installationId);

  return fetchRepositoryPeopleSuggestions({
    token,
    owner: repository.owner,
    name: repository.name
  });
}
