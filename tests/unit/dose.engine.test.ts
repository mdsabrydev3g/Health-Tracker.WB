import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRACE_MINUTES,
  generateDoseInstances,
  materialisationWindow,
  resolveDoseStatus,
  tallyDay,
  type MedicationLike,
  type ScheduleLike,
} from "@/core/engine/dose.engine";
import { addDays } from "@/core/time";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Africa/Cairo";
const PERSON = "p1";

const med = (over: Partial<MedicationLike> = {}): MedicationLike => ({
  id: "m1",
  personId: PERSON,
  startDate: "2024-01-01",
  endDate: null,
  status: "active",
  ...over,
});

const sched = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: "s1",
  medicationId: "m1",
  kind: "daily",
  times: ["08:00"],
  quantityPerDose: 1,
  anchorDate: "2024-01-01",
  activeFrom: "2024-01-01",
  activeTo: null,
  ...over,
});

const generate = (
  medications: MedicationLike[],
  schedules: ScheduleLike[],
  from: string,
  to: string,
) => generateDoseInstances({ medications, schedules, timeZone: TZ, from, to });

describe("dose engine — daily schedules", () => {
  it("generates one dose per day for a single time", () => {
    const doses = generate([med()], [sched()], "2024-01-01", "2024-01-05");
    expect(doses).toHaveLength(5);
    expect(doses[0].localDay).toBe("2024-01-01");
  });

  it("generates multiple doses per day for multiple times, sorted", () => {
    const doses = generate(
      [med()],
      [sched({ times: ["20:00", "08:00", "14:00"] })],
      "2024-01-01",
      "2024-01-02",
    );
    expect(doses).toHaveLength(6);
    // Sorted by instant, so 08:00 precedes 14:00 precedes 20:00.
    const day1 = doses.filter((d) => d.localDay === "2024-01-01");
    expect(formatInTimeZone(new Date(day1[0].scheduledAtUtc), TZ, "HH:mm")).toBe("08:00");
    expect(formatInTimeZone(new Date(day1[2].scheduledAtUtc), TZ, "HH:mm")).toBe("20:00");
  });

  it("respects the medication start date", () => {
    const doses = generate(
      [med({ startDate: "2024-01-03" })],
      [sched()],
      "2024-01-01",
      "2024-01-05",
    );
    expect(doses.map((d) => d.localDay)).toEqual([
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
    ]);
  });

  it("stops at the medication end date", () => {
    const doses = generate(
      [med({ endDate: "2024-01-03" })],
      [sched()],
      "2024-01-01",
      "2024-01-10",
    );
    expect(doses).toHaveLength(3);
  });

  it("skips paused and discontinued medications", () => {
    expect(generate([med({ status: "paused" })], [sched()], "2024-01-01", "2024-01-03")).toHaveLength(0);
    expect(
      generate([med({ status: "discontinued" })], [sched()], "2024-01-01", "2024-01-03"),
    ).toHaveLength(0);
  });
});

describe("dose engine — everyNDays / weekdays / PRN", () => {
  it("fires every N days from the anchor", () => {
    const doses = generate(
      [med()],
      [sched({ kind: "everyNDays", intervalN: 3 })],
      "2024-01-01",
      "2024-01-10",
    );
    expect(doses.map((d) => d.localDay)).toEqual([
      "2024-01-01",
      "2024-01-04",
      "2024-01-07",
      "2024-01-10",
    ]);
  });

  it("does not fire everyNDays before the anchor date", () => {
    const doses = generate(
      [med()],
      [sched({ kind: "everyNDays", intervalN: 3, anchorDate: "2024-01-05" })],
      "2024-01-01",
      "2024-01-10",
    );
    expect(doses[0].localDay).toBe("2024-01-05");
  });

  it("fires only on selected weekdays", () => {
    const doses = generate(
      [med()],
      [sched({ kind: "weekdays", weekdays: [1, 4] })], // Monday + Thursday
      "2024-01-01",
      "2024-01-14",
    );
    for (const d of doses) {
      const wd = new Date(`${d.localDay}T00:00:00Z`).getUTCDay();
      expect([1, 4]).toContain(wd);
    }
    expect(doses.length).toBeGreaterThan(0);
  });

  it("never generates scheduled instances for PRN", () => {
    const doses = generate(
      [med()],
      [sched({ kind: "prn", times: [] })],
      "2024-01-01",
      "2024-01-10",
    );
    expect(doses).toHaveLength(0);
  });
});

describe("dose engine — taper and supersession", () => {
  it("applies the quantity of the taper step covering the day", () => {
    const doses = generate(
      [med()],
      [
        sched({
          kind: "taper",
          quantityPerDose: 4,
          taperSteps: [
            { from: "2024-01-01", to: "2024-01-03", quantityPerDose: 4 },
            { from: "2024-01-04", to: "2024-01-06", quantityPerDose: 2 },
          ],
        }),
      ],
      "2024-01-01",
      "2024-01-06",
    );
    expect(doses.filter((d) => d.quantity === 4)).toHaveLength(3);
    expect(doses.filter((d) => d.quantity === 2)).toHaveLength(3);
  });

  it("produces nothing on days outside every taper step", () => {
    const doses = generate(
      [med()],
      [
        sched({
          kind: "taper",
          taperSteps: [{ from: "2024-01-01", to: "2024-01-02", quantityPerDose: 1 }],
        }),
      ],
      "2024-01-01",
      "2024-01-05",
    );
    expect(doses).toHaveLength(2);
  });

  it("closes a superseded schedule and starts the new one mid-range", () => {
    const doses = generate(
      [med()],
      [
        sched({ id: "old", activeTo: "2024-01-03" }),
        sched({ id: "new", activeFrom: "2024-01-04", times: ["08:00", "20:00"] }),
      ],
      "2024-01-01",
      "2024-01-05",
    );
    const byDay = new Map<string, number>();
    for (const d of doses) byDay.set(d.localDay, (byDay.get(d.localDay) ?? 0) + 1);
    expect(byDay.get("2024-01-02")).toBe(1); // old schedule
    expect(byDay.get("2024-01-05")).toBe(2); // new schedule
  });
});

describe("dose engine — idempotency keys", () => {
  it("is unique per person + med + instant", () => {
    const doses = generate(
      [med()],
      [sched({ times: ["08:00", "20:00"] })],
      "2024-01-01",
      "2024-01-03",
    );
    const keys = new Set(doses.map((d) => d.idempotencyKey));
    expect(keys.size).toBe(doses.length);
    expect(doses[0].idempotencyKey).toBe(`${PERSON}|m1|${doses[0].scheduledAtUtc}`);
  });
});

describe("dose engine — status resolution", () => {
  const at = (iso: string) => new Date(iso);

  it("is upcoming before the scheduled time", () => {
    expect(
      resolveDoseStatus({
        current: "upcoming",
        scheduledAtUtc: "2024-01-01T08:00:00.000Z",
        now: at("2024-01-01T07:59:00.000Z"),
        isPrn: false,
      }),
    ).toBe("upcoming");
  });

  it("is due inside the grace window", () => {
    expect(
      resolveDoseStatus({
        current: "upcoming",
        scheduledAtUtc: "2024-01-01T08:00:00.000Z",
        now: at("2024-01-01T09:00:00.000Z"),
        isPrn: false,
        graceMinutes: DEFAULT_GRACE_MINUTES,
      }),
    ).toBe("due");
  });

  it("becomes missed only after the grace window", () => {
    expect(
      resolveDoseStatus({
        current: "upcoming",
        scheduledAtUtc: "2024-01-01T08:00:00.000Z",
        now: at("2024-01-01T10:01:00.000Z"),
        isPrn: false,
        graceMinutes: DEFAULT_GRACE_MINUTES,
      }),
    ).toBe("missed");
  });

  it("never marks a PRN dose as missed", () => {
    expect(
      resolveDoseStatus({
        current: "upcoming",
        scheduledAtUtc: "2024-01-01T08:00:00.000Z",
        now: at("2024-01-05T10:01:00.000Z"),
        isPrn: true,
      }),
    ).toBe("due");
  });

  it("preserves a human-set terminal status", () => {
    expect(
      resolveDoseStatus({
        current: "taken",
        scheduledAtUtc: "2024-01-01T08:00:00.000Z",
        now: at("2024-01-05T10:01:00.000Z"),
        isPrn: false,
      }),
    ).toBe("taken");
  });
});

describe("dose engine — materialisation window and tally", () => {
  it("covers MATERIALISATION_DAYS days inclusive", () => {
    const w = materialisationWindow("2024-01-01");
    expect(w.from).toBe("2024-01-01");
    expect(w.to).toBe(addDays("2024-01-01", 13));
  });

  it("tallies today's progress", () => {
    const t = tallyDay(
      [
        { localDay: "2024-01-01", status: "taken" as const },
        { localDay: "2024-01-01", status: "due" as const },
        { localDay: "2024-01-01", status: "missed" as const },
        { localDay: "2024-01-02", status: "taken" as const },
      ],
      "2024-01-01",
    );
    expect(t).toEqual({ taken: 1, remaining: 1, missed: 1, total: 3 });
  });
});
