import { describe, expect, it } from "vitest";
import {
  alreadyDeducted,
  balanceFromEvents,
  buildInventoryEvent,
  computeStock,
  dailyConsumption,
  isEventChainConsistent,
  occurrencesPerDay,
  type InventoryEventLike,
} from "@/core/engine/inventory.engine";
import type { ScheduleLike } from "@/core/engine/dose.engine";

const sched = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: "s1",
  medicationId: "m1",
  kind: "daily",
  times: ["08:00"],
  quantityPerDose: 1,
  anchorDate: "2024-01-01",
  activeFrom: "2024-01-01",
  activeTo: null,
  ...over,
});

const ev = (qty: number, over: Partial<InventoryEventLike> = {}): InventoryEventLike => ({
  id: `e${Math.random()}`,
  medicationId: "m1",
  type: qty >= 0 ? "purchase" : "doseTaken",
  qty,
  prevBalance: 0,
  newBalance: 0,
  doseEventId: null,
  ...over,
});

describe("inventory — balance is the fold of events", () => {
  it("sums signed quantities", () => {
    expect(balanceFromEvents([ev(30), ev(-1), ev(-1), ev(-0.5)])).toBeCloseTo(27.5);
  });

  it("returns zero with no events", () => {
    expect(balanceFromEvents([])).toBe(0);
  });

  it("verifies a consistent prev/new chain", () => {
    let balance = 0;
    const chain: InventoryEventLike[] = [];
    for (const qty of [30, -1, -2, 10]) {
      const e = buildInventoryEvent({
        medicationId: "m1",
        currentBalance: balance,
        delta: qty,
        type: qty > 0 ? "purchase" : "doseTaken",
      });
      chain.push({ id: `c${chain.length}`, ...e });
      balance = e.newBalance;
    }
    expect(isEventChainConsistent(chain, 0)).toBe(true);
    expect(balance).toBe(37);
  });

  it("detects a broken chain", () => {
    const broken: InventoryEventLike[] = [
      { ...ev(10), prevBalance: 0, newBalance: 10 },
      { ...ev(-1), prevBalance: 50, newBalance: 49 },
    ];
    expect(isEventChainConsistent(broken, 0)).toBe(false);
  });
});

describe("inventory — consumption per schedule kind", () => {
  it("daily: one per listed time", () => {
    expect(occurrencesPerDay(sched({ times: ["08:00", "20:00"] }))).toBe(2);
  });

  it("weekdays: prorated across the week", () => {
    expect(occurrencesPerDay(sched({ kind: "weekdays", weekdays: [1, 4], times: ["08:00"] }))).toBeCloseTo(2 / 7);
  });

  it("everyNDays: divided by the interval", () => {
    expect(occurrencesPerDay(sched({ kind: "everyNDays", intervalN: 3, times: ["08:00"] }))).toBeCloseTo(1 / 3);
  });

  it("PRN is unpredictable and counts as zero", () => {
    expect(occurrencesPerDay(sched({ kind: "prn", times: [] }))).toBe(0);
  });

  it("quantities multiply consumption", () => {
    expect(dailyConsumption([sched({ times: ["08:00", "20:00"], quantityPerDose: 2 })])).toBe(4);
  });

  it("sums across multiple schedules", () => {
    expect(dailyConsumption([sched({ times: ["08:00"] }), sched({ times: ["20:00"] })])).toBe(2);
  });
});

describe("inventory — depletion and warnings", () => {
  const today = "2024-01-01";

  it("predicts the depletion date from daily consumption", () => {
    const r = computeStock({
      events: [ev(10)],
      schedules: [sched({ times: ["08:00", "20:00"], quantityPerDose: 1 })], // 2/day
      today,
    });
    expect(r.balance).toBe(10);
    expect(r.dailyConsumption).toBe(2);
    expect(r.remainingDays).toBe(5);
    expect(r.depletionDate).toBe("2024-01-06");
    expect(r.status).toBe("ok");
  });

  it("flags low stock at the configured threshold", () => {
    const r = computeStock({
      events: [ev(4)],
      schedules: [sched({ times: ["08:00", "20:00"] })],
      today,
      lowStockThresholdDays: 2,
    });
    expect(r.status).toBe("low");
    expect(r.warnings.some((w) => w.kind === "low")).toBe(true);
  });

  it("reports depleted at zero balance", () => {
    const r = computeStock({
      events: [ev(2), ev(-2)],
      schedules: [sched()],
      today,
    });
    expect(r.status).toBe("depleted");
    expect(r.warnings[0].kind).toBe("depleted");
  });

  it("raises expiry-vs-depletion as a distinct failure mode", () => {
    const r = computeStock({
      events: [ev(60)],
      schedules: [sched()], // 1/day → finishes in 60 days
      today,
      packExpiry: "2024-01-15", // but the pack expires first
    });
    expect(r.status).toBe("expiryRisk");
    expect(r.warnings.some((w) => w.kind === "expiryRisk")).toBe(true);
    expect(r.warnings[0].messageAr).toContain("صلاحيتها");
  });

  it("does not raise expiry risk when the pack outlasts consumption", () => {
    const r = computeStock({
      events: [ev(5)],
      schedules: [sched()],
      today,
      packExpiry: "2025-12-31",
    });
    expect(r.status).toBe("ok");
  });

  it("cannot predict depletion for a PRN-only medication", () => {
    const r = computeStock({
      events: [ev(20)],
      schedules: [sched({ kind: "prn", times: [] })],
      today,
    });
    expect(r.remainingDays).toBeNull();
    expect(r.depletionDate).toBeNull();
    expect(r.warnings.some((w) => w.kind === "noSchedule")).toBe(true);
  });

  it("handles fractional (partial) doses", () => {
    const r = computeStock({
      events: [ev(10), ev(-0.5)],
      schedules: [sched({ quantityPerDose: 0.5 })],
      today,
    });
    expect(r.balance).toBeCloseTo(9.5);
    expect(r.remainingDays).toBeCloseTo(19);
  });
});

describe("inventory — idempotency (the double-tap bug)", () => {
  it("detects that a dose was already deducted", () => {
    const events = [ev(-1, { doseEventId: "dose-123" })];
    expect(alreadyDeducted(events, "dose-123")).toBe(true);
    expect(alreadyDeducted(events, "dose-456")).toBe(false);
  });

  it("builds an event carrying the dose id for idempotent replay", () => {
    const e = buildInventoryEvent({
      medicationId: "m1",
      currentBalance: 30,
      delta: -1,
      type: "doseTaken",
      doseEventId: "dose-123",
    });
    expect(e.prevBalance).toBe(30);
    expect(e.newBalance).toBe(29);
    expect(e.doseEventId).toBe("dose-123");
  });
});
