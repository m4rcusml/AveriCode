import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import type { ActivityStatus } from "@prisma/client";

type StatusBadgeProps = {
  status: ActivityStatus | "UNKNOWN";
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status[0] + status.slice(1).toLowerCase();
  const Icon = status === "ACTIVE" ? CircleCheck : status === "INACTIVE" ? CircleX : CircleHelp;

  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <Icon aria-hidden size={16} />
      {label}
    </span>
  );
}
