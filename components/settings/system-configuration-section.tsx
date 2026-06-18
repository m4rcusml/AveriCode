import { CalendarClock, Mail, ShieldCheck } from "lucide-react";
import type { SettingsSystemConfig } from "@/lib/settings/queries";

type SystemConfigurationSectionProps = {
  systemConfig: SettingsSystemConfig[];
};

function ConfigRow({ label, isConfigured }: SettingsSystemConfig) {
  return (
    <li>
      <span>{label}</span>
      <span className={`status-badge ${isConfigured ? "status-active" : "status-unknown"}`}>
        <ShieldCheck aria-hidden size={16} />
        {isConfigured ? "Configured" : "Missing"}
      </span>
    </li>
  );
}

export function SystemConfigurationSection({ systemConfig }: SystemConfigurationSectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">System configuration</h2>
          <p className="section-copy">Values are not shown here; only presence is checked.</p>
        </div>
      </div>
      <ul className="checklist">
        {systemConfig.map((config) => (
          <ConfigRow key={config.label} {...config} />
        ))}
      </ul>
      <div className="notice notice-warning settings-cron-note">
        <CalendarClock aria-hidden size={18} />
        <div>
          <strong>Weekly cron</strong>
          <p>Configured for Monday 06:00 America/Sao_Paulo using Vercel UTC expression 0 9 * * 1.</p>
        </div>
      </div>
      <div className="notice settings-cron-note">
        <Mail aria-hidden size={18} />
        <div>
          <strong>Member invitations</strong>
          <p>Users must sign in once before they can be added to a workspace.</p>
        </div>
      </div>
    </section>
  );
}
