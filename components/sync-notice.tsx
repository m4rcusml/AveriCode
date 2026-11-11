"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};
const serverSnapshot = () => null;
const getHost = () => document.getElementById("avericode-sync-notices");

export function SyncNotice({ children, className = "" }: { children: ReactNode; className?: string }) {
  const host = useSyncExternalStore(subscribe, getHost, serverSnapshot);
  return host ? createPortal(
    <div className={`toast ${className}`} role="status" aria-live="polite" aria-atomic="true">{children}</div>,
    host
  ) : null;
}
