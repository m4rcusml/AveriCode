"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export type SyncRepositoryState = {
  id: string;
  lastSyncedAt: string | null;
  status: string | null;
  configurationError: string | null;
  suspendedAt: string | null;
};

function revision(repositories: SyncRepositoryState[]) {
  return JSON.stringify([...repositories].sort((a, b) => a.id.localeCompare(b.id)).map((r) =>
    [r.id, r.lastSyncedAt, r.status, r.configurationError, r.suspendedAt]));
}

export function SyncStatusRefresh({ workspaceId, repositories }: { workspaceId: string; repositories: SyncRepositoryState[] }) {
  const router = useRouter();
  const initialRevision = revision(repositories);
  const initiallyRunning = repositories.some((repository) => repository.status === "RUNNING" || repository.status === "PENDING");

  useEffect(() => {
    let seenRevision = initialRevision;
    let running = initiallyRunning;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let disposed = false;
    const activeOperations = new Set<string>();

    async function check() {
      if (disposed || document.visibilityState === "hidden" || request) return;
      clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(`/api/github/sync-now?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
        });
        if (!response.ok) return;
        const data = await response.json() as { repositories: SyncRepositoryState[] };
        if (disposed || controller.signal.aborted) return;
        const nextRevision = revision(data.repositories);
        running = data.repositories.some((repository) => repository.status === "RUNNING" || repository.status === "PENDING");
        if (nextRevision !== seenRevision) {
          seenRevision = nextRevision;
          router.refresh();
        }
      } catch {
        // A failed status read preserves the last visible evidence and retries when the tab is active.
      } finally {
        if (request === controller) {
          request = undefined;
          if (!disposed && document.visibilityState === "visible") timer = setTimeout(check, running || activeOperations.size > 0 ? 3000 : 60_000);
        }
      }
    }

    function visibilityChanged() {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        request?.abort();
        request = undefined;
      }
      else void check();
    }
    function operationChanged(event: Event) {
      const detail = (event as CustomEvent<{ operationId?: string; pending?: boolean }>).detail;
      if (detail?.operationId) {
        if (detail.pending) activeOperations.add(detail.operationId);
        else activeOperations.delete(detail.operationId);
      }
      void check();
    }
    void check();
    window.addEventListener("focus", check);
    window.addEventListener("avericode:sync", operationChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      window.removeEventListener("focus", check);
      window.removeEventListener("avericode:sync", operationChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [workspaceId, initialRevision, initiallyRunning, router]);

  return null;
}
