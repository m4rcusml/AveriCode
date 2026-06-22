import Image from "next/image";
import Link from "next/link";
import { Activity, Settings } from "lucide-react";
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
          <Image alt="" aria-hidden className="brand-logo" height={34} priority src="/logo.svg" width={42} />
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
