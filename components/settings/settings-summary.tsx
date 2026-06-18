import { Building2, Database, Github, Users } from "lucide-react";
import type { SettingsData } from "@/lib/settings/queries";

type SettingsSummaryProps = {
  canManageWorkspace: boolean;
  metrics: SettingsData["metrics"];
  workspaceSlug: string;
};

export function SettingsSummary({ canManageWorkspace, metrics, workspaceSlug }: SettingsSummaryProps) {
  return (
    <section className="metric-grid" aria-label="Settings summary">
      <div className="metric-card">
        <div className="metric-label">
          <Database aria-hidden size={16} />
          Workspace slug
        </div>
        <div className="metric-value metric-value-compact">{workspaceSlug}</div>
        <div className="metric-note">Primary workspace identifier</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Users aria-hidden size={16} />
          Members
        </div>
        <div className="metric-value">{metrics.memberCount}</div>
        <div className="metric-note">{canManageWorkspace ? "Management enabled" : "View only"}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Building2 aria-hidden size={16} />
          GitHub accounts
        </div>
        <div className="metric-value">{metrics.githubAccountCount}</div>
        <div className="metric-note">{metrics.organizationCount} organization(s)</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Github aria-hidden size={16} />
          Repositories
        </div>
        <div className="metric-value">{metrics.repositoryCount}</div>
        <div className="metric-note">{metrics.monitoredRepositoryCount} monitored</div>
      </div>
    </section>
  );
}
