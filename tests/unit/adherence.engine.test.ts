import { describe, expect, it } from "vitest";
import {
  computeAdherence,
  computeStreak,
  dailyBreakdown,
  type AdherenceDose,
} from "@/core/engine/adherence.engine";

const now = new Date("2024-01-10T12:00:00.000Z");

const d = (
  localDay: string,
  status: AdherenceDose["status"],
  over: Partial<AdherenceDose> = {},
): AdherenceDose => ({
  localDay,
  scheduledAtUtc: `${localDay}T08:00:00.000Z`,
  status,
  ...over,
});

describe("adherence — percentage", () => {
  it("counts taken over taken + missed + skipped", () => {
    const r = computeAdherence(
      [d("2024-01-01", "taken"), d("2024-01-02", "taken"), d("2024-01-03", "missed"), d("2024-01-04", "skipped")],
      now,
    );
    expect(r.countable).toBe(4);
    expect(r.adherencePct).toBe(50);
  });

  it("returns null rather than 0% when nothing is countable", () => {
    const r = computeAdherence([], now);
    expect(r.adherencePct).toBeNull();
  });

  it("excludes doses that are not yet due from the denominator", () => {
    const r = computeAdherence(
      [
        d("2024-01-01", "taken"),
        d("2030-01-01", "upcoming"), // future
      ],
      now,
    );
    expect(r.pending).toBe(0);
    expect(r.countable).toBe(1);
    expect(r.adherencePct).toBe(100);
  });

  it("excludes PRN doses entirely", () => {
    const r = computeAdherence(
      [d("2024-01-01", "taken"), d("2024-01-02", "missed", { isPrn: true })],
      now,
    );
    expect(r.countable).toBe(1);
    expect(r.adherencePct).toBe(100);
  });

  it("does not punish a cancelled dose", () => {
    const r = computeAdherence(
      [d("2024-01-01", "taken"), d("2024-01-02", "cancelled")],
      now,
    );
    expect(r.missed).toBe(0);
    expect(r.adherencePct).toBe(100);
  });

  it("counts a past-but-unactioned dose as pending, not missed", () => {
    const r = computeAdherence([d("2024-01-01", "upcoming")], now);
    expect(r.pending).toBe(1);
    expect(r.adherencePct).toBeNull();
  });
});

describe("adherence — streaks", () => {
  it("counts consecutive days without a missed dose", () => {
    const doses = [
      d("2024-01-10", "taken"),
      d("2024-01-09", "taken"),
      d("2024-01-08", "taken"),
    ];
    expect(computeStreak(doses, "2024-01-10")).toBe(3);
  });

  it("stops at the first missed day", () => {
    const doses = [
      d("2024-01-10", "taken"),
      d("2024-01-09", "taken"),
      d("2024-01-08", "missed"),
      d("2024-01-07", "taken"),
    ];
    expect(computeStreak(doses, "2024-01-10")).toBe(2);
  });

  it("treats a day with no scheduled doses as neutral", () => {
    const doses = [d("2024-01-10", "taken"), d("2024-01-08", "taken")];
    expect(computeStreak(doses, "2024-01-10")).toBe(2);
  });

  it("returns zero when today has a missed dose", () => {
    const doses = [d("2024-01-10", "missed"), d("2024-01-09", "taken")];
    expect(computeStreak(doses, "2024-01-10")).toBe(0);
  });
});

describe("adherence — daily breakdown", () => {
  it("produces one row per day in the range", () => {
    const rows = dailyBreakdown(
      [d("2024-01-01", "taken"), d("2024-01-01", "missed"), d("2024-01-02", "taken")],
      "2024-01-01",
      "2024-01-03",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ day: "2024-01-01", taken: 1, missed: 1, skipped: 0 });
    expect(rows[2]).toEqual({ day: "2024-01-03", taken: 0, missed: 0, skipped: 0 });
  });
});
