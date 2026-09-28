/**
 * ADHERENCE ENGINE — pure.
 *
 * Wording discipline: this module produces numbers only. Any Arabic string
 * derived from it must stay neutral — never shame the mother (§8).
 */

import type { DoseStatus } from "@/core/engine/dose.engine";
import { addDays, enumerateLocalDays, type LocalDay } from "@/core/time";

export interface AdherenceDose {
  localDay: LocalDay;
  scheduledAtUtc: string;
  status: DoseStatus;
  isPrn?: boolean;
}

export interface AdherenceReport {
  taken: number;
  missed: number;
  skipped: number;
  /** Scheduled but not yet due — deliberately excluded from the denominator. */
  pending: number;
  /** Denominator actually used: taken + missed + skipped. */
  countable: number;
  /** null when there is nothing countable yet (never show "0% adherence"). */
  adherencePct: number | null;
}

/**
 * adherence% = taken / (taken + missed + skipped)
 *
 * Only doses whose scheduled time has already passed count. Future doses and
 * PRN doses are excluded from the denominator entirely.
 */
export function computeAdherence(
  doses: AdherenceDose[],
  now: Date,
): AdherenceReport {
  let taken = 0;
  let missed = 0;
  let skipped = 0;
  let pending = 0;

  for (const d of doses) {
    if (d.isPrn) continue;
    const isPast = new Date(d.scheduledAtUtc) <= now;

    switch (d.status) {
      case "taken":
        taken++;
        break;
      case "missed":
        missed++;
        break;
      case "skipped":
        skipped++;
        break;
      case "cancelled":
        // A cancelled dose (med discontinued, schedule superseded) is not a
        // failure and must not pollute adherence.
        break;
      default:
        if (isPast) pending++;
        break;
    }
  }

  const countable = taken + missed + skipped;
  return {
    taken,
    missed,
    skipped,
    pending,
    countable,
    adherencePct: countable === 0 ? null : Math.round((taken / countable) * 100),
  };
}

/**
 * Consecutive recent days with zero missed scheduled doses.
 * Walks backwards from `today`; today itself only counts once it is over.
 */
export function computeStreak(
  doses: AdherenceDose[],
  today: LocalDay,
  lookbackDays = 60,
): number {
  const byDay = new Map<LocalDay, AdherenceDose[]>();
  for (const d of doses) {
    if (d.isPrn) continue;
    const list = byDay.get(d.localDay) ?? [];
    list.push(d);
    byDay.set(d.localDay, list);
  }

  let streak = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const day = addDays(today, -i);
    const dayDoses = byDay.get(day);
    if (!dayDoses || dayDoses.length === 0) {
      // No scheduled doses that day — neutral, does not break the streak.
      continue;
    }
    if (dayDoses.some((d) => d.status === "missed")) return streak;
    streak++;
  }
  return streak;
}

/** Per-day breakdown for the reports chart. */
export function dailyBreakdown(
  doses: AdherenceDose[],
  from: LocalDay,
  to: LocalDay,
): { day: LocalDay; taken: number; missed: number; skipped: number }[] {
  return enumerateLocalDays(from, to).map((day) => {
    const todays = doses.filter((d) => d.localDay === day && !d.isPrn);
    return {
      day,
      taken: todays.filter((d) => d.status === "taken").length,
      missed: todays.filter((d) => d.status === "missed").length,
      skipped: todays.filter((d) => d.status === "skipped").length,
    };
  });
}
