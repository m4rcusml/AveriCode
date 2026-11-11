import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, GitBranch, Github, ShieldCheck, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAuthSession();
  if (session?.user?.id) redirect("/dashboard");
  return <div className="public-shell"><header className="public-topbar"><Link className="brand" href="/" aria-label="AveriCode"><Image alt="" aria-hidden height={34} width={34} src="/logo.svg" priority /><span className="brand-wordmark">Averi<strong>Code</strong></span></Link><ThemeToggle /></header><main className="page public-page" id="main-content"><section className="public-intro"><div><h1 className="public-title" aria-label="AveriCode">A visão do todo.<br /><em>O contexto de cada projeto.</em></h1><p className="public-copy">Acompanhe as mudanças nos seus projetos GitHub, as pessoas que contribuem e os sinais que merecem uma conversa.</p><div className="public-principles"><div><GitBranch aria-hidden size={19} /><div><strong>Seu portfólio em uma só visão</strong><p>Vários projetos e contas, organizados no workspace da sua equipe.</p></div></div><div><ArrowUpRight aria-hidden size={19} /><div><strong>Atualizações com contexto</strong><p>Mensagens de commits, branches e datas para entender o que mudou.</p></div></div><div><Users aria-hidden size={19} /><div><strong>Pessoas, sem placar de produtividade</strong><p>Atividade de código é um ponto de partida para a conversa com a equipe.</p></div></div></div></div><aside className="login-box"><Image alt="" aria-hidden height={54} width={54} src="/logo.svg" /><h2>Traga seus projetos<br />para a mesma conversa.</h2><p>Entre com sua conta GitHub e escolha os repositórios que deseja acompanhar.</p><Link className="button button-primary" href="/api/auth/signin"><Github aria-hidden size={18} />Continuar com GitHub<ArrowUpRight aria-hidden size={15} /></Link><div className="login-box-footnote"><ShieldCheck aria-hidden size={16} /><span>Seu login identifica você. O GitHub App oferece acesso de leitura somente aos repositórios selecionados.</span></div></aside></section><footer className="public-footer">AveriCode · Contexto para quem lidera múltiplos projetos.</footer></main></div>;
}
