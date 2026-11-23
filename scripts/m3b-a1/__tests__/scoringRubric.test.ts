import { describe, it, expect } from 'vitest';
import {
  scoreFindings, normalizeFindings, scoreNormalized, pct, requirementKey, inferAlternatives, isListOnlyEvidence,
  findingsFromDetailedComparison, displayedScore, RUBRIC_VERSION, SCORED_CATEGORIES, type RequirementFinding,
} from '../scoringRubric';
import {
  FRONTEND_BASE, FRONTEND_REORDERED_REBUCKETED, FRONTEND_WITH_DUPLICATES, FRONTEND_SEMANTIC_FLIP,
  FRONTEND_MERGED_ROW, OR_GROUP_ONE_ROW, OR_GROUP_PERMUTED, INJECTION, VI_PRESENTATION, DOCUMENTED_MODEL_SCORES,
} from '../fixtures';

const req = (n: number, status: string, priority = 'required'): RequirementFinding[] =>
  Array.from({ length: n }, (_, i) => ({ requirement: `${priority}-${status}-${i}`, category: 'skills', priority, status, cvEvidence: status === 'matched' ? 'stated in CV' : undefined }));
const row = (requirement: string, status: string, extra: Partial<RequirementFinding> = {}): RequirementFinding =>
  ({ requirement, category: 'tools', priority: 'required', status, cvEvidence: status === 'matched' ? `Used ${requirement} daily in production` : undefined, ...extra });

// Seeded PRNG so property tests are reproducible.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function shuffle<T>(a: T[], r: () => number): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
}

describe('layer 2: numeric scoring is deterministic for identical normalized input', () => {
  it('identical findings ×200 → one distinct result', () => {
    const outs = new Set(Array.from({ length: 200 }, () => JSON.stringify(scoreFindings(structuredClone(FRONTEND_BASE)))));
    expect(outs.size).toBe(1);
  });

  it('scoreNormalized is a pure function of the normalized set', () => {
    const { items, diagnostics } = normalizeFindings(FRONTEND_BASE);
    expect(scoreNormalized([...items].reverse(), diagnostics).score).toBe(scoreNormalized(items, diagnostics).score);
  });

  it('baseline fixture score is 90 (High); documented model scores spread 75–88', () => {
    const r = scoreFindings(FRONTEND_BASE);
    expect([r.score, r.fitBand]).toEqual([90, 'High']);
    expect(Math.max(...DOCUMENTED_MODEL_SCORES) - Math.min(...DOCUMENTED_MODEL_SCORES)).toBe(13);
  });

  it('row order and bucket reassignment (among scored buckets) do not change the score', () => {
    expect(scoreFindings(FRONTEND_REORDERED_REBUCKETED).score).toBe(scoreFindings(FRONTEND_BASE).score);
  });

  it('100 random permutations → same score and findingsHash', () => {
    const r = rng(7);
    const base = scoreFindings(FRONTEND_BASE);
    for (let i = 0; i < 100; i++) expect(scoreFindings(shuffle(FRONTEND_BASE, r)).findingsHash).toBe(base.findingsHash);
  });
});

describe('OD-10 (accepted): literal ATS keywords never enter the fit score', () => {
  it('keywords rows are excluded and counted, whatever their status', () => {
    const r = scoreFindings(FRONTEND_WITH_DUPLICATES);
    expect(r.score).toBe(scoreFindings(FRONTEND_BASE).score);
    expect(r.diagnostics.keywordsExcluded).toBe(3);
  });

  it('a conflicting literal-keyword row ("Figma" missing as ATS string) no longer moves the score', () => {
    const conflict = [...FRONTEND_BASE, { requirement: 'Figma', category: 'keywords', priority: 'required', status: 'missing' }];
    expect(scoreFindings(conflict).score).toBe(90);
  });

  it('a keywords-only JD scores null (no silent 0, no keyword-driven fit)', () => {
    expect(scoreFindings([{ requirement: 'B2B SaaS', category: 'keywords', priority: 'required', status: 'matched', cvEvidence: 'B2B SaaS' }]).score).toBeNull();
  });
});

describe('adversarial semantic cases', () => {
  it('exact duplicates (same scored bucket or across scored buckets) merge; 50× stuffing cannot inflate', () => {
    const base = [...req(2, 'matched'), ...req(2, 'missing')];
    const stuffed = [...base, ...Array.from({ length: 50 }, (_, i) => ({ ...base[0], category: SCORED_CATEGORIES[i % 4] }))];
    const r = scoreFindings(stuffed);
    expect(r.score).toBe(scoreFindings(base).score);
    expect(r.diagnostics.duplicatesMerged).toBe(50);
  });

  it('near-duplicates and tool aliases resolve to one requirement: React / React.js / ReactJS', () => {
    expect(new Set(['React', 'React.js', 'ReactJS', ' react ', 'REACT.JS'].map((r) => requirementKey({ requirement: r }))).size).toBe(1);
    const near = [...FRONTEND_BASE, { requirement: 'React.js', category: 'skills', priority: 'required', status: 'matched', cvEvidence: 'React SPA in production' }];
    const r = scoreFindings(near);
    expect(r.score).toBe(90);
    expect(r.diagnostics.aliasMerged).toBe(1);
  });

  it.each([['Postgres', 'PostgreSQL'], ['K8s', 'Kubernetes'], ['Amazon Web Services', 'AWS'], ['Golang', 'Go'], ['NodeJS', 'Node.js']])('alias %s ≡ %s', (a, b) => {
    expect(requirementKey({ requirement: a })).toBe(requirementKey({ requirement: b }));
  });

  it('related-but-different tools are NOT aliased (PostgreSQL ≠ BigQuery, Tableau ≠ Looker, Java ≠ JavaScript)', () => {
    for (const [a, b] of [['PostgreSQL', 'BigQuery'], ['Tableau', 'Looker'], ['Java', 'JavaScript'], ['React', 'React Native']]) {
      expect(requirementKey({ requirement: a })).not.toBe(requirementKey({ requirement: b }));
    }
  });

  it('a conflicting duplicate in a scored bucket merges conservatively (lower credit wins, flagged)', () => {
    const r = scoreFindings([row('Docker', 'matched'), { ...row('docker', 'missing'), category: 'skills' }]);
    expect(r.score).toBe(0);
    expect(r.diagnostics.conflictingDuplicates).toBe(1);
  });

  it('one specific statement may legitimately support several independent requirements', () => {
    const ev = 'Built ETL pipelines in Python loading data into PostgreSQL';
    const r = scoreFindings([
      { requirement: 'Python', category: 'skills', priority: 'required', status: 'matched', cvEvidence: ev },
      { requirement: 'PostgreSQL', category: 'tools', priority: 'required', status: 'matched', cvEvidence: ev },
    ], { listOnlyEvidence: 'partial' });
    expect(r.score).toBe(100);
  });

  it('list-only evidence: full credit by default; OD-12 "partial" halves it (keyword-stuffed skills line)', () => {
    const stuffed = ['Python', 'Kafka', 'Spark', 'Airflow'].map((t) => ({ requirement: t, category: 'tools', priority: 'required', status: 'matched', cvEvidence: 'Skills: Python, SQL, Spark, Kafka, Airflow' }));
    expect(scoreFindings(stuffed).score).toBe(100);
    const r = scoreFindings(stuffed, { listOnlyEvidence: 'partial' });
    expect(r.score).toBe(50);
    expect(r.diagnostics.listOnlyDowngraded).toBe(4);
  });

  it.each([
    ['Skills: Python, SQL', true], ['Python, SQL, Spark', true], ['Kỹ năng: Excel, Power BI', true],
    ['Built ETL pipelines in Python', false], ['Led a team of 5 engineers, owned roadmap', false], ['', false],
  ])('isListOnlyEvidence(%j) = %s', (ev, expected) => {
    expect(isListOnlyEvidence(ev)).toBe(expected);
  });

  it('generic / inferred evidence ("implies", placeholders) earns only partial credit', () => {
    const r = scoreFindings([
      row('Kafka', 'matched', { cvEvidence: 'N/A' }),
      row('Leadership', 'matched', { cvEvidence: 'Senior title implies leadership' }),
    ]);
    expect(r.score).toBe(50);
    expect(r.diagnostics.unverifiedMatchDowngraded).toBe(2);
  });

  it('unsupported seniority claim: "matched" 5+ years with evidence of 3 years → partial', () => {
    const r = scoreFindings([{ requirement: '5+ years of frontend experience', category: 'experience', priority: 'required', status: 'matched', cvEvidence: '3 years of frontend experience' }]);
    expect(r.score).toBe(50);
    expect(r.diagnostics.unverifiedMatchDowngraded).toBe(1);
  });

  it('OR text inferred from " or " (today\'s schema has no alternatives field); "/" never splits', () => {
    expect(inferAlternatives('BigQuery, Snowflake or Redshift')).toEqual(['BigQuery', 'Snowflake', 'Redshift']);
    expect(inferAlternatives('CI/CD')).toBeUndefined();
    expect(inferAlternatives('3 years in fintech or 5 years in banking')).toBeUndefined();
    expect(requirementKey({ requirement: 'Snowflake or BigQuery or Redshift' })).toBe(requirementKey({ requirement: 'BigQuery, Snowflake or Redshift' }));
    expect(scoreFindings(OR_GROUP_PERMUTED).score).toBe(scoreFindings(OR_GROUP_ONE_ROW).score);
  });

  it('AND requirements stay separate: evidence for Python does not satisfy SQL', () => {
    const r = scoreFindings([row('Python', 'matched'), row('SQL', 'missing')]);
    expect(r.score).toBe(50);
  });

  it('ambiguous evidence: partial = ½, unknown = 0 and counted separately from missing', () => {
    const r = scoreFindings([row('A', 'partial'), row('B', 'missing'), row('C', 'unknown')]);
    expect(r.score).toBe(17);
    expect(r.counts).toEqual({ matched: 0, partial: 1, missing: 1, unknown: 1 });
  });

  it('requirement grounding (OD-13): a row absent from the JD is flagged; excluded only with groundedOnly', () => {
    const jdText = 'Frontend Developer. Requirements: React, TypeScript, Figma. Nice to have: Next.js.';
    const findings = [row('React', 'matched'), row('TypeScript', 'matched'), row('Degree implied by role', 'missing')];
    const flagged = scoreFindings(findings, { jdText });
    expect(flagged.diagnostics.ungrounded).toBe(1);
    expect(flagged.score).toBe(67);
    expect(scoreFindings(findings, { jdText, groundedOnly: true }).score).toBe(100);
  });

  it('invented requirements supported by the same evidence cannot inflate a score when groundedOnly', () => {
    const jdText = 'Requirements: SQL, Tableau.';
    const ev = 'Wrote SQL reports in Tableau every week';
    const base = [row('SQL', 'matched', { cvEvidence: ev }), row('Tableau', 'missing')];
    const padded = [...base, row('Data storytelling', 'matched', { cvEvidence: ev }), row('Business acumen', 'matched', { cvEvidence: ev })];
    expect(scoreFindings(padded, { jdText }).score).toBeGreaterThan(scoreFindings(base, { jdText }).score!); // inflation without grounding
    expect(scoreFindings(padded, { jdText, groundedOnly: true }).score).toBe(scoreFindings(base, { jdText }).score);
  });

  it('model-authored numbers and prompt-injection text have no effect', () => {
    const withNumbers = FRONTEND_BASE.map((r) => ({ ...r, matchScore: 100, score: -5, weight: 999 })) as RequirementFinding[];
    expect(scoreFindings(withNumbers).score).toBe(90);
    const inj = scoreFindings(INJECTION);
    expect([inj.score, inj.diagnostics.keywordsExcluded]).toEqual([50, 1]);
  });
});

describe('priority, categories, eligibility', () => {
  it('required outweighs preferred (3:1)', () => {
    expect(scoreFindings([...req(1, 'missing'), ...req(1, 'matched', 'preferred')]).score).toBe(25);
    expect(scoreFindings([...req(1, 'matched'), ...req(1, 'missing', 'preferred')]).score).toBe(75);
  });

  it('invalid status → unknown (not missing); invalid priority → required; invalid category → keywords (excluded); flagged', () => {
    const r = scoreFindings([{ requirement: 'Go', category: 'skills', priority: 'must', status: 'maybe' }, { requirement: 'Rust', category: 'weird', status: 'matched' }]);
    expect(r.counts.unknown).toBe(1);
    expect(r.diagnostics).toMatchObject({ statusDefaulted: 1, priorityDefaulted: 1, categoryDefaulted: 1, keywordsExcluded: 1 });
  });

  it('empty scored categories are null, never 0; there is no keywords breakdown', () => {
    const r = scoreFindings(req(2, 'matched'));
    expect(r.breakdown.skills).toEqual({ score: 100, weight: 6, requirements: 2 });
    for (const c of SCORED_CATEGORIES.filter((c) => c !== 'skills')) expect(r.breakdown[c]).toBeNull();
    expect(Object.keys(r.breakdown)).toEqual([...SCORED_CATEGORIES]);
  });

  it('overall equals the weight-averaged breakdown (±1 rounding)', () => {
    const r = scoreFindings(FRONTEND_BASE);
    const cats = Object.values(r.breakdown).filter((b): b is NonNullable<typeof b> => b !== null);
    const weighted = cats.reduce((s, b) => s + b.score * b.weight, 0) / cats.reduce((s, b) => s + b.weight, 0);
    expect(Math.abs(weighted - r.score!)).toBeLessThanOrEqual(1);
  });

  it('hard requirements are reported, not silently capped', () => {
    const r = scoreFindings([{ requirement: 'Work authorization in Vietnam', category: 'experience', priority: 'required', status: 'missing', hard: true }, ...req(3, 'matched')]);
    expect([r.score, r.hardRequirementsNotEvidenced]).toEqual([75, ['Work authorization in Vietnam']]);
  });
});

describe('empty and malformed input', () => {
  it.each([[[]], [null], [undefined], ['not-an-array'], [{}]])('no valid requirements → score null (%#)', (input) => {
    const r = scoreFindings(input);
    expect([r.score, r.fitBand]).toEqual([null, null]);
  });

  it('rows without requirement text are rejected and counted', () => {
    const r = scoreFindings([null, 42, { status: 'matched' }, { requirement: '   ', status: 'matched' }, ...req(1, 'matched')]);
    expect([r.diagnostics.rowsRejected, r.score]).toEqual([4, 100]);
  });

  it('2,000 rows × 10k-char requirement text: bounded, order-invariant', () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({ requirement: `req ${i} ` + 'x'.repeat(10_000), category: SCORED_CATEGORIES[i % 4], priority: i % 3 ? 'required' : 'preferred', status: ['matched', 'partial', 'missing'][i % 3], cvEvidence: 'evidence of use' }));
    const a = scoreFindings(big);
    expect(a.score! >= 0 && a.score! <= 100).toBe(true);
    expect(scoreFindings([...big].reverse()).findingsHash).toBe(a.findingsHash);
  });
});

describe('rounding and band boundaries', () => {
  it('exact half rounds up, no float drift', () => {
    expect([pct(119, 200), pct(1189, 2000), pct(159, 200), pct(1, 3), pct(2, 3)]).toEqual([60, 59, 80, 33, 67]);
  });

  it('60 Medium, 59 Low, 80 High, 79 Medium', () => {
    expect(scoreFindings([...req(3, 'matched'), ...req(2, 'missing')]).fitBand).toBe('Medium');
    expect(scoreFindings([...req(4, 'matched'), ...req(1, 'missing')]).fitBand).toBe('High');
    const r59 = scoreFindings([...req(13, 'matched'), ...req(9, 'missing')]);
    expect([r59.score, r59.fitBand]).toEqual([59, 'Low']);
    const r79 = scoreFindings([...req(15, 'matched'), ...req(4, 'missing')]);
    expect([r79.score, r79.fitBand]).toEqual([79, 'Medium']);
  });

  it('score is always an integer in [0,100] (500 random fixtures)', () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const rows = Array.from({ length: 1 + Math.floor(r() * 20) }, (_, k) => ({
        requirement: `r${k}`, category: SCORED_CATEGORIES[k % 4], priority: r() < 0.7 ? 'required' : 'preferred',
        status: ['matched', 'partial', 'missing', 'unknown'][Math.floor(r() * 4)], cvEvidence: 'used it daily',
      }));
      const s = scoreFindings(rows).score!;
      expect(Number.isInteger(s) && s >= 0 && s <= 100).toBe(true);
    }
  });
});

describe('monotonicity and discrimination', () => {
  it('upgrading any single row (missing→partial→matched) never lowers the score (300 random cases)', () => {
    const r = rng(3);
    const order = ['missing', 'partial', 'matched'];
    for (let i = 0; i < 300; i++) {
      const rows = Array.from({ length: 2 + Math.floor(r() * 12) }, (_, k) => ({
        requirement: `r${k}`, category: SCORED_CATEGORIES[k % 4], priority: r() < 0.6 ? 'required' : 'preferred',
        status: order[Math.floor(r() * 3)], cvEvidence: 'used it daily',
      }));
      const k = Math.floor(r() * rows.length);
      const idx = order.indexOf(rows[k].status);
      if (idx === 2) continue;
      const up = rows.map((x, j) => (j === k ? { ...x, status: order[idx + 1] } : x));
      expect(scoreFindings(up).score!).toBeGreaterThanOrEqual(scoreFindings(rows).score!);
    }
  });

  it('keeps strong / moderate / weak CVs apart (discrimination, not just low variance)', () => {
    const strong = scoreFindings([...req(5, 'matched'), ...req(2, 'matched', 'preferred')]).score!;
    const moderate = scoreFindings([...req(3, 'matched'), ...req(2, 'partial'), ...req(2, 'missing', 'preferred')]).score!;
    const weak = scoreFindings([...req(1, 'matched'), ...req(4, 'missing'), ...req(2, 'missing', 'preferred')]).score!;
    expect(strong - moderate).toBeGreaterThanOrEqual(15);
    expect(moderate - weak).toBeGreaterThanOrEqual(15);
  });
});

describe('presentation, surface and version invariance', () => {
  it('EN/VI presentation strings do not affect the score', () => {
    expect(scoreFindings(VI_PRESENTATION).findingsHash).toBe(scoreFindings(FRONTEND_BASE).findingsHash);
  });

  it('Vietnamese requirement text keeps its diacritics in the key', () => {
    expect(requirementKey({ requirement: 'Tiếng Anh giao tiếp' })).toBe('tiếng anh giao tiếp');
    expect(requirementKey({ requirement: 'Tiếng Anh giao tiếp' })).not.toBe(requirementKey({ requirement: 'Tieng Anh giao tiep' }));
  });

  it('personal and recruiter JSONB shapes give identical results', () => {
    const dc = {
      skills: [{ requirement: 'TypeScript', status: 'matched' as const, priority: 'required' as const, cvEvidence: 'TypeScript in all repos', verification: 'met' as const }],
      tools: [{ requirement: 'Jest', status: 'missing' as const, priority: 'nice-to-have' as const }],
      experience: [], education: [], keywords: [],
    };
    const personal = scoreFindings(findingsFromDetailedComparison(structuredClone(dc)));
    const recruiter = scoreFindings(findingsFromDetailedComparison(JSON.parse(JSON.stringify({ detailedComparison: dc })).detailedComparison));
    expect(recruiter).toEqual(personal);
  });

  it('legacy / canonical-en-v1 rows are displayed as stored and never mutated', () => {
    expect(displayedScore(Object.freeze({ matchScore: 88, scoreVersion: 'canonical-en-v1' }))).toEqual({ score: 88, source: 'stored' });
    expect(displayedScore(Object.freeze({ matchScore: 72 }))).toEqual({ score: 72, source: 'stored' });
    expect(displayedScore({ matchScore: 90, scoreVersion: RUBRIC_VERSION }).source).toBe('rubric');
  });
});

describe('remaining semantic variance (NOT removed by the rubric; A2 must measure it)', () => {
  it('matched→partial flip on one required row: 90 → 83', () => {
    expect(scoreFindings(FRONTEND_SEMANTIC_FLIP).score).toBe(83);
  });

  it('requirement merging ("React and TypeScript" as one row): 90 → 89', () => {
    expect(scoreFindings(FRONTEND_MERGED_ROW).score).toBe(89);
  });

  it('required↔preferred flip on a missing row: 90 → 83', () => {
    expect(scoreFindings(FRONTEND_BASE.map((r) => (r.requirement === 'Next.js' ? { ...r, priority: 'required' } : r))).score).toBe(83);
  });

  it('a row moved into "keywords" by the model disappears from the score: 90 → 89', () => {
    expect(scoreFindings(FRONTEND_BASE.map((r) => (r.requirement === 'Figma' ? { ...r, category: 'keywords' } : r))).score).toBe(89);
  });
});
