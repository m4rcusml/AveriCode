import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Profile } from "next-auth";

const mocks = vi.hoisted(() => ({
  ensureDefaultWorkspaceForUser: vi.fn(),
  prisma: { user: { update: vi.fn() }, account: { updateMany: vi.fn() } }
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/workspaces", () => ({ ensureDefaultWorkspaceForUser: mocks.ensureDefaultWorkspaceForUser }));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));

describe("GitHub authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  test("falls back to GitHub App credentials when OAuth env entries are blank", async () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "  ");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "app-client");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "app-secret");
    const { authOptions } = await import("@/lib/auth");
    const provider = authOptions.providers[0] as {
      options: { clientId: string; clientSecret: string; allowDangerousEmailAccountLinking?: boolean };
    };

    expect(provider.options.clientId).toBe("app-client");
    expect(provider.options.clientSecret).toBe("app-secret");
    expect(provider.options.allowDangerousEmailAccountLinking).not.toBe(true);
  });

  test("prefers explicit OAuth credentials and updates only the authenticated GitHub account on reauthorization", async () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "oauth-client");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "oauth-secret");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "app-client");
    const { authOptions } = await import("@/lib/auth");
    const provider = authOptions.providers[0] as { options: { clientId: string } };
    expect(provider.options.clientId).toBe("oauth-client");
    const profile = { id: 42, login: "octocat" } as Profile;

    await authOptions.events?.signIn?.({
      user: { id: "user-1", name: "Octocat" },
      account: {
        provider: "github", type: "oauth", providerAccountId: "42",
        access_token: "fresh-token", refresh_token: "fresh-refresh", expires_at: 123456, scope: "read:user"
      },
      profile,
      isNewUser: false
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { githubUserId: "42", githubUsername: "octocat" }
    });
    expect(mocks.prisma.account.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "github", providerAccountId: "42" },
      data: expect.objectContaining({ access_token: "fresh-token", refresh_token: "fresh-refresh", expires_at: 123456 })
    });
    expect(mocks.ensureDefaultWorkspaceForUser).toHaveBeenCalledWith("user-1", "Octocat");
  });
});
