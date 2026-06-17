export function getGitHubAppInstallUrl(workspaceId: string) {
  const slug = process.env.GITHUB_APP_SLUG?.trim();

  if (!slug) {
    return null;
  }

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", workspaceId);
  return url.toString();
}
