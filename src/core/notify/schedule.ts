/**
 * NOTIFICATION SCHEDULER — pure.
 *
 * Turns materialised dose instances into concrete local-notification requests.
 * Dose reminders are LOCAL notifications scheduled ahead of time from the
 * materialised doses — not live server pushes. Server push is only a fallback /
 * escalation channel (§9).
 *
 * Pure on purpose: the Arabic copy and the id mapping are the parts most likely
 * to regress, and they must be testable without Capacitor or Android.
 */

import { formatTimeAr } from "@/core/time";
import { pluralizeDose } from "@/lib/utils";

export const DOSE_CHANNEL_ID = "dose_reminders";
export const DOSE_CHANNEL_NAME = "تذكير الجرعات";

/** Snooze choices offered on the notification (§9). */
export const SNOOZE_MINUTES = [5, 10, 15, 30] as const;

export interface DoseNotificationInput {
  doseId: string;
  medicationName: string;
  quantity: number;
  strength?: string | null;
  foodRuleText?: string | null;
  scheduledAtUtc: string;
  timeZone: string;
}

export interface NotificationRequest {
  /** Capacitor needs a 32-bit int id; dose ids are UUIDs, so we map them. */
  id: number;
  title: string;
  body: string;
  scheduledAtUtc: string;
  channelId: string;
  extra: {
    doseId: string;
    medicationName: string;
    kind: "dose" | "followup" | "escalation";
  };
  /** Rendered as action buttons on the notification. */
  actions: { id: string; title: string }[];
}

/**
 * Deterministic UUID → positive int32.
 *
 * Must be stable: the same dose must always map to the same notification id so
 * that a reschedule replaces the old alarm instead of creating a duplicate.
 */
export function doseNotificationId(doseId: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < doseId.length; i++) {
    hash ^= doseId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Keep it positive and inside int32.
  return hash % 0x7fffffff;
}

/** Action buttons. Interactive prompts go only to the device bound to the person. */
export const DOSE_ACTIONS = [
  { id: "taken", title: "أخذت الدواء" },
  { id: "notyet", title: "لم آخذ بعد" },
  { id: "snooze", title: "تأجيل" },
];

export function buildDoseNotification(
  input: DoseNotificationInput,
): NotificationRequest {
  const { doseId, medicationName, quantity, strength, foodRuleText } = input;

  const parts: string[] = [`${quantity} ${pluralizeDose(quantity)}`];
  if (strength) parts.push(strength);
  if (foodRuleText) parts.push(foodRuleText);

  return {
    id: doseNotificationId(doseId),
    title: `حان موعد جرعة ${medicationName}`,
    body: parts.join(" · "),
    scheduledAtUtc: input.scheduledAtUtc,
    channelId: DOSE_CHANNEL_ID,
    extra: { doseId, medicationName, kind: "dose" },
    actions: DOSE_ACTIONS,
  };
}

/**
 * Follow-up reminder after the grace window if the dose was not actioned.
 * Uses a distinct notification id so it never clobbers the original alarm.
 */
export function buildFollowUpNotification(
  input: DoseNotificationInput,
  graceMinutes: number,
): NotificationRequest {
  const base = buildDoseNotification(input);
  return {
    ...base,
    id: (base.id + 1_000_000) % 0x7fffffff,
    extra: { ...base.extra, kind: "followup" },
    body: `${base.body} — مرّ أكثر من ${graceMinutes} دقيقة ولم تُسجَّل الجرعة`,
  };
}

/**
 * Caregiver-facing alert. Informational only — no action buttons (§9): the
 * caregiver's device never gets the interactive dose prompt.
 */
export function buildEscalationNotification(input: {
  personName: string;
  medicationName: string;
  scheduledAtUtc: string;
  timeZone: string;
  missedCount: number;
}): { id: number; title: string; body: string; channelId: string; actions: [] } {
  const time = formatTimeAr(new Date(input.scheduledAtUtc), input.timeZone);
  const missed =
    input.missedCount === 1
      ? "جرعة واحدة"
      : input.missedCount === 2
        ? "جرعتان"
        : `${input.missedCount} جرعات`;

  return {
    id: doseNotificationId(`escalation:${input.scheduledAtUtc}`),
    title: `لم تُسجَّل ${missed}`,
    body: `${input.personName} — ${input.medicationName} (${time}). راجع تعليمات الطبيب أو النشرة الدوائية لمعرفة الإجراء المناسب.`,
    channelId: DOSE_CHANNEL_ID,
    actions: [],
  };
}

/** Neutral wording — never "double the next dose" (§9). */
export const MISSED_DOSE_ADVICE =
  "لم يتم تسجيل الجرعة. راجع تعليمات الطبيب أو النشرة الدوائية لمعرفة الإجراء المناسب.";
