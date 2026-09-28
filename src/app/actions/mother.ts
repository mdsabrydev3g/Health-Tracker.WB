"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/core/db";
import { users } from "@/core/db/schema";
import { verifyPin } from "@/lib/auth";

/** Not exported: a "use server" module may only export async functions. */
const MOTHER_COOKIE = "ht_mother_person";

/**
 * Bind this device to a person and boot into Mother Mode.
 * Called once during enrolment by the caregiver (§4).
 */
export async function enrollDevice(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  if (!personId) return;

  const store = await cookies();
  store.set(MOTHER_COOKIE, personId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  redirect("/mother");
}

/**
 * Exit Mother Mode. Requires the caregiver PIN — a secret that is separate
 * from the account password and from the app-lock PIN (§4).
 */
export async function unlockMotherMode(formData: FormData) {
  const pin = String(formData.get("pin") ?? "");

  // Single family account: the one caregiver row.
  const [user] = await db.select().from(users).limit(1);
  if (!user?.pinHash || !(await verifyPin(pin, user.pinHash))) {
    redirect("/mother/unlock?error=1");
  }

  const store = await cookies();
  store.delete(MOTHER_COOKIE);
  redirect("/");
}
