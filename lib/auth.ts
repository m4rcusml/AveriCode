import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkspaceForUser } from "@/lib/workspaces";

type GitHubProfile = {
  id?: number | string;
  login?: string;
  name?: string | null;
};

function githubClientId() {
  return process.env.GITHUB_OAUTH_CLIENT_ID ?? process.env.GITHUB_APP_CLIENT_ID ?? "";
}

function githubClientSecret() {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET ?? process.env.GITHUB_APP_CLIENT_SECRET ?? "";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database"
  },
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  providers: [
    GitHubProvider({
      clientId: githubClientId(),
      clientSecret: githubClientSecret(),
      allowDangerousEmailAccountLinking: true
    })
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.githubUsername = user.githubUsername;
      }

      return session;
    }
  },
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id) {
        return;
      }

      if (account?.provider === "github") {
        const githubProfile = profile as GitHubProfile | undefined;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            githubUserId: githubProfile?.id ? String(githubProfile.id) : undefined,
            githubUsername: githubProfile?.login ?? undefined
          }
        });
      }

      await ensureDefaultWorkspaceForUser(user.id, user.name);
    }
  }
};

export function getAuthSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new Error("Authentication required.");
  }

  return session.user;
}
