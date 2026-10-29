/**
 * Stage 3.13A — read-only probability authority audit.
 *
 * Reads AnalysisResult JSON files produced by scripts/benchmark-gemini-analyze.ts
 * (`<outDir>/raw/*.json`) and prints the current matchScore / successProbability /
 * passProbability combinations. It makes no network calls, writes nothing and
 * imports no production code: the point is to measure what the pipeline already
 * stored, not to change it.
 *
 * Usage:
 *   node node_modules/.bin/tsx scripts/audit-probability-authority.ts <rawDir> [<rawDir> ...]
 *
 * Exit code is always 0 — this is an observation tool, not a gate.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const LEVELS = ['High', 'Medium', 'Low', 'Cao', 'Trung bình', 'Thấp'];

type Row = {
  file: string;
  matchScore: number | string;
  success: string;
  pass: string;
  same: boolean;
  passExplanationChars: number;
};

function readRows(dir: string): Row[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
      const success = typeof r.successProbability === 'string' ? r.successProbability : '(missing)';
      const pass = typeof r.passProbability === 'string' ? r.passProbability : '(missing)';
      return {
        file: `${basename(dirname(dir))}/${basename(dir)}/${basename(f)}`,
        matchScore: typeof r.matchScore === 'number' ? r.matchScore : String(r.matchScore ?? '(missing)'),
        success,
        pass,
        same: success === pass,
        passExplanationChars: typeof r.passExplanation === 'string' ? r.passExplanation.length : 0,
      };
    });
}

const dirs = process.argv.slice(2);
if (!dirs.length) throw new Error('usage: audit-probability-authority.ts <rawDir> [<rawDir> ...]');

const rows = dirs.flatMap(readRows);

console.log('sample | matchScore | successProbability | passProbability | same | passExplanationChars');
for (const r of rows) {
  console.log(`${r.file} | ${r.matchScore} | ${r.success} | ${r.pass} | ${r.same ? 'yes' : 'NO'} | ${r.passExplanationChars}`);
}

const divergent = rows.filter((r) => !r.same);
const known = rows.filter((r) => LEVELS.includes(r.success) && LEVELS.includes(r.pass));
const scoreOnly = (r: Row) => typeof r.matchScore === 'number';

console.log('\nsummary');
console.log(`files: ${rows.length}`);
console.log(`identical: ${rows.length - divergent.length}/${rows.length}`);
console.log(`divergent: ${divergent.length}/${rows.length}${divergent.length ? ` (${divergent.map((r) => r.file).join(', ')})` : ''}`);
console.log(`unexpected level values: ${rows.filter((r) => !LEVELS.includes(r.success) || !LEVELS.includes(r.pass)).length}`);
console.log(`rows without numeric matchScore: ${rows.filter((r) => !scoreOnly(r)).length}`);

// Is either field a function of matchScore? Same score must always map to the
// same level; anything else means the value is not deterministic in matchScore.
for (const key of ['success', 'pass'] as const) {
  const byScore = new Map<number, Set<string>>();
  for (const r of rows) {
    if (!scoreOnly(r)) continue;
    const s = r.matchScore as number;
    if (!byScore.has(s)) byScore.set(s, new Set());
    byScore.get(s)!.add(r[key]);
  }
  const ambiguous = [...byScore.entries()].filter(([, v]) => v.size > 1);
  console.log(
    `deterministic in matchScore (${key}): ${ambiguous.length ? 'NO' : 'consistent in this sample'}`
    + (ambiguous.length ? ` — ${ambiguous.map(([s, v]) => `${s}→{${[...v].join(',')}}`).join('; ')}` : '')
  );
}
