import type {
  AnalysisResult,
  CategorizedPoint,
  CategorizedScore,
  ComparisonItem,
  DetailedComparison,
  FormatAssessment,
  MissingGap,
  RewriteSuggestion,
} from "./types.js";

/** Supabase / legacy rows sometimes store JSON columns as double-encoded strings */
export function coerceJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

const IMPACTS = new Set(["High", "Medium", "Low"]);

export function normalizeCategoryScores(raw: unknown): CategorizedScore {
  const o = coerceJsonField<Record<string, unknown>>(raw, {});
  const n = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const x = parseFloat(v);
      return Number.isFinite(x) ? x : 0;
    }
    return 0;
  };
  return {
    skills: n(o.skills),
    softSkills: n(o.softSkills),
    hardSkills: n(o.hardSkills),
    technicalSkills: n(o.technicalSkills),
    experience: n(o.experience),
    tools: n(o.tools),
    languageSkills: n(o.languageSkills),
    education: n(o.education),
  };
}

export function normalizeMatchingPoints(raw: unknown): CategorizedPoint[] {
  const arr = coerceJsonField<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => ({
      category: typeof item.category === "string" ? item.category : "Skills",
      content: typeof item.content === "string" ? item.content : String(item.content ?? ""),
    }));
}

export function normalizeMissingGaps(raw: unknown): MissingGap[] {
  const arr = coerceJsonField<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => {
      const impact = item.impact;
      const safeImpact =
        typeof impact === "string" && IMPACTS.has(impact)
          ? (impact as MissingGap["impact"])
          : ("Medium" as const);
      return {
        category: typeof item.category === "string" ? item.category : "Skills",
        content: typeof item.content === "string" ? item.content : String(item.content ?? ""),
        impact: safeImpact,
      };
    });
}

export function normalizeComparisonItems(raw: unknown): ComparisonItem[] {
  const arr = coerceJsonField<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  const statuses = new Set(["matched", "partial", "missing"]);
  const priorities = new Set(["required", "nice-to-have"]);
  return arr
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => {
      const st = item.status;
      const status = typeof st === "string" && statuses.has(st) ? (st as ComparisonItem["status"]) : "missing";
      const pr = item.priority;
      const priority =
        typeof pr === "string" && priorities.has(pr) ? (pr as ComparisonItem["priority"]) : undefined;
      return {
        requirement:
          typeof item.requirement === "string" ? item.requirement : String(item.requirement ?? ""),
        status,
        cvEvidence: typeof item.cvEvidence === "string" ? item.cvEvidence : undefined,
        improvement: typeof item.improvement === "string" ? item.improvement : undefined,
        priority,
      };
    });
}

export function normalizeDetailedComparison(raw: unknown): DetailedComparison {
  const o = coerceJsonField<Record<string, unknown>>(raw, {});
  return {
    skills: normalizeComparisonItems(o.skills),
    experience: normalizeComparisonItems(o.experience),
    tools: normalizeComparisonItems(o.tools),
    education: normalizeComparisonItems(o.education),
    keywords: normalizeComparisonItems(o.keywords),
  };
}

export function normalizeRewriteSuggestions(raw: unknown): RewriteSuggestion[] {
  const arr = coerceJsonField<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => ({
      section: typeof item.section === "string" ? item.section : "",
      original: typeof item.original === "string" ? item.original : "",
      optimized: typeof item.optimized === "string" ? item.optimized : "",
      explanation: typeof item.explanation === "string" ? item.explanation : "",
    }));
}

export function normalizeStringArray(raw: unknown): string[] {
  const arr = coerceJsonField<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === "string");
}

export function normalizeFormatAssessment(raw: unknown): FormatAssessment {
  const o = coerceJsonField<Record<string, unknown>>(raw, {});
  const b = (v: unknown) => v === true;
  const n = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const x = parseFloat(v);
      return Number.isFinite(x) ? x : 0;
    }
    return 0;
  };
  return {
    analysisAvailable: b(o.analysisAvailable),
    overallAtsParseabilityScore: n(o.overallAtsParseabilityScore),
    hasMultiColumnLayout: b(o.hasMultiColumnLayout),
    hasTablesOrGraphics: b(o.hasTablesOrGraphics),
    hasStandardSectionHeadings: b(o.hasStandardSectionHeadings),
    contactInfoInHeaderFooter: b(o.contactInfoInHeaderFooter),
    fontConsistencyIssue: b(o.fontConsistencyIssue),
    dateFormatConsistent: b(o.dateFormatConsistent),
    isLikelyScannedImage: b(o.isLikelyScannedImage),
    formatIssues: normalizeStringArray(o.formatIssues),
  };
}

/**
 * `matchScore` (from /analyze) and `ats_evaluation.relevant_score` (from the
 * independent /parse-cv call) are two separate Gemini judgments of the same
 * CV-vs-JD fit and can legitimately disagree. Surface the disagreement
 * instead of silently picking one.
 */
export function computeScoreDiscrepancy(
  matchScore: number,
  relevantScore: number,
  thresholdPoints = 15
): { hasDiscrepancy: boolean; deltaAbs: number } {
  const deltaAbs = Math.abs(matchScore - relevantScore);
  return { hasDiscrepancy: deltaAbs > thresholdPoints, deltaAbs };
}

/** True if detailed comparison has at least one row to render */
export function detailedComparisonHasRows(dc: DetailedComparison | null | undefined): boolean {
  if (!dc || typeof dc !== "object") return false;
  const keys = ["skills", "experience", "tools", "education", "keywords"] as const;
  return keys.some((k) => {
    const v = dc[k];
    return Array.isArray(v) && v.length > 0;
  });
}

/** Normalize partial Analysis-shaped payloads (DB rows, Gemini) into safe AnalysisResult fields */
export function normalizeAnalysisPayload(row: Record<string, unknown>): Pick<
  AnalysisResult,
  | "categoryScores"
  | "matchingPoints"
  | "missingGaps"
  | "atsKeywords"
  | "rewriteSuggestions"
  | "detailedComparison"
> {
  return {
    categoryScores: normalizeCategoryScores(row.category_scores),
    matchingPoints: normalizeMatchingPoints(row.matching_points),
    missingGaps: normalizeMissingGaps(row.missing_gaps),
    atsKeywords: normalizeStringArray(row.ats_keywords),
    rewriteSuggestions: normalizeRewriteSuggestions(row.rewrite_suggestions),
    detailedComparison: normalizeDetailedComparison(row.detailed_comparison),
  };
}
