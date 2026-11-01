import type { RewriteSuggestion } from '../../src/services/ai/types.js';

// Numbers as a CV would state them ("7", "1,2", "35%"), separators dropped so
// "1,2 triệu" and "1.2M" compare equal. MM/YYYY dates and bare years are
// chronology the pipeline normalizes from the CV's own dates, not metrics.
// stripLeadingZeros (Full CV only): "05" and "5" are the same value — the
// rewrite zero-pads counts ("05 thương hiệu"). Zeros are stripped from the raw
// match before separators are dropped, so "0.5"/"0,5" stay distinct from "5".
function metricNumbers(text: string, stripLeadingZeros = false): string[] {
  const stripped = text
    .replace(/\b\d{1,2}\/(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return (stripped.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) =>
    (stripLeadingZeros ? n.replace(/^0+(?=\d)/, '') : n).replace(/[.,]/g, '')
  );
}

// Translation check: both texts state the same numeric facts (same Stage 3.3
// normalization, leading zeros ignored) and the same years. Stricter than the
// rewrite guard, which ignores years — a translation must not change them.
export function sameNumericFacts(source: string, translated: string): boolean {
  const years = (t: string) => new Set(t.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  return (
    same(new Set(metricNumbers(source, true)), new Set(metricNumbers(translated, true))) &&
    same(years(source), years(translated))
  );
}

// A JD term that must not enter "optimized" unless the CV states it. Only
// the raw-JD extractor below produces these. (Concepts derived from the
// analysis — detailedComparison / missingGaps — were tried and dropped
// truthful suggestions in benchmarks, e.g. "Nội" from "Hà Nội" blocking
// "nội dung"; the analysis never decides what is filtered.)
export type DeniedConcept = { concept: string; source: 'raw-jd' };

// Generic vocabulary: a hyphenated JD compound made only of these words (and
// stopwords) is not a distinctive term. Kept small on purpose.
const GENERIC = new Set([
  // business vocabulary
  'leadership', 'leader', 'leaders', 'stakeholder', 'stakeholders', 'analytics', 'analysis', 'analyses',
  'metric', 'metrics', 'dashboard', 'dashboards', 'reporting', 'report', 'reports', 'communication',
  'business', 'performance', 'data', 'team', 'teams', 'strategy', 'product', 'products', 'process',
  'processes', 'system', 'systems', 'project', 'projects', 'customer', 'customers', 'user', 'users',
  'management', 'quality', 'insights', 'results', 'growth', 'skills', 'skill', 'knowledge', 'ability',
  'experience', 'years', 'year', 'tools', 'tool', 'environment', 'role', 'work', 'weekly', 'junior',
  'senior', 'strong', 'solid', 'good', 'excellent', 'advanced', 'basic', 'proven', 'relevant', 'related',
  'familiarity', 'understanding', 'background', 'plus', 'preferred', 'required',
  // requirement verbs
  'build', 'create', 'define', 'design', 'develop', 'enable', 'ensure', 'lead', 'maintain', 'manage',
  'mentor', 'own', 'drive', 'support', 'use', 'using', 'apply', 'analyze', 'deliver', 'improve',
  'collaborate', 'partner', 'present', 'track', 'monitor',
]);

const STOPWORDS = new Set([
  'and', 'or', 'with', 'of', 'in', 'on', 'for', 'the', 'a', 'an', 'to', 'at', 'as', 'by', 'from', 'including',
  'e.g', 'eg', 'etc', 'such', 'like', 'is', 'be', 'về', 'và', 'hoặc', 'với', 'của', 'trong', 'các', 'cho',
  'là', 'có', 'như', 'từ', 'một', 'những',
]);

// Lowercase, hyphen/punctuation folded to spaces, whitespace collapsed:
// "Self-Serve" and "self serve" compare equal. No synonyms.
function normalizeText(text: string): string {
  return ` ${text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').replace(/\.(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

// Regular English plural → singular, for lexical evidence matching only (no
// stemming, lemmatization or fuzzy matching). Applied identically to the CV,
// the concept and the rewrite, so blocking is never looser than CV override.
// Conservative by design — when unsure the token is left as is:
//   - only pure-letter tokens of 4+ characters ("aws", "node.js" untouched)
//   - "-ies" → "-y"                         (policies → policy)
//   - "-sses/-shes/-ches/-xes/-zes" → drop "es" (boxes → box)
//   - other "-s" → drop "s", except "-ss", "-us", "-is"
//     (guardrails → guardrail, analysts → analyst; but business, process,
//      status, analysis stay intact)
// A missed irregular form is only a false negative.
export function canonicalToken(token: string): string {
  if (token.length < 4 || !/^\p{L}+$/u.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:sses|shes|ches|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

// normalizeText with each token in canonical (singular) form.
function canonicalText(text: string): string {
  return ` ${normalizeText(text).trim().split(' ').map(canonicalToken).join(' ')} `;
}

function containsPhrase(canonicalHay: string, phrase: string): boolean {
  return canonicalHay.includes(canonicalText(phrase));
}

// The surface form in `text` that matched `phrase` (debug provenance only).
function matchedForm(text: string, phrase: string): string | undefined {
  const tokens = normalizeText(text).trim().split(' ');
  const target = canonicalText(phrase).trim().split(' ');
  for (let i = 0; i + target.length <= tokens.length; i++) {
    if (target.every((t, j) => canonicalToken(tokens[i + j]) === t)) return tokens.slice(i, i + target.length).join(' ');
  }
  return undefined;
}

const isGeneric = (w: string) => GENERIC.has(w.toLowerCase());
const isStop = (w: string) => STOPWORDS.has(w.toLowerCase().replace(/\.$/, ''));

// ---------------------------------------------------------------------------
// Distinctive terms taken straight from the raw JD.
//
// The model sometimes writes a JD term into "optimized" ("…self-serve Tableau
// dashboards") even when its own analysis never listed it. The raw JD is used
// here only to answer "did this distinctive term originate in the
// JD?"; the CV answers "did the candidate state it?". A term that is in the JD
// but not the CV and that a rewrite introduces is unsafe as candidate history.
// This never implies the candidate lacks the capability.
//
// Only high-confidence lexical markers are taken — never generic words,
// arbitrary phrases, or plain Capitalized words (headings, sentence starts,
// company names):
//   1. hyphenated compounds (self-serve, north-star, cross-functional)
//   2. acronyms / identifiers with 3+ characters or a digit (GA4, PCI, CQRS, ETL)
//   3. mixed-case identifiers (BigQuery, OpenTelemetry, NestJS)
// ---------------------------------------------------------------------------

// Hyphenated style/employment words a grounded rewrite may use as a plain
// paraphrase of the CV ("data-driven" for "turning data into decisions"), or
// that describe the job rather than the candidate's history.
const STYLE_HYPHENATED = new Set([
  'data-driven', 'results-driven', 'detail-oriented', 'self-motivated', 'fast-paced', 'high-quality',
  'well-known', 'world-class', 'full-time', 'part-time', 'long-term', 'short-term', 'day-to-day',
  'up-to-date', 'hands-on', 'follow-up', 'one-on-one', 'on-site', 'in-house', 'well-being', 'e-mail',
]);

// Acronyms that name a place, role or document rather than a skill/practice.
const NON_CONCEPT_ACRONYMS = new Set([
  'APAC', 'EMEA', 'USA', 'HCM', 'CEO', 'CTO', 'CFO', 'COO', 'EEO', 'FAQ', 'ASAP', 'JD', 'CV', 'NB',
]);

export function rawJdConcepts(jd: string, cvText: string): DeniedConcept[] {
  const cv = canonicalText(cvText);
  const out = new Map<string, DeniedConcept>();
  const add = (term: string) => {
    if (containsPhrase(cv, term)) return; // CV evidence wins
    const key = normalizeText(term).trim();
    if (key && !out.has(key)) out.set(key, { concept: term, source: 'raw-jd' });
  };
  for (const line of jd.split(/\n/)) {
    // All-caps lines are headings ("REQUIREMENTS"), not content.
    const letters = line.replace(/[^\p{L}]/gu, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) continue;
    for (const m of line.matchAll(/\p{L}+(?:-\p{L}+)+/gu)) {
      const term = m[0];
      const parts = term.toLowerCase().split('-');
      if (STYLE_HYPHENATED.has(term.toLowerCase())) continue;
      if (parts.every((p) => isGeneric(p) || isStop(p))) continue;
      add(term);
    }
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) {
      const term = m[0];
      if (NON_CONCEPT_ACRONYMS.has(term)) continue;
      if (term.length < 3 && !/\d/.test(term)) continue; // AI, BI, UX… too ambiguous
      add(term);
    }
    // Mixed-case identifiers: take each word, then test for a lower→upper
    // transition. A single pattern with overlapping quantifiers backtracks
    // polynomially on long JD input (CodeQL js/polynomial-redos).
    for (const m of line.matchAll(/\b[A-Za-z][A-Za-z0-9]*\b/g)) if (/[a-z][A-Z]/.test(m[0])) add(m[0]);
  }
  return [...out.values()];
}

export type FullRewriteViolation = { reason: 'unsupported-number' | 'raw-jd'; concept: string };
export type FullRewriteValidation = { valid: boolean; violations: FullRewriteViolation[] };

/**
 * Same numeric + raw-JD policy as dropUnsupportedSuggestions, applied to the
 * whole rewritten CV. Detect only: the caller decides what to do (retry or
 * withhold the CV); nothing is deleted from the Markdown here.
 * The contact preamble (everything before the first "##" section) is not
 * checked: the prompt reserves it for "# Name" + contact lines, where the
 * same phone number re-spaced ("0912 345 678" → "0912345678") or a "LinkedIn"
 * label for a CV that only has "linkedin.com/in/…" is truthful CV data, not
 * a fabricated fact. `originalCvText` must be the exact text the model was
 * given; without it there is no evidence and the caller must skip validation.
 */
export function validateFullRewrite({
  originalCvText,
  jd,
  rewrittenCv,
}: {
  originalCvText: string;
  jd: string;
  rewrittenCv: string;
}): FullRewriteValidation {
  const firstSection = rewrittenCv.search(/^##\s/m);
  const body = firstSection > 0 ? rewrittenCv.slice(firstSection) : rewrittenCv;
  const cvNumbers = new Set(metricNumbers(originalCvText, true));
  const violations: FullRewriteViolation[] = [];
  for (const n of new Set(metricNumbers(body, true))) {
    if (!cvNumbers.has(n)) violations.push({ reason: 'unsupported-number', concept: n });
  }
  const canonicalBody = canonicalText(body);
  for (const d of rawJdConcepts(jd, originalCvText)) {
    if (containsPhrase(canonicalBody, d.concept)) violations.push({ reason: 'raw-jd', concept: d.concept });
  }
  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Guard telemetry (analysis_log.guard_metrics, v1). Aggregate counters and
// state only — never a concept, number, CV/JD/suggestion/rewrite text or PII.
// See docs/11_guard_metrics.md.
// ---------------------------------------------------------------------------
export type ViolationCounts = { unsupportedNumber: number; rawJd: number };

export type SuggestionGuardMetrics = {
  suggestionsIn: number;
  droppedTotal: number;
  skills: number;
  numeric: number;
  rawJd: number;
  // CV text was available, so the numeric/raw-JD checks could run. false
  // (inline PDF/image) does not mean no guard ran: the Skills rule still does.
  factualChecks: boolean;
};

export type FullCvRetryOutcome = 'not_needed' | 'skipped_budget' | 'error' | 'invalid' | 'recovered';

export type FullCvGuardMetrics = {
  validationAttempted: boolean;
  validationSkipped: boolean;
  firstPassValid: boolean | null;
  firstPassViolations?: ViolationCounts;
  retryOutcome: FullCvRetryOutcome;
  retryViolations?: ViolationCounts;
  fidelityFallback: boolean;
  // 2 once the retry call was started, even if it errored (its usage is then
  // missing from the token totals).
  geminiCalls: 1 | 2;
};

/** P0 requirement verification counts (analyze only; absent on older rows). */
export type RequirementVerificationMetrics = { rows: number; met: number; unmet: number; unknown: number };

export type GuardMetrics =
  | { v: 1; suggestionGuard: SuggestionGuardMetrics; requirementVerification?: RequirementVerificationMetrics }
  | { v: 1; fullCv: FullCvGuardMetrics };

export function countViolations(violations: FullRewriteViolation[]): ViolationCounts {
  return {
    unsupportedNumber: violations.filter((v) => v.reason === 'unsupported-number').length,
    rawJd: violations.filter((v) => v.reason === 'raw-jd').length,
  };
}

export type DroppedSuggestion = {
  section: string;
  reason: 'skills-section' | 'unsupported-number' | 'unsupported-jd-concept';
  concept?: string;
  source?: 'raw-jd';
  matchedForm?: string;
};

/**
 * Last-line guard for rewrite suggestions the prompt forbids but the model
 * still produced in benchmark runs (2026-10-29): a Skills-section rewrite
 * (it can only "improve" by adding skills the CV lacks) or an "optimized"
 * text with a number the CV never states (e.g. "9 năm" for a CV saying
 * "7 năm"). Such a suggestion is dropped rather than repaired — showing
 * fewer suggestions is better than showing a fabricated candidate fact.
 * A suggestion whose "optimized" text contains a distinctive JD term from
 * rawJdConcepts() that the CV never states is dropped too. Lowercase JD
 * concepts ("guardrail metrics") are deliberately not caught: a missed
 * leak is preferred over deleting truthful CV content.
 * The number and JD-term checks need the CV text, so they are skipped for
 * inline PDF/image input; the Skills rule always applies.
 */
export function dropUnsupportedSuggestions(
  suggestions: RewriteSuggestion[],
  cvText: string | undefined,
  denied: DeniedConcept[] = [],
  onDrop?: (d: DroppedSuggestion, suggestion: RewriteSuggestion) => void
): RewriteSuggestion[] {
  const cvNumbers = cvText ? new Set(metricNumbers(cvText)) : null;
  return suggestions.filter((s) => {
    if (/skill|kỹ năng/i.test(s.section)) {
      onDrop?.({ section: s.section, reason: 'skills-section' }, s);
      return false;
    }
    if (!cvNumbers) return true;
    if (!metricNumbers(s.optimized).every((n) => cvNumbers.has(n))) {
      onDrop?.({ section: s.section, reason: 'unsupported-number' }, s);
      return false;
    }
    const optimized = canonicalText(s.optimized);
    const hit = denied.find((d) => containsPhrase(optimized, d.concept));
    if (hit) {
      onDrop?.(
        {
          section: s.section,
          reason: 'unsupported-jd-concept',
          concept: hit.concept,
          source: hit.source,
          matchedForm: matchedForm(s.optimized, hit.concept),
        },
        s
      );
      return false;
    }
    return true;
  });
}
