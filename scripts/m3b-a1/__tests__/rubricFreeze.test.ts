import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RUBRIC_VERSION } from '../scoringRubric';
import { configHash } from '../a2Runner';

// The candidate rubric and the A2 benchmark inputs are frozen before any run.
// Editing them (or the P0 verification helper the rubric depends on) must come
// with a re-freeze, and after A2.0 results a new version + fresh held-out data.
type Manifest = { rubricVersion: string; files: Record<string, string>; currentMonth?: string; configHash?: string };
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Manifest;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe.each([['RUBRIC_FROZEN', load('scripts/m3b-a1/RUBRIC_FROZEN.json')], ['A2_FROZEN', load('scripts/m3b-a1/A2_FROZEN.json')]])('%s', (_name, m) => {
  it('rubric version matches', () => expect(RUBRIC_VERSION).toBe(m.rubricVersion));
  it.each(Object.entries(m.files))('%s hash matches', (path, hash) => expect(sha(path)).toBe(hash));
  it.skipIf(!m.configHash)('request config hash matches the pinned month', () => expect(configHash(m.currentMonth!)).toBe(m.configHash));
});
