import { Building2, Database, Github, Users } from "lucide-react";
import type { SettingsData } from "@/lib/settings/queries";

type SettingsSummaryProps = {
  canManageWorkspace: boolean;
  metrics: SettingsData["metrics"];
  workspaceSlug: string;
};

export function SettingsSummary({ canManageWorkspace, metrics, workspaceSlug }: SettingsSummaryProps) {
  return (
    <section className="metric-grid" aria-label="Resumo das configurações">
      <div className="metric-card">
        <div className="metric-label">
          <Database aria-hidden size={16} />
          Identificador
        </div>
        <div className="metric-value metric-value-compact">{workspaceSlug}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Users aria-hidden size={16} />
          Membros
        </div>
        <div className="metric-value">{metrics.memberCount}</div>
        <div className="metric-note">{canManageWorkspace ? "Gestão habilitada" : "Somente leitura"}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Building2 aria-hidden size={16} />
          Contas GitHub
        </div>
        <div className="metric-value">{metrics.githubAccountCount}</div>
        <div className="metric-note">{metrics.organizationCount} organizações</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Github aria-hidden size={16} />
          Projetos
        </div>
        <div className="metric-value">{metrics.repositoryCount}</div>
        <div className="metric-note">{metrics.monitoredRepositoryCount} monitorados</div>
      </div>
    </section>
  );
}
