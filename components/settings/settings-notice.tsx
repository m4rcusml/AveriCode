import { ShieldCheck } from "lucide-react";
import { firstSearchParamValue, type SearchParamValue } from "@/lib/search-params";

export type SettingsSearchParams = {
  settings_error?: SearchParamValue;
  settings_success?: SearchParamValue;
};

type SettingsNoticeProps = {
  searchParams?: SettingsSearchParams;
};

function settingsMessage(params: SettingsSearchParams | undefined) {
  const success = firstSearchParamValue(params?.settings_success);
  const error = firstSearchParamValue(params?.settings_error);

  if (success) {
    const messages: Record<string, string> = {
      workspace_member_added: "Membro adicionado ao workspace.",
      workspace_member_removed: "Membro removido do workspace.",
      workspace_member_updated: "Função do membro atualizada.",
      sync_schedule_updated: "Frequência de sincronização atualizada.",
      repository_request_resolved: "Solicitação de projetos revisada."
    };

    return {
      className: "notice notice-success",
      title: "Configurações atualizadas.",
      body: messages[success] ?? "As configurações do workspace foram atualizadas."
    };
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    workspace_member_failed: "Não foi possível atualizar este membro.",
    workspace_member_identifier_required: "Informe um usuário GitHub ou e-mail.",
    workspace_member_not_found: "Esta pessoa ainda não entrou no AveriCode.",
    workspace_owner_protected: "O responsável pelo workspace não pode ser removido ou rebaixado.",
    workspace_permission_denied: "Somente responsáveis e administradores podem gerenciar membros.",
    sync_schedule_invalid: "Escolha uma frequência de sincronização válida.",
    sync_schedule_owner_required: "Somente o responsável pode alterar a frequência de sincronização.",
    sync_schedule_failed: "Não foi possível salvar a frequência de sincronização.",
    repository_request_owner_required: "Somente o responsável pode revisar as solicitações.",
    repository_request_stale: "O solicitante ou um dos projetos não possui mais o acesso GitHub necessário.",
    repository_request_failed: "Não foi possível revisar a solicitação. Nenhum projeto foi alterado."
  };

  return {
    className: "notice notice-warning",
    title: "A configuração precisa de atenção.",
    body: messages[error] ?? "Não foi possível atualizar as configurações."
  };
}

export function SettingsNotice({ searchParams }: SettingsNoticeProps) {
  const notice = settingsMessage(searchParams);

  if (!notice) {
    return null;
  }

  return (
    <div className={notice.className}>
      <ShieldCheck aria-hidden size={18} />
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.body}</p>
      </div>
    </div>
  );
}
