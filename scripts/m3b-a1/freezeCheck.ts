// Live-run precondition: the committed freeze must still describe the code.
// Freeze tests are not a required CI check, so main can carry a stale freeze;
// the runner therefore re-verifies it itself and refuses to go live on drift.
// Paths are repo-relative (the runner and tests run from the repo root).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { computeManifest } from './a2Manifest';
import { configHash } from './a2Runner';

export const FREEZE_FILES = {
  manifest: 'scripts/m3b-a1/A2_FIXTURES_MANIFEST.json',
  frozen: ['scripts/m3b-a1/A2_FROZEN.json', 'scripts/m3b-a1/RUBRIC_FROZEN.json'],
};

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** null = freeze matches the code; otherwise a short reason (never file contents). */
export function staleFreeze(files: { manifest: string; frozen: string[] } = FREEZE_FILES): string | null {
  try {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(files.manifest, 'utf8')), computeManifest())) return 'manifest';
    for (const p of files.frozen) {
      const f = JSON.parse(readFileSync(p, 'utf8')) as { files: Record<string, string>; configHash?: string; currentMonth?: string };
      for (const [file, hash] of Object.entries(f.files)) if (sha(file) !== hash) return `hash:${file}`;
      if (f.configHash && configHash(f.currentMonth!) !== f.configHash) return 'configHash';
    }
    return null;
  } catch {
    return 'unreadable';
  }
}
