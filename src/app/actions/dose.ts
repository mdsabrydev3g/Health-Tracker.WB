"use server";

import { revalidatePath } from "next/cache";
import { recordDoseAction, type DoseAction } from "@/core/db/repository";

/**
 * Dose actions are plain form submissions — they work even if JS fails to
 * hydrate, which matters on the mother's device (§1.7 zero silent failures).
 */
export async function actOnDose(formData: FormData) {
  const doseId = String(formData.get("doseId") ?? "");
  const action = String(formData.get("action") ?? "") as DoseAction;
  const snoozeMinutes = Number(formData.get("snoozeMinutes") ?? 10);

  if (!doseId || !["taken", "skipped", "snoozed"].includes(action)) return;

  await recordDoseAction({ doseId, action, snoozeMinutes });

  revalidatePath("/");
  revalidatePath("/mother");
  revalidatePath("/inventory");
  revalidatePath("/reports");
}
