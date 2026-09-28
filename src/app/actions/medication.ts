"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/core/db";
import { inventoryEvents, medications, schedules } from "@/core/db/schema";
import { listPersons } from "@/core/db/repository";
import { buildInventoryEvent } from "@/core/engine/inventory.engine";
import { requireSession } from "@/lib/session";
import { localDayOf } from "@/core/time";

function parseTimes(raw: string): string[] {
  return raw
    .split(/[,\s،]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [h, m] = t.split(":");
      return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
    });
}

function parseWeekdays(raw: string): number[] {
  return raw
    .split(/[,\s،]+/)
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export async function createMedication(formData: FormData) {
  const session = await requireSession();
  const people = await listPersons(session.userId);
  const person = people[0];
  if (!person) throw new Error("لا يوجد شخص مضاف");

  const nameAr = String(formData.get("nameAr") ?? "").trim();
  if (!nameAr) throw new Error("اسم الدواء مطلوب");

  const kind = String(formData.get("scheduleKind") ?? "daily");
  const times = kind === "prn" ? [] : parseTimes(String(formData.get("times") ?? "08:00"));
  if (kind !== "prn" && times.length === 0) times.push("08:00");

  const packageKind = String(formData.get("packageKind") ?? "direct");
  const strips = Number(formData.get("strips") ?? 0) || null;
  const pillsPerStrip = Number(formData.get("pillsPerStrip") ?? 0) || null;
  const pillCount = Number(formData.get("pillCount") ?? 0) || null;
  const packageSize =
    packageKind === "strips" && strips && pillsPerStrip
      ? strips * pillsPerStrip
      : pillCount;

  const initialStock = Number(formData.get("initialStock") ?? packageSize ?? 0) || 0;
  const startDate = String(formData.get("startDate") ?? localDayOf(new Date(), person.timezone));

  await db.transaction(async (tx) => {
    const [med] = await tx
      .insert(medications)
      .values({
        personId: person.id,
        nameAr,
        nameEn: String(formData.get("nameEn") ?? "").trim() || null,
        strengthValue: Number(formData.get("strengthValue") ?? 0) || null,
        strengthUnit: String(formData.get("strengthUnit") ?? "").trim() || null,
        form: String(formData.get("form") ?? "tablet") as never,
        packageKind: packageKind as never,
        strips,
        pillsPerStrip,
        pillCount,
        packExpiry: String(formData.get("packExpiry") ?? "").trim() || null,
        startDate,
        foodRuleMode: String(formData.get("foodRuleMode") ?? "with") as never,
        foodRuleText: String(formData.get("foodRuleText") ?? "").trim() || null,
        costPackagePrice: Number(formData.get("costPackagePrice") ?? 0) || null,
        costPackageSize: packageSize,
        costCurrency: String(formData.get("costCurrency") ?? "EGP"),
        doctor: String(formData.get("doctor") ?? "").trim() || null,
        condition: String(formData.get("condition") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
        status: "active",
        balanceCache: initialStock,
      })
      .returning({ id: medications.id });

    await tx.insert(schedules).values({
      medicationId: med.id,
      kind: kind as never,
      times,
      quantityPerDose: Number(formData.get("quantityPerDose") ?? 1) || 1,
      dosesPerDay: times.length,
      anchorDate: startDate,
      weekdays: kind === "weekdays" ? parseWeekdays(String(formData.get("weekdays") ?? "")) : null,
      intervalN: kind === "everyNDays" ? Number(formData.get("intervalN") ?? 2) || 2 : null,
      activeFrom: startDate,
    });

    // Opening balance is an event like everything else (§7 append-only).
    if (initialStock > 0) {
      const event = buildInventoryEvent({
        medicationId: med.id,
        currentBalance: 0,
        delta: initialStock,
        type: "initial",
        reason: "رصيد افتتاحي",
      });
      await tx.insert(inventoryEvents).values({ ...event, atUtc: new Date() });
    }
  });

  // Materialisation happens on the next board read.
  revalidatePath("/");
  revalidatePath("/medications");
  revalidatePath("/inventory");
}
