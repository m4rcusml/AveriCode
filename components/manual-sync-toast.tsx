"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";

type SearchParamValue = string | string[] | undefined;

type ManualSyncToastProps = {
  dismissHref: string;
  error?: SearchParamValue;
  failedCount?: SearchParamValue;
  retryAfterMs?: SearchParamValue;
  skippedCount?: SearchParamValue;
  syncedCount?: SearchParamValue;
};

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function formatRetryAfter(value: SearchParamValue) {
  const retryAfterMs = Number(firstValue(value));

  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    return "a few minutes";
  }

  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function numberValue(value: SearchParamValue) {
  const parsed = Number(firstValue(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function repositoryCount(value: number) {
  return `${value} repositor${value === 1 ? "y" : "ies"}`;
}

export function ManualSyncToast({
  dismissHref,
  error,
  failedCount,
  retryAfterMs,
  skippedCount,
  syncedCount
}: ManualSyncToastProps) {
  const router = useRouter();
  const errorCode = firstValue(error);
  const failed = numberValue(failedCount);
  const skipped = numberValue(skippedCount);
  const synced = numberValue(syncedCount);
  const contentKey = [
    errorCode ?? "",
    firstValue(retryAfterMs) ?? "",
    String(failed),
    String(skipped),
    String(synced)
  ].join(":");
  const content =
    errorCode === "rate_limited"
      ? {
          title: "Manual sync is in cooldown",
          message: `Try again in about ${formatRetryAfter(retryAfterMs)}. This limit prevents repeated GitHub API calls for the same repository.`
        }
      : errorCode === "already_running"
        ? {
            title: "Manual sync is already running",
            message: "Wait for the current sync to finish before starting another one for this repository."
          }
        : errorCode === "no_active_repositories"
          ? {
              title: "No monitored repositories",
              message: "Activate repository monitoring before running a workspace sync."
            }
          : errorCode === "batch_skipped"
            ? {
                title: "Workspace sync was skipped",
                message: `${repositoryCount(skipped)} were in cooldown or already syncing. Try again in a few minutes.`
              }
            : errorCode === "batch_failed"
              ? {
                  title: "Workspace sync failed",
                  message: `${repositoryCount(failed)} could not be synced. Check the server logs for the GitHub API error.`
                }
              : errorCode === "batch_partial"
                ? {
                    title: "Workspace sync partially completed",
                    message: `${repositoryCount(synced)} synced. ${repositoryCount(skipped)} were skipped and ${repositoryCount(failed)} failed.`
                  }
                : null;
  const hasContent = Boolean(content);

  useEffect(() => {
    if (!hasContent) {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(dismissHref, { scroll: false });
    }, 6000);

    return () => window.clearTimeout(timeout);
  }, [contentKey, dismissHref, hasContent, router]);

  if (!content) {
    return null;
  }

  return (
    <div aria-live="polite" className="toast-stack" role="status">
      <div className="toast toast-warning">
        <AlertTriangle aria-hidden size={20} />
        <div>
          <strong>{content.title}</strong>
          <p>{content.message}</p>
        </div>
        <Link aria-label="Dismiss notification" className="toast-dismiss" href={dismissHref}>
          <X aria-hidden size={16} />
        </Link>
      </div>
    </div>
  );
}
