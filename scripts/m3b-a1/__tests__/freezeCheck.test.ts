import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleFreeze, FREEZE_FILES } from '../freezeCheck';

// Freeze-only suite (excluded from the normal CI run): the first test fails by
// design whenever a frozen file drifts without a re-freeze.
describe('staleFreeze (live-run precondition)', () => {
  it('the committed freeze matches the current code', () => expect(staleFreeze()).toBeNull());

  const dir = mkdtempSync(join(tmpdir(), 'm3b-freeze-'));
  const copy = (p: string) => { const t = join(dir, p.split('/').pop()!); copyFileSync(p, t); return t; };

  it('a manifest that no longer matches the code is stale', () => {
    const m = copy(FREEZE_FILES.manifest);
    const j = JSON.parse(readFileSync(m, 'utf8'));
    j.requestConfigHash = '0'.repeat(64);
    writeFileSync(m, JSON.stringify(j));
    expect(staleFreeze({ manifest: m, frozen: FREEZE_FILES.frozen })).toBe('manifest');
  });

  it('a frozen file hash that no longer matches is stale (names the file, never its content)', () => {
    const f = copy(FREEZE_FILES.frozen[0]);
    const j = JSON.parse(readFileSync(f, 'utf8'));
    j.files['scripts/m3b-a1/a2Runner.ts'] = 'f'.repeat(64);
    writeFileSync(f, JSON.stringify(j));
    expect(staleFreeze({ manifest: FREEZE_FILES.manifest, frozen: [f] })).toBe('hash:scripts/m3b-a1/a2Runner.ts');
  });

  it('a wrong config hash is stale; unreadable freeze files fail closed', () => {
    const f = copy(FREEZE_FILES.frozen[0]);
    const j = JSON.parse(readFileSync(f, 'utf8'));
    j.configHash = '1'.repeat(64);
    writeFileSync(f, JSON.stringify(j));
    expect(staleFreeze({ manifest: FREEZE_FILES.manifest, frozen: [f] })).toBe('configHash');
    expect(staleFreeze({ manifest: join(dir, 'missing.json'), frozen: [] })).toBe('unreadable');
  });

  it('the runner checks the freeze on the live path, after authorization', () => {
    const src = readFileSync('scripts/m3b-a1/a2Runner.ts', 'utf8');
    const live = src.slice(src.indexOf("if (cfg.mode === 'live') {"), src.indexOf('configHash(cfg.currentMonth) !== cfg.expectedConfigHash'));
    expect(live).toMatch(/checkLiveAuthorization[\s\S]*staleFreeze\(\)[\s\S]*freeze stale/);
  });
});
