"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/core/db";
import { persons } from "@/core/db/schema";
import { requireSession } from "@/lib/session";

export async function createPerson(formData: FormData) {
  const session = await requireSession();
  const nameAr = String(formData.get("nameAr") ?? "").trim();
  if (!nameAr) throw new Error("الاسم مطلوب");

  const allergies = String(formData.get("allergies") ?? "")
    .split(/[,\s،]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  await db.insert(persons).values({
    userId: session.userId,
    nameAr,
    dob: String(formData.get("dob") ?? "").trim() || null,
    gender: String(formData.get("gender") ?? "").trim() || null,
    bloodType: String(formData.get("bloodType") ?? "").trim() || null,
    timezone: String(formData.get("timezone") ?? "Africa/Cairo"),
    allergies,
    notes: String(formData.get("notes") ?? "").trim() || null,
    emergencyName: String(formData.get("emergencyName") ?? "").trim() || null,
    emergencyPhone: String(formData.get("emergencyPhone") ?? "").trim() || null,
    emergencyRelation: String(formData.get("emergencyRelation") ?? "").trim() || null,
  });

  revalidatePath("/");
  revalidatePath("/people");
}
