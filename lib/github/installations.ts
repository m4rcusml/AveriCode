import { GitHubAccountType, RepositorySelection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInstallationAccessToken, githubAppRequest, githubRequest } from "@/lib/github/app-auth";

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

export async function importInstallationRepositories(githubInstallationId: string) {
  const installation = await prisma.gitHubInstallation.findUniqueOrThrow({
    where: { id: githubInstallationId }
  });
  const repositories = await fetchInstallationRepositories(installation.installationId);
  const existingRepositories = await prisma.repository.findMany({
    where: {
      workspaceId: installation.workspaceId,
      githubRepoId: {
        in: repositories.map((repository) => String(repository.id))
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
