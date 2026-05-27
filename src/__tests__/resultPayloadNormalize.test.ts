import { describe, it, expect } from "vitest";
import {
  coerceJsonField,
  normalizeCategoryScores,
  normalizeMatchingPoints,
  normalizeMissingGaps,
  normalizeComparisonItems,
  normalizeDetailedComparison,
  normalizeRewriteSuggestions,
  normalizeStringArray,
  detailedComparisonHasRows,
  normalizeAnalysisPayload,
} from "../services/ai/resultPayloadNormalize";

describe("resultPayloadNormalize", () => {
  describe("coerceJsonField", () => {
    it("returns fallback for null", () => {
      expect(coerceJsonField(null, [])).toEqual([]);
    });

    it("returns fallback for empty string", () => {
      expect(coerceJsonField("", {})).toEqual({});
    });

    it("parses JSON string", () => {
      expect(coerceJsonField('{"a":1}', {})).toEqual({ a: 1 });
    });

    it("returns fallback on parse error", () => {
      expect(coerceJsonField("invalid json", "fallback")).toBe("fallback");
    });

    it("passes through object", () => {
      const obj = { x: 1 };
      expect(coerceJsonField(obj, {})).toBe(obj);
    });
  });

  describe("normalizeCategoryScores", () => {
    it("returns zeroed scores for null", () => {
      expect(normalizeCategoryScores(null)).toEqual({
        skills: 0,
        experience: 0,
        tools: 0,
        education: 0,
      });
    });

    it("parses valid object", () => {
      expect(
        normalizeCategoryScores({ skills: 90, experience: 80, tools: 85, education: 70 }),
      ).toEqual({ skills: 90, experience: 80, tools: 85, education: 70 });
    });

    it("coerces string scores to numbers", () => {
      expect(normalizeCategoryScores({ skills: "90", experience: "80" })).toEqual({
        skills: 90,
        experience: 80,
        tools: 0,
        education: 0,
      });
    });
  });

  describe("normalizeMatchingPoints", () => {
    it("returns empty array for null", () => {
      expect(normalizeMatchingPoints(null)).toEqual([]);
    });

    it("returns valid points", () => {
      const input = [
        { category: "Skills", content: "5 years React" },
        { category: "Experience", content: "Senior role" },
      ];
      expect(normalizeMatchingPoints(input)).toEqual(input);
    });
  });

  describe("normalizeMissingGaps", () => {
    it("defaults impact to Medium when missing", () => {
      const result = normalizeMissingGaps([{ category: "Skills", content: "AWS" }]);
      expect(result[0].impact).toBe("Medium");
    });

    it("keeps valid impact", () => {
      const result = normalizeMissingGaps([{ category: "Skills", content: "AWS", impact: "High" }]);
      expect(result[0].impact).toBe("High");
    });
  });

  describe("normalizeComparisonItems", () => {
    it("returns empty for null", () => {
      expect(normalizeComparisonItems(null)).toEqual([]);
    });

    it("validates status field", () => {
      const result = normalizeComparisonItems([
        { requirement: "React", status: "matched" },
        { requirement: "Vue", status: "invalid_status" },
      ]);
      expect(result[0].status).toBe("matched");
      expect(result[1].status).toBe("missing");
    });
  });

  describe("normalizeDetailedComparison", () => {
    it("returns structured empty on null", () => {
      const result = normalizeDetailedComparison(null);
      expect(result.skills).toEqual([]);
      expect(result.experience).toEqual([]);
      expect(result.tools).toEqual([]);
      expect(result.education).toEqual([]);
      expect(result.keywords).toEqual([]);
    });
  });

  describe("normalizeRewriteSuggestions", () => {
    it("returns empty for null", () => {
      expect(normalizeRewriteSuggestions(null)).toEqual([]);
    });

    it("returns valid suggestions", () => {
      const input = [
        {
          section: "summary",
          original: "I am a developer",
          optimized: "Senior developer with 5 years",
          explanation: "More specific",
        },
      ];
      expect(normalizeRewriteSuggestions(input)).toEqual(input);
    });
  });

  describe("normalizeStringArray", () => {
    it("returns empty for null", () => {
      expect(normalizeStringArray(null)).toEqual([]);
    });

    it("filters non-string values", () => {
      expect(normalizeStringArray(["a", 1, "b", null, "c"])).toEqual(["a", "b", "c"]);
    });
  });

  describe("detailedComparisonHasRows", () => {
    it("returns false for null", () => {
      expect(detailedComparisonHasRows(null)).toBe(false);
    });

    it("returns false for empty comparison", () => {
      expect(detailedComparisonHasRows({ skills: [], experience: [] } as any)).toBe(false);
    });

    it("returns true when has items", () => {
      expect(
        detailedComparisonHasRows({
          skills: [{ requirement: "React", status: "matched" }],
          experience: [],
        } as any),
      ).toBe(true);
    });
  });

  describe("normalizeAnalysisPayload", () => {
    it("handles empty row", () => {
      const result = normalizeAnalysisPayload({});
      expect(result.categoryScores.skills).toBe(0);
      expect(result.matchingPoints).toEqual([]);
      expect(result.atsKeywords).toEqual([]);
    });
  });
});