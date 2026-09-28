import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { actOnDose } from "@/app/actions/dose";
import { Button, Card } from "@/components/ui/primitives";
import { buildBoard } from "@/server/board";
import { getSession } from "@/lib/session";
import { listPersons } from "@/core/db/repository";
import { formatTimeAr } from "@/core/time";
import { pluralizeDose } from "@/lib/utils";

/**
 * MOTHER MODE (§4 / §10 / §14)
 *
 * One screen. Giant text. Two decisions: "أخذت الدواء" or "تأجيل".
 * No navigation, no settings, no costs, no other people, no documents.
 */

async function resolvePersonId(): Promise<string | null> {
  const store = await cookies();
  const bound = store.get("ht_mother_person")?.value;
  if (bound) return bound;

  // Not yet enrolled — a caregiver session may be previewing Mother Mode.
  const session = await getSession();
  if (!session) return null;
  const people = await listPersons(session.userId);
  return people[0]?.id ?? null;
}

export default async function MotherPage() {
  const personId = await resolvePersonId();
  if (!personId) redirect("/login");

  const board = await buildBoard(personId);
  if (!board) redirect("/login");

  const { nextDose, tally, timeZone } = board;
  const progress = tally.total === 0 ? 0 : Math.round((tally.taken / tally.total) * 100);

  return (
    <main
      dir="rtl"
      lang="ar"
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-5 text-mother safe-top safe-bottom"
    >
      <header className="text-center">
        <p className="text-xl text-slate-500">اليوم</p>
        <p className="text-2xl font-bold">
          أخذت {tally.taken} من {tally.total} {pluralizeDose(tally.total)}
        </p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {nextDose ? (
        <Card className="flex flex-col gap-4 border-4 border-brand-400 p-6 text-center">
          <p className="text-xl text-brand-700">حان موعد جرعة</p>
          <h1 className="text-4xl font-bold leading-tight">{nextDose.medicationName}</h1>
          <p className="text-3xl font-bold tabular-nums text-brand-800">
            {formatTimeAr(new Date(nextDose.scheduledAtUtc), timeZone)}
          </p>
          <p className="text-xl text-slate-600">
            {nextDose.quantity} {pluralizeDose(nextDose.quantity)}
            {nextDose.strength ? ` · ${nextDose.strength}` : ""}
            {nextDose.foodRuleText ? ` · ${nextDose.foodRuleText}` : ""}
          </p>

          <form action={actOnDose}>
            <input type="hidden" name="doseId" value={nextDose.id} />
            <input type="hidden" name="action" value="taken" />
            <Button type="submit" size="xl" className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Check size={36} />
              أخذت الدواء
            </Button>
          </form>

          <form action={actOnDose}>
            <input type="hidden" name="doseId" value={nextDose.id} />
            <input type="hidden" name="action" value="snoozed" />
            <input type="hidden" name="snoozeMinutes" value="15" />
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <Clock size={24} />
              تأجيل ١٥ دقيقة
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-2xl font-bold text-emerald-700">
            {tally.total === 0 ? "لا توجد جرعات اليوم" : "انتهت جرعات اليوم"}
          </p>
        </Card>
      )}

      {tally.missed > 0 ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-rose-800">
          لم يتم تسجيل {tally.missed} {pluralizeDose(tally.missed)}. راجع تعليمات
          الطبيب أو النشرة الدوائية لمعرفة الإجراء المناسب.
        </p>
      ) : null}

      {/* Hidden exit — requires the caregiver PIN (§4). */}
      <div className="mt-auto text-center">
        <Link href="/mother/unlock" className="text-xs text-slate-300">
          ⋯
        </Link>
      </div>
    </main>
  );
}
