// Deterministic freeze manifest for A2.0 + A2.1 inputs. Committed as
// A2_FIXTURES_MANIFEST.json; a2Manifest.test.ts fails if anything drifts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildAnalyzePromptEn } from '../../src/services/ai/prompts';
import { A2_FIXTURES, type A2Fixture } from './a2Fixtures';
import { A21_FIXTURES } from './a21Fixtures';
import { buildRequest, configHash, inputBytes, reservationUsd } from './a2Runner';
import { RUBRIC_VERSION, scoreFindings } from './scoringRubric';

export const PINNED_MONTH = '11/2026';
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const file = (p: string) => sha(readFileSync(p));

/** The frozen rubric applied to the human-draft labels (pre-registered reference, not ground truth). */
export function labelScore(f: A2Fixture) {
  const r = scoreFindings(Object.entries(f.expected.requirements).map(([requirement, e]) => ({
    requirement, category: 'skills', priority: e.priority, status: e.status, cvEvidence: 'per human label',
  })));
  return { score: r.score, band: r.fitBand };
}

const entry = (f: A2Fixture) => {
  const body = buildRequest(f, PINNED_MONTH).body;
  const bytes = inputBytes(body);
  return {
    id: f.id,
    jdSha256: sha(f.jd),
    cvSha256: sha(f.cv),
    labelsSha256: sha(JSON.stringify(f.expected)),
    renderedRequestSha256: sha(JSON.stringify(body)),
    requestBytes: bytes,
    reservationUsd: reservationUsd(bytes),
    labelRubric: labelScore(f),
  };
};

export function computeManifest() {
  return {
    pinnedMonth: PINNED_MONTH,
    requestConfigHash: configHash(PINNED_MONTH),
    promptTemplateSha256: sha(buildAnalyzePromptEn({ jdSection: 'Job Description (JD):\n<JD>', currentMonth: PINNED_MONTH })),
    rubricVersion: RUBRIC_VERSION,
    files: Object.fromEntries([
      'scripts/m3b-a1/scoringRubric.ts', 'src/services/ai/requirementVerification.ts', 'src/services/ai/prompts.ts',
      '_server-lib/ai/responseSchema.ts', '_server-lib/ai/geminiClient.ts', 'scripts/m3b-a1/a2Fixtures.ts', 'scripts/m3b-a1/a21Fixtures.ts',
      // A2.2: production response handling the runner's classifyResponse mirrors.
      '_server-lib/ai/analysisService.ts', 'src/services/ai/scoreNormalization.ts',
      'docs/audits/2026-11-23-m3b-a2-benchmark-protocol-v3.md',
    ].map((p) => [p, file(p)])),
    a20: A2_FIXTURES.map(entry),
    a21HeldOutPriorityOrder: A21_FIXTURES.map(entry),
  };
}
