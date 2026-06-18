import { GitHubAccountType } from "@prisma/client";

export function getGitHubAppInstallUrl(workspaceId: string) {
  const slug = process.env.GITHUB_APP_SLUG?.trim();

  if (!slug) {
    return null;
  }

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", workspaceId);
  return url.toString();
}

export function getGitHubInstallationSettingsUrl(input: {
  accountLogin: string;
  accountType: GitHubAccountType;
  installationId: string;
}) {
  if (input.accountType === "ORGANIZATION") {
    return `https://github.com/organizations/${encodeURIComponent(
      input.accountLogin
    )}/settings/installations/${encodeURIComponent(input.installationId)}`;
  }

  return `https://github.com/settings/installations/${encodeURIComponent(input.installationId)}`;
}
