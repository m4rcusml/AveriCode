import { GitHubAccountType, RepositorySelection } from "@prisma/client";
import { addExpectedContributorsToRepository } from "@/lib/contributors";
import { fetchRecentlyUpdatedRepositoryBranches } from "@/lib/github/commits";
import { fetchRepositoryPeopleSuggestions } from "@/lib/github/people";
import { prisma } from "@/lib/prisma";
import {
  getInstallationAccessToken,
  GitHubApiError,
  githubAppRequest,
  githubRequest
} from "@/lib/github/app-auth";

export type GitHubInstallationResponse = {
  id: number;
  repository_selection: "all" | "selected";
  account: {
    login: string;
    type: "User" | "Organization";
  };
};

export type GitHubRepositoryResponse = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string | null;
  owner: {
    login: string;
  };
};

type GitHubRepositoriesResponse = {
  repositories: GitHubRepositoryResponse[];
};

type GitHubInstallationsResponse = {
  installations: GitHubInstallationResponse[];
};

type GitHubOrganizationMembershipResponse = {
  role: "admin" | "member";
  state: string;
};

type ImportedRepository = {
  id: string;
  fullName: string;
  wasExisting: boolean;
  setup: {
    expectedContributorCount: number;
    monitoredBranchCount: number;
    warnings: string[];
  } | null;
};

const AUTO_BRANCH_LIMIT = 5;
const AUTO_BRANCH_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

function mapAccountType(type: GitHubInstallationResponse["account"]["type"]) {
  return type === "Organization" ? GitHubAccountType.ORGANIZATION : GitHubAccountType.USER;
}

function mapRepositorySelection(selection: GitHubInstallationResponse["repository_selection"]) {
  return selection === "all" ? RepositorySelection.ALL : RepositorySelection.SELECTED;
}

export async function fetchGitHubInstallation(installationId: string) {
  return githubAppRequest<GitHubInstallationResponse>(`/app/installations/${installationId}`);
}

export async function fetchGitHubAppInstallations() {
  const installations: GitHubInstallationResponse[] = [];

  for (let page = 1; ; page += 1) {
    const response = await githubAppRequest<GitHubInstallationsResponse>(
      `/app/installations?per_page=100&page=${page}`
    );

    installations.push(...response.installations);

    if (response.installations.length < 100) {
      break;
    }
  }

  return installations;
}

async function fetchInstallationRepositoriesWithToken(token: string) {
  const repositories: GitHubRepositoryResponse[] = [];

  for (let page = 1; ; page += 1) {
    const response = await githubRequest<GitHubRepositoriesResponse>(
      `/installation/repositories?per_page=100&page=${page}`,
      {
        bearerToken: token
      }
    );

    repositories.push(...response.repositories);

    if (response.repositories.length < 100) {
      break;
    }
  }

  return repositories;
}

export async function fetchInstallationRepositories(installationId: string) {
  const token = await getInstallationAccessToken(installationId);
  return fetchInstallationRepositoriesWithToken(token);
}

export async function configureNewRepository(
  repository: {
    id: string;
    defaultBranch: string | null;
    name: string;
    owner: string;
  },
  token: string
) {
  const warnings: string[] = [];
  let expectedContributorCount = 0;
  let monitoredBranchCount = 0;
  const [peopleResult, branchesResult] = await Promise.allSettled([
    fetchRepositoryPeopleSuggestions({
      token,
      owner: repository.owner,
      name: repository.name
    }),
    fetchRecentlyUpdatedRepositoryBranches({
      token,
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.defaultBranch,
      since: new Date(Date.now() - AUTO_BRANCH_LOOKBACK_MS),
      limit: AUTO_BRANCH_LIMIT
    })
  ]);

  if (peopleResult.status === "fulfilled") {
    warnings.push(...peopleResult.value.errors);
    try {
      const addedContributors = await addExpectedContributorsToRepository(
        repository.id,
        peopleResult.value.allPeople
      );
      expectedContributorCount = addedContributors.length;
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Expected contributors could not be saved: ${error.message}`
          : "Expected contributors could not be saved."
      );
    }
  } else {
    warnings.push(
      peopleResult.reason instanceof Error
        ? `Expected contributors could not be configured: ${peopleResult.reason.message}`
        : "Expected contributors could not be configured."
    );
  }

  if (branchesResult.status === "fulfilled") {
    if (branchesResult.value.length > 0) {
      try {
        const result = await prisma.repositoryBranch.createMany({
          data: branchesResult.value.map((branch) => ({
            repositoryId: repository.id,
            name: branch.name
          })),
          skipDuplicates: true
        });
        monitoredBranchCount = result.count;
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Recent branches could not be saved: ${error.message}`
            : "Recent branches could not be saved."
        );
      }
    }
  } else {
    warnings.push(
      branchesResult.reason instanceof Error
        ? `Recent branches could not be configured: ${branchesResult.reason.message}`
        : "Recent branches could not be configured."
    );
  }

  return {
    expectedContributorCount,
    monitoredBranchCount,
    warnings
  };
}

async function isUserOrganizationAdminForInstallation(
  installationId: string,
  organization: string,
  username: string
) {
  const token = await getInstallationAccessToken(installationId);

  try {
    const membership = await githubRequest<GitHubOrganizationMembershipResponse>(
      `/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(username)}`,
      {
        bearerToken: token
      }
    );

    return membership.state === "active" && membership.role === "admin";
  } catch (error) {
    if (error instanceof GitHubApiError && [403, 404].includes(error.status)) {
      return false;
    }

    throw error;
  }
}

export async function userOwnsGitHubInstallation(
  installation: GitHubInstallationResponse,
  username: string
) {
  if (installation.account.type === "User") {
    return installation.account.login.toLowerCase() === username.toLowerCase();
  }

  return isUserOrganizationAdminForInstallation(
    String(installation.id),
    installation.account.login,
    username
  );
}

export async function importInstallationRepositories(githubInstallationId: string) {
  const installation = await prisma.gitHubInstallation.findUniqueOrThrow({
    where: { id: githubInstallationId }
  });
  const token = await getInstallationAccessToken(installation.installationId);
  const [githubInstallation, repositories] = await Promise.all([
    fetchGitHubInstallation(installation.installationId),
    fetchInstallationRepositoriesWithToken(token)
  ]);
  const repositoriesById = new Map(
    repositories.map((repository) => [String(repository.id), repository])
  );
  const repositoryIds = [...repositoriesById.keys()];

  await prisma.gitHubInstallation.update({
    where: { id: installation.id },
    data: {
      accountLogin: githubInstallation.account.login,
      accountType: mapAccountType(githubInstallation.account.type),
      repositorySelection: mapRepositorySelection(githubInstallation.repository_selection)
    }
  });

  await prisma.repository.deleteMany({
    where: {
      githubInstallationId: installation.id,
      ...(repositoryIds.length > 0
        ? {
            githubRepoId: {
              notIn: repositoryIds
            }
          }
        : {})
    }
  });

  const existingRepositories = await prisma.repository.findMany({
    where: {
      githubInstallationId: installation.id
    },
    select: {
      id: true,
      githubRepoId: true
    }
  });
  const importedRepositories: ImportedRepository[] = [];

  for (const existingRepository of existingRepositories) {
    const repository = repositoriesById.get(existingRepository.githubRepoId);

    if (!repository) {
      continue;
    }

    const savedRepository = await prisma.repository.update({
      where: { id: existingRepository.id },
      data: {
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        defaultBranch: repository.default_branch,
        isActive: true
      }
    });

    importedRepositories.push({
      id: savedRepository.id,
      fullName: savedRepository.fullName,
      wasExisting: true,
      setup: null
    });
  }

  return importedRepositories;
}
