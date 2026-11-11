"use client";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

type Value = string | string[] | undefined;
function first(value: Value) { return Array.isArray(value) ? value[0] : value; }
function count(value: Value) { const n = Number(first(value)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
export function ManualSyncToast({ dismissHref, error, failedCount, retryAfterMs, skippedCount, syncedCount }: { dismissHref: string; error?: Value; failedCount?: Value; retryAfterMs?: Value; skippedCount?: Value; syncedCount?: Value }) {
  const retry = Math.max(1,Math.ceil(count(retryAfterMs)/60000));
  const messages: Record<string,{ title: string; message: string }> = {
    rate_limited: { title: "Aguarde para sincronizar novamente", message: `Tente novamente em cerca de ${retry} min. Isso evita consultas repetidas do mesmo projeto.` },
    already_running: { title: "Sincronização em andamento", message: "Aguarde a tentativa atual terminar antes de iniciar outra para este projeto." },
    no_active_repositories: { title: "Nenhum projeto monitorado", message: "Conecte um projeto antes de sincronizar o workspace." },
    sync_failed: { title: "Os dados ainda não foram atualizados", message: "Sua configuração foi salva. Confira a conexão do projeto e tente sincronizar novamente." },
    batch_skipped: { title: "Projetos aguardando sincronização", message: `${count(skippedCount)} projetos já estavam sincronizando ou precisam aguardar alguns minutos.` },
    batch_failed: { title: "A sincronização falhou", message: `${count(failedCount)} projetos não puderam ser atualizados. Revise o acesso GitHub e tente novamente.` },
    batch_partial: { title: "Sincronização parcialmente concluída", message: `${count(syncedCount)} projetos atualizados, ${count(skippedCount)} aguardando e ${count(failedCount)} com falha. Confira a situação de cada projeto.` }
  };
  const content = messages[first(error) ?? ""];
  if (!content) return null;
  return <div aria-live="polite" className="toast-stack" role="status"><div className="toast toast-warning"><AlertTriangle aria-hidden size={20} /><div><strong>{content.title}</strong><p>{content.message}</p></div><Link aria-label="Fechar notificação" className="toast-dismiss" href={dismissHref}><X aria-hidden size={16} /></Link></div></div>;
}
