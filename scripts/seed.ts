/**
 * Seed — creates the caregiver account, the mother's profile, and a realistic
 * cardiac + gastric medication set (~9 meds) with schedules and opening stock.
 *
 * Run: npm run db:seed   (requires DATABASE_URL, and AUTH_SECRET for the PIN)
 *
 * Idempotent: skips creation when the caregiver email already exists.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  inventoryEvents,
  medications,
  persons,
  schedules,
  users,
} from "@/core/db/schema";
import { hashPassword, hashPin } from "@/lib/auth";
import { buildInventoryEvent } from "@/core/engine/inventory.engine";

/* ── tiny .env loader (tsx does not read Next's env files) ── */
for (const file of [".env.local", ".env"]) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* file simply absent */
  }
}

const EMAIL = process.env.SEED_CAREGIVER_EMAIL ?? "caregiver@example.com";
const PASSWORD = process.env.SEED_CAREGIVER_PASSWORD ?? "change-me-now";
const PIN = process.env.SEED_CAREGIVER_PIN ?? "1234";

interface MedSeed {
  nameAr: string;
  nameEn: string;
  strengthValue: number;
  strengthUnit: string;
  form: "tablet" | "capsule" | "syrup" | "injection" | "drops" | "inhaler" | "patch" | "other";
  times: string[];
  quantityPerDose: number;
  kind: "daily" | "everyNDays" | "weekdays" | "prn" | "taper";
  foodRuleMode: "with" | "before" | "after" | "emptyStomach" | "avoid" | "custom";
  foodRuleText?: string;
  condition: string;
  stock: number;
  packagePrice: number;
  packageSize: number;
}

/** The mother's real-world regimen: cardiac + gastric protection. */
const MEDS: MedSeed[] = [
  {
    nameAr: "أسبرين",
    nameEn: "Aspirin",
    strengthValue: 81,
    strengthUnit: "mg",
    form: "tablet",
    times: ["08:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "after",
    foodRuleText: "بعد الإفطار",
    condition: "القلب — مضاد للتخثر",
    stock: 28,
    packagePrice: 30,
    packageSize: 30,
  },
  {
    nameAr: "بيسوبرولول (كونكور)",
    nameEn: "Bisoprolol",
    strengthValue: 5,
    strengthUnit: "mg",
    form: "tablet",
    times: ["08:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "with",
    condition: "ضغط الدم والقلب",
    stock: 30,
    packagePrice: 75,
    packageSize: 30,
  },
  {
    nameAr: "راميبريل (تريتاس)",
    nameEn: "Ramipril",
    strengthValue: 5,
    strengthUnit: "mg",
    form: "capsule",
    times: ["20:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "with",
    condition: "ضغط الدم",
    stock: 30,
    packagePrice: 90,
    packageSize: 30,
  },
  {
    nameAr: "أتورفاستاتين (ليبيتور)",
    nameEn: "Atorvastatin",
    strengthValue: 20,
    strengthUnit: "mg",
    form: "tablet",
    times: ["20:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "after",
    foodRuleText: "بعد العشاء",
    condition: "الكوليسترول",
    stock: 30,
    packagePrice: 120,
    packageSize: 30,
  },
  {
    nameAr: "فوروسيميد (لازيكس)",
    nameEn: "Furosemide",
    strengthValue: 40,
    strengthUnit: "mg",
    form: "tablet",
    times: ["08:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "emptyStomach",
    foodRuleText: "على معدة فارغة صباحاً",
    condition: "احتباس السوائل",
    stock: 20,
    packagePrice: 25,
    packageSize: 30,
  },
  {
    nameAr: "كلوبيدوجريل (بلافيكس)",
    nameEn: "Clopidogrel",
    strengthValue: 75,
    strengthUnit: "mg",
    form: "tablet",
    times: ["08:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "with",
    condition: "القلب — مضاد للتخثر",
    stock: 28,
    packagePrice: 180,
    packageSize: 28,
  },
  {
    nameAr: "أوميبرازول",
    nameEn: "Omeprazole",
    strengthValue: 20,
    strengthUnit: "mg",
    form: "capsule",
    times: ["07:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "emptyStomach",
    foodRuleText: "قبل الإفطار بنصف ساعة",
    condition: "حماية المعدة",
    stock: 30,
    packagePrice: 45,
    packageSize: 30,
  },
  {
    nameAr: "نيتروجليسرين",
    nameEn: "Nitroglycerin",
    strengthValue: 0.5,
    strengthUnit: "mg",
    form: "tablet",
    times: [], // PRN — log only, never "missed"
    quantityPerDose: 1,
    kind: "prn",
    foodRuleMode: "custom",
    foodRuleText: "تحت اللسان عند ألم الصدر",
    condition: "ألم الصدر — عند الحاجة",
    stock: 20,
    packagePrice: 35,
    packageSize: 20,
  },
  {
    nameAr: "كالسيوم + فيتامين د",
    nameEn: "Calcium + Vitamin D",
    strengthValue: 500,
    strengthUnit: "mg",
    form: "tablet",
    times: ["14:00"],
    quantityPerDose: 1,
    kind: "daily",
    foodRuleMode: "after",
    foodRuleText: "بعد الغداء",
    condition: "العظام",
    stock: 60,
    packagePrice: 60,
    packageSize: 60,
  },
];

async function main() {
  const db = getDb();

  const existing = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  let userId: string;

  if (existing.length > 0) {
    userId = existing[0].id;
    console.log(`• Caregiver already exists: ${EMAIL}`);
  } else {
    const [user] = await db
      .insert(users)
      .values({
        email: EMAIL,
        passwordHash: await hashPassword(PASSWORD),
        pinHash: await hashPin(PIN),
        displayName: "مسؤول الرعاية",
      })
      .returning({ id: users.id });
    userId = user.id;
    console.log(`✓ Caregiver created: ${EMAIL} / ${PASSWORD} (PIN ${PIN})`);
  }

  const people = await db.select().from(persons).where(eq(persons.userId, userId)).limit(1);
  let personId: string;

  if (people.length > 0) {
    personId = people[0].id;
    console.log(`• Person already exists: ${people[0].nameAr}`);
  } else {
    const [person] = await db
      .insert(persons)
      .values({
        userId,
        nameAr: "الوالدة",
        dob: "1948-01-01",
        gender: "female",
        timezone: "Africa/Cairo",
        bloodType: "O+",
        allergies: ["بنسلين"],
        notes: "مريضة قلب — ٩ أدوية يومية تقريباً",
        emergencyName: "مسؤول الرعاية",
        emergencyPhone: "+20XXXXXXXXXX",
        emergencyRelation: "ابن/ابنة",
      })
      .returning({ id: persons.id });
    personId = person.id;
    console.log("✓ Person created: الوالدة");
  }

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;

  for (const m of MEDS) {
    const dup = await db
      .select()
      .from(medications)
      .where(and(eq(medications.personId, personId), eq(medications.nameAr, m.nameAr)))
      .limit(1);
    if (dup.length > 0) continue;

    const [med] = await db
      .insert(medications)
      .values({
        personId,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        strengthValue: m.strengthValue,
        strengthUnit: m.strengthUnit,
        form: m.form,
        packageKind: "direct",
        pillCount: m.packageSize,
        startDate: today,
        foodRuleMode: m.foodRuleMode,
        foodRuleText: m.foodRuleText ?? null,
        costPackagePrice: m.packagePrice,
        costPackageSize: m.packageSize,
        costCurrency: "EGP",
        condition: m.condition,
        status: "active",
        balanceCache: m.stock,
      })
      .returning({ id: medications.id });

    await db.insert(schedules).values({
      medicationId: med.id,
      kind: m.kind,
      times: m.times,
      quantityPerDose: m.quantityPerDose,
      dosesPerDay: m.times.length,
      anchorDate: today,
      prnMaxPerDay: m.kind === "prn" ? 3 : null,
      activeFrom: today,
    });

    if (m.stock > 0) {
      const event = buildInventoryEvent({
        medicationId: med.id,
        currentBalance: 0,
        delta: m.stock,
        type: "initial",
        reason: "رصيد افتتاحي",
      });
      await db.insert(inventoryEvents).values({ ...event, atUtc: new Date() });
    }
    created++;
  }

  console.log(`✓ ${created} medications created (${MEDS.length} total in regimen)`);
  console.log("\nDone. Start the app with: npm run dev");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
