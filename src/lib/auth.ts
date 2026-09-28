/**
 * Password + PIN hashing. Node runtime only (bcrypt) — never import this from
 * Edge middleware; import @/lib/token there instead.
 *
 * The PIN is a separate secret from the account password: it unlocks Mother
 * Mode exit and device binding, and is short enough to type on a phone.
 */

import bcrypt from "bcryptjs";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/token";
