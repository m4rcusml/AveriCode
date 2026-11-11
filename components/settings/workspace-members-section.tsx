import { Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import {
  addWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction
} from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import { type SettingsMember, userLabel } from "@/lib/settings/queries";

type WorkspaceMembersSectionProps = {
  canManageWorkspace: boolean;
  members: SettingsMember[];
  workspaceId: string;
};

export function WorkspaceMembersSection({
  canManageWorkspace,
  members,
  workspaceId
}: WorkspaceMembersSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Membros do workspace</h2>
          <p className="section-copy">Pessoas com acesso a este workspace e aos dados dos projetos monitorados.</p>
        </div>
      </div>
      {canManageWorkspace ? (
        <form action={addWorkspaceMemberAction} className="settings-form-row workspace-member-form">
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input name="returnTo" type="hidden" value="/settings" />
          <div className="field">
            <label htmlFor="workspace-member-identifier">Usuário GitHub ou e-mail</label>
            <input
              id="workspace-member-identifier"
              name="identifier"
              placeholder="octocat ou pessoa@empresa.com"
            />
          </div>
          <div className="field">
            <label htmlFor="workspace-member-role">Função</label>
            <select defaultValue="MEMBER" id="workspace-member-role" name="role">
              <option value="MEMBER">Membro</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Adicionando…">
            <UserPlus aria-hidden size={16} />
            Adicionar membro
          </PendingSubmitButton>
        </form>
      ) : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Membro</th>
              <th>GitHub</th>
              <th>E-mail</th>
              <th>Função</th>
              <th>Projetos da conta</th>
              <th>Entrou em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="cell-title">{userLabel(member)}</div>
                  {member.isCurrentUser ? <div className="cell-subtitle">Você</div> : null}
                </td>
                <td>
                  {member.githubUsername ? `@${member.githubUsername}` : <span className="muted">Não informado</span>}
                </td>
                <td>{member.email ?? <span className="muted">Não informado</span>}</td>
                <td>
                  <span className={`status-badge ${member.isOwner ? "status-active" : "status-unknown"}`}>
                    <ShieldCheck aria-hidden size={16} />
                    {member.role === "OWNER" ? "Responsável" : member.role === "ADMIN" ? "Administrador" : "Membro"}
                  </span>
                </td>
                <td>{member.ownedRepositoryCount}</td>
                <td>{formatDateTime(member.createdAt)}</td>
                <td>
                  {canManageWorkspace && !member.isOwner ? (
                    <div className="button-row">
                      <form action={updateWorkspaceMemberRoleAction} className="inline-form">
                        <input name="workspaceMemberId" type="hidden" value={member.id} />
                        <input name="returnTo" type="hidden" value="/settings" />
                        <select aria-label={`Função de ${userLabel(member)}`} defaultValue={member.role} name="role">
                          <option value="MEMBER">Membro</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                        <PendingSubmitButton className="button button-secondary" pendingLabel="Salvando…">
                          <Save aria-hidden size={16} />
                          Salvar
                        </PendingSubmitButton>
                      </form>
                      <form action={removeWorkspaceMemberAction}>
                        <input name="workspaceMemberId" type="hidden" value={member.id} />
                        <input name="returnTo" type="hidden" value="/settings" />
                        <PendingSubmitButton className="button button-danger" pendingLabel="Removendo…">
                          <Trash2 aria-hidden size={16} />
                          Remover
                        </PendingSubmitButton>
                      </form>
                    </div>
                  ) : (
                    <span className="muted">{member.isOwner ? "Responsável protegido" : "Sem permissão"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
