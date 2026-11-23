import { describe, it, expect } from 'vitest';
import {
  scoreFitV1, buildFitShadow, inspectRawTable, fitPct, fitRequirementKey, isListOnlyEvidence,
  fitScoreShadowEnabled, fitScoreAuthorityEnabled, FIT_SCORE_VERSION, MAX_FIT_ROWS, type FitRow,
} from '../../services/ai/fitScore';
import type { DetailedComparison } from '../../services/ai/types';

// All rows synthetic. Expected values = A3.2 contract §6 table (exact score, band, counters).
type Opt = { category?: string; priority?: string | undefined; ev?: string };
const r = (requirement: string, status: string, o: Opt = {}): FitRow => ({
  requirement,
  category: o.category ?? 'skills',
  priority: 'priority' in o ? o.priority : 'required',
  status,
  cvEvidence: o.ev ?? (status === 'matched' ? `Used ${requirement} daily in production` : undefined),
});
const many = (n: number, status: string, priority = 'required') =>
  Array.from({ length: n }, (_, i) => r(`${priority}-${status}-${i}`, status, { priority }));
const s = (rows: unknown) => scoreFitV1(rows);
const counts = (rows: unknown) => { const c = s(rows).counts; return [c.matched, c.partial, c.missing, c.unknown]; };

describe('fit-score-v1 contract table (A3.2 §6)', () => {
  it('all matched (4 req + 2 pref) → 100 High', () => {
    const rows = [...many(4, 'matched'), ...many(2, 'matched', 'preferred')];
    expect([s(rows).score, s(rows).band]).toEqual([100, 'High']);
    expect(counts(rows)).toEqual([6, 0, 0, 0]);
    expect([s(rows).required, s(rows).preferred]).toEqual([4, 2]);
  });
  it('all missing → 0 Low', () => {
    expect([s(many(5, 'missing')).score, s(many(5, 'missing')).band]).toEqual([0, 'Low']);
  });
  it('all partial → 50 Low', () => {
    expect([s(many(5, 'partial')).score, s(many(5, 'partial')).band]).toEqual([50, 'Low']);
  });
  it('2 required missing + 2 preferred matched → 25', () => {
    expect(s([...many(2, 'missing'), ...many(2, 'matched', 'preferred')]).score).toBe(25);
  });
  it('1 of 4 required missing → 75 Medium', () => {
    const x = s([...many(3, 'matched'), ...many(1, 'missing')]);
    expect([x.score, x.band]).toEqual([75, 'Medium']);
  });
  it('unknown rows: 0 credit, kept in the denominator → 50', () => {
    const rows = [...many(2, 'matched'), ...many(2, 'unknown')];
    expect(s(rows).score).toBe(50);
    expect(counts(rows)).toEqual([2, 0, 0, 2]);
  });
  it('invalid status "unsure" → unknown, statusDefaulted → 75', () => {
    const x = s([...many(3, 'matched'), r('X', 'unsure')]);
    expect([x.score, x.diag.statusDefaulted, x.counts.unknown]).toEqual([75, 1, 1]);
  });
  it('duplicate ×3 ("React", tools "React", "react.") + SQL missing → 50, not 75', () => {
    const x = s([r('React', 'matched'), r('React', 'matched', { category: 'tools' }), r('react.', 'matched'), r('SQL', 'missing')]);
    expect([x.score, x.diag.duplicatesMerged]).toEqual([50, 2]);
  });
  it('conflicting duplicate: lower status wins, counted', () => {
    const x = s([r('React', 'matched'), r('React', 'missing'), r('SQL', 'matched')]);
    expect([x.score, x.diag.conflictingDuplicates]).toEqual([50, 1]);
    expect(counts([r('React', 'matched'), r('React', 'missing'), r('SQL', 'matched')])).toEqual([1, 0, 1, 0]);
  });
  it('alias "React.js" + "React" merge → 50', () => {
    const x = s([r('React.js', 'matched'), r('React', 'matched'), r('SQL', 'missing')]);
    expect([x.score, x.diag.aliasMerged, x.diag.duplicatesMerged]).toEqual([50, 1, 1]);
  });
  it('ATS keywords excluded: Figma tools matched + keyword Figma missing → 100', () => {
    const x = s([r('Figma', 'matched', { category: 'tools' }), r('Figma', 'missing', { category: 'keywords' }), r('Sketch', 'matched')]);
    expect([x.score, x.diag.keywordsExcluded]).toEqual([100, 1]);
  });
  it('experience shortfall, model partial → 88 High (no numeric penalty)', () => {
    const x = s([r('5+ years of backend development', 'partial', { category: 'experience' }), ...many(3, 'matched')]);
    expect([x.score, x.band]).toEqual([88, 'High']);
  });
  it('experience "matched" but evidence says 3 years → downgraded → 83', () => {
    const x = s([r('5+ years of backend development', 'matched', { category: 'experience', ev: '3 years of backend development' }), ...many(2, 'matched')]);
    expect([x.score, x.band, x.diag.unverifiedMatchDowngraded]).toEqual([83, 'High', 1]);
  });
  it('mixed VI/EN rows → 55 Low, diacritics preserved', () => {
    const rows = [
      r('Thành thạo SQL', 'matched'), r('Kinh nghiệm Power BI', 'partial'),
      r('Tiếng Anh', 'matched', { priority: 'nice-to-have' }), r('Python', 'missing'),
    ];
    expect([s(rows).score, s(rows).band]).toEqual([55, 'Low']);
    expect(counts(rows)).toEqual([2, 1, 1, 0]);
    expect(fitRequirementKey('Thành thạo SQL')).toBe('thành thạo sql');
  });
  it('empty table → null, no_scorable_rows (never 0)', () => {
    expect(s([])).toMatchObject({ score: null, band: null, reason: 'no_scorable_rows' });
  });
  it('malformed table → null, malformed_rows', () => {
    for (const bad of [null, undefined, 'x', 42, {}]) expect(s(bad)).toMatchObject({ score: null, reason: 'malformed_rows' });
  });
  it('matched with empty evidence → partial → 75', () => {
    const x = s([r('Kubernetes', 'matched', { ev: '' }), ...many(1, 'matched')]);
    expect([x.score, x.diag.unverifiedMatchDowngraded]).toEqual([75, 1]);
  });
  it('missing priority defaults to required → 25', () => {
    const x = s([r('Go', 'missing', { priority: undefined }), ...many(1, 'matched', 'preferred')]);
    expect([x.score, x.diag.priorityDefaulted]).toEqual([25, 1]);
  });
});

describe('fit-score-v1 rules', () => {
  it('rounds half-up exactly once, in integers', () => {
    expect([fitPct(119, 200), fitPct(159, 200), fitPct(1, 3), fitPct(2, 3), fitPct(1, 8)]).toEqual([60, 80, 33, 67, 13]);
    // row-level: 7 req partial + 1 pref matched → num 23, den 44 → 52.27 → 52
    expect(s([...many(7, 'partial'), ...many(1, 'matched', 'preferred')]).score).toBe(52);
  });
  it('score is an integer in [0,100] for random tables', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const st = ['matched', 'partial', 'missing', 'unknown'];
    for (let i = 0; i < 300; i++) {
      const rows = Array.from({ length: 1 + Math.floor(rnd() * 20) }, (_, k) =>
        r(`req ${k}`, st[Math.floor(rnd() * 4)], { priority: rnd() < 0.5 ? 'required' : 'nice-to-have' }));
      const x = s(rows).score!;
      expect(Number.isInteger(x) && x >= 0 && x <= 100).toBe(true);
    }
  });
  it('order-independent', () => {
    const rows = [r('React', 'matched'), r('React', 'partial', { category: 'tools' }), r('SQL', 'missing'), r('Go', 'partial', { priority: 'nice-to-have' })];
    expect(s([...rows].reverse())).toEqual(s(rows));
  });
  it('literal-keyword-only JD → null, no_scorable_rows', () => {
    expect(s([r('Agile', 'matched', { category: 'keywords' })])).toMatchObject({ score: null, reason: 'no_scorable_rows' });
  });
  it('unknown category → keywords (excluded), counted', () => {
    const x = s([r('X', 'matched', { category: 'hobbies' }), r('Y', 'matched')]);
    expect([x.score, x.diag.categoryDefaulted, x.diag.keywordsExcluded]).toEqual([100, 1, 1]);
  });
  it('rejects non-object rows and empty requirements', () => {
    const x = s([null, 'React', { requirement: 7 }, r('   ', 'matched'), r('SQL', 'matched')]);
    expect([x.score, x.diag.rowsIn, x.diag.rowsRejected]).toEqual([100, 5, 4]);
  });
  it('skills-list-only evidence keeps full credit in v1 and is counted', () => {
    const x = s([r('Python', 'matched', { ev: 'Skills: Python, SQL' }), r('SQL', 'matched', { ev: 'Python, SQL, Excel, Tableau' })]);
    expect([x.score, x.diag.listOnlyEvidence]).toEqual([100, 2]);
    expect(isListOnlyEvidence('Kỹ năng: Python, SQL')).toBe(true);
    expect(isListOnlyEvidence('Built ETL pipelines in Python for 3 years')).toBe(false);
  });
  it('VI evidence: shortfall and inference markers downgrade like EN', () => {
    const vi = s([r('Tối thiểu 5 năm kinh nghiệm backend', 'matched', { ev: '3 năm kinh nghiệm backend' }), ...many(1, 'matched')]);
    const inf = s([r('Sống tại Hà Nội', 'matched', { ev: 'Địa chỉ ngụ ý ở Hà Nội' }), ...many(1, 'matched')]);
    for (const x of [vi, inf]) expect([x.score, x.diag.unverifiedMatchDowngraded]).toEqual([75, 1]);
  });
  it('OR groups are order-free', () => {
    expect(fitRequirementKey('React or Vue')).toBe(fitRequirementKey('Vue or React.js'));
  });
  it(`${MAX_FIT_ROWS} rows are scored; ${MAX_FIT_ROWS + 1} rows → too_many_rows (never truncated)`, () => {
    expect(s(many(MAX_FIT_ROWS, 'matched')).score).toBe(100);
    expect(s(many(MAX_FIT_ROWS + 1, 'matched'))).toMatchObject({ score: null, reason: 'too_many_rows', diag: { rowsIn: 101 } });
  });
  it('ignores model-authored numbers on rows', () => {
    expect(s([{ ...r('SQL', 'missing'), score: 100, matchScore: 100 }]).score).toBe(0);
  });
});

const dc = (over: Partial<DetailedComparison> = {}): DetailedComparison => ({ skills: [], experience: [], tools: [], education: [], keywords: [], ...over });

describe('raw table inspection', () => {
  it('counts statuses outside the schema enum', () => {
    expect(inspectRawTable({ skills: [{ status: 'matched' }, { status: 'unknown' }, { status: 'unsure' }, {}] })).toEqual({ malformed: false, schemaViolations: 3 });
  });
  it('accepts a JSON-string table like the production normalizer', () => {
    expect(inspectRawTable(JSON.stringify({ tools: [{ status: 'partial' }] }))).toEqual({ malformed: false, schemaViolations: 0 });
  });
  it('flags missing / non-object / non-array buckets as malformed', () => {
    for (const bad of [undefined, null, 'garbage', [], { skills: 'x' }]) expect(inspectRawTable(bad).malformed).toBe(true);
  });
});

describe('buildFitShadow', () => {
  const table = dc({ skills: [{ requirement: 'SQL', status: 'matched', cvEvidence: 'Wrote SQL reports weekly', priority: 'required' }], tools: [{ requirement: 'Tableau', status: 'missing', priority: 'required' }] });
  it('compares canonical and shadow without touching the input', () => {
    const before = structuredClone(table);
    const x = buildFitShadow({ detailedComparison: table, rawDetailedComparison: table, canonicalScore: 72, inputMode: 'text' });
    expect(x).toEqual({
      v: FIT_SCORE_VERSION, eligible: true, canonical: 72, shadow: 50, absDiff: 22, bandCanonical: 'Medium', bandShadow: 'Low',
      counts: { matched: 1, partial: 0, missing: 1, unknown: 0 }, required: 2, preferred: 0,
      diag: { rowsIn: 2, rowsRejected: 0, keywordsExcluded: 0, duplicatesMerged: 0, conflictingDuplicates: 0, aliasMerged: 0, unverifiedMatchDowngraded: 0, listOnlyEvidence: 0, statusDefaulted: 0, priorityDefaulted: 0, categoryDefaulted: 0, schemaViolations: 0 },
      inputMode: 'text',
    });
    expect(table).toEqual(before);
  });
  it('malformed raw table → ineligible with reason, even though normalized buckets are empty', () => {
    const x = buildFitShadow({ detailedComparison: dc(), rawDetailedComparison: 'garbage', canonicalScore: 40, inputMode: 'image' });
    expect(x).toMatchObject({ eligible: false, reason: 'malformed_rows', shadow: null, absDiff: null, bandShadow: null, bandCanonical: 'Low' });
  });
  it('empty raw table → no_scorable_rows', () => {
    expect(buildFitShadow({ detailedComparison: dc(), rawDetailedComparison: {}, canonicalScore: 40, inputMode: 'pdf_text' })).toMatchObject({ eligible: false, reason: 'no_scorable_rows' });
  });
});

describe('flags', () => {
  it('shadow is off by default and only on for "true"/"on"', () => {
    expect(fitScoreShadowEnabled({})).toBe(false);
    for (const v of ['false', 'off', '0', '1', 'TRUE', '']) expect(fitScoreShadowEnabled({ FIT_SCORE_SHADOW: v })).toBe(false);
    for (const v of ['true', 'on']) expect(fitScoreShadowEnabled({ FIT_SCORE_SHADOW: v })).toBe(true);
  });
  it('authority is non-operational whatever the env says', () => {
    expect(fitScoreAuthorityEnabled()).toBe(false);
  });
});
