import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/core/db";
import { doseEvents, medications, persons } from "@/core/db/schema";
import { markOverdueMissed, materialiseDoses } from "@/core/db/repository";
import { addDays, localDayOf } from "@/core/time";
import { resolvePersonId } from "@/server/device";

/**
 * GET /api/doses/upcoming
 *
 * What the native shell asks for on launch, on foreground, after any medication
 * edit, and nightly — so it can schedule local alarms from materialised doses
 * (§6 / §9). Returns the next 14 days.
 */
export async function GET() {
  const personId = await resolvePersonId();
  if (!personId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [person] = await db
    .select()
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const timeZone = person.timezone || "Africa/Cairo";
  const today = localDayOf(new Date(), timeZone);

  await materialiseDoses(person.id, timeZone, today);
  await markOverdueMissed(person.id, 120, new Date());

  const rows = await db
    .select({
      id: doseEvents.id,
      medicationId: doseEvents.medicationId,
      scheduledAtUtc: doseEvents.scheduledAtUtc,
      localDay: doseEvents.localDay,
      status: doseEvents.status,
      quantity: doseEvents.quantity,
      nameAr: medications.nameAr,
      strengthValue: medications.strengthValue,
      strengthUnit: medications.strengthUnit,
      foodRuleText: medications.foodRuleText,
    })
    .from(doseEvents)
    .innerJoin(medications, eq(doseEvents.medicationId, medications.id))
    .where(
      and(
        eq(doseEvents.personId, personId),
        gte(doseEvents.localDay, today),
        lte(doseEvents.localDay, addDays(today, 13)),
        // Only doses that still need an action are worth an alarm.
        eq(doseEvents.status, "upcoming"),
      ),
    )
    .orderBy(doseEvents.scheduledAtUtc);

  return NextResponse.json({
    personId: person.id,
    personName: person.nameAr,
    timeZone,
    today,
    doses: rows.map((r) => ({
      doseId: r.id,
      medicationId: r.medicationId,
      medicationName: r.nameAr,
      quantity: r.quantity ?? 1,
      strength:
        r.strengthValue != null
          ? `${r.strengthValue} ${r.strengthUnit ?? ""}`.trim()
          : null,
      foodRuleText: r.foodRuleText,
      scheduledAtUtc: new Date(r.scheduledAtUtc).toISOString(),
      localDay: r.localDay,
    })),
  });
}
