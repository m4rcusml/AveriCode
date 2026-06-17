import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Code2, GitBranch, Settings, Users } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";
import "./globals.css";

export const metadata: Metadata = {
  title: "AveriCode",
  description: "Weekly GitHub contributor activity monitoring."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/dashboard">
              <span className="brand-mark">
                <Code2 aria-hidden size={19} />
              </span>
              AveriCode
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/dashboard">
                <Activity aria-hidden size={16} />
                Dashboard
              </Link>
              <Link href="/dashboard/repositories">
                <GitBranch aria-hidden size={16} />
                Repositories
              </Link>
              <Link href="/dashboard/contributors">
                <Users aria-hidden size={16} />
                Contributors
              </Link>
              <Link href="/settings">
                <Settings aria-hidden size={16} />
                Settings
              </Link>
            </nav>
            <AuthControls />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
