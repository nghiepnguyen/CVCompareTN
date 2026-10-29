import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PROBABILITY_VERSION,
  SCORE_HIGH_MIN,
  SCORE_MEDIUM_MIN,
  derivePassProbability,
  displayProbability,
  formatProbability,
  probabilityTone,
  resolveProbability,
  type ProbabilitySurface,
} from '../../services/ai/canonicalProbability';

const SURFACES: ProbabilitySurface[] = ['analysis', 'history', 'comparison', 'recruiter'];

describe('derivePassProbability — Stage 3.13B contract A', () => {
  it('pins the inclusive product boundaries', () => {
    expect(SCORE_HIGH_MIN).toBe(80);
    expect(SCORE_MEDIUM_MIN).toBe(60);
    expect(derivePassProbability(80)).toBe('High');
    expect(derivePassProbability(60)).toBe('Medium');
    expect(derivePassProbability(59.999)).toBe('Low');
    expect(derivePassProbability(79.999)).toBe('Medium');
  });

  it.each([
    [Number.NaN, 'Low'],
    [Number.POSITIVE_INFINITY, 'Low'],
    [Number.NEGATIVE_INFINITY, 'Low'],
    [-1, 'Low'],
    [0, 'Low'],
    [59, 'Low'],
    [59.999, 'Low'],
    [60, 'Medium'],
    [79.999, 'Medium'],
    [80, 'High'],
    [100, 'High'],
    [101, 'High'],
  ])('score %s → %s', (score, expected) => {
    expect(derivePassProbability(score)).toBe(expected);
  });

  it('is monotone non-decreasing across the score domain', () => {
    const order = { Low: 0, Medium: 1, High: 2 } as const;
    for (let s = 0.5; s <= 100; s += 0.5) {
      expect(order[derivePassProbability(s)]).toBeGreaterThanOrEqual(order[derivePassProbability(s - 0.5)]);
    }
  });

  it('is deterministic and pure', () => {
    for (const s of [0, 59.999, 60, 79.999, 80, 100]) {
      expect(derivePassProbability(s)).toBe(derivePassProbability(s));
    }
  });
});

describe('resolveProbability — version boundary', () => {
  it('canonical rows use passProbability only, on every surface', () => {
    for (const surface of SURFACES) {
      const resolved = resolveProbability(
        { probabilityVersion: CANONICAL_PROBABILITY_VERSION, passProbability: 'Medium', successProbability: 'High' },
        surface
      );
      expect(resolved).toEqual({ value: 'Medium', source: 'canonical' });
    }
  });

  it('canonical rows never resurrect successProbability when passProbability is missing', () => {
    for (const surface of SURFACES) {
      const resolved = resolveProbability(
        { probabilityVersion: CANONICAL_PROBABILITY_VERSION, passProbability: '', successProbability: 'High' },
        surface
      );
      expect(resolved).toEqual({ value: '', source: 'missing' });
      expect(displayProbability(
        { probabilityVersion: CANONICAL_PROBABILITY_VERSION, passProbability: '', successProbability: 'High' },
        surface
      )).toBe('—');
    }
  });

  it('canonical rows treat a non-enum value as missing instead of falling back', () => {
    const resolved = resolveProbability(
      { probabilityVersion: CANONICAL_PROBABILITY_VERSION, passProbability: 'Cao', successProbability: 'High' },
      'analysis'
    );
    expect(resolved).toEqual({ value: '', source: 'missing' });
  });

  it('legacy rows preserve the historical field per surface', () => {
    const legacy = { successProbability: 'High', passProbability: 'Medium' };
    expect(resolveProbability(legacy, 'analysis')).toEqual({ value: 'Medium', source: 'legacy' });
    expect(resolveProbability(legacy, 'history')).toEqual({ value: 'High', source: 'legacy' });
    expect(resolveProbability(legacy, 'comparison')).toEqual({ value: 'High', source: 'legacy' });
    expect(resolveProbability(legacy, 'recruiter')).toEqual({ value: 'High', source: 'legacy' });
  });

  it('legacy recruiter keeps the success||pass fallback; other surfaces do not', () => {
    const passOnly = { successProbability: '', passProbability: 'Medium' };
    expect(resolveProbability(passOnly, 'recruiter')).toEqual({ value: 'Medium', source: 'legacy' });
    expect(resolveProbability(passOnly, 'history')).toEqual({ value: '', source: 'legacy' });
    expect(resolveProbability(passOnly, 'analysis')).toEqual({ value: 'Medium', source: 'legacy' });
  });

  it('unknown versions preserve stored passProbability and never recompute or fall back', () => {
    for (const surface of SURFACES) {
      expect(resolveProbability(
        { probabilityVersion: 'canonical-score-v2', passProbability: 'Low', successProbability: 'High' },
        surface
      )).toEqual({ value: 'Low', source: 'unknown-version' });
      expect(resolveProbability(
        { probabilityVersion: 'canonical-score-v2', passProbability: '', successProbability: 'High' },
        surface
      )).toEqual({ value: '', source: 'unknown-version' });
    }
  });

  it('treats an empty/whitespace version as legacy, not canonical', () => {
    expect(resolveProbability(
      { probabilityVersion: '   ', successProbability: 'High', passProbability: 'Medium' },
      'history'
    )).toEqual({ value: 'High', source: 'legacy' });
  });
});

describe('probability display helpers', () => {
  it('formats empty canonical values as an em dash but preserves legacy empties', () => {
    expect(formatProbability({ value: '', source: 'missing' })).toBe('—');
    expect(formatProbability({ value: '', source: 'unknown-version' })).toBe('—');
    expect(formatProbability({ value: '', source: 'legacy' })).toBe('');
    expect(formatProbability({ value: 'High', source: 'canonical' })).toBe('High');
  });

  it('maps canonical and legacy Vietnamese values to the same tone', () => {
    expect(probabilityTone('High')).toBe('high');
    expect(probabilityTone('Cao')).toBe('high');
    expect(probabilityTone('Medium')).toBe('medium');
    expect(probabilityTone('Trung bình')).toBe('medium');
    expect(probabilityTone('Low')).toBe('low');
    expect(probabilityTone('Thấp')).toBe('low');
    expect(probabilityTone('')).toBe('unknown');
    expect(probabilityTone('%')).toBe('unknown');
  });
});
