import { describe, expect, it } from 'vitest';
import { rawJdConcepts } from '../../../_server-lib/ai/suggestionGuard';

// M2-D2 Phase 0: the hyphenated-compound pattern retried from every letter of
// a hyphen-free run, so a 50k-char single token took ~1.3 s locally and ~5 s
// on CI (m2bStabilization "JD exactly at the limit" timed out). The anchored
// pattern must return the same matches as the old one.
const OLD = /\p{L}+(?:-\p{L}+)+/gu;
const NEW = /(?<!\p{L})\p{L}+(?:-\p{L}+)+/gu;

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe('raw-JD hyphenated compounds (M2-D2 Phase 0)', () => {
  it('anchored pattern returns exactly the old matches on random mixed input', () => {
    const alphabet = ['a', 'B', 'ệ', 'Đ', 'é', '-', '-', ' ', '\n', '1', '.', '_', 'ß'];
    const rand = seeded(42);
    for (let n = 0; n < 2000; n++) {
      const len = 1 + Math.floor(rand() * 40);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
      const oldM = [...s.matchAll(OLD)].map((m) => [m.index, m[0]]);
      const newM = [...s.matchAll(NEW)].map((m) => [m.index, m[0]]);
      expect(newM, JSON.stringify(s)).toEqual(oldM);
    }
  });

  it('a 50k-char hyphen-free token is processed in linear time', () => {
    const t = performance.now();
    rawJdConcepts('y'.repeat(50_000), 'CV');
    // Was ~1.3 s before the fix; now single-digit ms. Generous CI margin.
    expect(performance.now() - t).toBeLessThan(250);
  });

  it('still extracts hyphenated compounds', () => {
    const concepts = rawJdConcepts('Build self-serve dashboards and cross-functional rituals', 'CV text').map((c) => c.concept);
    expect(concepts).toEqual(expect.arrayContaining(['self-serve', 'cross-functional']));
  });
});
