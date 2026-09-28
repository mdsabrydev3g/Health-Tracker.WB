"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Settings } from "lucide-react";
import { openBatterySettings, openExactAlarmSettings } from "@/lib/alarm-health";

interface DeviceHealth {
  id: string;
  label: string;
  boundTo: string | null;
  problems: string[];
}

/**
 * Caregiver dashboard banner — "zero silent failures" (§1.7).
 *
 * If the mother's phone can no longer fire an alarm (notifications off, exact
 * alarms revoked, Doze not exempted, or no reschedule in >36h) the caregiver is
 * told here instead of assuming she was reminded.
 */
export function AlarmHealthBanner() {
  const [devices, setDevices] = useState<DeviceHealth[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/devices/alarm-health", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { devices: DeviceHealth[] };
        if (alive) setDevices(data.devices);
      } catch {
        /* offline — do not alarm the caregiver about the alarm checker */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const broken = (devices ?? []).filter((d) => d.problems.length > 0);
  if (broken.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {broken.map((d) => (
        <div
          key={d.id}
          className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-900"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0" size={22} />
            <div className="flex-1">
              <p className="font-bold">
                {d.boundTo ? `جهاز ${d.boundTo}` : d.label} — التذكير معطّل
              </p>
              <ul className="mt-1 list-inside list-disc text-sm">
                {d.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openExactAlarmSettings()}
                  className="inline-flex min-h-touch items-center gap-2 rounded-xl bg-rose-600 px-4 font-semibold text-white"
                >
                  <Settings size={18} />
                  فتح إعدادات الإنذارات
                </button>
                <button
                  type="button"
                  onClick={() => void openBatterySettings()}
                  className="inline-flex min-h-touch items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 font-semibold text-rose-800"
                >
                  إعدادات البطارية
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
