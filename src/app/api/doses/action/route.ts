import { NextResponse } from "next/server";
import { recordDoseAction, type DoseAction } from "@/core/db/repository";
import { resolvePersonId } from "@/server/device";

/**
 * POST /api/doses/action
 *
 * Called when the mother taps an action on the notification (أخذت الدواء /
 * تأجيل / لم آخذ بعد). Idempotent — the same tap twice records once (§16).
 */
export async function POST(req: Request) {
  const personId = await resolvePersonId();
  if (!personId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { doseId?: string; action?: string; snoozeMinutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { doseId, action, snoozeMinutes } = body;
  if (!doseId || !action) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!["taken", "skipped", "snoozed"].includes(action)) {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  const result = await recordDoseAction({
    doseId,
    action: action as DoseAction,
    snoozeMinutes: snoozeMinutes ?? 10,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    alreadyApplied: result.alreadyApplied,
    balance: result.balance ?? null,
  });
}
