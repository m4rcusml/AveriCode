import { GitHubAccountType, RepositorySelection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getInstallationAccessToken,
  GitHubApiError,
  githubAppRequest,
  githubRequest
} from "@/lib/github/app-auth";

type GitHubInstallationResponse = {
  id: number;
  repository_selection: "all" | "selected";
  account: {
    login: string;
    type: "User" | "Organization";
  };
};

type GitHubRepositoryResponse = {
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
};

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

export async function fetchInstallationRepositories(installationId: string) {
  const token = await getInstallationAccessToken(installationId);
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

async function userOwnsGitHubInstallation(installation: GitHubInstallationResponse, username: string) {
  if (installation.account.type === "User") {
    return installation.account.login.toLowerCase() === username.toLowerCase();
  }

  return isUserOrganizationAdminForInstallation(
    String(installation.id),
    installation.account.login,
    username
  );
}

export async function persistInstallationFromSetup(workspaceId: string, installationId: string) {
  const installation = await fetchGitHubInstallation(installationId);

  const savedInstallation = await prisma.gitHubInstallation.upsert({
    where: {
      workspaceId_installationId: {
        workspaceId,
        installationId
      }
    },
    update: {
      accountLogin: installation.account.login,
      accountType: mapAccountType(installation.account.type),
      repositorySelection: mapRepositorySelection(installation.repository_selection)
    },
    create: {
      workspaceId,
      installationId,
      accountLogin: installation.account.login,
      accountType: mapAccountType(installation.account.type),
      repositorySelection: mapRepositorySelection(installation.repository_selection)
    }
  });

  const importedRepositories = await importInstallationRepositories(savedInstallation.id);

  return {
    installation: savedInstallation,
    importedCount: importedRepositories.length,
    importedRepositories,
    newRepositories: importedRepositories.filter((repository) => !repository.wasExisting)
  };
}

export async function importOwnerGitHubInstallationsForWorkspace(userId: string, workspaceId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      githubUsername: true
    }
  });
  const username = user?.githubUsername;

  if (!username) {
    return [];
  }

  const installations = await fetchGitHubAppInstallations();
  const importedInstallations = [];

  for (const installation of installations) {
    if (!(await userOwnsGitHubInstallation(installation, username))) {
      continue;
    }

    importedInstallations.push(
      await persistInstallationFromSetup(workspaceId, String(installation.id))
    );
  }

  return importedInstallations;
}

export async function importInstallationRepositories(githubInstallationId: string) {
  const installation = await prisma.gitHubInstallation.findUniqueOrThrow({
    where: { id: githubInstallationId }
  });
  const [githubInstallation, repositories] = await Promise.all([
    fetchGitHubInstallation(installation.installationId),
    fetchInstallationRepositories(installation.installationId)
  ]);
  const repositoryIds = repositories.map((repository) => String(repository.id));

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
      workspaceId: installation.workspaceId,
      githubRepoId: {
        in: repositoryIds
      }
    },
    select: {
      githubRepoId: true
    }
  });
  const existingRepositoryIds = new Set(
    existingRepositories.map((repository) => repository.githubRepoId)
  );
  const importedRepositories: ImportedRepository[] = [];

  for (const repository of repositories) {
    const savedRepository = await prisma.repository.upsert({
      where: {
        workspaceId_githubRepoId: {
          workspaceId: installation.workspaceId,
          githubRepoId: String(repository.id)
        }
      },
      update: {
        githubInstallationId: installation.id,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        defaultBranch: repository.default_branch
      },
      create: {
        workspaceId: installation.workspaceId,
        githubInstallationId: installation.id,
        githubRepoId: String(repository.id),
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        defaultBranch: repository.default_branch
      }
    });

    importedRepositories.push({
      id: savedRepository.id,
      fullName: savedRepository.fullName,
      wasExisting: existingRepositoryIds.has(savedRepository.githubRepoId)
    });
  }

  return importedRepositories;
}
