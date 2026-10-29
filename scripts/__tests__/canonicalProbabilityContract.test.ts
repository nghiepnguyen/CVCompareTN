/**
 * AUDIT / CONTRACT TEST ONLY — freezes the Stage 3.13B specification.
 *
 * These tests exercise the *reference* mapping exported by
 * scripts/audit-canonical-probability.ts. They are not production code, are not
 * imported by the app, and do not assert any current runtime behavior. Stage
 * 3.13C must move the same rules into the production path and keep these
 * expectations (or document a new probabilityVersion).
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  HIGH_MIN,
  MEDIUM_MIN,
  contractA,
  contractB,
  contractC,
  levelForScore,
  type Level,
  type RequiredGaps,
} from '../audit-canonical-probability';

const ORDER: Record<Level, number> = { Low: 0, Medium: 1, High: 2 };
const noGaps: RequiredGaps = { requiredTotal: 5, requiredMissing: 0, requiredPartial: 0 };

describe('CONTRACT A — score-only canonical probability', () => {
  it('uses the existing product boundaries inclusively', () => {
    expect(HIGH_MIN).toBe(80);
    expect(MEDIUM_MIN).toBe(60);
    expect(levelForScore(0)).toBe('Low');
    expect(levelForScore(59)).toBe('Low');
    expect(levelForScore(59.9)).toBe('Low');
    expect(levelForScore(60)).toBe('Medium');
    expect(levelForScore(79.9)).toBe('Medium');
    expect(levelForScore(80)).toBe('High');
    expect(levelForScore(100)).toBe('High');
  });

  it('clamps out-of-range scores and maps non-finite to Low', () => {
    expect(levelForScore(-10)).toBe('Low');
    expect(levelForScore(150)).toBe('High');
    expect(levelForScore(Number.NaN)).toBe('Low');
    expect(levelForScore(Number.POSITIVE_INFINITY)).toBe('Low');
  });

  it('is deterministic: the same score always maps to the same level', () => {
    for (let s = 0; s <= 100; s++) {
      expect(contractA(s)).toBe(contractA(s));
    }
  });

  it('ignores any additional gap input (Invariant C holds by construction)', () => {
    // contractA has a one-argument signature; passing gap data as an extra
    // argument cannot change the result, so a more severe required gap can
    // never yield a higher probability.
    const withGaps = contractA as unknown as (score: number, gaps: RequiredGaps) => Level;
    const gaps: RequiredGaps[] = [
      noGaps,
      { requiredTotal: 5, requiredMissing: 1, requiredPartial: 0 },
      { requiredTotal: 5, requiredMissing: 5, requiredPartial: 0 },
    ];
    for (const s of [0, 50, 60, 79, 80, 95, 100]) {
      for (const g of gaps) expect(withGaps(s, g)).toBe(contractA(s));
    }
  });

  it('is monotone non-decreasing in matchScore (Invariant B)', () => {
    for (let s = 1; s <= 100; s++) {
      expect(ORDER[contractA(s)]).toBeGreaterThanOrEqual(ORDER[contractA(s - 1)]);
    }
  });

  it('pins the versioned contract id', () => {
    expect(CONTRACT_VERSION).toBe('canonical-score-v1');
  });
});

describe('candidate B — score bands + required-gap cap (evaluated, not selected)', () => {
  it('caps High at Medium when any required item is missing', () => {
    expect(contractB(95, { requiredTotal: 12, requiredMissing: 1, requiredPartial: 1 })).toBe('Medium');
    expect(contractB(95, { requiredTotal: 12, requiredMissing: 0, requiredPartial: 1 })).toBe('High');
    expect(contractB(79, { requiredTotal: 12, requiredMissing: 3, requiredPartial: 0 })).toBe('Medium');
    expect(contractB(40, { requiredTotal: 12, requiredMissing: 6, requiredPartial: 0 })).toBe('Low');
  });

  it('is monotone in score and non-increasing in required gaps', () => {
    for (let s = 1; s <= 100; s++) {
      expect(ORDER[contractB(s, noGaps)]).toBeGreaterThanOrEqual(ORDER[contractB(s - 1, noGaps)]);
    }
    for (const s of [0, 59, 60, 79, 80, 95, 100]) {
      let prev = 2;
      for (const missing of [0, 1, 2, 5]) {
        const v = ORDER[contractB(s, { requiredTotal: 5, requiredMissing: missing, requiredPartial: 0 })];
        expect(v).toBeLessThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('candidate C — weighted recomputation (evaluated, not selected)', () => {
  it('demonstrates duplicate scoring: additive penalties can cross two bands', () => {
    expect(contractA(76)).toBe('Medium');
    expect(contractC(76, { requiredTotal: 10, requiredMissing: 2, requiredPartial: 2 })).toBe('Low');
  });

  it('can violate requirement monotonicity when partials outweigh a missing item', () => {
    // Three partials penalise more than one missing here, so the more severe
    // required state (1 missing) scores HIGHER than the 3-partial state.
    const partials = contractC(70, { requiredTotal: 5, requiredMissing: 0, requiredPartial: 3 });
    const missing = contractC(70, { requiredTotal: 5, requiredMissing: 1, requiredPartial: 0 });
    expect(ORDER[missing]).toBeGreaterThan(ORDER[partials]);
  });
});
