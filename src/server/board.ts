/**
 * Board assembly — the one-glance view the caregiver sees (§1.4).
 *
 * Server-only. Pulls the person, materialises doses, auto-misses overdue ones,
 * resolves live statuses, and folds inventory into stock reports.
 */

import { eq, inArray } from "drizzle-orm";
import {
  listDoses,
  listMedications,
  listPersons,
  listSchedules,
  markOverdueMissed,
  materialiseDoses,
  toScheduleLike,
} from "@/core/db/repository";
import { db } from "@/core/db";
import { inventoryEvents, medications, persons } from "@/core/db/schema";
import {
  resolveDoseStatus,
  tallyDay,
  type DoseStatus,
} from "@/core/engine/dose.engine";
import { computeAdherence, computeStreak } from "@/core/engine/adherence.engine";
import { computeStock, type StockReport } from "@/core/engine/inventory.engine";
import { addDays, localDayOf, type LocalDay } from "@/core/time";

export interface BoardDose {
  id: string;
  medicationId: string;
  medicationName: string;
  strength: string | null;
  form: string;
  scheduledAtUtc: string;
  localDay: LocalDay;
  status: DoseStatus;
  quantity: number;
  foodRuleText: string | null;
  isPrn: boolean;
}

export interface BoardMedication {
  id: string;
  nameAr: string;
  strength: string | null;
  status: string;
  stock: StockReport;
}

export interface Board {
  personId: string;
  personName: string;
  timeZone: string;
  today: LocalDay;
  doses: BoardDose[];
  todayDoses: BoardDose[];
  nextDose: BoardDose | null;
  tally: { taken: number; remaining: number; missed: number; total: number };
  adherence7: { taken: number; missed: number; skipped: number; adherencePct: number | null };
  streak: number;
  medications: BoardMedication[];
  /** Anything the caregiver must see immediately (§1.4). */
  alerts: { tone: "danger" | "warn"; message: string }[];
}

const STRENGTH = (m: { strengthValue?: number | null; strengthUnit?: string | null }) =>
  m.strengthValue != null ? `${m.strengthValue} ${m.strengthUnit ?? ""}`.trim() : null;

export async function getBoard(userId: string): Promise<Board | null> {
  const people = await listPersons(userId);
  const person = people[0];
  if (!person) return null;
  return buildBoard(person.id);
}

/**
 * Build the board for a known person — used by Mother Mode, which is bound to a
 * device and has no caregiver session (§4).
 */
export async function buildBoard(personId: string): Promise<Board | null> {
  const [person] = await db
    .select()
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  if (!person) return null;

  const now = new Date();
  const timeZone = person.timezone || "Africa/Cairo";
  const today = localDayOf(now, timeZone);

  // Materialise + auto-miss before reading, so the board is always current.
  await materialiseDoses(person.id, timeZone, today);
  await markOverdueMissed(person.id, 120, now);

  const windowEnd = addDays(today, 13);
  const rows = await listDoses(person.id, today, windowEnd);

  const doses: BoardDose[] = rows.map(({ dose, medication }) => ({
    id: dose.id,
    medicationId: medication.id,
    medicationName: medication.nameAr,
    strength: STRENGTH(medication),
    form: medication.form,
    scheduledAtUtc: new Date(dose.scheduledAtUtc).toISOString(),
    localDay: dose.localDay,
    status: resolveDoseStatus({
      current: dose.status as DoseStatus,
      scheduledAtUtc: new Date(dose.scheduledAtUtc).toISOString(),
      now,
      isPrn: false,
      graceMinutes: 120,
    }),
    quantity: dose.quantity ?? 1,
    foodRuleText: medication.foodRuleText,
    isPrn: false,
  }));

  const todayDoses = doses.filter((d) => d.localDay === today);
  const tally = tallyDay(doses, today);

  const nextDose =
    todayDoses.find((d) => d.status === "due" || d.status === "snoozed") ??
    todayDoses.find((d) => d.status === "upcoming") ??
    null;

  const sevenAgo = addDays(today, -6);
  const adherence7 = computeAdherence(
    doses.filter((d) => d.localDay >= sevenAgo),
    now,
  );
  const streak = computeStreak(doses, today);

  // ── inventory ──
  const meds = await listMedications(person.id, true);
  const scheds = meds.length ? await listSchedules(meds.map((m) => m.id)) : [];

  const medIds = meds.map((m) => m.id);
  const invRows = medIds.length
    ? await db
        .select()
        .from(inventoryEvents)
        .where(inArray(inventoryEvents.medicationId, medIds))
    : [];

  const medicationsBoard: BoardMedication[] = meds.map((m) => {
    const own = invRows
      .filter((e) => e.medicationId === m.id)
      .map((e) => ({
        id: e.id,
        medicationId: e.medicationId,
        type: e.type,
        qty: e.qty,
        prevBalance: e.prevBalance,
        newBalance: e.newBalance,
        doseEventId: e.doseEventId,
      }));
    const ownScheds = scheds.filter((s) => s.medicationId === m.id).map(toScheduleLike);

    return {
      id: m.id,
      nameAr: m.nameAr,
      strength: STRENGTH(m),
      status: m.status,
      stock: computeStock({
        events: own,
        schedules: ownScheds,
        today,
        packExpiry: m.packExpiry,
        lowStockThresholdDays: 2,
      }),
    };
  });

  const alerts: Board["alerts"] = [];
  for (const m of medicationsBoard) {
    for (const w of m.stock.warnings) {
      alerts.push({
        tone: w.kind === "expiryRisk" || w.kind === "depleted" ? "danger" : "warn",
        message: `${m.nameAr}: ${w.messageAr}`,
      });
    }
  }
  if (tally.missed > 0) {
    alerts.push({
      tone: "danger",
      message: `لم يتم تسجيل ${tally.missed} ${tally.missed === 1 ? "جرعة" : "جرعات"} اليوم`,
    });
  }

  return {
    personId: person.id,
    personName: person.nameAr,
    timeZone,
    today,
    doses,
    todayDoses,
    nextDose,
    tally,
    adherence7,
    streak,
    medications: medicationsBoard,
    alerts,
  };
}

export { medications };
