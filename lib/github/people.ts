import { GitHubApiError, getInstallationAccessToken, githubRequest } from "@/lib/github/app-auth";
import { prisma } from "@/lib/prisma";

type GitHubUserResponse = {
  id: number;
  login: string;
  avatar_url: string | null;
};

export type GitHubPersonSuggestion = {
  githubUserId: string;
  username: string;
  avatarUrl: string | null;
};

type RepositoryPeopleSuggestions = {
  suggestedContributors: GitHubPersonSuggestion[];
  accessWithoutContributions: GitHubPersonSuggestion[];
  errors: string[];
};

function toPerson(user: GitHubUserResponse): GitHubPersonSuggestion {
  return {
    githubUserId: String(user.id),
    username: user.login,
    avatarUrl: user.avatar_url
  };
}

async function fetchPaginatedUsers(token: string, path: string) {
  const users: GitHubPersonSuggestion[] = [];

  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const pageUsers = await githubRequest<GitHubUserResponse[]>(
      `${path}${separator}per_page=100&page=${page}`,
      {
        bearerToken: token
      }
    );

    users.push(...pageUsers.map(toPerson));

    if (pageUsers.length < 100) {
      break;
    }
  }

  return users;
}

async function fetchRepositoryCollaborators(input: {
  token: string;
  owner: string;
  name: string;
}) {
  return fetchPaginatedUsers(
    input.token,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/collaborators?affiliation=all`
  );
}

async function fetchRepositoryContributors(input: {
  token: string;
  owner: string;
  name: string;
}) {
  return fetchPaginatedUsers(
    input.token,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/contributors?anon=false`
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

export async function getRepositoryPeopleSuggestions(repositoryId: string): Promise<RepositoryPeopleSuggestions> {
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id: repositoryId },
    include: {
      installation: true
    }
  });
  const token = await getInstallationAccessToken(repository.installation.installationId);
  const errors: string[] = [];
  let repositoryCollaborators: GitHubPersonSuggestion[] = [];
  let repositoryContributors: GitHubPersonSuggestion[] = [];

  try {
    repositoryCollaborators = uniquePeople(
      await fetchRepositoryCollaborators({
        token,
        owner: repository.owner,
        name: repository.name
      })
    );
  } catch (error) {
    errors.push(readableGitHubError(error, "Repository collaborators"));
  }

  try {
    repositoryContributors = uniquePeople(
      await fetchRepositoryContributors({
        token,
        owner: repository.owner,
        name: repository.name
      })
    );
  } catch (error) {
    errors.push(readableGitHubError(error, "Repository contributors"));
  }

  const contributorKeys = new Set(repositoryContributors.map(suggestionKey));
  const suggestedContributors = repositoryCollaborators.filter((collaborator) =>
    contributorKeys.has(suggestionKey(collaborator))
  );
  const accessWithoutContributions = repositoryCollaborators.filter(
    (collaborator) => !contributorKeys.has(suggestionKey(collaborator))
  );

  return {
    suggestedContributors,
    accessWithoutContributions,
    errors
  };
}
