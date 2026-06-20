import Link from "next/link";
import { Activity, Code2, Settings } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";
import { NavLink } from "@/components/nav-link";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">
            <Code2 aria-hidden size={19} />
          </span>
          AveriCode
        </Link>
        <WorkspaceSwitcher />
        <nav className="nav" aria-label="Primary navigation">
          <NavLink exact href="/dashboard">
            <Activity aria-hidden size={16} />
            Dashboard
          </NavLink>
          <NavLink href="/settings">
            <Settings aria-hidden size={16} />
            Settings
          </NavLink>
        </nav>
        <AuthControls />
      </header>
      {children}
    </div>
  );
}
