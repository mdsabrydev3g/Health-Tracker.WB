import type { DoseStatus } from "@/core/engine/dose.engine";
import { Badge } from "@/components/ui/primitives";

const LABELS: Record<DoseStatus, string> = {
  upcoming: "قادمة",
  due: "حان موعدها",
  taken: "تم أخذها",
  missed: "فائتة",
  skipped: "تم تخطيها",
  snoozed: "مؤجلة",
  cancelled: "ملغاة",
};

const TONES: Record<DoseStatus, "ok" | "warn" | "danger" | "muted" | "info"> = {
  upcoming: "muted",
  due: "warn",
  taken: "ok",
  missed: "danger",
  skipped: "info",
  snoozed: "warn",
  cancelled: "muted",
};

export function DoseStatusBadge({ status }: { status: DoseStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}

export const doseStatusLabel = (s: DoseStatus) => LABELS[s];
