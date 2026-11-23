import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The A1 prototype must never reach production code paths.
const ROOTS = ['src', '_server-lib', 'api', 'server', 'server.ts'];

function* files(p: string): Generator<string> {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isFile()) { if (/\.(ts|tsx|js|mjs)$/.test(p)) yield p; return; }
  for (const e of readdirSync(p)) if (e !== 'node_modules') yield* files(join(p, e));
}

describe('M3-B A1 prototype isolation', () => {
  it('no production file imports scripts/m3b-a1', () => {
    const offenders = ROOTS.flatMap((r) => [...files(r)]).filter((f) => /m3b-a1|scoringRubric/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
