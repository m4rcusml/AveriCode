import Image from "next/image";
import Link from "next/link";
import { Github, LogOut } from "lucide-react";
import { getAuthSession } from "@/lib/auth";

export async function AuthControls() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return (
      <Link className="button button-primary" href="/api/auth/signin">
        <Github aria-hidden size={16} />
        Sign in
      </Link>
    );
  }

  return (
    <div className="auth-controls">
      {session.user.image ? (
        <Image
          alt=""
          className="avatar"
          height={32}
          src={session.user.image}
          width={32}
        />
      ) : null}
      <div className="identity">
        <span>{session.user.name ?? session.user.githubUsername ?? session.user.email}</span>
      </div>
      <Link className="button button-secondary" href="/api/auth/signout">
        <LogOut aria-hidden size={16} />
        Sign out
      </Link>
    </div>
  );
}
