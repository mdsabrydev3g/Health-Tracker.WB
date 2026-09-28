import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/core/db";
import { devices, persons } from "@/core/db/schema";
import { resolvePersonId, resolveUserId } from "@/server/device";

/**
 * POST /api/devices/alarm-health
 *
 * The watchdog (§9). The native shell reports, after every reschedule:
 *   { deviceId, exactAlarmGranted, batteryExempt, notifGranted, nextAlarmAtUtc }
 *
 * The caregiver dashboard shows a red banner if the MOTHER's device loses any of
 * these — because a reminder that silently does not fire is worse than none.
 */
export async function POST(req: Request) {
  let body: {
    deviceId?: string;
    exactAlarmGranted?: boolean;
    batteryExempt?: boolean;
    notifGranted?: boolean;
    nextAlarmAtUtc?: string | null;
    label?: string;
    platform?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const personId = await resolvePersonId();
  const userId = await resolveUserId();
  if (!personId && !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const alarmHealth = {
    exactAlarmGranted: body.exactAlarmGranted ?? false,
    batteryExempt: body.batteryExempt ?? false,
    notifGranted: body.notifGranted ?? false,
    lastRescheduleAtUtc: now.toISOString(),
    // jsonb field is typed `string | undefined` — normalise null away.
    nextAlarmAtUtc: body.nextAlarmAtUtc ?? undefined,
  };

  if (body.deviceId) {
    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, body.deviceId))
      .limit(1);

    if (existing) {
      await db
        .update(devices)
        .set({ alarmHealth, lastSeenAt: now, updatedAt: now })
        .where(eq(devices.id, body.deviceId));
      return NextResponse.json({ ok: true, deviceId: body.deviceId });
    }
  }

  // First report from this device — register it.
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [created] = await db
    .insert(devices)
    .values({
      userId,
      label: body.label ?? "جهاز غير مسمّى",
      platform: (body.platform === "android" ? "android" : "web") as "android" | "web",
      boundPersonId: personId ?? null,
      alarmHealth,
      lastSeenAt: now,
    })
    .returning({ id: devices.id });

  return NextResponse.json({ ok: true, deviceId: created.id }, { status: 201 });
}

/**
 * GET /api/devices/alarm-health
 *
 * What the caregiver dashboard reads: is the mother's phone still able to fire
 * an alarm? Stale (>36h since last reschedule) counts as a problem too.
 */
export async function GET() {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: devices.id,
      label: devices.label,
      platform: devices.platform,
      alarmHealth: devices.alarmHealth,
      lastSeenAt: devices.lastSeenAt,
      personName: persons.nameAr,
    })
    .from(devices)
    .leftJoin(persons, eq(devices.boundPersonId, persons.id))
    .where(eq(devices.userId, userId));

  const STALE_HOURS = 36;
  const cutoff = Date.now() - STALE_HOURS * 3600_000;

  const devicesOut = rows.map((d) => {
    const h = d.alarmHealth;
    const last = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : null;
    const problems: string[] = [];

    if (h) {
      if (!h.notifGranted) problems.push("الإشعارات مغلقة");
      if (!h.exactAlarmGranted) problems.push("الإنذارات الدقيقة غير مفعّلة");
      if (!h.batteryExempt) problems.push("تحسين البطارية مفعل");
    }
    if (last === null || last < cutoff) {
      problems.push(`لم يعُد جدولته منذ أكثر من ${STALE_HOURS} ساعة`);
    }

    return {
      id: d.id,
      label: d.label,
      platform: d.platform,
      boundTo: d.personName,
      alarmHealth: h,
      lastSeenAt: d.lastSeenAt,
      problems,
    };
  });

  return NextResponse.json({ devices: devicesOut });
}
