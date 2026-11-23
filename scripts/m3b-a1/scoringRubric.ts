// M3-B OFFLINE PROTOTYPE — deterministic fit score from requirement-level
// findings (architecture E). Not imported by production code (enforced by
// scripts/m3b-a1/__tests__/isolation.test.ts). FROZEN: any edit changes the
// file hash in scripts/m3b-a1/RUBRIC_FROZEN.json and must bump RUBRIC_VERSION
// (scripts/m3b-a1/__tests__/rubricFreeze.test.ts).
//
// Two layers, kept separate on purpose:
//   1. normalizeFindings — SEMANTIC normalization (identity, aliases, OR text,
//      duplicates, evidence strength, keywords policy). Its output stability
//      depends on the model's classifications and is what A2 must measure.
//   2. scoreNormalized — NUMERIC scoring. Pure integer arithmetic over the
//      normalized set: identical normalized input ⇒ identical score.
// Neither layer is evidence that live end-to-end analysis is stable.
import { createHash } from 'node:crypto';
import { deriveItemVerification } from '../../src/services/ai/requirementVerification';
import type { DetailedComparison } from '../../src/services/ai/types';

export const RUBRIC_VERSION = 'rubric-proto-v1-candidate';

export type EvidenceStatus = 'matched' | 'partial' | 'missing' | 'unknown';
export type Priority = 'required' | 'preferred';
export const CATEGORIES = ['skills', 'experience', 'tools', 'education', 'keywords'] as const;
export type Category = (typeof CATEGORIES)[number];
/** Scored categories: literal-ATS "keywords" never enter the fit score (OD-10, accepted). */
export const SCORED_CATEGORIES = ['skills', 'experience', 'tools', 'education'] as const;
export type ScoredCategory = (typeof SCORED_CATEGORIES)[number];

/** Prototype input. Semantic judgments only — no numbers authored by the model. */
export interface RequirementFinding {
  requirement: string;
  category: string;
  priority?: string;
  status: string;
  cvEvidence?: string;
  /** OR-group members; any supported member satisfies the group. Inferred from " or " text when absent. */
  alternatives?: string[];
  /** Eligibility gate (e.g. work authorization). Reported, never a hidden cap. */
  hard?: boolean;
}

export interface RubricOptions {
  /** OD-12 (owner decision pending): credit for a matched row whose evidence is only a skills-list mention. */
  listOnlyEvidence?: 'full' | 'partial';
  /** OD-13 (pending): JD text for requirement grounding. Ungrounded rows are always flagged; excluded only when `groundedOnly`. */
  jdText?: string;
  groundedOnly?: boolean;
}

// Owner-tunable constants (uncalibrated; calibration requires A2 + held-out data).
export const PRIORITY_WEIGHT: Record<Priority, number> = { required: 3, preferred: 1 };
/** Credit in halves so all arithmetic stays in integers: matched 2/2, partial 1/2. */
const CREDIT2: Record<EvidenceStatus, number> = { matched: 2, partial: 1, missing: 0, unknown: 0 };
const STATUS_RANK: Record<EvidenceStatus, number> = { missing: 0, unknown: 0, partial: 1, matched: 2 };
export const FIT_HIGH_MIN = 80;
export const FIT_MEDIUM_MIN = 60;
export type FitBand = 'High' | 'Medium' | 'Low';

/**
 * Versioned alias table (exact whole-key match after normalization). Only
 * unambiguous names of the same product/technology; never "related" tools.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  'react.js': 'react', reactjs: 'react',
  'node': 'node.js', nodejs: 'node.js',
  'vue.js': 'vue', vuejs: 'vue',
  'next': 'next.js', nextjs: 'next.js',
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

export interface NormalizedRequirement {
  key: string;
  requirement: string;
  category: Category;
  priority: Priority;
  status: EvidenceStatus;
  hard: boolean;
  grounded: boolean;
}

export interface NormalizeDiagnostics {
  rowsIn: number;
  rowsRejected: number;
  keywordsExcluded: number;
  duplicatesMerged: number;
  conflictingDuplicates: number;
  aliasMerged: number;
  orInferred: number;
  unverifiedMatchDowngraded: number;
  listOnlyDowngraded: number;
  ungrounded: number;
  ungroundedExcluded: number;
  priorityDefaulted: number;
  categoryDefaulted: number;
  statusDefaulted: number;
}

export interface CategoryBreakdown { score: number; weight: number; requirements: number }

export interface RubricResult {
  rubricVersion: string;
  /** null = not enough valid requirements to score (never a silent 0). */
  score: number | null;
  /** Fit band of `score` — a CV/JD fit band, not a screening or hiring probability. */
  fitBand: FitBand | null;
  breakdown: Record<ScoredCategory, CategoryBreakdown | null>;
  counts: Record<EvidenceStatus, number>;
  hardRequirementsNotEvidenced: string[];
  diagnostics: NormalizeDiagnostics;
  /** SHA-256 of the normalized, sorted findings + version: identical hash ⇒ identical score. */
  findingsHash: string;
}

const MAX_KEY_CHARS = 300;
const norm = (s: string) =>
  s.normalize('NFC').toLowerCase().replace(/[\s ]+/g, ' ').replace(/[,;:!?'"()[\]{}]/g, '').replace(/\.$/, '').trim().slice(0, MAX_KEY_CHARS);
const alias = (k: string) => ALIASES[k] ?? k;

/** " or " splits only (never "/": CI/CD, UI/UX, TCP/IP are single terms). Commas join the list when " or " is present. */
export function inferAlternatives(requirement: string): string[] | undefined {
  if (!/\s(?:or|hoặc)\s/i.test(requirement)) return undefined;
  const parts = requirement.split(/\s*,\s*|\s+(?:or|hoặc)\s+/i).map((p) => p.trim()).filter(Boolean);
  // Long clauses are not tool alternatives ("3 years in fintech or 5 years in banking" stays one row).
  return parts.length > 1 && parts.every((p) => p.split(/\s+/).length <= 3) ? parts : undefined;
}

/** Identity key: NFC, case/space/punctuation-insensitive, alias-resolved; OR groups are order-free sets. */
export function requirementKey(f: Pick<RequirementFinding, 'requirement' | 'alternatives'>): string {
  const alts = (f.alternatives && f.alternatives.length > 1 ? f.alternatives : inferAlternatives(f.requirement) ?? [])
    .map((a) => alias(norm(a))).filter(Boolean);
  if (alts.length > 1) return 'or:' + [...new Set(alts)].sort().join('|');
  return alias(norm(f.requirement));
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

const STOP = new Set(['and', 'the', 'with', 'for', 'experience', 'years', 'year', 'skills', 'skill', 'knowledge', 'strong', 'good', 'ability', 'proficient', 'proficiency', 'kinh', 'nghiệm', 'năm', 'kỹ', 'năng']);
const tokens = (s: string) => norm(s).split(/[^\p{L}\p{N}+#.]+/u).map((t) => t.replace(/\.+$/, '')).filter((t) => t.length >= 2 && !STOP.has(t));
function isGrounded(requirement: string, jdTokens: Set<string> | null): boolean {
  if (!jdTokens) return true;
  const req = tokens(requirement).map(alias);
  return req.length === 0 || req.some((t) => jdTokens.has(t));
}

/** Layer 1 — semantic normalization. Pure and order-independent. */
export function normalizeFindings(findings: readonly RequirementFinding[] | unknown, opts: RubricOptions = {}): { items: NormalizedRequirement[]; diagnostics: NormalizeDiagnostics } {
  const d: NormalizeDiagnostics = {
    rowsIn: 0, rowsRejected: 0, keywordsExcluded: 0, duplicatesMerged: 0, conflictingDuplicates: 0, aliasMerged: 0,
    orInferred: 0, unverifiedMatchDowngraded: 0, listOnlyDowngraded: 0, ungrounded: 0, ungroundedExcluded: 0,
    priorityDefaulted: 0, categoryDefaulted: 0, statusDefaulted: 0,
  };
  const rows = Array.isArray(findings) ? findings : [];
  d.rowsIn = rows.length;
  const jdTokens = typeof opts.jdText === 'string' ? new Set(tokens(opts.jdText).map(alias)) : null;
  const byKey = new Map<string, NormalizedRequirement>();

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || typeof (raw as RequirementFinding).requirement !== 'string') { d.rowsRejected++; continue; }
    const f = raw as RequirementFinding;
    const key = requirementKey(f);
    if (!key || key === 'or:') { d.rowsRejected++; continue; }

    let category: Category;
    if ((CATEGORIES as readonly string[]).includes(f.category)) category = f.category as Category;
    else { category = 'keywords'; d.categoryDefaulted++; }
    if (category === 'keywords') { d.keywordsExcluded++; continue; } // OD-10: advisory ATS signal only

    if (!(f.alternatives && f.alternatives.length > 1) && inferAlternatives(f.requirement)) d.orInferred++;
    if (key !== norm(f.requirement) && !key.startsWith('or:')) d.aliasMerged++;

    let status: EvidenceStatus;
    if (f.status === 'matched' || f.status === 'partial' || f.status === 'missing' || f.status === 'unknown') status = f.status;
    else { status = 'unknown'; d.statusDefaulted++; }
    // Full credit only when P0 verification says "met": usable, non-inferred evidence, no same-metric shortfall.
    if (status === 'matched' && deriveItemVerification({ requirement: f.requirement, status: 'matched', cvEvidence: f.cvEvidence }) !== 'met') {
      status = 'partial'; d.unverifiedMatchDowngraded++;
    } else if (status === 'matched' && opts.listOnlyEvidence === 'partial' && isListOnlyEvidence(f.cvEvidence)) {
      status = 'partial'; d.listOnlyDowngraded++;
    }

    let priority: Priority;
    if (f.priority === 'required') priority = 'required';
    else if (f.priority === 'preferred' || f.priority === 'nice-to-have') priority = 'preferred';
    else { priority = 'required'; d.priorityDefaulted++; }

    const grounded = isGrounded(f.requirement, jdTokens);
    if (!grounded) {
      d.ungrounded++;
      if (opts.groundedOnly) { d.ungroundedExcluded++; continue; }
    }

    const next: NormalizedRequirement = { key, requirement: f.requirement.trim(), category, priority, status, hard: f.hard === true, grounded };
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, next); continue; }
    // Same requirement twice: conservative, commutative merge.
    d.duplicatesMerged++;
    if (prev.status !== next.status) d.conflictingDuplicates++;
    byKey.set(key, {
      key,
      requirement: prev.requirement <= next.requirement ? prev.requirement : next.requirement,
      category: CATEGORIES.indexOf(prev.category) <= CATEGORIES.indexOf(next.category) ? prev.category : next.category,
      priority: prev.priority === 'required' || next.priority === 'required' ? 'required' : 'preferred',
      status: lowerStatus(prev.status, next.status),
      hard: prev.hard || next.hard,
      grounded: prev.grounded && next.grounded,
    });
  }
  const items = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { items, diagnostics: d };
}

// Lower credit wins. At credit 0, "unknown" beats "missing" so an unevaluable row stays visible as such.
function lowerStatus(a: EvidenceStatus, b: EvidenceStatus): EvidenceStatus {
  const lower = STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
  return STATUS_RANK[lower] === 0 && (a === 'unknown' || b === 'unknown') ? 'unknown' : lower;
}

/** Layer 2 — numeric scoring. Pure integer arithmetic; ignores every model-authored number. */
export function scoreNormalized(items: readonly NormalizedRequirement[], diagnostics: NormalizeDiagnostics): RubricResult {
  const counts: Record<EvidenceStatus, number> = { matched: 0, partial: 0, missing: 0, unknown: 0 };
  const per = Object.fromEntries(SCORED_CATEGORIES.map((c) => [c, { num: 0, den: 0, n: 0 }])) as Record<ScoredCategory, { num: number; den: number; n: number }>;
  let num = 0;
  let den = 0;
  for (const it of items) {
    const w = PRIORITY_WEIGHT[it.priority];
    counts[it.status]++;
    num += w * CREDIT2[it.status];
    den += w * 2;
    const c = per[it.category as ScoredCategory];
    c.num += w * CREDIT2[it.status]; c.den += w * 2; c.n++;
  }
  const breakdown = Object.fromEntries(
    SCORED_CATEGORIES.map((c) => [c, per[c].n ? { score: pct(per[c].num, per[c].den), weight: per[c].den / 2, requirements: per[c].n } : null])
  ) as Record<ScoredCategory, CategoryBreakdown | null>;
  const score = den > 0 ? pct(num, den) : null;
  const canonical = items.map(({ key, category, priority, status, hard }) => ({ key, category, priority, status, hard }));
  return {
    rubricVersion: RUBRIC_VERSION,
    score,
    fitBand: score === null ? null : score >= FIT_HIGH_MIN ? 'High' : score >= FIT_MEDIUM_MIN ? 'Medium' : 'Low',
    breakdown,
    counts,
    hardRequirementsNotEvidenced: items.filter((i) => i.hard && i.status !== 'matched').map((i) => i.requirement),
    diagnostics,
    findingsHash: createHash('sha256').update(JSON.stringify([RUBRIC_VERSION, canonical])).digest('hex'),
  };
}

export function scoreFindings(findings: readonly RequirementFinding[] | unknown, opts: RubricOptions = {}): RubricResult {
  const { items, diagnostics } = normalizeFindings(findings, opts);
  return scoreNormalized(items, diagnostics);
}

/** Integer round-half-up of 100·num/den, exact (no floating-point drift). */
export function pct(num: number, den: number): number {
  return Math.floor((200 * num + den) / (2 * den));
}

/** Adapter from today's canonical `detailedComparison` (history / candidate_cvs JSONB). */
export function findingsFromDetailedComparison(dc: Partial<DetailedComparison> | null | undefined): RequirementFinding[] {
  if (!dc || typeof dc !== 'object') return [];
  return CATEGORIES.flatMap((category) =>
    (Array.isArray(dc[category]) ? dc[category]! : []).map((row) => ({
      requirement: row.requirement, category, priority: row.priority, status: row.status, cvEvidence: row.cvEvidence,
    }))
  );
}

/** Compatibility boundary: stored scores are shown as stored unless written by this rubric version. Never rescored. */
export function displayedScore(row: { matchScore?: unknown; scoreVersion?: unknown }): { score: number | null; source: 'rubric' | 'stored' } {
  const s = typeof row.matchScore === 'number' && Number.isFinite(row.matchScore) ? row.matchScore : null;
  return { score: s, source: row.scoreVersion === RUBRIC_VERSION ? 'rubric' : 'stored' };
}
