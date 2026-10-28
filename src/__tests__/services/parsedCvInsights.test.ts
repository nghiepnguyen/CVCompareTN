import { describe, it, expect } from "vitest";
import { deriveParsedCvInsights } from "../../services/ai/resultPayloadNormalize";
import type { AnalysisResult, ComparisonItem, DetailedComparison } from "../../services/ai/types";
import { applyLocalization, presentationItems } from "../../../_server-lib/ai/localizeAnalysis";

const item = (requirement: string, status: ComparisonItem["status"], priority?: ComparisonItem["priority"]): ComparisonItem =>
  ({ requirement, status, ...(priority ? { priority } : {}) });

const dc = (over: Partial<DetailedComparison>): DetailedComparison =>
  ({ skills: [], experience: [], tools: [], education: [], keywords: [], ...over });

const legacy = { key_match_highlights: ["Legacy A", "Legacy B"], missing_keywords: ["BigQuery"] };

describe("deriveParsedCvInsights (Stage 3.9B)", () => {
  it("maps matched to highlights and missing to missing requirements", () => {
    const r = deriveParsedCvInsights(dc({ skills: [item("SQL", "matched", "required"), item("Looker", "missing", "required")] }));
    expect(r).toEqual({ highlights: ["SQL"], missingRequirements: ["Looker"], source: "canonical" });
  });

  it("never treats partial as missing (or as a highlight)", () => {
    const r = deriveParsedCvInsights(dc({ skills: [item("Python (pandas, statsmodels)", "partial", "required")] }));
    expect(r.missingRequirements).toEqual([]);
    expect(r.highlights).toEqual([]);
  });

  it("sorts required before nice-to-have and keeps canonical order within a priority", () => {
    const r = deriveParsedCvInsights(dc({
      skills: [item("MMM", "missing", "nice-to-have"), item("Looker", "missing", "required")],
      tools: [item("Airflow", "missing", "nice-to-have"), item("dbt", "missing", "required")],
      keywords: [item("North-star metrics", "missing")], // legacy row without priority sorts with non-required
    }));
    expect(r.missingRequirements).toEqual(["Looker", "dbt", "MMM", "Airflow", "North-star metrics"]);
  });

  it("caps highlights at 3, required first", () => {
    const r = deriveParsedCvInsights(dc({
      skills: [item("Bahasa", "matched", "nice-to-have"), item("SQL", "matched", "required"), item("Python", "matched", "required")],
      tools: [item("dbt", "matched", "required"), item("Snowflake", "matched", "required")],
    }));
    expect(r.highlights).toEqual(["SQL", "Python", "dbt"]);
  });

  it("ignores legacy arrays when canonical rows exist", () => {
    const r = deriveParsedCvInsights(dc({ skills: [item("SQL", "matched", "required")] }), legacy);
    expect(r.source).toBe("canonical");
    expect(r.highlights).toEqual(["SQL"]);
    expect(r.missingRequirements).toEqual([]);
  });

  it("falls back to legacy arrays when there is no canonical table", () => {
    expect(deriveParsedCvInsights(undefined, legacy)).toEqual({
      highlights: ["Legacy A", "Legacy B"], missingRequirements: ["BigQuery"], source: "legacy",
    });
    expect(deriveParsedCvInsights(dc({}), {})).toEqual({ highlights: [], missingRequirements: [], source: "legacy" });
  });

  it("does not report an alternative as missing when the OR requirement is matched", () => {
    const r = deriveParsedCvInsights(dc({ tools: [item("Cloud warehouse (BigQuery, Snowflake or Redshift)", "matched", "required")] }), legacy);
    expect(r.missingRequirements).toEqual([]);
    expect(r.highlights).toEqual(["Cloud warehouse (BigQuery, Snowflake or Redshift)"]);
  });

  it("gives the same chips for the EN canonical result and its VI localization", () => {
    const canonical = {
      passExplanation: "Strong SQL", mainFactor: "SQL", matchingPoints: [], missingGaps: [], rewriteSuggestions: [],
      detailedComparison: dc({
        skills: [{ ...item("SQL", "matched", "required"), improvement: "Show query volume" }],
        tools: [{ ...item("Looker", "missing", "required"), improvement: "Consider learning Looker" }],
      }),
    } as unknown as AnalysisResult;
    // Translate every string Stage 3.7 localization is allowed to touch.
    // No digits in the text: localization rejects strings whose numbers differ from the source.
    const translated = presentationItems(canonical).map(({ id }) => ({ id, text: `VI ${id.replace(/\d/g, "#")}` }));
    const { result: vi, accepted } = applyLocalization(canonical, translated);
    expect(accepted).toBe(translated.length);
    expect(vi.detailedComparison.tools[0].improvement).toBe("VI detailedComparison.tools.#.improvement");
    expect(deriveParsedCvInsights(vi.detailedComparison)).toEqual(deriveParsedCvInsights(canonical.detailedComparison));
    expect(deriveParsedCvInsights(vi.detailedComparison)).toEqual({ highlights: ["SQL"], missingRequirements: ["Looker"], source: "canonical" });
  });
});
