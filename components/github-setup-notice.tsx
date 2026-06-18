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

  if (!error) {
    return null;
  }

  const messages: Record<string, { body: string; title: string }> = {
    missing_github_app_slug: {
      title: "GitHub App slug is not configured.",
      body: "Set GITHUB_APP_SLUG before adding repositories."
    },
    workspace_permission_denied: {
      title: "Workspace permission required.",
      body: "Only workspace owners and admins can connect or update GitHub App access."
    }
  };
  const content = messages[error] ?? {
    title: "GitHub did not return an installation id.",
    body:
      "If you selected an organization where you are not an owner, GitHub may have created an installation request instead of installing the app. Ask an organization owner to approve or install AveriCode, then come back and use Add repositories again."
  };

  return (
    <div className="notice notice-warning">
      <AlertTriangle aria-hidden size={18} />
      <div>
        <strong>{content.title}</strong>
        <p>{content.body}{action ? ` GitHub setup action: ${action}.` : ""}</p>
      </div>
    </div>
  );
}
