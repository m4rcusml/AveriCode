import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, GitBranch, Github, ShieldCheck, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAuthSession();
  if (session?.user?.id) redirect("/dashboard");
  return <div className="public-shell"><header className="public-topbar"><Link className="brand" href="/" aria-label="AveriCode"><Image alt="" aria-hidden height={34} width={34} src="/logo.svg" priority /><span className="brand-wordmark">Averi<strong>Code</strong></span></Link><ThemeToggle /></header><main className="page public-page" id="main-content"><section className="public-intro"><div><h1 className="public-title" aria-label="AveriCode">Monitore seus<br /><em>projetos no GitHub.</em></h1><p className="public-copy">Atividade dos contribuidores nos últimos 7 dias.</p><div className="public-principles"><div><GitBranch aria-hidden size={19} /><strong>Vários projetos e contas</strong></div><div><ArrowUpRight aria-hidden size={19} /><strong>Últimos commits por projeto</strong></div><div><Users aria-hidden size={19} /><strong>Contribuidores com e sem commits</strong></div></div></div><aside className="login-box"><Image alt="" aria-hidden height={54} width={54} src="/logo.svg" /><h2>Entrar no AveriCode</h2><p>Entre com GitHub e selecione os repositórios.</p><Link className="button button-primary" href="/api/auth/signin"><Github aria-hidden size={18} />Continuar com GitHub<ArrowUpRight aria-hidden size={15} /></Link><div className="login-box-footnote"><ShieldCheck aria-hidden size={16} /><span>Somente leitura nos repositórios selecionados.</span></div></aside></section></main></div>;
}
