import { redirect } from "next/navigation";
import Link from "next/link";
import { Github, ShieldCheck } from "lucide-react";
import { getAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAuthSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="page">
      <section className="hero-panel">
        <div>
          <p className="pill">
            <ShieldCheck aria-hidden size={16} />
            PostgreSQL-backed GitHub activity snapshots
          </p>
          <h1 className="page-title">AveriCode</h1>
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
  );
}
