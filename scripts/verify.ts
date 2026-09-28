/**
 * Integration verification — exercises the real database through the repository
 * layer, not the engines in isolation.
 *
 * Focus: the acceptance criterion that is easiest to get wrong.
 *   "Marking a dose taken twice (double tap / offline retry) deducts inventory
 *    exactly once." (§16)
 *
 * Run (env must already be exported, or present in .env.local for `npm run`):
 *   npx tsx scripts/verify.ts
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  doseEvents,
  inventoryEvents,
  medications,
  persons,
} from "@/core/db/schema";
import * as repo from "@/core/db/repository";
import { balanceFromEvents, computeStock } from "@/core/engine/inventory.engine";
import { localDayOf } from "@/core/time";

const db = getDb();
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function balanceOf(medicationId: string): Promise<number> {
  const rows = await db
    .select()
    .from(inventoryEvents)
    .where(eq(inventoryEvents.medicationId, medicationId));
  return balanceFromEvents(rows);
}

async function main() {
  const [person] = await db.select().from(persons).limit(1);
  if (!person) throw new Error("No person found. Run: npm run db:seed");
  console.log(`Person: ${person.nameAr} (tz ${person.timezone})\n`);

  const today = localDayOf(new Date(), person.timezone);

  // 1 — materialisation
  const created = await repo.materialiseDoses(person.id, person.timezone, today);
  check("materialiseDoses generated instances", created > 0, `${created} generated`);

  const reRun = await repo.materialiseDoses(person.id, person.timezone, today);
  check("re-materialisation is idempotent", reRun === created, `${reRun} on 2nd run`);

  const allDoses = await db
    .select()
    .from(doseEvents)
    .where(eq(doseEvents.personId, person.id));
  check(
    "dose rows in DB match generated count",
    allDoses.length === created,
    `${allDoses.length} rows`,
  );

  // 2 — pick an actionable scheduled dose
  const target = allDoses.find((d) => d.status === "upcoming" || d.status === "due");
  if (!target) throw new Error("No actionable dose found");

  const [med] = await db
    .select()
    .from(medications)
    .where(eq(medications.id, target.medicationId))
    .limit(1);
  console.log(`\nTarget dose: ${med.nameAr} @ ${target.scheduledAtUtc}`);

  const before = await balanceOf(med.id);
  console.log(`Balance before: ${before}`);

  // 3 — first "taken"
  const first = await repo.recordDoseAction({ doseId: target.id, action: "taken" });
  check("first taken succeeded", first.ok && !first.alreadyApplied);

  const after1 = await balanceOf(med.id);
  const expected = before - (target.quantity ?? 1);
  check(
    "inventory deducted by the dose quantity",
    Math.abs(after1 - expected) < 1e-9,
    `${before} → ${after1} (expected ${expected})`,
  );

  // 4 — THE acceptance test: a second "taken" must be a no-op
  const second = await repo.recordDoseAction({ doseId: target.id, action: "taken" });
  check("second taken reports alreadyApplied", second.alreadyApplied === true);

  const after2 = await balanceOf(med.id);
  check(
    "double tap did NOT deduct again",
    Math.abs(after2 - after1) < 1e-9,
    `still ${after2}`,
  );

  const deductions = await db
    .select()
    .from(inventoryEvents)
    .where(eq(inventoryEvents.doseEventId, target.id));
  check(
    "exactly one inventory event per dose",
    deductions.length === 1,
    `${deductions.length} rows`,
  );

  // 5 — inventory event chain integrity
  const chain = await db
    .select()
    .from(inventoryEvents)
    .where(eq(inventoryEvents.medicationId, med.id));
  let running = 0;
  let consistent = true;
  for (const e of chain) {
    if (Math.abs(e.prevBalance - running) > 1e-9) consistent = false;
    running = e.newBalance;
  }
  check("inventory event chain is internally consistent", consistent);

  // 6 — stock report
  const scheds = await repo.listSchedules([med.id]);
  const stock = computeStock({
    events: chain,
    schedules: scheds.map(repo.toScheduleLike),
    today,
    packExpiry: med.packExpiry,
  });
  check(
    "stock report is coherent",
    Math.abs(stock.balance - after2) < 1e-9,
    `balance ${stock.balance}, ${stock.dailyConsumption}/day, status ${stock.status}, depletion ${stock.depletionDate ?? "n/a"}`,
  );

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
