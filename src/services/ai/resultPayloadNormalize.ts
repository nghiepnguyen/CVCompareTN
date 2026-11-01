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
      const cvEvidence = typeof item.cvEvidence === "string" ? item.cvEvidence : undefined;
      const verification = normalizeVerification(item.verification, status, cvEvidence);
      const jdEvidence = typeof item.jdEvidence === "string" ? item.jdEvidence.trim() : "";
      return {
        requirement:
          typeof item.requirement === "string" ? item.requirement : String(item.requirement ?? ""),
        status,
        cvEvidence,
        improvement: typeof item.improvement === "string" ? item.improvement : undefined,
        priority,
        // Absent stays absent: old results must not turn into "unverified".
        ...(verification ? { verification } : {}),
        ...(jdEvidence ? { jdEvidence } : {}),
      };
    });
}

/**
 * Verification never overrides `status`: code may only weaken a model claim to
 * "unknown", never create "met"/"unmet". "met" needs a matched row with CV
 * evidence; "unmet" needs a non-matched row citing the contradicting CV fact.
 */
function normalizeVerification(
  raw: unknown,
  status: ComparisonItem["status"],
  cvEvidence: string | undefined
): ComparisonItem["verification"] {
  if (raw !== "met" && raw !== "unmet" && raw !== "unknown") return undefined;
  const hasEvidence = Boolean(cvEvidence?.trim());
  if (raw === "met" && !(status === "matched" && hasEvidence)) return "unknown";
  if (raw === "unmet" && !(status !== "matched" && hasEvidence)) return "unknown";
  return raw;
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

/** True if detailed comparison has at least one row to render */
export function detailedComparisonHasRows(dc: DetailedComparison | null | undefined): boolean {
  if (!dc || typeof dc !== "object") return false;
  const keys = ["skills", "experience", "tools", "education", "keywords"] as const;
  return keys.some((k) => {
    const v = dc[k];
    return Array.isArray(v) && v.length > 0;
  });
}

export interface RequirementInsight {
  requirement: string;
  status: ComparisonItem["status"];
  priority?: ComparisonItem["priority"];
  cvEvidence?: string;
  improvement?: string;
  /** Display category derived from the detailedComparison bucket. */
  category: string;
  /** Legacy missingGaps only; canonical surfaces use `priority` instead. */
  impact?: MissingGap["impact"];
}

export interface RequirementInsights {
  matched: RequirementInsight[];
  partial: RequirementInsight[];
  missing: RequirementInsight[];
  source: "canonical" | "legacy";
}

export interface ParsedCvInsights {
  highlights: string[];
  missingRequirements: string[];
  source: "canonical" | "legacy";
}

const MAX_HIGHLIGHTS = 3;
const DETAILED_COMPARISON_KEYS = ["skills", "experience", "tools", "education", "keywords"] as const;

type LegacyRequirementPoint =
  | string
  | { content?: unknown; category?: unknown; impact?: unknown };

const legacyText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const categoryForBucket = (key: (typeof DETAILED_COMPARISON_KEYS)[number]): string =>
  key.charAt(0).toUpperCase() + key.slice(1);
const priorityRank = (priority: ComparisonItem["priority"]): number =>
  priority === "required" ? 0 : priority === "nice-to-have" ? 1 : 2;

/**
 * Single deterministic derivation of requirement status for every active
 * surface (Analysis tab, recruiter panel/export, Parsed CV). Canonical
 * detailedComparison is the only authority when it has rows; the free-text
 * matchingPoints/missingGaps arrays are read only for genuinely legacy results
 * that have no usable canonical table. `partial` is kept separate and is never
 * promoted to missing. Ordering: required → nice-to-have → unknown, preserving
 * canonical order inside each priority group.
 */
export function deriveRequirementInsights(
  dc: DetailedComparison | null | undefined,
  legacy?: {
    matchingPoints?: readonly LegacyRequirementPoint[];
    missingGaps?: readonly LegacyRequirementPoint[];
  }
): RequirementInsights {
  if (!detailedComparisonHasRows(dc)) {
    const matched: RequirementInsight[] = (legacy?.matchingPoints ?? []).flatMap((point) => {
      const requirement = typeof point === "string" ? point.trim() : legacyText(point?.content);
      if (!requirement) return [];
      const category =
        typeof point === "object" && point && typeof point.category === "string" && point.category
          ? point.category
          : "Skills";
      return [{ requirement, status: "matched" as const, category }];
    });
    const missing: RequirementInsight[] = (legacy?.missingGaps ?? []).flatMap((gap) => {
      const requirement = typeof gap === "string" ? gap.trim() : legacyText(gap?.content);
      if (!requirement) return [];
      const impact = typeof gap === "object" && gap && typeof gap.impact === "string" && IMPACTS.has(gap.impact as MissingGap["impact"])
        ? (gap.impact as MissingGap["impact"])
        : undefined;
      const category =
        typeof gap === "object" && gap && typeof gap.category === "string" && gap.category
          ? gap.category
          : "Skills";
      return [{ requirement, status: "missing" as const, category, ...(impact ? { impact } : {}) }];
    });
    return { matched, partial: [], missing, source: "legacy" };
  }

  const items: RequirementInsight[] = DETAILED_COMPARISON_KEYS.flatMap((key) =>
    (dc![key] ?? []).flatMap((item) => {
      const requirement = typeof item?.requirement === "string" ? item.requirement.trim() : "";
      if (!requirement) return [];
      return [{
        requirement,
        status: item.status,
        priority: item.priority,
        cvEvidence: legacyText(item.cvEvidence) || undefined,
        improvement: legacyText(item.improvement) || undefined,
        category: categoryForBucket(key),
      }];
    })
  );
  // Array#sort is stable: canonical order is preserved within each priority.
  const ordered = items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const byStatus = (status: ComparisonItem["status"]) => ordered.filter((item) => item.status === status);
  return {
    matched: byStatus("matched"),
    partial: byStatus("partial"),
    missing: byStatus("missing"),
    source: "canonical",
  };
}

/**
 * Parsed CV quick-scan chips. Canonical analyze is the only authority on what
 * matches or is missing (Stage 3.9B): when detailedComparison has rows, both
 * lists come from it alone — `partial` is neither, and a requirement met via
 * an alternative ("BigQuery or Snowflake") is never reported missing. Legacy
 * parse-generated arrays are used only for old results without that table.
 */
export function deriveParsedCvInsights(
  dc: DetailedComparison | null | undefined,
  legacy?: { key_match_highlights?: string[]; missing_keywords?: string[] }
): ParsedCvInsights {
  const canonical = deriveRequirementInsights(dc);
  if (canonical.source === "canonical") {
    return {
      highlights: canonical.matched.slice(0, MAX_HIGHLIGHTS).map((item) => item.requirement),
      missingRequirements: canonical.missing.map((item) => item.requirement),
      source: "canonical",
    };
  }
  return {
    highlights: (legacy?.key_match_highlights ?? []).slice(0, MAX_HIGHLIGHTS),
    missingRequirements: legacy?.missing_keywords ?? [],
    source: "legacy",
  };
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
