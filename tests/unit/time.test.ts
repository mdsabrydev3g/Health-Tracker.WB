import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  enumerateLocalDays,
  localDayOf,
  weekdayOf,
  zonedToUtc,
} from "@/core/time";
import { formatInTimeZone } from "date-fns-tz";

describe("time helpers — local-day enumeration", () => {
  it("crosses a month boundary correctly", () => {
    expect(enumerateLocalDays("2024-01-30", "2024-02-02")).toEqual([
      "2024-01-30",
      "2024-01-31",
      "2024-02-01",
      "2024-02-02",
    ]);
  });

  it("handles a leap year February", () => {
    const days = enumerateLocalDays("2024-02-27", "2024-03-01");
    expect(days).toHaveLength(4);
    expect(days).toContain("2024-02-29");
  });

  it("has no Feb 29 in a non-leap year", () => {
    const days = enumerateLocalDays("2023-02-27", "2023-03-01");
    expect(days).toEqual(["2023-02-27", "2023-02-28", "2023-03-01"]);
  });

  it("crosses a year boundary", () => {
    expect(enumerateLocalDays("2023-12-30", "2024-01-02")).toHaveLength(4);
  });

  it("returns a single day when from === to", () => {
    expect(enumerateLocalDays("2024-05-05", "2024-05-05")).toEqual([
      "2024-05-05",
    ]);
  });

  it("returns empty for an inverted range", () => {
    expect(enumerateLocalDays("2024-05-06", "2024-05-05")).toEqual([]);
  });
});

describe("time helpers — arithmetic", () => {
  it("adds days across a month end", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("computes signed day distances", () => {
    expect(daysBetween("2024-01-01", "2024-01-01")).toBe(0);
    expect(daysBetween("2024-01-01", "2024-01-04")).toBe(3);
    expect(daysBetween("2024-12-31", "2025-01-01")).toBe(1);
  });

  it("maps weekdays with 0 = Sunday", () => {
    // 2024-01-07 was a Sunday.
    expect(weekdayOf("2024-01-07")).toBe(0);
    expect(weekdayOf("2024-01-13")).toBe(6); // Saturday
  });
});

describe("time helpers — DST safety (Africa/Cairo)", () => {
  const tz = "Africa/Cairo";

  it("keeps an 08:00 dose at 08:00 local across the spring transition", () => {
    // Egypt reintroduced DST; in 2024 it began late April.
    const before = zonedToUtc("2024-04-25", "08:00", tz);
    const after = zonedToUtc("2024-04-27", "08:00", tz);

    expect(formatInTimeZone(before, tz, "HH:mm")).toBe("08:00");
    expect(formatInTimeZone(after, tz, "HH:mm")).toBe("08:00");
  });

  it("keeps an 08:00 dose at 08:00 local across the autumn transition", () => {
    const before = zonedToUtc("2024-10-30", "08:00", tz);
    const after = zonedToUtc("2024-11-01", "08:00", tz);
    expect(formatInTimeZone(before, tz, "HH:mm")).toBe("08:00");
    expect(formatInTimeZone(after, tz, "HH:mm")).toBe("08:00");
  });

  it("produces different UTC instants on either side of the transition", () => {
    const before = zonedToUtc("2024-04-25", "08:00", tz);
    const after = zonedToUtc("2024-04-27", "08:00", tz);
    // Prove we are not blindly adding a fixed +02:00 offset.
    const hourBefore = Number(formatInTimeZone(before, "UTC", "H"));
    const hourAfter = Number(formatInTimeZone(after, "UTC", "H"));
    expect(hourBefore).not.toBe(hourAfter);
  });

  it("derives the local day from an instant, not from UTC arithmetic", () => {
    // 23:30 Cairo on 2024-05-01 is still 2024-05-01 locally even though it
    // may already be the 2nd in UTC.
    const instant = zonedToUtc("2024-05-01", "23:30", tz);
    expect(localDayOf(instant, tz)).toBe("2024-05-01");
  });
});
