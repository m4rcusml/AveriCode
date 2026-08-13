import { Prisma, type GitHubAccountType, type RepositorySelection } from "@prisma/client";
import { GitHubApiError, getInstallationAccessToken, githubRequest } from "@/lib/github/app-auth";
import {
  configureNewRepository,
  fetchGitHubAppInstallations,
  fetchGitHubInstallation,
  fetchInstallationRepositories,
  type GitHubInstallationResponse,
  type GitHubRepositoryResponse,
  userOwnsGitHubInstallation
} from "@/lib/github/installations";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembership } from "@/lib/workspaces";

type GitHubIdentity = {
  id: number;
  login: string;
};

function mapAccountType(type: GitHubInstallationResponse["account"]["type"]): GitHubAccountType {
  return type === "Organization" ? "ORGANIZATION" : "USER";
}

function mapRepositorySelection(
  selection: GitHubInstallationResponse["repository_selection"]
): RepositorySelection {
  return selection === "all" ? "ALL" : "SELECTED";
}

function pendingKey(workspaceId: string, githubRepoId: string) {
  return `${workspaceId}:${githubRepoId}`;
}

async function getGitHubOAuthToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true }
  });

  if (!account?.access_token) {
    throw new Error("GitHub authorization is missing. Sign in with GitHub again.");
  }

  return account.access_token;
}

export async function getVerifiedGitHubIdentity(userId: string) {
  const token = await getGitHubOAuthToken(userId);
  let identity: GitHubIdentity;

  try {
    identity = await githubRequest<GitHubIdentity>("/user", { bearerToken: token });
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) {
      throw new Error("GitHub authorization is missing. Sign in with GitHub again.");
    }
    throw error;
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { githubUserId: true }
  });

  if (user.githubUserId && user.githubUserId !== String(identity.id)) {
    throw new Error("GitHub identity does not match the signed-in AveriCode user.");
  }

  return identity;
}

export async function verifyLinkableGitHubInstallation(userId: string, installationId: string) {
  const identity = await getVerifiedGitHubIdentity(userId);
  const installation = await fetchGitHubInstallation(installationId);

  if (!(await userOwnsGitHubInstallation(installation, identity.login))) {
    throw new Error("GitHub installation is not available to this user.");
  }

  return installation;
}

export async function listLinkableGitHubInstallations(userId: string) {
  const identity = await getVerifiedGitHubIdentity(userId);
  const installations = await fetchGitHubAppInstallations();
  const eligible: GitHubInstallationResponse[] = [];

  for (const installation of installations) {
    if (await userOwnsGitHubInstallation(installation, identity.login)) {
      eligible.push(installation);
    }
  }

  return eligible;
}

export async function listSelectableInstallationRepositories(input: {
  userId: string;
  workspaceId: string;
  installationId: string;
}) {
  const membership = await getWorkspaceMembership(input.userId, input.workspaceId);
  if (!membership) throw new Error("Workspace access denied.");
  const installation = await verifyLinkableGitHubInstallation(input.userId, input.installationId);
  const repositories = await fetchInstallationRepositories(input.installationId);
  const [existing, pending] = await Promise.all([
    prisma.repository.findMany({
      where: { workspaceId: input.workspaceId },
      select: { githubRepoId: true }
    }),
    prisma.repositoryAccessRequestItem.findMany({
      where: { pendingKey: { not: null }, request: { workspaceId: input.workspaceId } },
      select: { githubRepoId: true }
    })
  ]);
  const unavailableIds = new Set([
    ...existing.map((repository) => repository.githubRepoId),
    ...pending.map((item) => item.githubRepoId)
  ]);

  return {
    installation,
    repositories: repositories.map((repository) => ({
      ...repository,
      unavailable: unavailableIds.has(String(repository.id))
    }))
  };
}

async function upsertInstallation(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  installation: GitHubInstallationResponse
) {
  return tx.gitHubInstallation.upsert({
    where: {
      workspaceId_installationId: {
        workspaceId,
        installationId: String(installation.id)
      }
    },
    update: {
      accountLogin: installation.account.login,
      accountType: mapAccountType(installation.account.type),
      repositorySelection: mapRepositorySelection(installation.repository_selection)
    },
    create: {
      workspaceId,
      installationId: String(installation.id),
      accountLogin: installation.account.login,
      accountType: mapAccountType(installation.account.type),
      repositorySelection: mapRepositorySelection(installation.repository_selection)
    }
  });
}

async function saveRepositories(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  installationRecordId: string,
  repositories: GitHubRepositoryResponse[]
) {
  const saved = [];

  for (const repository of repositories) {
    saved.push(
      await tx.repository.upsert({
        where: {
          workspaceId_githubRepoId: {
            workspaceId,
            githubRepoId: String(repository.id)
          }
        },
        update: {
          githubInstallationId: installationRecordId,
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          private: repository.private,
          defaultBranch: repository.default_branch,
          isActive: true
        },
        create: {
          workspaceId,
          githubInstallationId: installationRecordId,
          githubRepoId: String(repository.id),
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          private: repository.private,
          defaultBranch: repository.default_branch,
          isActive: true
        }
      })
    );
  }

  return saved;
}

function selectRepositories(repositories: GitHubRepositoryResponse[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const matches = repositories.filter((repository) => selected.has(String(repository.id)));

  if (matches.length !== selected.size || matches.length === 0) {
    throw new Error("One or more selected repositories are no longer accessible.");
  }

  return matches;
}

export async function connectRepositoriesToWorkspace(input: {
  userId: string;
  workspaceId: string;
  installationId: string;
  githubRepoIds: string[];
}) {
  const membership = await getWorkspaceMembership(input.userId, input.workspaceId);
  if (!membership) throw new Error("Workspace access denied.");
  const installation = await verifyLinkableGitHubInstallation(input.userId, input.installationId);
  const availableRepositories = await fetchInstallationRepositories(input.installationId);
  const selectedRepositories = selectRepositories(availableRepositories, [...new Set(input.githubRepoIds)]);
  const existingCount = await prisma.repository.count({
    where: {
      workspaceId: input.workspaceId,
      githubRepoId: { in: selectedRepositories.map((repository) => String(repository.id)) }
    }
  });
  if (existingCount > 0) throw new Error("A selected repository is already connected to this workspace.");
  const pendingCount = await prisma.repositoryAccessRequestItem.count({
    where: {
      pendingKey: {
        in: selectedRepositories.map((repository) => pendingKey(input.workspaceId, String(repository.id)))
      }
    }
  });
  if (pendingCount > 0) throw new Error("A selected repository already has a pending request.");
  const currentMembership = await getWorkspaceMembership(input.userId, input.workspaceId);
  if (!currentMembership) throw new Error("Workspace access denied.");

  if (currentMembership.role === "MEMBER") {
    try {
      const request = await prisma.repositoryAccessRequest.create({
        data: {
          workspaceId: input.workspaceId,
          requesterId: input.userId,
          installationId: String(installation.id),
          accountLogin: installation.account.login,
          accountType: mapAccountType(installation.account.type),
          repositorySelection: mapRepositorySelection(installation.repository_selection),
          items: {
            create: selectedRepositories.map((repository) => ({
              githubRepoId: String(repository.id),
              owner: repository.owner.login,
              name: repository.name,
              fullName: repository.full_name,
              private: repository.private,
              defaultBranch: repository.default_branch,
              pendingKey: pendingKey(input.workspaceId, String(repository.id))
            }))
          }
        },
        include: { items: true }
      });
      return { kind: "request" as const, request };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("A selected repository already has a pending request.");
      }
      throw error;
    }
  }

  const savedRepositories = await prisma.$transaction(async (tx) => {
    const savedInstallation = await upsertInstallation(tx, input.workspaceId, installation);
    return saveRepositories(tx, input.workspaceId, savedInstallation.id, selectedRepositories);
  });
  const token = await getInstallationAccessToken(input.installationId);
  await Promise.all(
    savedRepositories.map((repository) =>
      configureNewRepository(
        { id: repository.id, owner: repository.owner, name: repository.name, defaultBranch: repository.defaultBranch },
        token
      )
    )
  );
  return { kind: "connected" as const, repositories: savedRepositories };
}

export async function resolveRepositoryAccessRequest(input: {
  reviewerUserId: string;
  requestId: string;
  approvedItemIds: string[];
}) {
  const request = await prisma.repositoryAccessRequest.findUnique({
    where: { id: input.requestId },
    include: {
      workspace: { select: { ownerId: true } },
      requester: { select: { id: true } },
      items: true
    }
  });
  if (!request || request.status !== "PENDING") throw new Error("Pending request not found.");
  if (request.workspace.ownerId !== input.reviewerUserId) throw new Error("Workspace owner role required.");
  const requesterMembership = await getWorkspaceMembership(request.requesterId, request.workspaceId);
  if (!requesterMembership) throw new Error("The requester is no longer a workspace member.");
  const installation = await verifyLinkableGitHubInstallation(request.requesterId, request.installationId);
  const accessibleRepositories = await fetchInstallationRepositories(request.installationId);
  const accessibleById = new Map(accessibleRepositories.map((repository) => [String(repository.id), repository]));
  const approvedIds = new Set(input.approvedItemIds);
  if ([...approvedIds].some((id) => !request.items.some((item) => item.id === id))) {
    throw new Error("An approved request item is invalid.");
  }
  const approvedItems = request.items.filter((item) => approvedIds.has(item.id));
  const approvedRepositories = approvedItems.map((item) => accessibleById.get(item.githubRepoId));
  if (approvedRepositories.some((repository) => !repository)) {
    throw new Error("An approved repository is no longer accessible. Review the selection and try again.");
  }
  const currentRequesterMembership = await getWorkspaceMembership(
    request.requesterId,
    request.workspaceId
  );
  if (!currentRequesterMembership) throw new Error("The requester is no longer a workspace member.");
  const currentRequest = await prisma.repositoryAccessRequest.findUnique({
    where: { id: request.id },
    select: { status: true }
  });
  if (currentRequest?.status !== "PENDING") throw new Error("Pending request not found.");
  const existingCount = approvedItems.length
    ? await prisma.repository.count({
        where: { workspaceId: request.workspaceId, githubRepoId: { in: approvedItems.map((item) => item.githubRepoId) } }
      })
    : 0;
  if (existingCount > 0) throw new Error("An approved repository is already connected to this workspace.");

  const result = await prisma.$transaction(async (tx) => {
    const savedInstallation = approvedItems.length
      ? await upsertInstallation(tx, request.workspaceId, installation)
      : null;
    const savedRepositories = savedInstallation
      ? await saveRepositories(
          tx,
          request.workspaceId,
          savedInstallation.id,
          approvedRepositories as GitHubRepositoryResponse[]
        )
      : [];
    const savedByGithubId = new Map(savedRepositories.map((repository) => [repository.githubRepoId, repository]));

    for (const item of request.items) {
      const approved = approvedIds.has(item.id);
      await tx.repositoryAccessRequestItem.update({
        where: { id: item.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          repositoryId: approved ? savedByGithubId.get(item.githubRepoId)?.id : null,
          pendingKey: null
        }
      });
    }

    const status = approvedItems.length === 0
      ? "REJECTED"
      : approvedItems.length === request.items.length
        ? "APPROVED"
        : "PARTIALLY_APPROVED";
    await tx.repositoryAccessRequest.update({
      where: { id: request.id },
      data: { status, reviewedById: input.reviewerUserId, reviewedAt: new Date() }
    });
    return { status, savedRepositories };
  });

  if (result.savedRepositories.length > 0) {
    const token = await getInstallationAccessToken(request.installationId);
    await Promise.all(
      result.savedRepositories.map((repository) =>
        configureNewRepository(
          { id: repository.id, owner: repository.owner, name: repository.name, defaultBranch: repository.defaultBranch },
          token
        )
      )
    );
  }
  return result;
}
