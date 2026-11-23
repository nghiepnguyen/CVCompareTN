import { describe, it, expect } from 'vitest';
import { A2_FIXTURES } from '../a2Fixtures';
import { scoreFindings } from '../scoringRubric';

// Pre-registered targets: the frozen rubric applied to the owner-reviewed
// human labels (draft). A2 compares the rubric score of each live response with
// these targets; they are fixed before any run and never tuned on pilot output.
const TARGETS: Record<string, { score: number; band: string }> = {
  'a2-strong': { score: 100, band: 'High' },
  'a2-boundary-80': { score: 83, band: 'High' },
  'a2-boundary-60': { score: 63, band: 'Medium' },
  'a2-semantic-stress': { score: 78, band: 'Medium' },
};

const labelled = (f: (typeof A2_FIXTURES)[number]) =>
  Object.entries(f.expected.requirements).map(([requirement, e]) => ({
    requirement, category: 'skills', priority: e.priority, status: e.status, cvEvidence: 'per human label',
  }));

describe('A2.0 fixtures', () => {
  it('cover the four required cases, all synthetic', () => {
    expect(A2_FIXTURES.map((f) => f.id)).toEqual(['a2-strong', 'a2-boundary-80', 'a2-boundary-60', 'a2-semantic-stress']);
    for (const f of A2_FIXTURES) expect(f.cv).toMatch(/\(synthetic\)/);
    expect(JSON.stringify(A2_FIXTURES)).not.toMatch(/@|\+?\d{9,}|https?:\/\//); // no emails, phone numbers or links
  });

  it.each(A2_FIXTURES.map((f) => [f.id, f] as const))('%s: frozen rubric on human labels = pre-registered target', (id, f) => {
    const r = scoreFindings(labelled(f));
    expect({ score: r.score, band: r.fitBand }).toEqual(TARGETS[id]);
  });

  it('boundary fixtures sit within ±5 of their boundary; strong and weak-ish stay discriminated', () => {
    expect(Math.abs(TARGETS['a2-boundary-80'].score - 80)).toBeLessThanOrEqual(5);
    expect(Math.abs(TARGETS['a2-boundary-60'].score - 60)).toBeLessThanOrEqual(5);
    expect(TARGETS['a2-strong'].score - TARGETS['a2-boundary-60'].score).toBeGreaterThanOrEqual(25);
  });
});
