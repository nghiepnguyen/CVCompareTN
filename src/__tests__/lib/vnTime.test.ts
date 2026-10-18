import { describe, it, expect } from "vitest";
import { VN_TIME_ZONE, vnDateParts, vnStartOfDay, vnSignupQuotaCycle } from "../../lib/vnTime";
import { formatPlanExpiryDate } from "../../lib/planLimits";
import { computeYearsOfExperience } from "../../services/ai/parsedCvNormalize";

describe("vnTime", () => {
  it("test host runs outside ICT", () => {
    expect(new Date("2026-01-31T17:00:00Z").getDate()).toBe(31);
  });

  it("vnDateParts rolls the day at 17:00 UTC (month end)", () => {
    expect(vnDateParts(new Date("2026-01-31T16:59:59Z"))).toEqual({ y: 2026, m: 0, day: 31 });
    expect(vnDateParts(new Date("2026-01-31T17:00:00Z"))).toEqual({ y: 2026, m: 1, day: 1 });
  });

  it("vnDateParts rolls the year at 17:00 UTC on Dec 31", () => {
    expect(vnDateParts(new Date("2026-12-31T16:59:59Z"))).toEqual({ y: 2026, m: 11, day: 31 });
    expect(vnDateParts(new Date("2026-12-31T17:00:00Z"))).toEqual({ y: 2027, m: 0, day: 1 });
  });

  it("vnStartOfDay returns 00:00 ICT as a UTC instant", () => {
    expect(vnStartOfDay(new Date("2026-03-01T02:00:00Z")).toISOString()).toBe("2026-02-28T17:00:00.000Z");
    expect(vnStartOfDay(new Date("2026-02-28T18:00:00Z")).toISOString()).toBe("2026-02-28T17:00:00.000Z");
    expect(vnStartOfDay(new Date("2026-02-28T16:00:00Z")).toISOString()).toBe("2026-02-27T17:00:00.000Z");
  });

  it("vnStartOfDay shifts by days and months across boundaries", () => {
    const newYear = new Date("2026-12-31T17:30:00Z"); // 2027-01-01 00:30 ICT
    expect(vnStartOfDay(newYear, -7).toISOString()).toBe("2026-12-24T17:00:00.000Z");
    expect(vnStartOfDay(newYear, 0, -1).toISOString()).toBe("2026-11-30T17:00:00.000Z");
  });

  describe("vnSignupQuotaCycle matches current_quota_cycle(reset_day)", () => {
    it("uses the ICT day, not the UTC day", () => {
      expect(vnSignupQuotaCycle(new Date("2026-10-14T18:00:00Z"))).toEqual({ resetDay: 15, usageMonth: "2026-10-15" });
    });

    it.each([
      ["2026-01-28T17:00:00Z", "2026-01-29"],
      ["2026-01-30T05:00:00Z", "2026-01-30"],
      ["2026-01-30T17:00:00Z", "2026-01-31"],
    ])("clamps day 29-31 to reset day 28 (%s = ICT %s)", (iso) => {
      expect(vnSignupQuotaCycle(new Date(iso))).toEqual({ resetDay: 28, usageMonth: "2026-01-28" });
    });

    it("rolls the year at 17:00 UTC on Dec 31", () => {
      expect(vnSignupQuotaCycle(new Date("2026-12-31T17:00:00Z"))).toEqual({ resetDay: 1, usageMonth: "2027-01-01" });
    });
  });

  it("formatPlanExpiryDate shows the ICT date", () => {
    expect(formatPlanExpiryDate("2026-11-18T17:30:00Z", "vi")).toBe("19/11/2026");
    expect(formatPlanExpiryDate("2026-11-18T16:30:00Z", "vi")).toBe("18/11/2026");
  });

  it("toLocaleString with VN_TIME_ZONE ignores the host zone", () => {
    const s = new Date("2026-12-31T17:00:00Z").toLocaleDateString("vi-VN", { timeZone: VN_TIME_ZONE });
    expect(s).toBe("1/1/2027");
  });

  it("computeYearsOfExperience counts the current ICT month", () => {
    const work = [{ duration: { start: "02/2026", end: "", is_current: true } }];
    // 2026-02-28 17:00Z is already March in ICT: Feb..Mar = 2 months.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ict = computeYearsOfExperience(work as any, new Date("2026-02-28T17:00:00Z"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = computeYearsOfExperience(work as any, new Date("2026-02-28T16:00:00Z"));
    expect(ict).not.toBe(before);
  });
});
