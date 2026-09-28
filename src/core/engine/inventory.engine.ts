/**
 * INVENTORY ENGINE — pure.
 *
 * Balance is ALWAYS the fold of append-only inventory events. We never trust a
 * bare "remaining" number stored on the medication row; `balanceCache` is only
 * a read optimisation and is recomputed from events whenever in doubt.
 */

import type { ScheduleLike } from "@/core/engine/dose.engine";
import { addDays, type LocalDay } from "@/core/time";

export type InventoryEventType =
  | "initial"
  | "doseTaken"
  | "manualAdd"
  | "manualRemove"
  | "purchase"
  | "correction"
  | "discontinued";

export interface InventoryEventLike {
  id: string;
  medicationId: string;
  type: InventoryEventType;
  qty: number;
  prevBalance: number;
  newBalance: number;
  doseEventId?: string | null;
}

/** Current balance — the fold of every event, in insertion order. */
export function balanceFromEvents(events: InventoryEventLike[]): number {
  return events.reduce((sum, e) => sum + e.qty, 0);
}

/** Sanity check: the event chain must be internally consistent. */
export function isEventChainConsistent(
  events: InventoryEventLike[],
  openingBalance = 0,
): boolean {
  let running = openingBalance;
  for (const e of events) {
    if (Math.abs(e.prevBalance - running) > 1e-9) return false;
    running = e.newBalance;
    if (Math.abs(running - (e.prevBalance + e.qty)) > 1e-9) return false;
  }
  return true;
}

/**
 * How many doses per calendar day a schedule generates, averaged.
 * Used to predict depletion. Approximate by design — the depletion date is a
 * planning aid, not a guarantee.
 */
export function occurrencesPerDay(s: ScheduleLike): number {
  const times = s.times?.length ?? 0;
  switch (s.kind) {
    case "daily":
      return times;
    case "weekdays": {
      const n = (s.weekdays ?? []).length || 7;
      return (times * n) / 7;
    }
    case "everyNDays":
      return times / Math.max(1, s.intervalN ?? 1);
    case "taper":
      return times;
    // PRN consumption is unknown — it cannot be predicted, only observed.
    case "prn":
      return 0;
    default:
      return 0;
  }
}

/** Total daily consumption across all schedules of one medication. */
export function dailyConsumption(schedules: ScheduleLike[]): number {
  return schedules.reduce(
    (sum, s) => sum + occurrencesPerDay(s) * s.quantityPerDose,
    0,
  );
}

export type StockStatus = "ok" | "low" | "depleted" | "expiryRisk";

export interface StockWarning {
  kind: "low" | "depleted" | "expiryRisk" | "noSchedule";
  messageAr: string;
}

export interface StockReport {
  balance: number;
  dailyConsumption: number;
  /** null when consumption is zero (PRN-only) — depletion is undefined. */
  remainingDays: number | null;
  depletionDate: LocalDay | null;
  status: StockStatus;
  warnings: StockWarning[];
}

export interface ComputeStockInput {
  events: InventoryEventLike[];
  schedules: ScheduleLike[];
  today: LocalDay;
  packExpiry?: string | null;
  lowStockThresholdDays?: number;
}

export function computeStock(input: ComputeStockInput): StockReport {
  const {
    events,
    schedules,
    today,
    packExpiry,
    lowStockThresholdDays = 2,
  } = input;

  const balance = balanceFromEvents(events);
  const consumption = dailyConsumption(schedules);
  const warnings: StockWarning[] = [];

  if (balance <= 0) {
    warnings.push({
      kind: "depleted",
      messageAr: "نفد الدواء — يلزم إعادة التعبئة",
    });
    return {
      balance,
      dailyConsumption: consumption,
      remainingDays: 0,
      depletionDate: null,
      status: "depleted",
      warnings,
    };
  }

  // PRN-only medication: we cannot predict depletion, only report balance.
  if (consumption <= 0) {
    warnings.push({
      kind: "noSchedule",
      messageAr: "هذا الدواء عند الحاجة — لا يمكن توقع تاريخ النفاد",
    });
    return {
      balance,
      dailyConsumption: 0,
      remainingDays: null,
      depletionDate: null,
      status: "ok",
      warnings,
    };
  }

  const remainingDays = balance / consumption;
  const depletionDate = addDays(today, Math.floor(remainingDays));

  // Distinct failure mode (§7): the pack expires BEFORE it is finished.
  if (packExpiry && packExpiry < depletionDate) {
    warnings.push({
      kind: "expiryRisk",
      messageAr: "العلبة ستنتهي صلاحيتها قبل أن ينتهي الدواء",
    });
  }

  if (remainingDays <= lowStockThresholdDays) {
    warnings.push({
      kind: "low",
      messageAr: `المخزون يكفي أقل من ${lowStockThresholdDays} يوم — أعد التعبئة`,
    });
  }

  const status: StockStatus =
    warnings.some((w) => w.kind === "expiryRisk")
      ? "expiryRisk"
      : remainingDays <= lowStockThresholdDays
        ? "low"
        : "ok";

  return {
    balance,
    dailyConsumption: consumption,
    remainingDays,
    depletionDate,
    status,
    warnings,
  };
}

export interface BuildEventInput {
  medicationId: string;
  currentBalance: number;
  delta: number; // negative when a dose is taken
  type: InventoryEventType;
  reason?: string;
  atUtc?: Date;
  deviceId?: string;
  doseEventId?: string;
}

/**
 * Build the next append-only event with a consistent prev/new balance.
 * Idempotency is enforced upstream by the doseEventId + dose idempotency key:
 * marking the same dose taken twice must deduct inventory exactly once.
 */
export function buildInventoryEvent(input: BuildEventInput): Omit<
  InventoryEventLike,
  "id"
> {
  const prevBalance = input.currentBalance;
  const newBalance = prevBalance + input.delta;
  return {
    medicationId: input.medicationId,
    type: input.type,
    qty: input.delta,
    prevBalance,
    newBalance,
    doseEventId: input.doseEventId ?? null,
  };
}

/** Has this dose already been deducted? Prevents the double-tap bug (§16). */
export function alreadyDeducted(
  events: InventoryEventLike[],
  doseEventId: string,
): boolean {
  return events.some((e) => e.doseEventId === doseEventId);
}
