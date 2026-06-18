import { Activity, AlertCircle, Clock, GitBranch } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import type { DashboardMetrics as DashboardMetricsData } from "@/lib/dashboard/queries";

type DashboardMetricsProps = {
  metrics: DashboardMetricsData;
};

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
    <section className="metric-grid" aria-label="Workspace activity metrics">
      <div className="metric-card">
        <div className="metric-label">
          <GitBranch aria-hidden size={16} />
          Monitored repositories
        </div>
        <div className="metric-value">{metrics.monitoredRepositoryCount}</div>
        <div className="metric-note">{metrics.totalRepositoryCount} imported total</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Activity aria-hidden size={16} />
          Active contributors
        </div>
        <div className="metric-value">{metrics.activeContributorCount}</div>
        <div className="metric-note">Expected contributors with commits</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <AlertCircle aria-hidden size={16} />
          Inactive contributors
        </div>
        <div className="metric-value">{metrics.inactiveContributorCount}</div>
        <div className="metric-note">
          {metrics.unknownContributorCount > 0
            ? `${metrics.unknownContributorCount} without snapshot`
            : "Snapshots available"}
        </div>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Clock aria-hidden size={16} />
          Last sync
        </div>
        <div className="metric-value metric-value-compact">{formatDateTime(metrics.latestSyncStartedAt)}</div>
        <div className="metric-note">{metrics.latestSyncTarget}</div>
      </div>
    </section>
  );
}
