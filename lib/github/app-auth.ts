import { readFile } from "node:fs/promises";
import { createPrivateKey } from "node:crypto";
import jwt from "jsonwebtoken";

const GITHUB_API_URL = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  responseBody: string;
  retryAfterMs: number | null;

  constructor(message: string, status: number, responseBody: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfterMs = retryAfterMs;
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

  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error(
      "Invalid GitHub App private key. Use GITHUB_APP_PRIVATE_KEY with escaped \\n line breaks, quote the full multiline PEM value, or set GITHUB_APP_PRIVATE_KEY_PATH to the downloaded .pem file."
    );
  }

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
  const { bearerToken, ...requestInit } = init;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${bearerToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "AveriCode");
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...requestInit,
    headers,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    const rateLimited = response.status === 429 || (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after") || /rate limit/i.test(body)));
    let retryAfterMs: number | null = null;
    if (rateLimited) {
      const retryAfter = response.headers.get("retry-after");
      const reset = response.headers.get("x-ratelimit-reset");
      retryAfterMs = retryAfter && Number.isFinite(Number(retryAfter))
        ? Math.max(0, Number(retryAfter) * 1000)
        : reset && Number.isFinite(Number(reset))
          ? Math.max(0, Number(reset) * 1000 - Date.now())
          : 60_000;
    }
    const message = rateLimited
      ? `GitHub API rate limit reached. Try again in ${Math.ceil(retryAfterMs! / 60_000)} minute(s).`
      : response.status === 401
        ? "GitHub authorization expired or was revoked. Reconnect GitHub and try again."
        : response.status === 403
          ? "GitHub denied access. Check the App permissions and installation status."
          : `GitHub API request failed: ${response.status}`;
    throw new GitHubApiError(message, response.status, body, retryAfterMs);
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

export async function getInstallationAccessToken(installationId: string, init?: { signal?: AbortSignal }) {
  const response = await githubAppRequest<InstallationTokenResponse>(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      signal: init?.signal
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
