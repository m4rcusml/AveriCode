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
          <h2 className="section-title">Workspace members</h2>
          <p className="section-copy">People who can access this workspace and its monitored repository data.</p>
        </div>
      </div>
      {canManageWorkspace ? (
        <form action={addWorkspaceMemberAction} className="settings-form-row workspace-member-form">
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input name="returnTo" type="hidden" value="/settings" />
          <div className="field">
            <label htmlFor="workspace-member-identifier">GitHub username or email</label>
            <input
              id="workspace-member-identifier"
              name="identifier"
              placeholder="octocat or user@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="workspace-member-role">Role</label>
            <select defaultValue="MEMBER" id="workspace-member-role" name="role">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Adding...">
            <UserPlus aria-hidden size={16} />
            Add member
          </PendingSubmitButton>
        </form>
      ) : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>GitHub</th>
              <th>Email</th>
              <th>Role</th>
              <th>Owned repos</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="cell-title">{userLabel(member)}</div>
                  {member.isCurrentUser ? <div className="cell-subtitle">Current user</div> : null}
                </td>
                <td>
                  {member.githubUsername ? `@${member.githubUsername}` : <span className="muted">None</span>}
                </td>
                <td>{member.email ?? <span className="muted">None</span>}</td>
                <td>
                  <span className={`status-badge ${member.isOwner ? "status-active" : "status-unknown"}`}>
                    <ShieldCheck aria-hidden size={16} />
                    {member.role}
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
                        <select defaultValue={member.role} name="role">
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <PendingSubmitButton className="button button-secondary" pendingLabel="Saving...">
                          <Save aria-hidden size={16} />
                          Save
                        </PendingSubmitButton>
                      </form>
                      <form action={removeWorkspaceMemberAction}>
                        <input name="workspaceMemberId" type="hidden" value={member.id} />
                        <input name="returnTo" type="hidden" value="/settings" />
                        <PendingSubmitButton className="button button-danger" pendingLabel="Removing...">
                          <Trash2 aria-hidden size={16} />
                          Remove
                        </PendingSubmitButton>
                      </form>
                    </div>
                  ) : (
                    <span className="muted">{member.isOwner ? "Owner protected" : "No access"}</span>
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
