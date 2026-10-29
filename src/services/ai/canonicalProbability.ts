// Stage 3.13B contract A — score only. `passProbability` is a categorical
// representation of the canonical matchScore; it is not a second scoring
// authority. Change the version whenever the mapping changes; historical rows
// keep the version they were written with and are never recomputed.
export const CANONICAL_PROBABILITY_VERSION = 'canonical-score-v1';

// Product boundaries already used by the score verdict/colors (inclusive).
export const SCORE_HIGH_MIN = 80;
export const SCORE_MEDIUM_MIN = 60;

export type ProbabilityLevel = 'High' | 'Medium' | 'Low';
export type ScoreTone = 'high' | 'medium' | 'low' | 'unknown';
export type ProbabilitySurface = 'analysis' | 'history' | 'comparison' | 'recruiter';
export type ProbabilitySource = 'canonical' | 'legacy' | 'unknown-version' | 'missing';

/** Structural subset accepted by the resolver (AnalysisResult, DB rows, JSONB). */
export interface ProbabilityFields {
  passProbability?: string | null;
  successProbability?: string | null;
  probabilityVersion?: string | null;
}

export interface ResolvedProbability {
  /** Raw stored/derived value. Empty string when absent/invalid. */
  value: string;
  source: ProbabilitySource;
}

const LEVELS: readonly ProbabilityLevel[] = ['High', 'Medium', 'Low'];

export function isProbabilityLevel(value: unknown): value is ProbabilityLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/**
 * Canonical probability contract A:
 *   non-finite → 0, clamp [0,100], >=80 High, >=60 Medium, else Low.
 * No rounding, no other inputs. Pure.
 */
export function derivePassProbability(score: number): ProbabilityLevel {
  const finite = Number.isFinite(score) ? score : 0;
  const clamped = Math.min(100, Math.max(0, finite));
  if (clamped >= SCORE_HIGH_MIN) return 'High';
  if (clamped >= SCORE_MEDIUM_MIN) return 'Medium';
  return 'Low';
}

/**
 * Single compatibility boundary for displays.
 *
 * - canonical version: only `passProbability`, validated against the enum;
 *   missing/invalid → source `missing` (never falls back to successProbability).
 * - unknown version: preserve stored `passProbability`; never recompute, never
 *   fall back to another field.
 * - legacy (version absent): preserve the field each surface historically read.
 */
export function resolveProbability(
  result: ProbabilityFields,
  surface: ProbabilitySurface
): ResolvedProbability {
  const rawVersion = typeof result.probabilityVersion === 'string' ? result.probabilityVersion.trim() : '';
  const pass = typeof result.passProbability === 'string' ? result.passProbability : '';
  const success = typeof result.successProbability === 'string' ? result.successProbability : '';

  if (rawVersion === CANONICAL_PROBABILITY_VERSION) {
    const trimmed = pass.trim();
    return isProbabilityLevel(trimmed)
      ? { value: trimmed, source: 'canonical' }
      : { value: '', source: 'missing' };
  }

  if (rawVersion) {
    // Forward compatible: we do not know this mapping, so we only display what
    // was stored; no recomputation and no fallback to the legacy field.
    return { value: pass, source: 'unknown-version' };
  }

  switch (surface) {
    case 'analysis':
      return { value: pass, source: 'legacy' };
    case 'history':
    case 'comparison':
      return { value: success, source: 'legacy' };
    case 'recruiter':
      return { value: success || pass, source: 'legacy' };
  }
}

/**
 * Display helper. Canonical/unknown/missing values never render an empty badge;
 * legacy rows keep their historical empty state (the field selection is what
 * must be preserved, but blank stays blank).
 */
export function formatProbability(resolved: ResolvedProbability): string {
  if (resolved.source === 'legacy') return resolved.value;
  return resolved.value || '—';
}

/** Tone for the existing pass-probability badge; tolerates legacy VI values. */
export function probabilityTone(value: string | null | undefined): ScoreTone {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'high' || v === 'cao') return 'high';
  if (v === 'medium' || v === 'trung bình' || v === 'trung binh') return 'medium';
  if (v === 'low' || v === 'thấp' || v === 'thap') return 'low';
  return 'unknown';
}

/** Convenience for consumers that only render a value. */
export function displayProbability(result: ProbabilityFields, surface: ProbabilitySurface): string {
  return formatProbability(resolveProbability(result, surface));
}
