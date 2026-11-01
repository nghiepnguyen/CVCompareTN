import type { ComparisonItem, DetailedComparison } from "./types.js";

/**
 * P0 requirement verification, derived AFTER the canonical Gemini analysis.
 * Pure metadata: it never reads or changes status, scores or probability, and
 * Gemini never authors it (P0/P0.1 benchmarks: a model-written verification
 * field shifted matchScore and dropped requirements).
 *
 * - met:     canonical status "matched" with usable CV evidence (no re-judging).
 * - unmet:   only a deterministic same-metric shortfall (IELTS band, years of
 *            experience in the same domain) on a non-matched row.
 * - unknown: everything else. Absence of evidence is not failure.
 */
export type RequirementVerification = NonNullable<ComparisonItem["verification"]>;

const PLACEHOLDER_EVIDENCE =
  /^(?:n\/?a|none|nil|-+|not (?:mentioned|stated|shown|found|specified|provided|available)|no (?:evidence|mention|information)|không(?: có)?|chưa(?: có)?)\.?$|does(?:n't| not) (?:mention|state|show)|not mentioned|không đề cập|chưa (?:thể hiện|cho thấy|đề cập)/i;

export function hasUsableEvidence(evidence: string | undefined): boolean {
  const text = evidence?.trim() ?? "";
  return /[\p{L}\p{N}]/u.test(text) && !PLACEHOLDER_EVIDENCE.test(text);
}

// IELTS band bound to the word IELTS (e.g. "IELTS 6.5+", "IELTS overall band 6.0").
const IELTS = /\bIELTS\b[^\d\n]{0,20}?(\d(?:\.\d)?)/gi;
// "<n> years|yrs|năm <domain>"; the number must sit directly before the unit.
const YEARS = /(?<![\d.])(\d{1,2}(?:\.\d)?)\s*(\+)?\s*(?:years?|yrs?|năm)\b([^,.;:()\n]*)/gi;
const NOT_A_MINIMUM = /\d\s*(?:-|–|to|đến)\s*\d|up to|at most|under|less than|maximum|no more than|tối đa|dưới|không quá/i;
const OPEN_ENDED = /\b(?:over|more than|at least|above|hơn|trên|ít nhất)\s*$/i;
const DOMAIN_STOP = new Set([
  "of", "in", "with", "as", "a", "an", "the", "and", "experience", "experiences", "professional", "total",
  "work", "working", "relevant", "related", "hands", "on", "minimum", "least", "at", "proven", "solid",
  "kinh", "nghiệm", "làm", "việc", "trong", "về", "lĩnh", "vực", "tối", "thiểu",
  // Model phrasing about where the CV says it, not what the experience is.
  "cv", "stated", "states", "explicitly", "listed", "mentioned", "summary", "profile",
]);

const domainTokens = (tail: string) =>
  new Set(tail.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((w) => w && !DOMAIN_STOP.has(w)));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

function ieltsBands(text: string): number[] {
  return [...text.matchAll(IELTS)].map((m) => Number(m[1]));
}

type YearsFact = { value: number; atLeast: boolean; domain: Set<string> };
function yearsFacts(text: string): YearsFact[] {
  return [...text.matchAll(YEARS)].map((m) => ({
    value: Number(m[1]),
    atLeast: Boolean(m[2]) || OPEN_ENDED.test(text.slice(0, m.index)),
    domain: domainTokens(m[3]),
  }));
}

/**
 * Deterministic shortfall check for one metric. Returns:
 * "shortfall" when CV value < JD minimum for the same metric, "comparable"
 * when both sides are the same metric but not a shortfall, null otherwise.
 * Any ambiguity (several values, ranges, open-ended CV values, different
 * domains) returns null → the caller falls back to "unknown".
 */
export function compareMetric(requirement: string, evidence: string): "shortfall" | "comparable" | null {
  const jdBands = ieltsBands(requirement);
  if (jdBands.length) {
    const cvBands = new Set(ieltsBands(evidence));
    if (jdBands.length !== 1 || cvBands.size !== 1) return null;
    return [...cvBands][0] < jdBands[0] ? "shortfall" : "comparable";
  }
  if (NOT_A_MINIMUM.test(requirement)) return null;
  const jd = yearsFacts(requirement);
  const cv = yearsFacts(evidence);
  if (jd.length !== 1 || cv.length !== 1) return null;
  if (!sameSet(jd[0].domain, cv[0].domain)) return null;
  if (cv[0].value >= jd[0].value) return "comparable";
  return cv[0].atLeast ? null : "shortfall";
}

export function deriveItemVerification(item: ComparisonItem): RequirementVerification {
  if (!hasUsableEvidence(item.cvEvidence)) return "unknown";
  const metric = compareMetric(item.requirement, item.cvEvidence!);
  if (item.status === "matched") return metric === "shortfall" ? "unknown" : "met";
  return metric === "shortfall" ? "unmet" : "unknown";
}

export type RequirementVerificationCounts = { rows: number; met: number; unmet: number; unknown: number };

/** Returns a new table with `verification` set on every row; input is not mutated. */
export function deriveRequirementVerification(dc: DetailedComparison): {
  detailedComparison: DetailedComparison;
  counts: RequirementVerificationCounts;
} {
  const counts: RequirementVerificationCounts = { rows: 0, met: 0, unmet: 0, unknown: 0 };
  const enrich = (items: ComparisonItem[]) =>
    items.map((item) => {
      const verification = deriveItemVerification(item);
      counts.rows++;
      counts[verification]++;
      return { ...item, verification };
    });
  return {
    detailedComparison: {
      skills: enrich(dc.skills),
      experience: enrich(dc.experience),
      tools: enrich(dc.tools),
      education: enrich(dc.education),
      keywords: enrich(dc.keywords),
    },
    counts,
  };
}
