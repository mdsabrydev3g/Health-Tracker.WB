import { Plus } from "lucide-react";
import { CaregiverNav } from "@/components/CaregiverNav";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui/primitives";
import { createMedication } from "@/app/actions/medication";
import {
  listMedications,
  listPersons,
  listSchedules,
  toScheduleLike,
} from "@/core/db/repository";
import { computeStock } from "@/core/engine/inventory.engine";
import { db } from "@/core/db";
import { inventoryEvents } from "@/core/db/schema";
import { inArray } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { localDayOf } from "@/core/time";
import { formatNumber } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  daily: "يومياً",
  everyNDays: "كل عدة أيام",
  weekdays: "أيام محددة",
  prn: "عند الحاجة",
  taper: "جرعات متناقصة",
};

const FOOD_LABEL: Record<string, string> = {
  with: "مع الأكل",
  before: "قبل الأكل",
  after: "بعد الأكل",
  emptyStomach: "على معدة فارغة",
  avoid: "تجنب أطعمة معينة",
  custom: "حسب التعليمات",
};

function describeSchedule(s: ReturnType<typeof toScheduleLike>): string {
  const times = s.times.join("، ");
  if (s.kind === "prn") return "عند الحاجة";
  if (s.kind === "everyNDays") return `كل ${s.intervalN ?? 2} أيام · ${times}`;
  if (s.kind === "weekdays") return `أيام ${(s.weekdays ?? []).join("، ")} · ${times}`;
  return `${KIND_LABEL[s.kind] ?? s.kind} · ${times}`;
}

export default async function MedicationsPage() {
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

  const today = localDayOf(new Date(), person.timezone);
  const meds = await listMedications(person.id, false);
  const scheds = meds.length ? await listSchedules(meds.map((m) => m.id)) : [];
  const invRows = meds.length
    ? await db
        .select()
        .from(inventoryEvents)
        .where(inArray(inventoryEvents.medicationId, meds.map((m) => m.id)))
    : [];

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="safe-top mb-4">
        <h1 className="text-2xl font-bold">الأدوية</h1>
        <p className="text-slate-500">{person.nameAr}</p>
      </header>

      <section className="mb-6">
        <SectionTitle>قائمة الأدوية</SectionTitle>
        {meds.length === 0 ? (
          <EmptyState>لا توجد أدوية بعد — أضف أول دواء بالأسفل</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {meds.map((m) => {
              const own = invRows.filter((e) => e.medicationId === m.id);
              const stock = computeStock({
                events: own,
                schedules: scheds.filter((s) => s.medicationId === m.id).map(toScheduleLike),
                today,
                packExpiry: m.packExpiry,
                lowStockThresholdDays: 2,
              });
              return (
                <li key={m.id}>
                  <Card className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-bold">{m.nameAr}</h3>
                      <div className="flex flex-wrap gap-2">
                        {m.status !== "active" ? (
                          <Badge tone="muted">{m.status}</Badge>
                        ) : null}
                        {stock.status !== "ok" ? (
                          <Badge tone={stock.status === "expiryRisk" ? "danger" : "warn"}>
                            {stock.status === "depleted"
                              ? "نفد"
                              : stock.status === "expiryRisk"
                                ? "صلاحية"
                                : "مخزون منخفض"}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm text-slate-500">
                      {m.strengthValue ? `${m.strengthValue} ${m.strengthUnit ?? ""} · ` : ""}
                      {FOOD_LABEL[m.foodRuleMode] ?? m.foodRuleMode}
                      {m.condition ? ` · ${m.condition}` : ""}
                    </p>
                    <p className="text-sm text-slate-600">
                      {scheds
                        .filter((s) => s.medicationId === m.id)
                        .map((s) => describeSchedule(toScheduleLike(s)))
                        .join(" | ") || "بدون جدول"}
                    </p>
                    <p className="text-sm">
                      <span className="text-slate-500">المخزون: </span>
                      <span className="font-bold tabular-nums">
                        {formatNumber(Math.round(stock.balance * 100) / 100)}
                      </span>
                      {stock.remainingDays != null ? (
                        <span className="text-slate-500">
                          {" "}
                          · يكفي {Math.floor(stock.remainingDays)} يوم
                        </span>
                      ) : null}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>إضافة دواء</SectionTitle>
        <Card>
          <form action={createMedication} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium">اسم الدواء (عربي) *</span>
              <input name="nameAr" required className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الاسم بالإنجليزية</span>
              <input name="nameEn" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">التركيز</span>
              <div className="flex gap-2">
                <input name="strengthValue" type="number" step="0.01" dir="ltr" className="min-h-touch w-24 rounded-xl border border-slate-300 px-3" />
                <input name="strengthUnit" placeholder="mg" dir="ltr" className="min-h-touch w-24 rounded-xl border border-slate-300 px-3" />
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الشكل</span>
              <select name="form" className="min-h-touch rounded-xl border border-slate-300 px-3">
                <option value="tablet">قرص</option>
                <option value="capsule">كبسولة</option>
                <option value="syrup">شراب</option>
                <option value="injection">حقنة</option>
                <option value="drops">قطرات</option>
                <option value="inhaler">بخاخ</option>
                <option value="patch">لاصقة</option>
                <option value="other">أخرى</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">نوع الجدول</span>
              <select name="scheduleKind" className="min-h-touch rounded-xl border border-slate-300 px-3">
                <option value="daily">يومياً</option>
                <option value="everyNDays">كل N أيام</option>
                <option value="weekdays">أيام محددة</option>
                <option value="prn">عند الحاجة</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">المواعيد (مثال: 08:00, 20:00)</span>
              <input name="times" defaultValue="08:00" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الكمية في الجرعة</span>
              <input name="quantityPerDose" type="number" step="0.5" defaultValue="1" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">N (لكل N أيام)</span>
              <input name="intervalN" type="number" defaultValue="2" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">أيام الأسبوع (0=أحد)</span>
              <input name="weekdays" placeholder="1,4" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">مع الأكل</span>
              <select name="foodRuleMode" className="min-h-touch rounded-xl border border-slate-300 px-3">
                {Object.entries(FOOD_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">ملاحظة الغذاء</span>
              <input name="foodRuleText" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">تاريخ البداية</span>
              <input name="startDate" type="date" defaultValue={today} dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">تاريخ انتهاء الصلاحية</span>
              <input name="packExpiry" type="date" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الرصيد الافتتاحي</span>
              <input name="initialStock" type="number" defaultValue="30" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">سعر العلبة</span>
              <input name="costPackagePrice" type="number" step="0.01" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الحالة المرضية</span>
              <input name="condition" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium">الطبيب</span>
              <input name="doctor" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>

            <div className="sm:col-span-2">
              <Button type="submit" size="lg">
                <Plus size={20} />
                حفظ الدواء
              </Button>
            </div>
          </form>
        </Card>
      </section>

      <CaregiverNav />
    </main>
  );
}
