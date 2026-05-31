import { describe, it, expect } from "vitest";
import {
  isProPlan,
  isRecruiterPlan,
  formatPlanExpiryDate,
  MAX_BATCH_BY_PLAN,
  MAX_SAVED_JD_BY_PLAN,
  MAX_CAMPAIGN_CVS,
  MAX_CAMPAIGNS,
  HISTORY_DAYS_BY_PLAN,
} from "../lib/planLimits";

describe("planLimits", () => {
  describe("isProPlan", () => {
    it("returns true for pro plan", () => {
      expect(isProPlan("pro")).toBe(true);
    });

    it("returns false for free plan", () => {
      expect(isProPlan("free")).toBe(false);
    });

    it("returns false for recruiter plan", () => {
      expect(isProPlan("recruiter")).toBe(false);
    });
  });

  describe("isRecruiterPlan", () => {
    it("returns true for recruiter plan", () => {
      expect(isRecruiterPlan("recruiter")).toBe(true);
    });

    it("returns false for pro plan", () => {
      expect(isRecruiterPlan("pro")).toBe(false);
    });

    it("returns false for free plan", () => {
      expect(isRecruiterPlan("free")).toBe(false);
    });
  });

  describe("MAX_BATCH_BY_PLAN", () => {
    it("free plan allows 1 CV batch", () => {
      expect(MAX_BATCH_BY_PLAN.free).toBe(1);
    });

    it("pro plan allows 5 CV batch", () => {
      expect(MAX_BATCH_BY_PLAN.pro).toBe(5);
    });

    it("recruiter plan allows 50 CV batch", () => {
      expect(MAX_BATCH_BY_PLAN.recruiter).toBe(50);
    });
  });

  describe("MAX_CAMPAIGN_CVS", () => {
    it("free plan allows 0 campaign CVs", () => {
      expect(MAX_CAMPAIGN_CVS.free).toBe(0);
    });

    it("pro plan allows 0 campaign CVs", () => {
      expect(MAX_CAMPAIGN_CVS.pro).toBe(0);
    });

    it("recruiter plan allows 50 campaign CVs", () => {
      expect(MAX_CAMPAIGN_CVS.recruiter).toBe(50);
    });
  });

  describe("MAX_CAMPAIGNS", () => {
    it("free plan allows 0 campaigns", () => {
      expect(MAX_CAMPAIGNS.free).toBe(0);
    });

    it("pro plan allows 0 campaigns", () => {
      expect(MAX_CAMPAIGNS.pro).toBe(0);
    });

    it("recruiter plan allows 10 campaigns", () => {
      expect(MAX_CAMPAIGNS.recruiter).toBe(10);
    });
  });

  describe("MAX_SAVED_JD_BY_PLAN", () => {
    it("free plan allows 3 saved JDs", () => {
      expect(MAX_SAVED_JD_BY_PLAN.free).toBe(3);
    });

    it("pro plan allows unlimited saved JDs", () => {
      expect(MAX_SAVED_JD_BY_PLAN.pro).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe("HISTORY_DAYS_BY_PLAN", () => {
    it("free plan keeps 7 days", () => {
      expect(HISTORY_DAYS_BY_PLAN.free).toBe(7);
    });

    it("pro plan keeps ~100 years (effectively unlimited)", () => {
      expect(HISTORY_DAYS_BY_PLAN.pro).toBe(36500);
    });
  });

  describe("formatPlanExpiryDate", () => {
    it("returns null for null input", () => {
      expect(formatPlanExpiryDate(null, "vi")).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(formatPlanExpiryDate(undefined, "vi")).toBeNull();
    });

    it("returns null for invalid date string", () => {
      expect(formatPlanExpiryDate("not-a-date", "vi")).toBeNull();
    });

    it("formats valid date in Vietnamese locale", () => {
      const result = formatPlanExpiryDate("2026-12-31T00:00:00Z", "vi");
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it("formats valid date in English locale", () => {
      const result = formatPlanExpiryDate("2026-12-31T00:00:00Z", "en");
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  });
});