/**
 * Session token — jose only. Safe to import from Edge middleware.
 * Kept separate from auth.ts so that bcrypt never enters the edge bundle.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ht_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with: openssl rand -base64 48",
    );
  }
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  userId: string;
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId as string, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
