import { ExternalLink, Github } from "lucide-react";
import type { DashboardWorkspace } from "@/lib/dashboard/queries";

type DashboardHeaderProps = {
  installUrl: string | null;
  workspace: DashboardWorkspace;
};

export function DashboardHeader({ installUrl, workspace }: DashboardHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">
          You are in <span className="workspace-title-highlight">{workspace.name}</span>
        </h1>
        <p className="page-copy">Repository activity dashboard for the last 7 days.</p>
      </div>
      <div className="button-row">
        {installUrl ? (
          <a className="button button-primary" href={installUrl}>
            <Github aria-hidden size={16} />
            Add repositories
            <ExternalLink aria-hidden size={14} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
