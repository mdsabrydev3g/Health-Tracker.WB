import { HeartPulse } from "lucide-react";
import { login } from "@/app/actions/auth";
import { Button, Card } from "@/components/ui/primitives";

const ERRORS: Record<string, string> = {
  missing: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
  invalid: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 text-white">
          <HeartPulse size={44} />
        </div>
        <h1 className="text-3xl font-bold">Health Tracker</h1>
        <p className="text-slate-500">متابعة الأدوية والصحة — للعائلة</p>
      </div>

      <Card>
        <form action={login} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/"} />

          <label className="flex flex-col gap-2">
            <span className="font-medium">البريد الإلكتروني</span>
            <input
              name="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              className="min-h-touch rounded-xl border border-slate-300 px-4 text-left"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">كلمة المرور</span>
            <input
              name="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              className="min-h-touch rounded-xl border border-slate-300 px-4 text-left"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
              {ERRORS[error] ?? "حدث خطأ، يرجى المحاولة مرة أخرى"}
            </p>
          ) : null}

          <Button type="submit" size="lg">
            دخول
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-slate-400">
        هذا التطبيق للاستخدام الشخصي للعائلة فقط — ليس جهازاً طبياً ولا يقدّم
        استشارات طبية.
      </p>
    </main>
  );
}
