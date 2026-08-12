import { CalendarClock, Save } from "lucide-react";
import { updateWorkspaceSyncScheduleAction } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/dates";
import type { SettingsWorkspace } from "@/lib/settings/queries";
import { SYNC_SCHEDULE_OPTIONS } from "@/lib/sync-schedule";

type ScheduledSyncSectionProps = {
  isWorkspaceOwner: boolean;
  workspace: SettingsWorkspace;
};

export function ScheduledSyncSection({
  isWorkspaceOwner,
  workspace
}: ScheduledSyncSectionProps) {
  const selectedOption = SYNC_SCHEDULE_OPTIONS.find(
    (option) => option.value === workspace.syncSchedule
  );

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Scheduled repository sync</h2>
          <p className="section-copy">
            Choose how often AveriCode refreshes activity for every repository in this workspace.
          </p>
        </div>
      </div>

      {isWorkspaceOwner ? (
        <form action={updateWorkspaceSyncScheduleAction} className="scheduled-sync-form">
          <input name="workspaceId" type="hidden" value={workspace.id} />
          <input name="returnTo" type="hidden" value="/settings" />
          <div className="field">
            <label htmlFor="workspace-sync-schedule">Frequency</label>
            <select
              defaultValue={workspace.syncSchedule}
              id="workspace-sync-schedule"
              name="syncSchedule"
            >
              {SYNC_SCHEDULE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Saving...">
            <Save aria-hidden size={16} />
            Save frequency
          </PendingSubmitButton>
        </form>
      ) : (
        <p className="section-copy">Only the workspace owner can change this frequency.</p>
      )}

      <div className="notice settings-cron-note">
        <CalendarClock aria-hidden size={18} />
        <div>
          <strong>{selectedOption?.label ?? workspace.syncSchedule}</strong>
          <p>
            {selectedOption?.description} Last scheduled attempt: {formatDateTime(workspace.lastScheduledSyncAt)}.
          </p>
        </div>
      </div>
    </section>
  );
}
