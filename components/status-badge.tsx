import { CircleCheck, CircleHelp, CircleMinus } from "lucide-react";
import type { ActivityStatus } from "@prisma/client";

export function StatusBadge({ status }: { status: ActivityStatus }) {
  const label = status === "ACTIVE" ? "Com commits" : status === "INACTIVE" ? "Sem commits" : "Sem dado atual";
  const Icon = status === "ACTIVE" ? CircleCheck : status === "INACTIVE" ? CircleMinus : CircleHelp;
  return <span className={`status-badge status-${status.toLowerCase()}`}><Icon aria-hidden size={13} />{label}</span>;
}
