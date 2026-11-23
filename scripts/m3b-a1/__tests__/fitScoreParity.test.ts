import { describe, it, expect } from 'vitest';
import { scoreFindings, type RequirementFinding } from '../scoringRubric';
import * as F from '../fixtures';
import { scoreFitV1 } from '../../../src/services/ai/fitScore';

// A3.3: the production fit-score-v1 module must score exactly like the frozen
// A2 prototype under the A3.2 defaults (list-only = full credit, no JD
// grounding). Model rows carry no `alternatives` / `hard`, so those are stripped.
const asRows = (fs: readonly RequirementFinding[]) => fs.map(({ alternatives: _a, hard: _h, ...r }) => r);
const same = (fs: RequirementFinding[]) => {
  const p = scoreFindings(asRows(fs));
  const v = scoreFitV1(asRows(fs));
  expect(v.score).toBe(p.score);
  expect(v.band).toBe(p.fitBand);
  expect(v.counts).toEqual(p.counts);
  for (const k of ['rowsIn', 'rowsRejected', 'keywordsExcluded', 'duplicatesMerged', 'conflictingDuplicates', 'aliasMerged', 'unverifiedMatchDowngraded', 'statusDefaulted', 'priorityDefaulted', 'categoryDefaulted'] as const) {
    expect(v.diag[k], k).toBe(p.diagnostics[k]);
  }
};

describe('fit-score-v1 ↔ frozen prototype parity', () => {
  it('every fixture table', () => {
    for (const [name, value] of Object.entries(F)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'object') same(value as RequirementFinding[]);
      else expect(typeof name).toBe('string');
    }
  });

  it('2,000 random tables (statuses, priorities, buckets, aliases, duplicates, evidence)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    const reqs = ['React', 'React.js', 'react.', 'SQL', 'Postgres', 'PostgreSQL', 'k8s', 'Kubernetes', 'React or Vue', 'Vue or React',
      '5+ years of backend development', 'Tối thiểu 5 năm kinh nghiệm backend', 'IELTS 6.5', 'Tiếng Anh', '', '  '];
    const ev = [undefined, '', 'N/A', 'Used it daily in production', '3 years of backend development', '3 năm kinh nghiệm backend',
      'IELTS 6.0', 'Skills: Python, SQL', 'Python, SQL, Excel, Tableau', 'Location implies Hanoi', 'ngụ ý'];
    for (let i = 0; i < 2000; i++) {
      const rows = Array.from({ length: Math.floor(rnd() * 12) }, () => ({
        requirement: pick(reqs),
        category: pick(['skills', 'experience', 'tools', 'education', 'keywords', 'other']),
        priority: pick(['required', 'preferred', 'nice-to-have', undefined, 'must']),
        status: pick(['matched', 'partial', 'missing', 'unknown', 'unsure']),
        cvEvidence: pick(ev),
      })) as RequirementFinding[];
      same(rows);
    }
  });
});
