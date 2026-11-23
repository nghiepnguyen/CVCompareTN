// M3-B A3.3 — `fit-score-v1`: a deterministic 0–100 fit score computed from the
// requirement rows Gemini already returns (contract:
// docs/audits/2026-11-23-m3b-a32-scoring-contract.md §2, §4).
//
// SHADOW ONLY. The Gemini matchScore stays authoritative; this module never
// changes a result, a stored row, quota or billing. Pure and synchronous: no
// I/O, no network, no model-authored numbers as input.
//
// FROZEN CONTRACT: any change to weights, credits, the alias table, status /
// priority / category rules or eligibility is a new version (`fit-score-v2`);
// never edit v1 in place. The file hash is in the benchmark freeze manifest.
import { deriveItemVerification } from './requirementVerification.js';
import { derivePassProbability, type ProbabilityLevel } from './canonicalProbability.js';
import type { DetailedComparison } from './types.js';

export const FIT_SCORE_VERSION = 'fit-score-v1';

export type FitStatus = 'matched' | 'partial' | 'missing' | 'unknown';
type Priority = 'required' | 'preferred';
const CATEGORIES = ['skills', 'experience', 'tools', 'education', 'keywords'] as const;
type Category = (typeof CATEGORIES)[number];

/** More input rows than this ⇒ ineligible, never truncated (~10× the observed 8–10). */
export const MAX_FIT_ROWS = 100;
const MAX_KEY_CHARS = 300;
const WEIGHT: Record<Priority, number> = { required: 3, preferred: 1 };
/** Credit in halves so all arithmetic stays in integers: matched 2/2, partial 1/2. */
const CREDIT2: Record<FitStatus, number> = { matched: 2, partial: 1, missing: 0, unknown: 0 };
const STATUS_RANK: Record<FitStatus, number> = { missing: 0, unknown: 0, partial: 1, matched: 2 };
/** Statuses the response schema allows; anything else in the raw table is a schema violation. */
const SCHEMA_STATUSES = new Set(['matched', 'partial', 'missing']);

/**
 * Versioned alias table (exact whole-key match after normalization). Only
 * unambiguous names of the same product/technology; never "related" tools.
 */
export const FIT_ALIASES: Readonly<Record<string, string>> = {
  'react.js': 'react', reactjs: 'react',
  node: 'node.js', nodejs: 'node.js',
  'vue.js': 'vue', vuejs: 'vue',
  next: 'next.js', nextjs: 'next.js',
  js: 'javascript', ecmascript: 'javascript',
  ts: 'typescript',
  postgres: 'postgresql', psql: 'postgresql',
  k8s: 'kubernetes',
  'amazon web services': 'aws',
  'google cloud platform': 'gcp', 'google cloud': 'gcp',
  'microsoft azure': 'azure',
  'ms excel': 'excel', 'microsoft excel': 'excel',
  golang: 'go',
};

export type FitReason = 'no_scorable_rows' | 'malformed_rows' | 'too_many_rows' | 'error';
export type FitInputMode = 'text' | 'pdf_text' | 'inline_pdf' | 'image';

export interface FitDiagnostics {
  rowsIn: number;
  rowsRejected: number;
  keywordsExcluded: number;
  duplicatesMerged: number;
  conflictingDuplicates: number;
  aliasMerged: number;
  unverifiedMatchDowngraded: number;
  /** Matched rows whose evidence is only a skills-list mention. Counted; v1 still gives full credit (OD-12). */
  listOnlyEvidence: number;
  statusDefaulted: number;
  priorityDefaulted: number;
  categoryDefaulted: number;
  schemaViolations: number;
}

export interface FitScoreResult {
  score: number | null;
  band: ProbabilityLevel | null;
  reason?: Exclude<FitReason, 'error'>;
  counts: Record<FitStatus, number>;
  required: number;
  preferred: number;
  diag: FitDiagnostics;
}

/** Privacy-safe telemetry stored in analysis_log.guard_metrics.fitShadow: numbers and enums only. */
export type FitShadow =
  | {
      v: typeof FIT_SCORE_VERSION;
      eligible: boolean;
      reason?: FitReason;
      canonical: number;
      shadow: number | null;
      absDiff: number | null;
      bandCanonical: ProbabilityLevel;
      bandShadow: ProbabilityLevel | null;
      counts: Record<FitStatus, number>;
      required: number;
      preferred: number;
      diag: FitDiagnostics;
      inputMode: FitInputMode;
    }
  | { v: typeof FIT_SCORE_VERSION; eligible: false; reason: 'error' };

/** A row as the shadow reads it: the displayed (normalized) table, flattened with its bucket. */
export interface FitRow {
  requirement: unknown;
  category: unknown;
  priority?: unknown;
  status: unknown;
  cvEvidence?: unknown;
}

interface Normalized { key: string; category: Category; priority: Priority; status: FitStatus }

const norm = (s: string) =>
  s.normalize('NFC').toLowerCase().replace(/[\s ]+/g, ' ').replace(/[,;:!?'"()[\]{}]/g, '').replace(/\.$/, '').trim().slice(0, MAX_KEY_CHARS);
const alias = (k: string) => FIT_ALIASES[k] ?? k;

/** " or " splits only (never "/": CI/CD, UI/UX, TCP/IP are single terms). Commas join the list when " or " is present. */
function inferAlternatives(requirement: string): string[] | undefined {
  if (!/\s(?:or|hoặc)\s/i.test(requirement)) return undefined;
  const parts = requirement.split(/\s*,\s*|\s+(?:or|hoặc)\s+/i).map((p) => p.trim()).filter(Boolean);
  // Long clauses are not tool alternatives ("3 years in fintech or 5 years in banking" stays one row).
  return parts.length > 1 && parts.every((p) => p.split(/\s+/).length <= 3) ? parts : undefined;
}

/** Identity key: NFC, case/space/punctuation-insensitive, alias-resolved; OR groups are order-free sets. */
export function fitRequirementKey(requirement: string): string {
  const alts = (inferAlternatives(requirement) ?? []).map((a) => alias(norm(a))).filter(Boolean);
  if (alts.length > 1) return 'or:' + [...new Set(alts)].sort().join('|');
  return alias(norm(requirement));
}

const LIST_ONLY = /^(?:(?:technical |core |key )?skills?|tools?|technologies|tech stack|kỹ năng|công cụ)\s*[:\-–]/i;
/** Evidence that only lists names (a skills line), with no stated use. */
export function isListOnlyEvidence(evidence: string | undefined): boolean {
  const t = evidence?.trim() ?? '';
  if (!t) return false;
  if (LIST_ONLY.test(t)) return true;
  const items = t.split(/\s*[,;|•]\s*/).filter(Boolean);
  return items.length >= 3 && items.every((i) => i.split(/\s+/).length <= 3);
}

// Lower credit wins. At credit 0, "unknown" beats "missing" so an unevaluable row stays visible as such.
function lowerStatus(a: FitStatus, b: FitStatus): FitStatus {
  const lower = STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
  return STATUS_RANK[lower] === 0 && (a === 'unknown' || b === 'unknown') ? 'unknown' : lower;
}

/** Integer round-half-up of 100·num/den, exact (no floating-point drift). */
export function fitPct(num: number, den: number): number {
  return Math.floor((200 * num + den) / (2 * den));
}

const emptyDiag = (schemaViolations: number): FitDiagnostics => ({
  rowsIn: 0, rowsRejected: 0, keywordsExcluded: 0, duplicatesMerged: 0, conflictingDuplicates: 0, aliasMerged: 0,
  unverifiedMatchDowngraded: 0, listOnlyEvidence: 0, statusDefaulted: 0, priorityDefaulted: 0, categoryDefaulted: 0,
  schemaViolations,
});

/**
 * fit-score-v1 over flattened requirement rows (contract §2.2, steps 1–9).
 * Order-independent; `null` + reason whenever nothing valid can be scored.
 */
export function scoreFitV1(rows: unknown, schemaViolations = 0): FitScoreResult {
  const d = emptyDiag(schemaViolations);
  const counts: Record<FitStatus, number> = { matched: 0, partial: 0, missing: 0, unknown: 0 };
  const none = (reason: Exclude<FitReason, 'error'>): FitScoreResult => ({ score: null, band: null, reason, counts, required: 0, preferred: 0, diag: d });

  // (1) shape
  if (!Array.isArray(rows)) return none('malformed_rows');
  d.rowsIn = rows.length;
  if (rows.length > MAX_FIT_ROWS) return none('too_many_rows');

  const byKey = new Map<string, Normalized>();
  for (const raw of rows as unknown[]) {
    // (2) row validation
    if (!raw || typeof raw !== 'object' || typeof (raw as FitRow).requirement !== 'string') { d.rowsRejected++; continue; }
    const f = raw as FitRow & { requirement: string };
    const key = fitRequirementKey(f.requirement);
    if (!key || key === 'or:') { d.rowsRejected++; continue; }

    // (3) category / keywords — literal-ATS keywords never enter the score (OD-10)
    let category: Category;
    if ((CATEGORIES as readonly unknown[]).includes(f.category)) category = f.category as Category;
    else { category = 'keywords'; d.categoryDefaulted++; }
    if (category === 'keywords') { d.keywordsExcluded++; continue; }

    if (key !== norm(f.requirement) && !key.startsWith('or:')) d.aliasMerged++;

    // (4) status
    let status: FitStatus;
    if (f.status === 'matched' || f.status === 'partial' || f.status === 'missing' || f.status === 'unknown') status = f.status;
    else { status = 'unknown'; d.statusDefaulted++; }

    // (5) evidence: full credit only when P0 verification says "met"
    const evidence = typeof f.cvEvidence === 'string' ? f.cvEvidence : undefined;
    if (status === 'matched') {
      if (deriveItemVerification({ requirement: f.requirement, status: 'matched', cvEvidence: evidence }) !== 'met') {
        status = 'partial'; d.unverifiedMatchDowngraded++;
      } else if (isListOnlyEvidence(evidence)) {
        d.listOnlyEvidence++; // v1: full credit, measured only
      }
    }

    // (6) priority — missing or invalid defaults to required (an unlabelled gap is not discounted)
    let priority: Priority;
    if (f.priority === 'required') priority = 'required';
    else if (f.priority === 'preferred' || f.priority === 'nice-to-have') priority = 'preferred';
    else { priority = 'required'; d.priorityDefaulted++; }

    // (7)+(8) key/alias, commutative merge of duplicates
    const next: Normalized = { key, category, priority, status };
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, next); continue; }
    d.duplicatesMerged++;
    if (prev.status !== next.status) d.conflictingDuplicates++;
    byKey.set(key, {
      key,
      category: CATEGORIES.indexOf(prev.category) <= CATEGORIES.indexOf(next.category) ? prev.category : next.category,
      priority: prev.priority === 'required' || next.priority === 'required' ? 'required' : 'preferred',
      status: lowerStatus(prev.status, next.status),
    });
  }

  // (9) arithmetic — integers only, one rounding
  let num = 0;
  let den = 0;
  let required = 0;
  for (const it of byKey.values()) {
    const w = WEIGHT[it.priority];
    counts[it.status]++;
    if (it.priority === 'required') required++;
    num += w * CREDIT2[it.status];
    den += w * 2;
  }
  if (den === 0) return none('no_scorable_rows');
  const score = fitPct(num, den);
  return { score, band: derivePassProbability(score), counts, required, preferred: byKey.size - required, diag: d };
}

/** Flattens the displayed table with its bucket as `category`. */
export function fitRowsFromDetailedComparison(dc: DetailedComparison): FitRow[] {
  return CATEGORIES.flatMap((category) => dc[category].map((row) => ({ ...row, category })));
}

/**
 * Raw model table shape (before normalization, which silently turns a broken
 * table into empty buckets). `malformed` ⇒ no shadow score; `schemaViolations`
 * counts raw statuses outside the schema enum (production maps them to missing).
 */
export function inspectRawTable(raw: unknown): { malformed: boolean; schemaViolations: number } {
  let o = raw;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch { return { malformed: true, schemaViolations: 0 }; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { malformed: true, schemaViolations: 0 };
  let schemaViolations = 0;
  for (const c of CATEGORIES) {
    const bucket = (o as Record<string, unknown>)[c];
    if (bucket === undefined) continue;
    if (!Array.isArray(bucket)) return { malformed: true, schemaViolations: 0 };
    for (const row of bucket) {
      const st = row && typeof row === 'object' ? (row as { status?: unknown }).status : undefined;
      if (!(typeof st === 'string' && SCHEMA_STATUSES.has(st))) schemaViolations++;
    }
  }
  return { malformed: false, schemaViolations };
}

/** The shadow record for one successful canonical analysis. Throws only on a bug; callers must catch. */
export function buildFitShadow(input: {
  detailedComparison: DetailedComparison;
  rawDetailedComparison: unknown;
  canonicalScore: number;
  inputMode: FitInputMode;
}): FitShadow {
  const raw = inspectRawTable(input.rawDetailedComparison);
  const r = scoreFitV1(raw.malformed ? null : fitRowsFromDetailedComparison(input.detailedComparison), raw.schemaViolations);
  return {
    v: FIT_SCORE_VERSION,
    eligible: r.score !== null,
    ...(r.reason ? { reason: r.reason } : {}),
    canonical: input.canonicalScore,
    shadow: r.score,
    absDiff: r.score === null ? null : Math.abs(input.canonicalScore - r.score),
    bandCanonical: derivePassProbability(input.canonicalScore),
    bandShadow: r.band,
    counts: r.counts,
    required: r.required,
    preferred: r.preferred,
    diag: r.diag,
    inputMode: input.inputMode,
  };
}

/** Server-only flags (never VITE_*). Off unless explicitly "true" / "on". Read at call time. */
const flagOn = (v: string | undefined) => v === 'true' || v === 'on';
export function fitScoreShadowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn(env.FIT_SCORE_SHADOW);
}
/**
 * FIT_SCORE_AUTHORITY is deliberately NON-OPERATIONAL in A3.3: switching the
 * visible score needs a separate owner approval (A3.4). The env value is
 * ignored and the Gemini score stays authoritative.
 */
export function fitScoreAuthorityEnabled(): false {
  return false;
}
