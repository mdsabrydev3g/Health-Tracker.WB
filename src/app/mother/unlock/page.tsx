import { Lock } from "lucide-react";
import { unlockMotherMode } from "@/app/actions/mother";
import { Button, Card } from "@/components/ui/primitives";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main
      dir="rtl"
      lang="ar"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6 text-mother"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-800 text-white">
          <Lock size={40} />
        </div>
        <h1 className="text-2xl font-bold">رقم المرور</h1>
        <p className="text-slate-500">أدخل رقم مرور مسؤول الرعاية للخروج</p>
      </div>

      <Card>
        <form action={unlockMotherMode} className="flex flex-col gap-4">
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            required
            className="min-h-touch-lg rounded-xl border border-slate-300 px-4 text-center text-2xl tracking-widest"
          />
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
              رقم المرور غير صحيح
            </p>
          ) : null}
          <Button type="submit" size="lg">
            خروج
          </Button>
        </form>
      </Card>
    </main>
  );
}
