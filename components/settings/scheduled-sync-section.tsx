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
  const labels: Record<string, string> = { DAILY: "Diária", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal" };

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Sincronização agendada</h2>
          <p className="section-copy">
            Escolha a frequência de atualização dos projetos deste workspace.
          </p>
        </div>
      </div>

      {isWorkspaceOwner ? (
        <form action={updateWorkspaceSyncScheduleAction} className="scheduled-sync-form">
          <input name="workspaceId" type="hidden" value={workspace.id} />
          <input name="returnTo" type="hidden" value="/settings" />
          <div className="field">
            <label htmlFor="workspace-sync-schedule">Frequência</label>
            <select
              defaultValue={workspace.syncSchedule}
              id="workspace-sync-schedule"
              name="syncSchedule"
            >
              {SYNC_SCHEDULE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {labels[option.value]}
                </option>
              ))}
            </select>
          </div>
          <PendingSubmitButton className="button button-primary" pendingLabel="Salvando…">
            <Save aria-hidden size={16} />
            Salvar frequência
          </PendingSubmitButton>
        </form>
      ) : (
        <p className="section-copy">Somente o responsável pelo workspace pode alterar a frequência.</p>
      )}

      <div className="notice settings-cron-note">
        <CalendarClock aria-hidden size={18} />
        <div>
          <strong>{labels[workspace.syncSchedule]}</strong>
          <p>
            Verificação diária às 06h de São Paulo, respeitando a frequência escolhida. Última tentativa agendada: {formatDateTime(workspace.lastScheduledSyncAt)}.
          </p>
        </div>
      </div>
    </section>
  );
}
