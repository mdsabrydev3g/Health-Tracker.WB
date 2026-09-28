"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { buildDoseNotification } from "@/core/notify/schedule";
import {
  ensureNotificationPermission,
  nextPendingAlarmAt,
  onDoseAction,
  scheduleDoseNotifications,
} from "@/lib/notifications";
import {
  getAlarmHealth,
  isNative,
  openBatterySettings,
  openExactAlarmSettings,
  openNotificationSettings,
} from "@/lib/alarm-health";

/** Stable per-install device id, kept in localStorage. */
function getDeviceId(): string {
  const KEY = "ht_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Runs only on the mother's device (native shell). It:
 *   1. asks for POST_NOTIFICATIONS,
 *   2. pulls the materialised doses and schedules LOCAL alarms,
 *   3. refuses to silently fall back — it opens the system screen if exact
 *      alarms or the battery exemption are missing,
 *   4. reports alarm health so the caregiver can see a red banner,
 *   5. handles the notification action buttons.
 *
 * Renders nothing visible except a small status line in debug builds.
 */
export function MotherReminders() {
  const router = useRouter();
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      if (!isNative()) return;

      // 1 — permission
      const granted = await ensureNotificationPermission();
      if (!granted) {
        await openNotificationSettings();
      }

      // 2 — materialised doses → alarms
      const res = await fetch("/api/doses/upcoming", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        timeZone: string;
        doses: {
          doseId: string;
          medicationName: string;
          quantity: number;
          strength: string | null;
          foodRuleText: string | null;
          scheduledAtUtc: string;
        }[];
      };

      const requests = data.doses.map((d) =>
        buildDoseNotification({
          doseId: d.doseId,
          medicationName: d.medicationName,
          quantity: d.quantity,
          strength: d.strength,
          foodRuleText: d.foodRuleText,
          scheduledAtUtc: d.scheduledAtUtc,
          timeZone: data.timeZone,
        }),
      );

      const scheduled = await scheduleDoseNotifications(requests);

      // 3 — never silently degrade
      const health = await getAlarmHealth();
      if (health && !health.exactAlarmGranted) {
        await openExactAlarmSettings();
      }
      if (health && health.notifGranted && !health.batteryExempt) {
        await openBatterySettings();
      }

      // 4 — watchdog report
      const nextAlarmAtUtc = await nextPendingAlarmAt();
      await fetch("/api/devices/alarm-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          platform: "android",
          label: "هاتف الوالدة",
          exactAlarmGranted: health?.exactAlarmGranted ?? false,
          batteryExempt: health?.batteryExempt ?? false,
          notifGranted: health?.notifGranted ?? false,
          nextAlarmAtUtc,
        }),
      });

      // Diagnostic only — intentionally not rendered (see note below).
      console.info(`[reminders] ${scheduled} scheduled`);
    } catch (err) {
      console.error("reminder sync failed", err);
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    void sync();

    // Re-schedule when the app comes back to the foreground (§6).
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    let cleanup: (() => void) | undefined;
    void onDoseAction(async (e) => {
      if (!e.doseId) return;
      const action =
        e.actionId === "taken"
          ? "taken"
          : e.actionId === "snooze"
            ? "snoozed"
            : null;
      if (!action) return; // "notyet" — leave it due, the follow-up will fire

      await fetch("/api/doses/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doseId: e.doseId, action, snoozeMinutes: 15 }),
      });
      router.refresh();
      void sync();
    }).then((fn) => {
      cleanup = fn;
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      cleanup?.();
    };
  }, [sync, router]);

  // Renders nothing: this component is infrastructure, not UI. Mother Mode must
  // stay a single screen with no extra chrome (§10).
  return null;
}
