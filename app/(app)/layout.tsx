import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, LayoutDashboard, Settings, Users } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";
import { NavLink } from "@/components/nav-link";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="app-shell"><a className="skip-link" href="#main-content">Pular para o conteúdo</a><aside className="app-sidebar"><Link className="brand" href="/dashboard"><Image alt="" aria-hidden height={32} width={32} src="/logo.svg" priority /><span className="brand-wordmark">Averi<strong>Code</strong></span></Link><div className="sidebar-workspace"><WorkspaceSwitcher /></div><nav className="nav" aria-label="Navegação principal"><NavLink exact href="/dashboard"><LayoutDashboard aria-hidden size={17} />Portfólio</NavLink><Link href="/dashboard#updates"><ArrowUpRight aria-hidden size={17} />Atualizações</Link><Link href="/dashboard?view=people"><Users aria-hidden size={17} />Pessoas</Link><NavLink href="/settings"><Settings aria-hidden size={17} />Configurações</NavLink></nav><div className="sidebar-bottom"><span className="sidebar-indicator" />GitHub · Acesso de leitura</div></aside><div className="app-workarea"><header className="topbar"><span className="topbar-label">Workspace</span><AuthControls /></header>{children}</div></div>;
}
