import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/token";

/**
 * Route proxy (Next 16 renamed `middleware` → `proxy`).
 *
 * Caregiver routes require a session. Mother Mode (/mother) is deliberately NOT
 * protected here — it authenticates by its device binding, not by the
 * caregiver's login (§4: the app boots straight into Mother Mode).
 */
const PROTECTED = [
  "/",
  "/medications",
  "/inventory",
  "/reports",
  "/settings",
  "/people",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/",
    "/medications/:path*",
    "/inventory/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/people/:path*",
  ],
};
