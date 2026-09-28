/**
 * DOSE ENGINE — pure, deterministic, unit-tested.
 *
 * Given (medications, schedules, timezone, from, to) → the exact list of dose
 * instances with `scheduledAtUtc` + `localDay`.
 *
 * This module must never import React, Drizzle, Next, or anything else that
 * touches I/O. Plain data in, plain data out (§ hard rule).
 */

import {
  addDays,
  daysBetween,
  enumerateLocalDays,
  localDayOf,
  type LocalDay,
  weekdayOf,
  zonedToUtc,
} from "@/core/time";

export type ScheduleKind =
  | "daily"
  | "everyNDays"
  | "weekdays"
  | "prn"
  | "taper";

export interface ScheduleLike {
  id: string;
  medicationId: string;
  kind: ScheduleKind;
  times: string[];
  quantityPerDose: number;
  anchorDate: LocalDay;
  endDate?: string | null;
  weekdays?: number[] | null;
  intervalN?: number | null;
  taperSteps?: { from: string; to: string; quantityPerDose: number }[] | null;
  activeFrom: string;
  activeTo?: string | null;
}

export interface MedicationLike {
  id: string;
  personId: string;
  startDate: string;
  endDate?: string | null;
  status: "active" | "paused" | "finished" | "discontinued" | string;
}

export interface DoseInstance {
  personId: string;
  medicationId: string;
  scheduleId: string;
  scheduledAtUtc: string; // ISO
  localDay: LocalDay;
  quantity: number;
  idempotencyKey: string;
  isPrn: boolean;
}

export type DoseStatus =
  | "upcoming"
  | "due"
  | "taken"
  | "missed"
  | "skipped"
  | "snoozed"
  | "cancelled";

/** How far ahead we materialise doses (§6). 14 days ≈ 2 weeks of alarms. */
export const MATERIALISATION_DAYS = 14;
export const DEFAULT_GRACE_MINUTES = 120;

const maxOf = (...vals: (string | null | undefined)[]) =>
  vals.reduce<string>((acc, v) => (v && v > acc ? v : acc), "0000-01-01");

const minOf = (...vals: (string | null | undefined)[]) =>
  vals.reduce<string>((acc, v) => (v && v < acc ? v : acc), "9999-12-31");

/** Is this schedule in force on `day`? Honours supersession (activeFrom/To). */
function scheduleCoversDay(s: ScheduleLike, day: LocalDay): boolean {
  if (day < s.activeFrom) return false;
  if (s.activeTo && day > s.activeTo) return false;
  if (s.endDate && day > s.endDate) return false;

  switch (s.kind) {
    case "daily":
      return true;

    case "weekdays": {
      const days = s.weekdays ?? [];
      return days.includes(weekdayOf(day));
    }

    case "everyNDays": {
      const n = s.intervalN ?? 1;
      if (n <= 1) return true;
      if (day < s.anchorDate) return false;
      return daysBetween(s.anchorDate, day) % n === 0;
    }

    case "taper": {
      const steps = s.taperSteps ?? [];
      return steps.some((st) => day >= st.from && day <= st.to);
    }

    // PRN is log-only: it never produces a scheduled instance and is never
    // counted as "missed" (§6).
    case "prn":
      return false;

    default:
      return false;
  }
}

/** Quantity for a given day — taper overrides the base quantity. */
function quantityForDay(s: ScheduleLike, day: LocalDay): number {
  if (s.kind === "taper") {
    const step = (s.taperSteps ?? []).find(
      (st) => day >= st.from && day <= st.to,
    );
    if (step) return step.quantityPerDose;
  }
  return s.quantityPerDose;
}

export interface GenerateInput {
  medications: MedicationLike[];
  schedules: ScheduleLike[];
  timeZone: string;
  from: LocalDay;
  to: LocalDay;
}

/**
 * Materialise every scheduled dose in [from, to].
 *
 * Handles: daily multi-time, every-N-days, weekdays, taper, PRN exclusion,
 * schedule supersession mid-range, med start/end dates, and DST (an 08:00 dose
 * stays 08:00 local on both sides of a transition).
 */
export function generateDoseInstances(input: GenerateInput): DoseInstance[] {
  const { medications, schedules, timeZone, from, to } = input;
  const out: DoseInstance[] = [];

  const schedulesByMed = new Map<string, ScheduleLike[]>();
  for (const s of schedules) {
    const list = schedulesByMed.get(s.medicationId) ?? [];
    list.push(s);
    schedulesByMed.set(s.medicationId, list);
  }

  for (const med of medications) {
    // Only active medications produce doses.
    if (med.status !== "active") continue;

    const medSchedules = schedulesByMed.get(med.id) ?? [];
    for (const s of medSchedules) {
      if (s.kind === "prn") continue;

      const start = maxOf(from, med.startDate, s.activeFrom, s.anchorDate);
      const end = minOf(to, med.endDate, s.endDate, s.activeTo);
      if (start > end) continue;

      for (const day of enumerateLocalDays(start, end)) {
        if (!scheduleCoversDay(s, day)) continue;
        const quantity = quantityForDay(s, day);

        for (const time of s.times) {
          const scheduledAtUtc = zonedToUtc(day, time, timeZone);
          const scheduledIso = scheduledAtUtc.toISOString();
          out.push({
            personId: med.personId,
            medicationId: med.id,
            scheduleId: s.id,
            scheduledAtUtc: scheduledIso,
            localDay: day,
            quantity,
            idempotencyKey: `${med.personId}|${med.id}|${scheduledIso}`,
            isPrn: false,
          });
        }
      }
    }
  }

  out.sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));
  return out;
}

/** The [today, today + MATERIALISATION_DAYS) window used on app launch etc. */
export function materialisationWindow(today: LocalDay): {
  from: LocalDay;
  to: LocalDay;
} {
  return { from: today, to: addDays(today, MATERIALISATION_DAYS - 1) };
}

/**
 * Resolve the display status of a dose right now.
 *
 * A `due` dose becomes `missed` only after the grace window AND only for
 * scheduled (non-PRN) doses. A future dose is never missed.
 */
export function resolveDoseStatus(args: {
  current: DoseStatus;
  scheduledAtUtc: string;
  now: Date;
  isPrn: boolean;
  graceMinutes?: number;
}): DoseStatus {
  const { current, scheduledAtUtc, now, isPrn } = args;
  const grace = args.graceMinutes ?? DEFAULT_GRACE_MINUTES;

  // A terminal status set by a human always wins.
  if (
    current === "taken" ||
    current === "skipped" ||
    current === "missed" ||
    current === "cancelled"
  ) {
    return current;
  }
  if (current === "snoozed") return current;

  const scheduled = new Date(scheduledAtUtc);
  if (now < scheduled) return "upcoming";

  const graceEnd = new Date(scheduled.getTime() + grace * 60_000);
  if (now < graceEnd) return "due";

  // PRN doses are log-only — they are never "missed".
  return isPrn ? "due" : "missed";
}

/** The next dose that still needs an action (upcoming, due or snoozed). */
export function nextActionableDose<T extends { scheduledAtUtc: string }>(
  doses: T[],
  now: Date,
  predicate: (d: T) => boolean,
): T | null {
  const pending = doses
    .filter(predicate)
    .filter((d) => new Date(d.scheduledAtUtc) >= new Date(now.getTime() - 6 * 3600_000))
    .sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));
  return pending[0] ?? null;
}

/** Today's tally for the Mother Mode progress ring. */
export function tallyDay(
  doses: { localDay: string; status: DoseStatus }[],
  day: LocalDay,
): { taken: number; remaining: number; missed: number; total: number } {
  const todays = doses.filter((d) => d.localDay === day);
  const taken = todays.filter((d) => d.status === "taken").length;
  const missed = todays.filter((d) => d.status === "missed").length;
  const remaining = todays.filter(
    (d) =>
      d.status === "upcoming" ||
      d.status === "due" ||
      d.status === "snoozed",
  ).length;
  return { taken, remaining, missed, total: todays.length };
}

export { localDayOf };
