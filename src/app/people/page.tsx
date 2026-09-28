import { CaregiverNav } from "@/components/CaregiverNav";
import { Button, Card, EmptyState, SectionTitle } from "@/components/ui/primitives";
import { createPerson, } from "@/app/actions/person";
import { enrollDevice } from "@/app/actions/mother";
import { listPersons } from "@/core/db/repository";
import { requireSession } from "@/lib/session";

export default async function PeoplePage() {
  const session = await requireSession();
  const people = await listPersons(session.userId);

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="safe-top mb-4">
        <h1 className="text-2xl font-bold">الأشخاص</h1>
      </header>

      <section className="mb-6">
        <SectionTitle>العائلة</SectionTitle>
        {people.length === 0 ? (
          <EmptyState>لا يوجد أشخاص بعد</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {people.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-2">
                  <h3 className="text-lg font-bold">{p.nameAr}</h3>
                  <p className="text-sm text-slate-500">
                    {p.timezone}
                    {p.bloodType ? ` · فصيلة الدم ${p.bloodType}` : ""}
                    {p.dob ? ` · ${p.dob}` : ""}
                  </p>
                  {p.emergencyPhone ? (
                    <p className="text-sm">
                      طوارئ: {p.emergencyName ?? ""} — {p.emergencyPhone}
                    </p>
                  ) : null}

                  {/* Device enrolment: this device belongs to this person (§4). */}
                  <form action={enrollDevice}>
                    <input type="hidden" name="personId" value={p.id} />
                    <Button type="submit" variant="secondary">
                      هذا الجهاز يخص: {p.nameAr}
                    </Button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>إضافة شخص</SectionTitle>
        <Card>
          <form action={createPerson} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium">الاسم *</span>
              <input name="nameAr" required className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">تاريخ الميلاد</span>
              <input name="dob" type="date" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">فصيلة الدم</span>
              <input name="bloodType" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">المنطقة الزمنية</span>
              <input name="timezone" defaultValue="Africa/Cairo" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">الحساسية (بفواصل)</span>
              <input name="allergies" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">هاتف الطوارئ</span>
              <input name="emergencyPhone" dir="ltr" className="min-h-touch rounded-xl border border-slate-300 px-3" />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg">حفظ</Button>
            </div>
          </form>
        </Card>
      </section>

      <CaregiverNav />
    </main>
  );
}
