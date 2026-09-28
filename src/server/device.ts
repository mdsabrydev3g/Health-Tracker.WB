import { cookies } from "next/headers";
import { listPersons } from "@/core/db/repository";
import { getSession } from "@/lib/session";

export const MOTHER_COOKIE = "ht_mother_person";

/**
 * Resolve which person this request is about.
 *
 * Mother Mode devices carry a binding cookie and no session; the caregiver's
 * devices have a session and no binding (§4 — a caregiver device is bound to
 * nobody and receives informational alerts only).
 */
export async function resolvePersonId(): Promise<string | null> {
  const store = await cookies();
  const bound = store.get(MOTHER_COOKIE)?.value;
  if (bound) return bound;

  const session = await getSession();
  if (!session) return null;
  const people = await listPersons(session.userId);
  return people[0]?.id ?? null;
}

/** True when this device is bound to a person (i.e. it is a Mother Mode device). */
export async function isBoundDevice(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(MOTHER_COOKIE)?.value);
}

export async function resolveUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}
