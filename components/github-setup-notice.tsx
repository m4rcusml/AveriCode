import { AlertTriangle, CircleCheck } from "lucide-react";
type Value = string | string[] | undefined;
function first(value: Value) { return Array.isArray(value) ? value[0] : value; }
export function GitHubSetupNotice({ imported, setupAction, setupError }: { imported?: Value; setupAction?: Value; setupError?: Value }) {
  const error = first(setupError);
  const count = first(imported);
  if (count && !error) return <div className="notice notice-success"><CircleCheck aria-hidden size={18} /><div><strong>Acesso aos projetos atualizado.</strong><p>{count} projetos conectados ou revisados neste workspace.</p></div></div>;
  if (!error) return null;
  const messages: Record<string,string> = {
    missing_github_app_slug: "A configuração da conexão GitHub está incompleta. Peça ao administrador para revisar o GitHub App.",
    workspace_permission_denied: "Você precisa participar deste workspace para conectar ou solicitar projetos.",
    invalid_setup_state: "Este link expirou ou já foi utilizado. Inicie uma nova conexão em Conectar projetos.",
    setup_state_expired: "A conexão expirou. Inicie novamente em Conectar projetos.",
    installation_not_authorized: "Esta instalação não está disponível para sua conta GitHub atual.",
    github_reauthorization_required: "Sua autorização GitHub expirou. Saia e entre novamente para reconectar os projetos."
  };
  return <div className="notice notice-warning"><AlertTriangle aria-hidden size={18} /><div><strong>A conexão GitHub precisa de atenção.</strong><p>{messages[error] ?? "Não foi possível concluir a instalação. Se sua organização exige aprovação, peça ao responsável para aprovar o GitHub App e inicie a conexão novamente."}{first(setupAction) === "request" ? " Sua organização recebeu uma solicitação de acesso." : ""}</p></div></div>;
}
