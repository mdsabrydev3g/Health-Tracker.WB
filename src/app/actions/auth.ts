"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/core/db";
import { users } from "@/core/db/schema";
import { verifyPassword } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Same message for unknown email and wrong password — no user enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=invalid");
  }

  await startSession({ userId: user.id, email: user.email });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
