"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { SyncNotice } from "@/components/sync-notice";

type SyncControlProps = {
  repositoryId?: string;
  workspaceId?: string;
  disabled?: boolean;
  className?: string;
  iconOnly?: boolean;
  label?: string;
  ariaLabel?: string;
  title?: string;
};

export function SyncControl({ repositoryId, workspaceId, disabled, className = "button button-primary", iconOnly = false, label = "Sincronizar", ariaLabel, title }: SyncControlProps) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function synchronize() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const operationId = crypto.randomUUID();
    setPending(true);
    setFeedback("Sincronizando os dados salvos do projeto…");
    window.dispatchEvent(new CustomEvent("avericode:sync", { detail: { operationId, pending: true } }));
    try {
      const response = await fetch("/api/github/sync-now", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repositoryId ? { repositoryId } : { workspaceId }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(repositoryId ? 75_000 : 255_000)])
      });
      const data = await response.json() as { error?: string; retryAfterMs?: number; total?: number; succeeded?: number; failed?: number; skipped?: number };
      if (!response.ok) {
        if (response.status === 429) setFeedback(`Aguarde ${Math.max(1, Math.ceil((data.retryAfterMs ?? 60_000) / 60_000))} minuto(s) antes de sincronizar novamente.`);
        else if (response.status === 401) setFeedback("Sua sessão expirou. Entre novamente para sincronizar.");
        else setFeedback("Não foi possível concluir a sincronização. Confira o acesso e tente novamente.");
      } else if (data.total !== undefined) {
        setFeedback(`${data.succeeded ?? 0} projetos sincronizados, ${data.failed ?? 0} com falha e ${data.skipped ?? 0} aguardando outra tentativa.`);
      } else setFeedback("Sincronização concluída.");
    } catch {
      if (mounted.current) setFeedback("Não foi possível confirmar a conclusão. Os dados serão conferidos automaticamente; tente novamente quando a operação terminar.");
    } finally {
      request.current = null;
      window.dispatchEvent(new CustomEvent("avericode:sync", { detail: { operationId, pending: false } }));
      if (mounted.current) {
        setPending(false);
        // Updating the route is independent of the operation's completed/failed feedback.
        router.refresh();
      }
    }
  }

  return <>
    <button type="button" className={className} disabled={disabled || pending} aria-disabled={disabled || pending} aria-busy={pending} aria-label={ariaLabel ?? label} title={feedback || title} onClick={synchronize}>
      <RefreshCw aria-hidden className={pending ? "spin" : undefined} size={iconOnly ? 16 : 15} />
      {iconOnly ? null : pending ? "Sincronizando…" : label}
    </button>
    {iconOnly && feedback ? <SyncNotice><RefreshCw aria-hidden className={pending ? "spin" : undefined} size={18} /><div><strong>{ariaLabel ?? label}</strong><p>{feedback}</p></div><button className="toast-dismiss" type="button" aria-label="Fechar aviso de sincronização" onClick={() => setFeedback("")}><X aria-hidden size={16} /></button></SyncNotice> : null}
    {!iconOnly ? <span className="operation-feedback" role="status" aria-live="polite">{feedback}</span> : null}
  </>;
}
