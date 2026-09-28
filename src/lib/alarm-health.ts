"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Alarm-health watchdog client (§1.7 zero silent failures, §9).
 *
 * Backed by the custom Android plugin in
 * android/app/src/main/java/com/healthtracker/app/AlarmHealthPlugin.java.
 * On web/desktop every call degrades gracefully to `null` so the caregiver UI
 * simply shows no banner rather than crashing.
 */

export interface AlarmHealth {
  notifGranted: boolean;
  exactAlarmGranted: boolean;
  batteryExempt: boolean;
  sdkInt?: number;
}

interface AlarmHealthNative {
  getHealth(): Promise<AlarmHealth>;
  canScheduleExactAlarms(): Promise<{ granted: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
}

const Native = registerPlugin<AlarmHealthNative>("AlarmHealth");

export const isNative = () => Capacitor.isNativePlatform();

export async function getAlarmHealth(): Promise<AlarmHealth | null> {
  if (!isNative()) return null;
  try {
    return await Native.getHealth();
  } catch {
    return null;
  }
}

/** Everything that must be true for a reminder to actually wake the phone. */
export function healthProblems(h: AlarmHealth | null): string[] {
  if (!h) return [];
  const problems: string[] = [];
  if (!h.notifGranted) {
    problems.push("الإشعارات مغلقة — لن يصل أي تذكير");
  }
  if (!h.exactAlarmGranted) {
    problems.push("الإنذارات الدقيقة غير مفعّلة — قد يصل التذكير متأخراً");
  }
  if (!h.batteryExempt) {
    problems.push("تحسين البطارية مفعل — قد يؤجّل النظام التذكير");
  }
  return problems;
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await Native.openExactAlarmSettings();
  } catch {
    /* user can still reach it via system settings */
  }
}

export async function openBatterySettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await Native.openBatterySettings();
  } catch {
    /* ignore */
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await Native.openNotificationSettings();
  } catch {
    /* ignore */
  }
}
