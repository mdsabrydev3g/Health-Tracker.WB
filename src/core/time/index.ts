/**
 * Time helpers — PURE. No React, no DB, no I/O.
 *
 * The single most important rule in this codebase:
 *   • An INSTANT is a UTC Date.
 *   • A "day" is a LOCAL calendar day (YYYY-MM-DD) in a person's IANA zone.
 * Never derive a local day from UTC arithmetic — that silently breaks at
 * midnight boundaries and across DST. Egypt (Africa/Cairo) reintroduced DST in
 * 2023, so a hard-coded +02:00 offset is a bug waiting to happen.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Shape "YYYY-MM-DD" — the canonical local-day key used everywhere. */
export type LocalDay = string;

/**
 * The local calendar day an instant falls on, in the given IANA zone.
 * DST-safe: derived from formatting, not from arithmetic on the instant.
 */
export function localDayOf(instant: Date, timeZone: string): LocalDay {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/**
 * Wall-clock "YYYY-MM-DD" + "HH:mm" in `timeZone` → the true UTC instant.
 * An 08:00 dose is 08:00 local on BOTH sides of a DST transition.
 */
export function zonedToUtc(
  localDay: LocalDay,
  time: string,
  timeZone: string,
): Date {
  const [hh, mm] = time.split(":");
  return fromZonedTime(
    `${localDay}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`,
    timeZone,
  );
}

/** The instant a local day starts / ends, in UTC. */
export function startOfLocalDay(
  localDay: LocalDay,
  timeZone: string,
): Date {
  return zonedToUtc(localDay, "00:00", timeZone);
}

export function endOfLocalDay(localDay: LocalDay, timeZone: string): Date {
  return zonedToUtc(localDay, "23:59:59.999", timeZone);
}

/** 0 = Sunday … 6 = Saturday (matches §5 weekdays contract). */
export function weekdayOf(localDay: LocalDay): number {
  const [y, m, d] = localDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Every local day in [from, to], inclusive. Safe across month/year ends. */
export function enumerateLocalDays(from: LocalDay, to: LocalDay): LocalDay[] {
  if (from > to) return [];
  const days: LocalDay[] = [];
  const [y, m, d] = from.split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  const [ty, tm, td] = to.split("-").map(Number);
  const last = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return days;
}

/** Whole days between two local days. Used for every-N-days and depletion. */
export function daysBetween(a: LocalDay, b: LocalDay): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms =
    Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function addDays(localDay: LocalDay, n: number): LocalDay {
  const [y, m, d] = localDay.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/**
 * After a dose is created we may need the next day, but "add 24h" is wrong
 * across DST. Add calendar days in LOCAL time, then re-derive the day key.
 */
export function addDaysToInstant(
  instant: Date,
  n: number,
  timeZone: string,
): Date {
  const day = localDayOf(instant, timeZone);
  const [y, m, d] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const newDay = shifted.toISOString().slice(0, 10);
  const time = formatInTimeZone(instant, timeZone, "HH:mm:ss");
  return zonedToUtc(newDay, time, timeZone);
}

/** "08:00" → 480 minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

export function formatLocal(
  instant: Date,
  timeZone: string,
  pattern = "HH:mm",
): string {
  return formatInTimeZone(instant, timeZone, pattern);
}

/** Human label in Arabic — used by Mother Mode's giant dose card. */
export function formatTimeAr(instant: Date, timeZone: string): string {
  const hhmm = formatInTimeZone(instant, timeZone, "HH:mm");
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
