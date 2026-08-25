import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Activity, Database, Github, ShieldCheck } from "lucide-react";
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
          <span className="brand-mark">
            <Image alt="" aria-hidden className="brand-logo" height={34} priority src="/logo.svg" width={42} />
          </span>
          <span className="brand-copy">
            <span className="brand-wordmark"><span>Averi</span><strong>Code</strong></span>
            <span className="brand-tagline">Contributor intelligence</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="page public-page">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span className="signal-square" aria-hidden />
              GitHub activity / 7-day signal
            </p>
            <h1 aria-label="AveriCode" className="page-title public-title">
              <span aria-hidden>Averi</span>
              <strong aria-hidden>Code</strong>
            </h1>
            <p className="hero-thesis">
              Contributor activity, <strong>without blind spots.</strong>
            </p>
            <p className="page-copy hero-description">
              Monitor expected GitHub contributors across repositories and see who committed during the last
              seven days from saved workspace snapshots.
            </p>
            <div className="hero-proof-grid" aria-label="Product principles">
              <div>
                <Database aria-hidden size={17} />
                <span>PostgreSQL snapshots</span>
              </div>
              <div>
                <Activity aria-hidden size={17} />
                <span>Expected contributor signal</span>
              </div>
            </div>
          </div>
          <aside className="login-box">
            <div className="login-box-status">
              <span className="status-light" aria-hidden />
              Secure GitHub connection
              <span className="login-box-index">01</span>
            </div>
            <div className="login-mark" aria-hidden>
              <Image alt="" className="login-mark-logo" height={174} src="/logo.svg" width={214} />
              <span className="login-mark-orbit" />
            </div>
            <p className="login-box-label">Workspace access</p>
            <h2>Start monitoring the signal.</h2>
            <p>
              GitHub OAuth creates your AveriCode session. Repository access is handled separately through the
              AveriCode GitHub App.
            </p>
            <Link className="button button-primary" href="/api/auth/signin">
              <Github aria-hidden size={16} />
              Continue with GitHub
            </Link>
            <div className="login-box-footnote">
              <ShieldCheck aria-hidden size={15} />
              OAuth for identity. GitHub App for repository access.
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
