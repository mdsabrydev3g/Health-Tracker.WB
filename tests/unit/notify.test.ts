import { describe, expect, it } from "vitest";
import {
  DOSE_CHANNEL_ID,
  MISSED_DOSE_ADVICE,
  SNOOZE_MINUTES,
  buildDoseNotification,
  buildEscalationNotification,
  buildFollowUpNotification,
  doseNotificationId,
} from "@/core/notify/schedule";

const input = {
  doseId: "3f2a1b4c-5d6e-7f80-91a2-b3c4d5e6f708",
  medicationName: "أسبرين",
  quantity: 1,
  strength: "81 mg",
  foodRuleText: "بعد الإفطار",
  scheduledAtUtc: "2026-09-28T06:00:00.000Z",
  timeZone: "Africa/Cairo",
};

describe("notification ids", () => {
  it("is deterministic for the same dose", () => {
    const a = doseNotificationId(input.doseId);
    const b = doseNotificationId(input.doseId);
    expect(a).toBe(b);
  });

  it("stays inside positive int32 (Capacitor requirement)", () => {
    for (const id of [input.doseId, "a", "z".repeat(200), "٠١٢٣"]) {
      const n = doseNotificationId(id);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(0x7fffffff);
    }
  });

  it("gives different doses different ids", () => {
    expect(doseNotificationId("dose-a")).not.toBe(doseNotificationId("dose-b"));
  });
});

describe("dose notification content", () => {
  it("titles with the medication name", () => {
    const n = buildDoseNotification(input);
    expect(n.title).toContain("أسبرين");
    expect(n.title).toContain("حان موعد جرعة");
  });

  it("uses correct Arabic pluralisation in the body", () => {
    expect(buildDoseNotification({ ...input, quantity: 1 }).body).toContain("1 جرعة");
    expect(buildDoseNotification({ ...input, quantity: 2 }).body).toContain("جرعتان");
    expect(buildDoseNotification({ ...input, quantity: 3 }).body).toContain("3 جرعات");
  });

  it("includes strength and food rule", () => {
    const n = buildDoseNotification(input);
    expect(n.body).toContain("81 mg");
    expect(n.body).toContain("بعد الإفطار");
  });

  it("targets the dedicated dose channel", () => {
    expect(buildDoseNotification(input).channelId).toBe(DOSE_CHANNEL_ID);
  });

  it("offers the three required actions", () => {
    const ids = buildDoseNotification(input).actions.map((a) => a.id);
    expect(ids).toEqual(["taken", "notyet", "snooze"]);
  });

  it("carries the dose id so the tap can resolve the dose", () => {
    expect(buildDoseNotification(input).extra.doseId).toBe(input.doseId);
    expect(buildDoseNotification(input).extra.kind).toBe("dose");
  });
});

describe("follow-up and escalation", () => {
  it("uses a different id so it never clobbers the original alarm", () => {
    const base = buildDoseNotification(input);
    const follow = buildFollowUpNotification(input, 120);
    expect(follow.id).not.toBe(base.id);
    expect(follow.extra.kind).toBe("followup");
  });

  it("mentions the elapsed grace window", () => {
    expect(buildFollowUpNotification(input, 120).body).toContain("120 دقيقة");
  });

  it("gives the caregiver an informational alert with NO actions", () => {
    const e = buildEscalationNotification({
      personName: "الوالدة",
      medicationName: "أسبرين",
      scheduledAtUtc: input.scheduledAtUtc,
      timeZone: "Africa/Cairo",
      missedCount: 1,
    });
    expect(e.actions).toHaveLength(0);
    expect(e.body).toContain("الوالدة");
  });

  it("pluralises the missed count correctly", () => {
    const mk = (n: number) =>
      buildEscalationNotification({
        personName: "p",
        medicationName: "m",
        scheduledAtUtc: input.scheduledAtUtc,
        timeZone: "Africa/Cairo",
        missedCount: n,
      }).title;
    expect(mk(1)).toContain("جرعة واحدة");
    expect(mk(2)).toContain("جرعتان");
    expect(mk(5)).toContain("5 جرعات");
  });

  it("never tells anyone to double a dose", () => {
    expect(MISSED_DOSE_ADVICE).not.toContain("ضاعف");
    expect(MISSED_DOSE_ADVICE).toContain("الطبيب");
  });
});

describe("snooze options", () => {
  it("offers the documented choices", () => {
    expect([...SNOOZE_MINUTES]).toEqual([5, 10, 15, 30]);
  });
});
