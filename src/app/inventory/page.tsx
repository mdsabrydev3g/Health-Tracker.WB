import { AlertTriangle, Package } from "lucide-react";
import { CaregiverNav } from "@/components/CaregiverNav";
import { Badge, Card, EmptyState, SectionTitle, StatCard } from "@/components/ui/primitives";
import { getBoard } from "@/server/board";
import { requireSession } from "@/lib/session";
import { formatNumber } from "@/lib/utils";

const TONE_BY_STATUS = {
  ok: "ok",
  low: "warn",
  depleted: "danger",
  expiryRisk: "danger",
} as const;

export default async function InventoryPage() {
  const session = await requireSession();
  const board = await getBoard(session.userId);

  if (!board) {
    return (
      <main className="mx-auto max-w-3xl p-6 pb-28">
        <EmptyState>أضف شخصاً أولاً</EmptyState>
        <CaregiverNav />
      </main>
    );
  }

  const urgent = board.medications.filter((m) => m.stock.status !== "ok");

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="safe-top mb-4">
        <h1 className="text-2xl font-bold">المخزون</h1>
        <p className="text-slate-500">{board.personName}</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="عدد الأدوية" value={board.medications.length} />
        <StatCard
          label="تحتاج إعادة تعبئة"
          value={urgent.length}
          tone={urgent.length > 0 ? "danger" : "ok"}
        />
        <StatCard
          label="تنبيهات"
          value={board.alerts.length}
          tone={board.alerts.length > 0 ? "warn" : "ok"}
        />
      </section>

      {urgent.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>يحتاج انتباهًا</SectionTitle>
          <ul className="flex flex-col gap-2">
            {urgent.map((m) =>
              m.stock.warnings.map((w, i) => (
                <li
                  key={`${m.id}-${i}`}
                  className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
                >
                  <AlertTriangle className="mt-1 shrink-0" size={20} />
                  <span className="font-medium">
                    {m.nameAr}: {w.messageAr}
                  </span>
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionTitle>كل الأدوية</SectionTitle>
        {board.medications.length === 0 ? (
          <EmptyState>لا توجد أدوية بعد</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {board.medications.map((m) => (
              <li key={m.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Package size={20} className="text-slate-400" />
                      <h3 className="text-lg font-bold">{m.nameAr}</h3>
                    </div>
                    <Badge tone={TONE_BY_STATUS[m.stock.status]}>
                      {m.stock.status === "ok"
                        ? "كافٍ"
                        : m.stock.status === "low"
                          ? "منخفض"
                          : m.stock.status === "depleted"
                            ? "نفد"
                            : "صلاحية"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-slate-500">الرصيد</span>
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(Math.round(m.stock.balance * 100) / 100)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">الاستهلاك/يوم</span>
                      <p className="text-xl font-bold tabular-nums">
                        {formatNumber(Math.round(m.stock.dailyConsumption * 100) / 100)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">يكفي حتى</span>
                      <p className="text-lg font-bold">
                        {m.stock.depletionDate ?? "—"}
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CaregiverNav />
    </main>
  );
}
