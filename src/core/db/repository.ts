/**
 * Repository — every feature talks to this module, never to SQL directly.
 *
 * Mutations that touch inventory run inside a transaction: the dose event and
 * the inventory deduction must succeed or fail together, and a replayed
 * mutation must be a no-op (§7 idempotency, §16 acceptance).
 */

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/core/db";
import {
  auditLogs,
  doseEvents,
  inventoryEvents,
  medications,
  persons,
  schedules,
  type DoseEvent,
  type Medication,
  type Schedule,
} from "@/core/db/schema";
import {
  generateDoseInstances,
  materialisationWindow,
  type MedicationLike,
  type ScheduleLike,
} from "@/core/engine/dose.engine";
import { balanceFromEvents, buildInventoryEvent } from "@/core/engine/inventory.engine";
import { addDays, localDayOf, type LocalDay } from "@/core/time";

/* ─────────────────────────── persons ─────────────────────────── */

export async function listPersons(userId: string) {
  return db
    .select()
    .from(persons)
    .where(and(eq(persons.userId, userId), eq(persons.deleted, false)))
    .orderBy(persons.nameAr);
}

export async function getPerson(userId: string, personId: string) {
  const [row] = await db
    .select()
    .from(persons)
    .where(
      and(eq(persons.id, personId), eq(persons.userId, userId), eq(persons.deleted, false)),
    )
    .limit(1);
  return row ?? null;
}

/* ─────────────────────── medications ─────────────────────────── */

export async function listMedications(personId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(medications.personId, personId), eq(medications.status, "active"), eq(medications.deleted, false))
    : and(eq(medications.personId, personId), eq(medications.deleted, false));
  return db.select().from(medications).where(where).orderBy(medications.nameAr);
}

export async function getMedication(medicationId: string) {
  const [row] = await db
    .select()
    .from(medications)
    .where(eq(medications.id, medicationId))
    .limit(1);
  return row ?? null;
}

export async function listSchedules(medicationIds: string[]) {
  if (medicationIds.length === 0) return [];
  return db
    .select()
    .from(schedules)
    .where(
      and(inArray(schedules.medicationId, medicationIds), eq(schedules.deleted, false)),
    )
    .orderBy(schedules.activeFrom);
}

/* ─────────────────────── dose materialisation ────────────────── */

/**
 * Generate the next MATERIALISATION_DAYS of dose instances and insert any that
 * do not exist yet. Idempotent by construction: the unique idempotency key
 * makes a re-run a no-op, so this is safe to call on every app foreground.
 */
export async function materialiseDoses(
  personId: string,
  timeZone: string,
  today: LocalDay,
): Promise<number> {
  const meds = await listMedications(personId, true);
  if (meds.length === 0) return 0;

  const scheds = await listSchedules(meds.map((m) => m.id));
  const { from, to } = materialisationWindow(today);

  const instances = generateDoseInstances({
    medications: meds.map(toMedicationLike),
    schedules: scheds.map(toScheduleLike),
    timeZone,
    from,
    to,
  });

  if (instances.length === 0) return 0;

  await db
    .insert(doseEvents)
    .values(
      instances.map((i) => ({
        personId: i.personId,
        medicationId: i.medicationId,
        scheduleId: i.scheduleId,
        scheduledAtUtc: new Date(i.scheduledAtUtc),
        localDay: i.localDay,
        status: "upcoming" as const,
        quantity: i.quantity,
        idempotencyKey: i.idempotencyKey,
      })),
    )
    .onConflictDoNothing({ target: doseEvents.idempotencyKey });

  return instances.length;
}

/** Auto-miss any scheduled dose whose grace window has elapsed and no one acted. */
export async function markOverdueMissed(
  personId: string,
  graceMinutes: number,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - graceMinutes * 60_000);
  await db
    .update(doseEvents)
    .set({ status: "missed", source: "auto-missed", updatedAt: now })
    .where(
      and(
        eq(doseEvents.personId, personId),
        eq(doseEvents.status, "upcoming"),
        lte(doseEvents.scheduledAtUtc, cutoff),
      ),
    );
}

/* ─────────────────────────── dose reads ──────────────────────── */

export interface DoseRow {
  dose: DoseEvent;
  medication: Medication;
}

export async function listDoses(
  personId: string,
  from: LocalDay,
  to: LocalDay,
): Promise<DoseRow[]> {
  return db
    .select({ dose: doseEvents, medication: medications })
    .from(doseEvents)
    .innerJoin(medications, eq(doseEvents.medicationId, medications.id))
    .where(
      and(
        eq(doseEvents.personId, personId),
        gte(doseEvents.localDay, from),
        lte(doseEvents.localDay, to),
      ),
    )
    .orderBy(asc(doseEvents.scheduledAtUtc));
}

export async function getDose(doseId: string) {
  const [row] = await db
    .select()
    .from(doseEvents)
    .where(eq(doseEvents.id, doseId))
    .limit(1);
  return row ?? null;
}

/* ───────────────────────── dose actions ──────────────────────── */

export type DoseAction = "taken" | "skipped" | "snoozed";

export interface RecordDoseInput {
  doseId: string;
  action: DoseAction;
  deviceId?: string;
  actorUserId?: string;
  quantity?: number;
  snoozeMinutes?: number;
  now?: Date;
}

export interface RecordDoseResult {
  ok: boolean;
  /** true when the dose was already in this state — treated as success, not error. */
  alreadyApplied: boolean;
  balance?: number;
}

/**
 * Record a dose action + the matching inventory movement, atomically.
 *
 * Idempotency is guaranteed twice over:
 *   1. application level — an already-terminal dose is a no-op;
 *   2. database level — a partial unique index on inventoryEvents.doseEventId.
 * A double tap or an offline replay therefore deducts stock exactly once.
 */
export async function recordDoseAction(
  input: RecordDoseInput,
): Promise<RecordDoseResult> {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [dose] = await tx
      .select()
      .from(doseEvents)
      .where(eq(doseEvents.id, input.doseId))
      .limit(1);

    if (!dose) return { ok: false, alreadyApplied: false };

    // Already terminal → nothing to do, and crucially nothing to deduct.
    if (
      dose.status === "taken" ||
      dose.status === "skipped" ||
      dose.status === "missed"
    ) {
      return { ok: true, alreadyApplied: true };
    }

    if (input.action === "snoozed") {
      const until = new Date(now.getTime() + (input.snoozeMinutes ?? 10) * 60_000);
      await tx
        .update(doseEvents)
        .set({
          status: "snoozed",
          snoozedUntil: until,
          actedAtUtc: now,
          actedByDeviceId: input.deviceId ?? null,
          updatedAt: now,
        })
        .where(eq(doseEvents.id, input.doseId));
      return { ok: true, alreadyApplied: false };
    }

    if (input.action === "skipped") {
      await tx
        .update(doseEvents)
        .set({
          status: "skipped",
          actedAtUtc: now,
          actedByDeviceId: input.deviceId ?? null,
          updatedAt: now,
        })
        .where(eq(doseEvents.id, input.doseId));
      return { ok: true, alreadyApplied: false };
    }

    // ── taken ──
    const quantity = input.quantity ?? dose.quantity ?? 1;

    await tx
      .update(doseEvents)
      .set({
        status: "taken",
        actedAtUtc: now,
        actedByDeviceId: input.deviceId ?? null,
        quantity,
        source: input.deviceId ? "caregiver" : "caregiver",
        updatedAt: now,
      })
      .where(eq(doseEvents.id, input.doseId));

    // Guard: has this dose already been deducted?
    const [existing] = await tx
      .select()
      .from(inventoryEvents)
      .where(eq(inventoryEvents.doseEventId, input.doseId))
      .limit(1);

    if (existing) {
      return { ok: true, alreadyApplied: true };
    }

    const prior = await tx
      .select()
      .from(inventoryEvents)
      .where(eq(inventoryEvents.medicationId, dose.medicationId));

    const balance = balanceFromEvents(
      prior.map((e) => ({
        id: e.id,
        medicationId: e.medicationId,
        type: e.type,
        qty: e.qty,
        prevBalance: e.prevBalance,
        newBalance: e.newBalance,
        doseEventId: e.doseEventId,
      })),
    );

    const event = buildInventoryEvent({
      medicationId: dose.medicationId,
      currentBalance: balance,
      delta: -quantity,
      type: "doseTaken",
      doseEventId: dose.id,
      deviceId: input.deviceId,
    });

    await tx.insert(inventoryEvents).values({
      ...event,
      atUtc: now,
      deviceId: input.deviceId ?? null,
    });

    await tx
      .update(medications)
      .set({ balanceCache: event.newBalance, updatedAt: now })
      .where(eq(medications.id, dose.medicationId));

    return { ok: true, alreadyApplied: false, balance: event.newBalance };
  });
}

/* ─────────────────────────── inventory ───────────────────────── */

export async function listInventoryEvents(medicationId: string) {
  return db
    .select()
    .from(inventoryEvents)
    .where(eq(inventoryEvents.medicationId, medicationId))
    .orderBy(asc(inventoryEvents.atUtc), asc(inventoryEvents.id));
}

export async function addStock(
  medicationId: string,
  qty: number,
  opts: { type?: "purchase" | "manualAdd" | "correction"; reason?: string; deviceId?: string } = {},
) {
  return db.transaction(async (tx) => {
    const prior = await tx
      .select()
      .from(inventoryEvents)
      .where(eq(inventoryEvents.medicationId, medicationId));

    const balance = balanceFromEvents(prior);
    const delta = opts.type === "correction" ? qty - balance : qty;

    const event = buildInventoryEvent({
      medicationId,
      currentBalance: balance,
      delta,
      type: opts.type ?? "purchase",
      reason: opts.reason,
      deviceId: opts.deviceId,
    });

    await tx.insert(inventoryEvents).values({ ...event, deviceId: opts.deviceId ?? null });
    await tx
      .update(medications)
      .set({ balanceCache: event.newBalance })
      .where(eq(medications.id, medicationId));

    return event.newBalance;
  });
}

/* ──────────────────────────── audit ──────────────────────────── */

export async function writeAudit(entry: {
  userId?: string;
  actorDeviceId?: string;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    actorDeviceId: entry.actorDeviceId ?? null,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });
}

export async function listAudit(limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.atUtc)).limit(limit);
}

/* ────────────────────────── adapters ─────────────────────────── */

export function toMedicationLike(m: Medication): MedicationLike {
  return {
    id: m.id,
    personId: m.personId,
    startDate: m.startDate,
    endDate: m.endDate,
    status: m.status,
  };
}

export function toScheduleLike(s: Schedule): ScheduleLike {
  return {
    id: s.id,
    medicationId: s.medicationId,
    kind: s.kind,
    times: s.times ?? [],
    quantityPerDose: s.quantityPerDose,
    anchorDate: s.anchorDate,
    endDate: s.endDate,
    weekdays: s.weekdays,
    intervalN: s.intervalN,
    taperSteps: s.taperSteps,
    activeFrom: s.activeFrom,
    activeTo: s.activeTo,
  };
}

export { addDays, localDayOf };
