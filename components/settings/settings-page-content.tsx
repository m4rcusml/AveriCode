import { AddWorkspaceMemberSection } from "@/components/settings/add-workspace-member-section";
import { GitHubAccountsSection } from "@/components/settings/github-accounts-section";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNotice, type SettingsSearchParams } from "@/components/settings/settings-notice";
import { SettingsSummary } from "@/components/settings/settings-summary";
import { SystemConfigurationSection } from "@/components/settings/system-configuration-section";
import { WorkspaceMembersSection } from "@/components/settings/workspace-members-section";
import type { SettingsData } from "@/lib/settings/queries";

type SettingsPageContentProps = {
  data: SettingsData;
  searchParams?: SettingsSearchParams;
};

export function SettingsPageContent({ data, searchParams }: SettingsPageContentProps) {
  return (
    <main className="page">
      <SettingsNotice searchParams={searchParams} />
      <SettingsHeader installUrl={data.installUrl} workspace={data.workspace} />
      <SettingsSummary
        canManageWorkspace={data.canManageWorkspace}
        metrics={data.metrics}
        workspaceSlug={data.workspace.slug}
      />
      {data.canManageWorkspace ? <AddWorkspaceMemberSection workspaceId={data.workspace.id} /> : null}
      <WorkspaceMembersSection canManageWorkspace={data.canManageWorkspace} members={data.members} />
      <GitHubAccountsSection installUrl={data.installUrl} installations={data.installations} />
      <SystemConfigurationSection systemConfig={data.systemConfig} />
    </main>
  );
}
