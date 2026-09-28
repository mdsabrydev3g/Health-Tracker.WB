import Link from "next/link";
import { AlertTriangle, Check, Clock, Moon } from "lucide-react";
import { actOnDose } from "@/app/actions/dose";
import { CaregiverNav } from "@/components/CaregiverNav";
import { DoseStatusBadge } from "@/components/DoseStatus";
import { Badge, Button, Card, EmptyState, SectionTitle, StatCard } from "@/components/ui/primitives";
import type { BoardDose } from "@/server/board";
import { getBoard } from "@/server/board";
import { requireSession } from "@/lib/session";
import { formatTimeAr } from "@/core/time";
import { pluralizeDose } from "@/lib/utils";

function DoseActions({ dose, size = "md" }: { dose: BoardDose; size?: "md" | "lg" }) {
  const done = dose.status === "taken" || dose.status === "skipped";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={actOnDose}>
        <input type="hidden" name="doseId" value={dose.id} />
        <input type="hidden" name="action" value="taken" />
        <Button type="submit" size={size} disabled={done}>
          <Check size={size === "lg" ? 28 : 18} />
          أخذت الدواء
        </Button>
      </form>

      <form action={actOnDose}>
        <input type="hidden" name="doseId" value={dose.id} />
        <input type="hidden" name="action" value="snoozed" />
        <input type="hidden" name="snoozeMinutes" value="15" />
        <Button type="submit" variant="secondary" size={size} disabled={done}>
          <Clock size={size === "lg" ? 28 : 18} />
          تأجيل ١٥ دقيقة
        </Button>
      </form>

      <form action={actOnDose}>
        <input type="hidden" name="doseId" value={dose.id} />
        <input type="hidden" name="action" value="skipped" />
        <Button type="submit" variant="ghost" size={size} disabled={done}>
          تخطي
        </Button>
      </form>
    </div>
  );
}

export default async function TodayPage() {
  const session = await requireSession();
  const board = await getBoard(session.userId);

  if (!board) {
    return (
      <main className="mx-auto max-w-3xl p-6 pb-28">
        <EmptyState>
          لا يوجد أشخاص بعد. <Link href="/people" className="text-brand-700 underline">أضف شخصاً</Link> للبدء.
        </EmptyState>
        <CaregiverNav />
      </main>
    );
  }

  const { today, tally, adherence7, streak, nextDose, timeZone } = board;

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="safe-top mb-4">
        <h1 className="text-2xl font-bold">اليوم</h1>
        <p className="text-slate-500">
          {board.personName} · {today}
        </p>
      </header>

      {board.alerts.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2">
          {board.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                a.tone === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertTriangle className="mt-1 shrink-0" size={20} />
              <span className="font-medium">{a.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Next dose — the single most important thing on this screen (§10). */}
      <section className="mb-6">
        <SectionTitle>الجرعة القادمة</SectionTitle>
        {nextDose ? (
          <Card className="border-2 border-brand-300 bg-brand-50">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-2xl font-bold text-brand-900">{nextDose.medicationName}</h3>
              <span className="text-3xl font-bold tabular-nums text-brand-800">
                {formatTimeAr(new Date(nextDose.scheduledAtUtc), timeZone)}
              </span>
            </div>
            <p className="mt-1 text-slate-600">
              {nextDose.strength ? `${nextDose.strength} · ` : ""}
              {nextDose.quantity} {pluralizeDose(nextDose.quantity)}
              {nextDose.foodRuleText ? ` · ${nextDose.foodRuleText}` : ""}
            </p>
            <div className="mt-4">
              <DoseActions dose={nextDose} size="lg" />
            </div>
          </Card>
        ) : (
          <EmptyState>لا توجد جرعات متبقية اليوم</EmptyState>
        )}
      </section>

      {/* One-glance stats (§1.4). */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="تم أخذها" value={tally.taken} tone="ok" />
        <StatCard label="متبقية" value={tally.remaining} tone="info" />
        <StatCard label="فائتة" value={tally.missed} tone="danger" />
        <StatCard
          label="الالتزام (٧ أيام)"
          value={adherence7.adherencePct == null ? "—" : `${adherence7.adherencePct}%`}
          hint={`متتالية: ${streak} يوم`}
        />
      </section>

      {/* Today's timeline */}
      <section>
        <SectionTitle>جدول اليوم</SectionTitle>
        {board.todayDoses.length === 0 ? (
          <EmptyState>لا توجد جرعات مجدولة لهذا اليوم</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {board.todayDoses.map((d) => (
              <li key={d.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold">{d.medicationName}</h3>
                      <p className="text-sm text-slate-500">
                        {formatTimeAr(new Date(d.scheduledAtUtc), timeZone)}
                        {d.strength ? ` · ${d.strength}` : ""}
                        {d.foodRuleText ? ` · ${d.foodRuleText}` : ""}
                      </p>
                    </div>
                    <DoseStatusBadge status={d.status} />
                  </div>
                  <DoseActions dose={d} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex justify-center">
        <Link href="/mother">
          <Badge tone="info">
            <Moon size={14} className="ml-1" />
            فتح وضع الوالدة
          </Badge>
        </Link>
      </div>

      <CaregiverNav />
    </main>
  );
}
