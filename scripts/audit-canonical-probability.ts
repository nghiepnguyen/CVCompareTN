/**
 * Stage 3.13B — canonical probability contract simulator (READ-ONLY).
 *
 * Compares candidate mappings for the canonical `passProbability` against a
 * corpus of AnalysisResult JSON files (e.g. the raw output of
 * scripts/benchmark-gemini-analyze.ts). It imports no production code, makes no
 * network calls and writes nothing: the mapping functions below are the
 * *reference specification* for Stage 3.13C, not a runtime implementation.
 *
 * Usage:
 *   node node_modules/.bin/tsx scripts/audit-canonical-probability.ts <rawDir> [<rawDir> ...]
 *
 * Contract under test (selected): CONTRACT A — score only.
 *   matchScore >= 80 → High
 *   matchScore >= 60 → Medium
 *   otherwise        → Low
 *
 * AUDIT / CONTRACT TEST ONLY — freezes the Stage 3.13B specification.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Level = 'High' | 'Medium' | 'Low';
export type RequiredGaps = { requiredTotal: number; requiredMissing: number; requiredPartial: number };

// Contract thresholds. Evidence: the product already renders matchScore with a
// High verdict at >= 80 and Medium at >= 60 (AnalysisDetailsTab verdict copy);
// the contract reuses those existing product boundaries instead of inventing
// new ones. `prob` is the downstream representation, never an input to score.
export const HIGH_MIN = 80;
export const MEDIUM_MIN = 60;
export const CONTRACT_VERSION = 'canonical-score-v1';

const clamp = (score: number) => Math.min(100, Math.max(0, score));

export function levelForScore(score: number): Level {
  if (!Number.isFinite(score)) return 'Low'; // mirrors the 0-coercion at analyze time
  const s = clamp(score);
  if (s >= HIGH_MIN) return 'High';
  if (s >= MEDIUM_MIN) return 'Medium';
  return 'Low';
}

// CONTRACT A — representation only: the canonical score already carries the
// required-gap judgment (see docs), so probability reads nothing else.
export function contractA(score: number): Level {
  return levelForScore(score);
}

// CONTRACT B — score bands + "any missing required caps High at Medium".
// Evaluated as a candidate; not selected (see docs §6/§7).
export function contractB(score: number, gaps: RequiredGaps): Level {
  const base = levelForScore(score);
  return base === 'High' && gaps.requiredMissing > 0 ? 'Medium' : base;
}

// CONTRACT C — weighted recomputation, shown only to demonstrate duplicate
// scoring. Weights are illustrative, deliberately not tuned.
export function contractC(score: number, gaps: RequiredGaps): Level {
  return levelForScore(score - 10 * gaps.requiredMissing - 4 * gaps.requiredPartial);
}

export type CorpusRow = {
  id: string;
  score: number;
  success: string;
  pass: string;
  gaps: RequiredGaps;
  itemsWithoutPriority: number;
  missingRequiredTexts: string[];
  hasDetailedComparison: boolean;
};

type RawItem = { requirement?: unknown; status?: unknown; priority?: unknown };

export function rowFromResult(id: string, r: Record<string, unknown>): CorpusRow {
  const dc = (r.detailedComparison ?? {}) as Record<string, RawItem[]>;
  const items = Object.values(dc).flat();
  const required = items.filter((i) => i.priority === 'required');
  return {
    id,
    score: typeof r.matchScore === 'number' ? r.matchScore : Number(r.matchScore) || 0,
    success: typeof r.successProbability === 'string' ? r.successProbability : '(missing)',
    pass: typeof r.passProbability === 'string' ? r.passProbability : '(missing)',
    gaps: {
      requiredTotal: required.length,
      requiredMissing: required.filter((i) => i.status === 'missing').length,
      requiredPartial: required.filter((i) => i.status === 'partial').length,
    },
    itemsWithoutPriority: items.length - items.filter((i) => i.priority === 'required' || i.priority === 'nice-to-have').length,
    missingRequiredTexts: required.filter((i) => i.status === 'missing').map((i) => String(i.requirement ?? '')),
    hasDetailedComparison: items.length > 0,
  };
}

const ORDER: Record<Level, number> = { Low: 0, Medium: 1, High: 2 };
const orderLevel = (l: Level) => ORDER[l];

function distribution(levels: Level[]): Record<Level, number> {
  return { High: levels.filter((l) => l === 'High').length, Medium: levels.filter((l) => l === 'Medium').length, Low: levels.filter((l) => l === 'Low').length };
}

function transitions(current: string[], proposed: Level[]): Map<string, number> {
  const m = new Map<string, number>();
  current.forEach((c, i) => {
    const key = `${c} → ${proposed[i]}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  });
  return m;
}

function printDistribution(name: string, levels: Level[]) {
  const d = distribution(levels);
  console.log(`${name.padEnd(28)} High ${d.High} | Medium ${d.Medium} | Low ${d.Low}`);
}

function invariantGrid() {
  const scores = Array.from({ length: 101 }, (_, i) => i);
  const gapConfigs: RequiredGaps[] = [
    { requiredTotal: 6, requiredMissing: 0, requiredPartial: 0 },
    { requiredTotal: 6, requiredMissing: 0, requiredPartial: 3 },
    { requiredTotal: 6, requiredMissing: 1, requiredPartial: 0 },
    { requiredTotal: 6, requiredMissing: 2, requiredPartial: 2 },
    { requiredTotal: 6, requiredMissing: 6, requiredPartial: 0 },
  ];
  const verdicts: string[] = [];
  for (const [name, fn] of [
    ['A', (s: number, g: RequiredGaps) => contractA(s)],
    ['B', (s: number, g: RequiredGaps) => contractB(s, g)],
    ['C', (s: number, g: RequiredGaps) => contractC(s, g)],
  ] as const) {
    let scoreMonotone = true;
    let gapMonotone = true;
    for (const g of gapConfigs) {
      for (let i = 1; i < scores.length; i++) {
        if (orderLevel(fn(scores[i], g)) < orderLevel(fn(scores[i - 1], g))) scoreMonotone = false;
      }
    }
    for (const s of scores) {
      let prev: number | null = null;
      // more severe required gap = more missing, then more partial
      const ordered = [...gapConfigs].sort(
        (x, y) => x.requiredMissing - y.requiredMissing || x.requiredPartial - y.requiredPartial
      );
      for (const g of ordered) {
        const v = orderLevel(fn(s, g));
        // Invariant C: a more severe gap must not yield a HIGHER level.
        if (prev !== null && v > prev) gapMonotone = false;
        prev = v;
      }
    }
    verdicts.push(`${name}: score-monotone=${scoreMonotone} gap-monotone=${gapMonotone}`);
  }
  console.log(verdicts.join(' | '));
}

function main() {
  const dirs = process.argv.slice(2);
  if (!dirs.length) throw new Error('usage: audit-canonical-probability.ts <rawDir> [<rawDir> ...]');
  const rows = dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => {
        const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
        return rowFromResult(`${basename(dirname(dir))}/${basename(dir)}/${f}`, r);
      })
  );

  console.log('corpus');
  for (const r of rows) {
    const g = r.gaps;
    console.log(
      `${r.id} | score ${r.score} | required ${g.requiredTotal - g.requiredMissing - g.requiredPartial}/${g.requiredMissing}missing/${g.requiredPartial}partial`
      + ` | stored success ${r.success} | stored pass ${r.pass} | A ${contractA(r.score)} | B ${contractB(r.score, g)} | C ${contractC(r.score, g)}`
    );
  }
  console.log(`\nrows with detailedComparison: ${rows.filter((r) => r.hasDetailedComparison).length}/${rows.length}`);
  console.log(`items without priority: ${rows.reduce((n, r) => n + r.itemsWithoutPriority, 0)}`);

  console.log('\ndistribution (n=' + rows.length + ')');
  printDistribution('stored success', rows.map((r) => r.success as Level));
  printDistribution('stored pass', rows.map((r) => r.pass as Level));
  printDistribution('CONTRACT A', rows.map((r) => contractA(r.score)));
  printDistribution('candidate B', rows.map((r) => contractB(r.score, r.gaps)));
  printDistribution('candidate C', rows.map((r) => contractC(r.score, r.gaps)));
  const known = new Set(['High', 'Medium', 'Low']);
  console.log(`stored values outside High/Medium/Low: success ${rows.filter((r) => !known.has(r.success)).length}, pass ${rows.filter((r) => !known.has(r.pass)).length}`);

  console.log('\ntransitions — stored pass → CONTRACT A');
  for (const [k, v] of transitions(rows.map((r) => r.pass), rows.map((r) => contractA(r.score)))) console.log(`  ${k}: ${v}`);
  console.log('transitions — stored success → CONTRACT A');
  for (const [k, v] of transitions(rows.map((r) => r.success), rows.map((r) => contractA(r.score)))) console.log(`  ${k}: ${v}`);
  console.log('transitions — stored pass → candidate B');
  for (const [k, v] of transitions(rows.map((r) => r.pass), rows.map((r) => contractB(r.score, r.gaps)))) console.log(`  ${k}: ${v}`);

  console.log('\nB demotions vs A (high score + missing required)');
  for (const r of rows) {
    const a = contractA(r.score), b = contractB(r.score, r.gaps);
    if (a !== b) console.log(`  ${r.id} score ${r.score}: A=${a} B=${b} — missing required: ${r.missingRequiredTexts.join(' | ') || '(none)'}`);
  }

  console.log('\nboundary grid');
  for (const score of [59, 60, 61, 79, 80, 81, 95]) {
    for (const g of [
      { requiredTotal: 5, requiredMissing: 0, requiredPartial: 0 },
      { requiredTotal: 5, requiredMissing: 1, requiredPartial: 0 },
      { requiredTotal: 5, requiredMissing: 3, requiredPartial: 1 },
    ]) {
      console.log(
        `  score ${score} gaps ${g.requiredMissing}m/${g.requiredPartial}p → A ${contractA(score)} | B ${contractB(score, g)} | C ${contractC(score, g)}`
      );
    }
  }

  console.log('\ninvariants (scores 0..100 × gap configurations)');
  invariantGrid();
  // Determinism and the one-input signature are structural for A; assert the
  // corpus values are reproduced identically on a second pass.
  const nondeterministic = rows.filter((r) => contractA(r.score) !== contractA(r.score)).length;
  console.log(`A determinism violations: ${nondeterministic}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
