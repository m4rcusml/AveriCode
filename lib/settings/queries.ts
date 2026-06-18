import type { GitHubAccountType, RepositorySelection, WorkspaceRole } from "@prisma/client";
import { getGitHubAppInstallUrl } from "@/lib/github/install-url";
import { prisma } from "@/lib/prisma";
import { getSelectedWorkspaceForUser } from "@/lib/workspace-selection";

export type SettingsWorkspace = {
  id: string;
  name: string;
  ownerId: string;
  slug: string;
};

export type SettingsMember = {
  id: string;
  createdAt: Date;
  email: string | null;
  githubUsername: string | null;
  isCurrentUser: boolean;
  isOwner: boolean;
  name: string | null;
  ownedRepositoryCount: number;
  role: WorkspaceRole;
  userId: string;
};

export type SettingsInstallation = {
  id: string;
  accountLogin: string;
  accountType: GitHubAccountType;
  installationId: string;
  lastRepositorySyncAt: Date | null;
  monitoredRepositoryCount: number;
  repositoryCount: number;
  repositorySelection: RepositorySelection;
};

export type SettingsSystemConfig = {
  isConfigured: boolean;
  label: string;
};

export type SettingsData = {
  canManageWorkspace: boolean;
  installUrl: string | null;
  installations: SettingsInstallation[];
  metrics: {
    githubAccountCount: number;
    memberCount: number;
    monitoredRepositoryCount: number;
    organizationCount: number;
    repositoryCount: number;
  };
  members: SettingsMember[];
  systemConfig: SettingsSystemConfig[];
  workspace: SettingsWorkspace;
};

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function latestDate(values: Array<Date | null>) {
  const timestamps = values
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

export function userLabel(user: { email: string | null; githubUsername: string | null; name: string | null }) {
  return user.name ?? user.githubUsername ?? user.email ?? "Unknown user";
}

export async function getSettingsData(userId: string): Promise<SettingsData> {
  const workspace = await getSelectedWorkspaceForUser(userId);
  const [rawInstallations, rawMembers] = await Promise.all([
    prisma.gitHubInstallation.findMany({
      where: { workspaceId: workspace.id },
      include: {
        repositories: {
          select: {
            id: true,
            isActive: true,
            lastSyncedAt: true,
            owner: true
          }
        }
      },
      orderBy: [{ accountType: "asc" }, { accountLogin: "asc" }]
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: true
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    })
  ]);
  const repositories = rawInstallations.flatMap((installation) => installation.repositories);
  const monitoredRepositoryCount = repositories.filter((repository) => repository.isActive).length;
  const organizationCount = rawInstallations.filter(
    (installation) => installation.accountType === "ORGANIZATION"
  ).length;
  const currentMembership = rawMembers.find((member) => member.userId === userId);
  const canManageWorkspace = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const repositoriesByOwner = new Map<string, number>();

  for (const repository of repositories) {
    const owner = repository.owner.toLowerCase();
    repositoriesByOwner.set(owner, (repositoriesByOwner.get(owner) ?? 0) + 1);
  }

  return {
    canManageWorkspace,
    installUrl: getGitHubAppInstallUrl(workspace.id),
    installations: rawInstallations.map((installation): SettingsInstallation => ({
      id: installation.id,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      installationId: installation.installationId,
      lastRepositorySyncAt: latestDate(installation.repositories.map((repository) => repository.lastSyncedAt)),
      monitoredRepositoryCount: installation.repositories.filter((repository) => repository.isActive).length,
      repositoryCount: installation.repositories.length,
      repositorySelection: installation.repositorySelection
    })),
    members: rawMembers.map((member): SettingsMember => ({
      id: member.id,
      createdAt: member.createdAt,
      email: member.user.email,
      githubUsername: member.user.githubUsername,
      isCurrentUser: member.userId === userId,
      isOwner: member.userId === workspace.ownerId,
      name: member.user.name,
      ownedRepositoryCount: member.user.githubUsername
        ? repositoriesByOwner.get(member.user.githubUsername.toLowerCase()) ?? 0
        : 0,
      role: member.role,
      userId: member.userId
    })),
    metrics: {
      githubAccountCount: rawInstallations.length,
      memberCount: rawMembers.length,
      monitoredRepositoryCount,
      organizationCount,
      repositoryCount: repositories.length
    },
    systemConfig: [
      {
        label: "DATABASE_URL",
        isConfigured: configured(process.env.DATABASE_URL)
      },
      {
        label: "NEXTAUTH_SECRET or AUTH_SECRET",
        isConfigured: configured(process.env.NEXTAUTH_SECRET) || configured(process.env.AUTH_SECRET)
      },
      {
        label: "GitHub OAuth client id",
        isConfigured:
          configured(process.env.GITHUB_OAUTH_CLIENT_ID) || configured(process.env.GITHUB_APP_CLIENT_ID)
      },
      {
        label: "GitHub OAuth client secret",
        isConfigured:
          configured(process.env.GITHUB_OAUTH_CLIENT_SECRET) ||
          configured(process.env.GITHUB_APP_CLIENT_SECRET)
      },
      {
        label: "GITHUB_APP_ID",
        isConfigured: configured(process.env.GITHUB_APP_ID)
      },
      {
        label: "GITHUB_APP_SLUG",
        isConfigured: configured(process.env.GITHUB_APP_SLUG)
      },
      {
        label: "GitHub App private key",
        isConfigured:
          configured(process.env.GITHUB_APP_PRIVATE_KEY) ||
          configured(process.env.GITHUB_APP_PRIVATE_KEY_PATH)
      },
      {
        label: "GITHUB_APP_WEBHOOK_SECRET",
        isConfigured: configured(process.env.GITHUB_APP_WEBHOOK_SECRET)
      }
    ],
    workspace: {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
      slug: workspace.slug
    }
  };
}
