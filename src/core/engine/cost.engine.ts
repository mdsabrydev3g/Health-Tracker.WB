/**
 * COST ENGINE — pure.
 *
 * Costs are visible to the caregiver only. Mother Mode must never surface
 * money (§4).
 */

import type { ScheduleLike } from "@/core/engine/dose.engine";
import { dailyConsumption } from "@/core/engine/inventory.engine";

export interface CostInput {
  costPackagePrice?: number | null;
  costPackageSize?: number | null;
  currency?: string | null;
}

export interface MedCostRow {
  medicationId: string;
  nameAr: string;
  dailyConsumption: number;
  unitPrice: number | null;
  dailyCost: number | null;
  monthlyCost: number | null;
  currency: string;
}

/** Price per single unit (tablet/capsule/mL), or null if we lack the data. */
export function unitPrice(c: CostInput): number | null {
  if (c.costPackagePrice == null || !c.costPackageSize) return null;
  if (c.costPackageSize <= 0) return null;
  return c.costPackagePrice / c.costPackageSize;
}

export function monthlyCostFor(
  c: CostInput,
  schedules: ScheduleLike[],
): number | null {
  const up = unitPrice(c);
  if (up == null) return null;
  return dailyConsumption(schedules) * up * 30;
}

export function buildCostRows(
  meds: {
    id: string;
    nameAr: string;
    schedules: ScheduleLike[];
    cost: CostInput;
  }[],
  defaultCurrency = "EGP",
): MedCostRow[] {
  return meds.map((m) => {
    const up = unitPrice(m.cost);
    const dc = dailyConsumption(m.schedules);
    return {
      medicationId: m.id,
      nameAr: m.nameAr,
      dailyConsumption: dc,
      unitPrice: up,
      dailyCost: up == null ? null : dc * up,
      monthlyCost: monthlyCostFor(m.cost, m.schedules),
      currency: m.cost.currency ?? defaultCurrency,
    };
  });
}

export function totalMonthly(rows: MedCostRow[]): number {
  return rows.reduce((s, r) => s + (r.monthlyCost ?? 0), 0);
}
