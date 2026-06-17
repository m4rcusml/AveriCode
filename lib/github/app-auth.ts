import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";

const GITHUB_API_URL = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

async function getGitHubPrivateKey() {
  const inlineKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();

  if (inlineKey) {
    return inlineKey.replace(/\\n/g, "\n");
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();

  if (keyPath) {
    return readFile(keyPath, "utf8");
  }

  throw new Error("Missing GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH.");
}

export async function createGitHubAppJwt() {
  const appId = process.env.GITHUB_APP_ID;

  if (!appId) {
    throw new Error("Missing GITHUB_APP_ID.");
  }

  const privateKey = await getGitHubPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId
    },
    privateKey,
    {
      algorithm: "RS256"
    }
  );
}

type GitHubRequestInit = RequestInit & {
  bearerToken: string;
};

export async function githubRequest<T>(path: string, init: GitHubRequestInit) {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${init.bearerToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GitHubApiError(`GitHub API request failed: ${response.status}`, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function githubAppRequest<T>(path: string, init?: RequestInit) {
  const bearerToken = await createGitHubAppJwt();
  return githubRequest<T>(path, {
    ...init,
    bearerToken
  });
}

type InstallationTokenResponse = {
  token: string;
  expires_at: string;
};

export async function getInstallationAccessToken(installationId: string) {
  const response = await githubAppRequest<InstallationTokenResponse>(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST"
    }
  );

  return response.token;
}

export async function githubInstallationRequest<T>(
  installationId: string,
  path: string,
  init?: RequestInit
) {
  const bearerToken = await getInstallationAccessToken(installationId);
  return githubRequest<T>(path, {
    ...init,
    bearerToken
  });
}
