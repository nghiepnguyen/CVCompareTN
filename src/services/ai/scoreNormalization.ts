// M3-B R0: the ONE validation + normalization boundary for the model-authored
// overall score (canonical-en-v2). Called once in the server's analyzeCV,
// before the probability band and before any quota commit or persistence;
// every downstream surface receives the integer it returns.
//
// Contract:
// - valid = a JSON number that is finite and within [0, 100] BEFORE rounding;
// - everything else (missing, null, strings — including numeric strings —
//   NaN, ±Infinity, < 0, > 100) is invalid AI output: never coerced to 0,
//   never clamped. The response schema declares matchScore as NUMBER, so no
//   compatibility case requires accepting strings;
// - rounding: half-up to an integer, applied exactly once (59.5 → 60, 79.5 → 80).
export const MATCH_SCORE_MIN = 0;
export const MATCH_SCORE_MAX = 100;

export type InvalidScoreReason = 'missing' | 'not_a_number' | 'non_finite' | 'out_of_range';

export type MatchScoreValidation =
  | { ok: true; score: number }
  | { ok: false; reason: InvalidScoreReason };

export function normalizeMatchScore(raw: unknown): MatchScoreValidation {
  if (raw === undefined || raw === null) return { ok: false, reason: 'missing' };
  if (typeof raw !== 'number') return { ok: false, reason: 'not_a_number' };
  if (!Number.isFinite(raw)) return { ok: false, reason: 'non_finite' };
  if (raw < MATCH_SCORE_MIN || raw > MATCH_SCORE_MAX) return { ok: false, reason: 'out_of_range' };
  return { ok: true, score: Math.floor(raw + 0.5) };
}
