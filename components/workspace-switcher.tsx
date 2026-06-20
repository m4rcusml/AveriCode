import { ChevronDown, PanelsTopLeft } from "lucide-react";
import { switchWorkspaceAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAuthSession } from "@/lib/auth";
import { getSelectedWorkspaceForUser, getWorkspaceOptionsForUser } from "@/lib/workspace-selection";

export async function WorkspaceSwitcher() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return null;
  }

  const selectedWorkspace = await getSelectedWorkspaceForUser(session.user.id);
  const workspaceOptions = await getWorkspaceOptionsForUser(session.user.id);

  return (
    <details className="workspace-switcher">
      <summary aria-label="Switch workspace" className="workspace-switcher-trigger" title="Switch workspace">
        <PanelsTopLeft aria-hidden size={16} />
        <span>{selectedWorkspace.name}</span>
        <ChevronDown aria-hidden size={15} />
      </summary>
      <div className="workspace-switcher-menu">
        <div className="workspace-switcher-heading">Workspaces</div>
        {workspaceOptions.map((membership) => {
          const selected = membership.workspaceId === selectedWorkspace.id;

          return (
            <form action={switchWorkspaceAction} key={membership.id}>
              <input name="workspaceId" type="hidden" value={membership.workspaceId} />
              <PendingSubmitButton
                aria-current={selected ? "true" : undefined}
                className={`workspace-option ${selected ? "workspace-option-active" : ""}`}
                pendingLabel={
                  <>
                    <span>
                      <strong>Switching...</strong>
                      <small>{membership.role}</small>
                    </span>
                    <span className="pill">{membership.workspace._count.repositories}</span>
                  </>
                }
              >
                <span>
                  <strong>{membership.workspace.name}</strong>
                  <small>{membership.role}</small>
                </span>
                <span className="pill">{membership.workspace._count.repositories}</span>
              </PendingSubmitButton>
            </form>
          );
        })}
      </div>
    </details>
  );
}
