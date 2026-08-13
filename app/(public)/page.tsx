import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Github, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAuthSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <Link className="brand" href="/">
          <Image alt="" aria-hidden className="brand-logo" height={34} priority src="/logo.svg" width={42} />
          AveriCode
        </Link>
        <ThemeToggle />
      </header>
      <main className="page public-page">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="pill hero-kicker">
              <ShieldCheck aria-hidden size={16} />
              PostgreSQL-backed GitHub activity snapshots
            </p>
            <h1 className="page-title public-title">AveriCode</h1>
            <p className="page-copy">
              Monitor expected GitHub contributors across repositories and see who committed during the last
              seven days from saved workspace snapshots.
            </p>
          </div>
          <div className="login-box">
            <h2>Sign in with GitHub</h2>
            <p>
              GitHub OAuth creates your AveriCode session. Repository access is handled separately through the
              AveriCode GitHub App.
            </p>
            <Link className="button button-primary" href="/api/auth/signin">
              <Github aria-hidden size={16} />
              Continue with GitHub
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
