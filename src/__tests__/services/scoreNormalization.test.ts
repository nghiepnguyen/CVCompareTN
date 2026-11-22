// M3-B R0: the single validation + normalization boundary for matchScore.
import { describe, it, expect } from 'vitest';
import { normalizeMatchScore } from '../../services/ai/scoreNormalization';
import { derivePassProbability } from '../../services/ai/canonicalProbability';

describe('normalizeMatchScore', () => {
  it.each([
    [undefined, 'missing'],
    [null, 'missing'],
    ['70', 'not_a_number'], // numeric strings are not accepted (schema: NUMBER)
    ['abc', 'not_a_number'],
    ['', 'not_a_number'],
    [true, 'not_a_number'],
    [{}, 'not_a_number'],
    [[70], 'not_a_number'],
    [NaN, 'non_finite'],
    [Infinity, 'non_finite'],
    [-Infinity, 'non_finite'],
    [-5, 'out_of_range'],
    [-0.4, 'out_of_range'], // checked BEFORE rounding: never rounded into range
    [100.4, 'out_of_range'],
    [150, 'out_of_range'],
  ])('%j is invalid (%s) — never 0, never clamped', (raw, reason) => {
    expect(normalizeMatchScore(raw)).toEqual({ ok: false, reason });
  });

  it.each([
    [0, 0], [59, 59], [60, 60], [79, 79], [80, 80], [100, 100],
    [59.4, 59], [59.5, 60], [59.6, 60], [79.49, 79], [79.5, 80], [99.5, 100], [0.4, 0], [72.5, 73],
  ])('%j → %j (round half-up once)', (raw, score) => {
    expect(normalizeMatchScore(raw)).toEqual({ ok: true, score });
  });

  it.each([
    [59.4, 'Low'], [59.5, 'Medium'], [79.4, 'Medium'], [79.5, 'High'], [60, 'Medium'], [80, 'High'], [0, 'Low'], [100, 'High'],
  ])('band derives from the normalized integer: %j → %s (thresholds 60/80 unchanged)', (raw, band) => {
    const r = normalizeMatchScore(raw);
    expect(r.ok).toBe(true);
    expect(derivePassProbability((r as { score: number }).score)).toBe(band);
  });

  it('is idempotent on its own output (no second normalization can differ)', () => {
    for (let x = 0; x <= 100; x += 0.25) {
      const once = normalizeMatchScore(x) as { score: number };
      expect(normalizeMatchScore(once.score)).toEqual({ ok: true, score: once.score });
    }
  });
});
