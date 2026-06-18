import { AlertTriangle, CircleCheck } from "lucide-react";

type GitHubSetupNoticeProps = {
  imported?: string | string[];
  setupAction?: string | string[];
  setupError?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function GitHubSetupNotice({ imported, setupAction, setupError }: GitHubSetupNoticeProps) {
  const error = firstValue(setupError);
  const action = firstValue(setupAction);
  const importedCount = firstValue(imported);

  if (importedCount && !error) {
    return (
      <div className="notice notice-success">
        <CircleCheck aria-hidden size={18} />
        <div>
          <strong>GitHub repositories imported.</strong>
          <p>{importedCount} repository record(s) were imported or refreshed from the GitHub App installation.</p>
        </div>
      </div>
    );
  }

  if (error !== "missing_installation_id") {
    return null;
  }

  return (
    <div className="notice notice-warning">
      <AlertTriangle aria-hidden size={18} />
      <div>
        <strong>GitHub did not return an installation id.</strong>
        <p>
          If you selected an organization where you are not an owner, GitHub may have created an installation
          request instead of installing the app. Ask an organization owner to approve or install AveriCode, then
          come back and use Add repositories again.
          {action ? ` GitHub setup action: ${action}.` : ""}
        </p>
      </div>
    </div>
  );
}
