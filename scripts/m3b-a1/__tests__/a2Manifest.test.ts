import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeManifest } from '../a2Manifest';
import { A21_FIXTURES } from '../a21Fixtures';
import { A2_FIXTURES } from '../a2Fixtures';

// A2.0 and A2.1 inputs are frozen before any A2.0 output exists. Any drift in
// fixtures, labels, rendered prompts, request config, rubric or protocol fails
// here and requires an owner-approved re-freeze (after A2.0: new versions).
describe('A2 fixtures manifest', () => {
  it('committed manifest equals the computed one', () => {
    expect(JSON.parse(readFileSync('scripts/m3b-a1/A2_FIXTURES_MANIFEST.json', 'utf8'))).toEqual(computeManifest());
  });

  it('A2.1 held-out fixtures are synthetic, PII-free and disjoint from A2.0', () => {
    for (const f of A21_FIXTURES) expect(f.cv).toMatch(/\(synthetic\)/);
    expect(JSON.stringify(A21_FIXTURES)).not.toMatch(/@|\+?\d{9,}|https?:\/\//);
    const a20 = new Set(A2_FIXTURES.flatMap((f) => [f.jd, f.cv]));
    for (const f of A21_FIXTURES) { expect(a20.has(f.jd)).toBe(false); expect(a20.has(f.cv)).toBe(false); }
    expect(new Set([...A2_FIXTURES, ...A21_FIXTURES].map((f) => f.id)).size).toBe(10);
  });

  it('every fixture fits the per-request size bound and has a non-null label score', () => {
    for (const e of [...computeManifest().a20, ...computeManifest().a21HeldOutPriorityOrder]) {
      expect(e.requestBytes).toBeLessThan(256 * 1024);
      expect(e.labelRubric.score).not.toBeNull();
    }
  });
});
