import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Correct Arabic pluralisation (§14) — never a naive count + label.
 * 1 → جرعة · 2 → جرعتان · 3-10 → جرعات · 11+ → جرعة
 */
export function pluralizeDose(n: number): string {
  if (n === 1) return "جرعة";
  if (n === 2) return "جرعتان";
  if (n >= 3 && n <= 10) return "جرعات";
  return "جرعة";
}

export function pluralizeDay(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return "أيام";
  return "يوماً";
}

/** Eastern Arabic numerals toggle (§14). */
export function formatNumber(n: number, eastern = false): string {
  if (!eastern) return String(n);
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
}
