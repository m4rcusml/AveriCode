import { GitHubAccountsSection } from "@/components/settings/github-accounts-section";
import { ScheduledSyncSection } from "@/components/settings/scheduled-sync-section";
import { RepositoryAccessRequestsSection } from "@/components/settings/repository-access-requests-section";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNotice, type SettingsSearchParams } from "@/components/settings/settings-notice";
import { SettingsSummary } from "@/components/settings/settings-summary";
import { WorkspaceMembersSection } from "@/components/settings/workspace-members-section";
import type { SettingsData } from "@/lib/settings/queries";

type SettingsPageContentProps = {
  data: SettingsData;
  searchParams?: SettingsSearchParams;
};

export function SettingsPageContent({ data, searchParams }: SettingsPageContentProps) {
  return (
    <main className="page" id="main-content">
      <SettingsNotice searchParams={searchParams} />
      <SettingsHeader installUrl={data.installUrl} workspace={data.workspace} />
      <SettingsSummary
        canManageWorkspace={data.canManageWorkspace}
        metrics={data.metrics}
        workspaceSlug={data.workspace.slug}
      />
      <WorkspaceMembersSection
        canManageWorkspace={data.canManageWorkspace}
        members={data.members}
        workspaceId={data.workspace.id}
      />
      <GitHubAccountsSection canManageWorkspace={data.canManageWorkspace} installUrl={data.installUrl} installations={data.installations} />
      <RepositoryAccessRequestsSection
        isWorkspaceOwner={data.isWorkspaceOwner}
        requests={data.repositoryAccessRequests}
      />
      <ScheduledSyncSection
        isWorkspaceOwner={data.isWorkspaceOwner}
        workspace={data.workspace}
      />
    </main>
  );
}
