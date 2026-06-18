import { UserPlus } from "lucide-react";
import { addWorkspaceMemberAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type AddWorkspaceMemberSectionProps = {
  workspaceId: string;
};

export function AddWorkspaceMemberSection({ workspaceId }: AddWorkspaceMemberSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Add workspace member</h2>
          <p className="section-copy">Add users who have already signed in to AveriCode with GitHub OAuth.</p>
        </div>
      </div>
      <form action={addWorkspaceMemberAction} className="settings-form-row">
        <input name="workspaceId" type="hidden" value={workspaceId} />
        <input name="returnTo" type="hidden" value="/settings" />
        <div className="field">
          <label htmlFor="workspace-member-identifier">GitHub username or email</label>
          <input id="workspace-member-identifier" name="identifier" placeholder="octocat or user@example.com" />
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
    </section>
  );
}
