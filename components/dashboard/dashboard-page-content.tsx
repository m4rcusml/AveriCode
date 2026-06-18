import Link from "next/link";
import { Github } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { InstallationToolbar } from "@/components/dashboard/installation-toolbar";
import { RepositoryList } from "@/components/dashboard/repository-list";
import { GitHubSetupNotice } from "@/components/github-setup-notice";
import { ManualSyncToast } from "@/components/manual-sync-toast";
import type { DashboardData } from "@/lib/dashboard/queries";
import type { SearchParamValue } from "@/lib/search-params";

export type DashboardNoticeSearchParams = {
  failed_count?: SearchParamValue;
  imported?: SearchParamValue;
  manual_sync_error?: SearchParamValue;
  retry_after_ms?: SearchParamValue;
  setup_action?: SearchParamValue;
  setup_error?: SearchParamValue;
  skipped_count?: SearchParamValue;
  synced_count?: SearchParamValue;
};

type DashboardPageContentProps = {
  data: DashboardData;
  searchParams?: DashboardNoticeSearchParams;
};

export function DashboardPageContent({ data, searchParams }: DashboardPageContentProps) {
  return (
    <main className="page">
      <ManualSyncToast
        dismissHref={data.selectedDashboardHref}
        error={searchParams?.manual_sync_error}
        failedCount={searchParams?.failed_count}
        retryAfterMs={searchParams?.retry_after_ms}
        skippedCount={searchParams?.skipped_count}
        syncedCount={searchParams?.synced_count}
      />
      <GitHubSetupNotice
        imported={searchParams?.imported}
        setupAction={searchParams?.setup_action}
        setupError={searchParams?.setup_error}
      />

      <DashboardHeader installUrl={data.installUrl} workspace={data.workspace} />
      <DashboardMetrics metrics={data.metrics} />

      {data.tabInstallations.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <div>
            <h2>No repositories connected</h2>
            <p>Add a personal or organization repository to start monitoring expected contributors.</p>
            {data.installUrl ? (
              <a className="button button-primary" href={data.installUrl}>
                <Github aria-hidden size={16} />
                Add repositories
              </a>
            ) : (
              <Link className="button button-secondary" href="/settings">
                Configure GitHub App
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <InstallationToolbar
            selectedDashboardHref={data.selectedDashboardHref}
            selectedInstallation={data.selectedInstallation}
            tabInstallations={data.tabInstallations}
            workspace={data.workspace}
          />
          <RepositoryList returnTo={data.selectedDashboardHref} selectedInstallation={data.selectedInstallation} />
        </>
      )}
    </main>
  );
}
