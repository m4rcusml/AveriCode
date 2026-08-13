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
      workspace_member_added: "Workspace member added.",
      workspace_member_removed: "Workspace member removed.",
      workspace_member_updated: "Workspace member role updated.",
      sync_schedule_updated: "Scheduled sync frequency updated.",
      repository_request_resolved: "Repository access request resolved."
    };

    return {
      className: "notice notice-success",
      title: "Settings updated.",
      body: messages[success] ?? "The workspace settings were updated."
    };
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    workspace_member_failed: "Could not update the workspace member.",
    workspace_member_identifier_required: "Enter a GitHub username or email.",
    workspace_member_not_found: "This user has not signed in to AveriCode yet.",
    workspace_owner_protected: "The workspace owner cannot be removed or downgraded.",
    workspace_permission_denied: "Only workspace owners and admins can manage members.",
    sync_schedule_invalid: "Choose a valid scheduled sync frequency.",
    sync_schedule_owner_required: "Only the workspace owner can change the scheduled sync frequency.",
    sync_schedule_failed: "Could not update the scheduled sync frequency.",
    repository_request_owner_required: "Only the workspace owner can resolve repository requests.",
    repository_request_stale: "The requester or a selected repository no longer has the required GitHub access.",
    repository_request_failed: "The repository request could not be resolved. No repositories were changed."
  };

  return {
    className: "notice notice-warning",
    title: "Action needed.",
    body: messages[error] ?? "Could not update settings."
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
