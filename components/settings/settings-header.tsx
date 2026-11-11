import { ExternalLink, Github } from "lucide-react";
import type { SettingsWorkspace } from "@/lib/settings/queries";

type SettingsHeaderProps = {
  installUrl: string | null;
  workspace: SettingsWorkspace;
};

export function SettingsHeader({ installUrl, workspace }: SettingsHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="page-copy">
          Pessoas, contas GitHub e rotina de sincronização de <strong>{workspace.name}</strong>.
        </p>
      </div>
      <div className="button-row">
        {installUrl ? (
          <a className="button button-primary" href={installUrl}>
            <Github aria-hidden size={16} />
            Conectar projetos
            <ExternalLink aria-hidden size={14} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
