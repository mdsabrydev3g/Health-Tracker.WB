import { CaregiverNav } from "@/components/CaregiverNav";
import { Card, EmptyState, SectionTitle, StatCard } from "@/components/ui/primitives";
import { requireSession } from "@/lib/session";
import {
  listDoses,
  listMedications,
  listPersons,
  listSchedules,
  toScheduleLike,
} from "@/core/db/repository";
import {
  computeAdherence,
  computeStreak,
  dailyBreakdown,
} from "@/core/engine/adherence.engine";
import { buildCostRows, totalMonthly } from "@/core/engine/cost.engine";
import { addDays, localDayOf } from "@/core/time";
import { formatNumber, pluralizeDay } from "@/lib/utils";

export default async function ReportsPage() {
  const session = await requireSession();
  const people = await listPersons(session.userId);
  const person = people[0];
  if (!person) {
    return (
      <main className="mx-auto max-w-3xl p-6 pb-28">
        <EmptyState>أضف شخصاً أولاً</EmptyState>
        <CaregiverNav />
      </main>
    );
  }

  const now = new Date();
  const tz = person.timezone;
  const today = localDayOf(now, tz);
  const from30 = addDays(today, -29);

  const rows = await listDoses(person.id, from30, today);
  const doses = rows.map(({ dose }) => ({
    localDay: dose.localDay,
    scheduledAtUtc: new Date(dose.scheduledAtUtc).toISOString(),
    status: dose.status as never,
  }));

  const last7 = doses.filter((d) => d.localDay >= addDays(today, -6));
  const a7 = computeAdherence(last7, now);
  const a30 = computeAdherence(doses, now);
  const streak = computeStreak(doses, today);
  const breakdown = dailyBreakdown(doses, from30, today).slice(-14);

  const meds = await listMedications(person.id, true);
  const scheds = meds.length ? await listSchedules(meds.map((m) => m.id)) : [];
  const costRows = buildCostRows(
    meds.map((m) => ({
      id: m.id,
      nameAr: m.nameAr,
      schedules: scheds.filter((s) => s.medicationId === m.id).map(toScheduleLike),
      cost: {
        costPackagePrice: m.costPackagePrice,
        costPackageSize: m.costPackageSize,
        currency: m.costCurrency,
      },
    })),
  );
  const monthly = totalMonthly(costRows);
  const currency = costRows[0]?.currency ?? "EGP";

  const maxBar = Math.max(1, ...breakdown.map((b) => b.taken + b.missed + b.skipped));

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="safe-top mb-4">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <p className="text-slate-500">{person.nameAr}</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="التزام ٧ أيام"
          value={a7.adherencePct == null ? "—" : `${a7.adherencePct}%`}
          tone={a7.adherencePct != null && a7.adherencePct >= 90 ? "ok" : "warn"}
        />
        <StatCard
          label="التزام ٣٠ يوم"
          value={a30.adherencePct == null ? "—" : `${a30.adherencePct}%`}
          tone={a30.adherencePct != null && a30.adherencePct >= 90 ? "ok" : "warn"}
        />
        <StatCard label="أيام متتالية" value={`${streak} ${pluralizeDay(streak)}`} tone="ok" />
        <StatCard label="جرعات فائتة (٣٠ يوم)" value={a30.missed} tone={a30.missed > 0 ? "danger" : "ok"} />
      </section>

      <section className="mb-6">
        <SectionTitle>آخر ١٤ يوم</SectionTitle>
        <Card>
          <ul className="flex h-40 items-end justify-between gap-1">
            {breakdown.map((b) => {
              const taken = b.taken;
              const missed = b.missed + b.skipped;
              const total = taken + missed;
              const h = total === 0 ? 4 : Math.max(8, (total / maxBar) * 140);
              return (
                <li key={b.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-col justify-end" style={{ height: `${h}px` }}>
                    {missed > 0 ? (
                      <div className="w-full rounded-t bg-rose-400" style={{ height: `${(missed / total) * 100}%` }} />
                    ) : null}
                    {taken > 0 ? (
                      <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(taken / total) * 100}%` }} />
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-400">{b.day.slice(8)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-emerald-500" /> تم أخذها
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-rose-400" /> فائتة/متخطاة
            </span>
          </div>
        </Card>
      </section>

      <section className="mb-6">
        <SectionTitle>التكلفة التقديرية</SectionTitle>
        <Card>
          <p className="mb-3 text-2xl font-bold">
            {formatNumber(Math.round(monthly))} {currency}
            <span className="mr-2 text-sm font-normal text-slate-500">شهرياً</span>
          </p>
          {costRows.length === 0 ? (
            <p className="text-slate-500">لا توجد بيانات تكلفة</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {costRows.map((r) => (
                <li key={r.medicationId} className="flex justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
                  <span>{r.nameAr}</span>
                  <span className="tabular-nums text-slate-600">
                    {r.monthlyCost == null ? "—" : `${formatNumber(Math.round(r.monthlyCost))} ${r.currency}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <p className="text-center text-xs text-slate-400">
        الأرقام للمرجعية السريعة فقط ولا تُغني عن مراجعة الطبيب.
      </p>

      <CaregiverNav />
    </main>
  );
}
