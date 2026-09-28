"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  DOSE_ACTIONS,
  DOSE_CHANNEL_ID,
  DOSE_CHANNEL_NAME,
  type NotificationRequest,
} from "@/core/notify/schedule";

/**
 * Local notification scheduling.
 *
 * Dose reminders are scheduled AHEAD of time from the materialised dose list —
 * not pushed live from the server. That is what makes them survive Doze and
 * (with the plugin's boot receiver) a reboot.
 *
 * Every call no-ops on web/desktop so the same code path is safe everywhere.
 */

export const ACTION_TYPE_DOSE = "DOSE_ACTIONS";

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const status = await LocalNotifications.requestPermissions();
  return status.display === "granted";
}

/** HIGH-importance channel "تذكير الجرعات" with sound + vibration (§9). */
export async function ensureDoseChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: DOSE_CHANNEL_ID,
      name: DOSE_CHANNEL_NAME,
      description: "تذكير بمواعيد الجرعات",
      importance: 5, // IMPORTANCE_MAX
      visibility: 1,
      sound: "default",
      vibration: true,
    });
  } catch {
    // Older Android versions may not support channels; scheduling still works.
  }
}

export async function registerDoseActions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_DOSE,
          actions: DOSE_ACTIONS.map((a) => ({ id: a.id, title: a.title })),
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

export async function scheduleDoseNotifications(
  requests: NotificationRequest[],
): Promise<number> {
  if (!Capacitor.isNativePlatform() || requests.length === 0) return 0;

  await ensureDoseChannel();
  await registerDoseActions();

  // Cancel everything we own first, then re-add. Stable ids mean a reschedule
  // replaces rather than duplicates (see doseNotificationId).
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) =>
    requests.some((r) => r.id === n.id),
  );
  if (mine.length > 0) {
    await LocalNotifications.cancel({
      notifications: mine.map((n) => ({ id: n.id })),
    });
  }

  await LocalNotifications.schedule({
    notifications: requests.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.scheduledAtUtc) },
      channelId: r.channelId,
      actionTypeId: r.extra.kind === "dose" ? ACTION_TYPE_DOSE : undefined,
      extra: r.extra,
      sound: "default",
      smallIcon: "ic_stat_notify",
    })),
  });

  return requests.length;
}

export async function cancelAllDoseNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length === 0) return;
  await LocalNotifications.cancel({
    notifications: pending.notifications.map((n) => ({ id: n.id })),
  });
}

/** Next alarm we know about — written to devices.alarmHealth for the watchdog. */
export async function nextPendingAlarmAt(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length === 0) return null;
  const times = pending.notifications
    .map((n) => (n.schedule?.at ? new Date(n.schedule.at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  return times.length ? new Date(times[0]).toISOString() : null;
}

export interface DoseActionEvent {
  doseId?: string;
  actionId?: string;
  notificationId?: number;
}

/**
 * Fires when the mother taps an action on the notification.
 * Returns an unsubscribe function.
 */
export function onDoseAction(
  handler: (e: DoseActionEvent) => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(() => {});
  return LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (event) => {
      handler({
        doseId: event.notification?.extra?.doseId as string | undefined,
        actionId: event.actionId,
        notificationId: event.notification?.id,
      });
    },
  ) as unknown as Promise<() => void>;
}
