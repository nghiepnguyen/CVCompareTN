import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runBenchmark, configHash, readLedger, ledgerState, appendResume, checkLiveAuthorization, usd, LIVE_ENABLED,
  SOFT_STOPS, PROTOCOL_CHECKPOINTS, APPROVED_CAPS, type RunConfig, type Transport, type LedgerRecord,
} from '../a2Runner';
import { A2_FIXTURES } from '../a2Fixtures';
import { GEMINI_ANALYZE_MODEL } from '../../../_server-lib/ai/geminiClient';

// A2.2: production-parity classification, round-robin, protocol checkpoints,
// OD-G soft stops, model pinning and SHA-locked live authorization. Mock
// transport only; nothing leaves the process.
const MONTH = '11/2026';
type Resp = { status: number; json: unknown };
const text = (score: unknown) => JSON.stringify({ jobTitle: 'Synthetic', matchScore: score, detailedComparison: {} });
const resp = (o: { score?: unknown; raw?: string; finish?: string; inTok?: number; cand?: number; thoughts?: number; model?: string | null; noUsage?: boolean } = {}): Resp => {
  const inTok = o.inTok ?? 4000, cand = o.cand ?? 1500, thoughts = o.thoughts ?? 300;
  return { status: 200, json: {
    candidates: [{ content: { role: 'model', parts: [{ text: o.raw ?? text(o.score ?? 82.5) }] }, finishReason: o.finish ?? 'STOP' }],
    ...(o.noUsage ? {} : { usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: cand, thoughtsTokenCount: thoughts, totalTokenCount: inTok + cand + thoughts } }),
    ...(o.model === null ? {} : { modelVersion: o.model ?? GEMINI_ANALYZE_MODEL }),
  } };
};

function scripted(responses: Array<Resp | (() => Promise<Resp>)> = []) {
  const calls: string[] = [];
  const transport: Transport = {
    async send(url) { calls.push(url); const n = responses.shift() ?? resp(); return typeof n === 'function' ? n() : n; },
  };
  return { transport, calls };
}

let dir: string;
const ledgerPath = () => join(dir, 'ledger.jsonl');
const store = (r: unknown) => createHash('sha256').update(JSON.stringify(r)).digest('hex');
const cfg = (over: Partial<RunConfig> = {}): RunConfig => ({
  stage: 'A2.0', fixtures: A2_FIXTURES, runsPerFixture: 5, maxAttempts: 24, maxRetries: 4, budgetUsd: 5,
  currentMonth: MONTH, expectedConfigHash: configHash(MONTH), ledgerPath: ledgerPath(), writeArtifact: store,
  transport: scripted().transport, mode: 'mock', checkpoints: null, ...over,
});
const settled = () => readLedger(ledgerPath()).filter((r): r is Extract<LedgerRecord, { t: 'settled' }> => r.t === 'settled');
const reservedFixtures = () => readLedger(ledgerPath()).filter((r): r is Extract<LedgerRecord, { t: 'reserved' }> => r.t === 'reserved').map((r) => `${r.fixture}#${r.run}`);

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'm3b-a22-')); });

describe('HTTP 200 is not success: production classification', () => {
  it.each([
    ['invalid finishReason (MAX_TOKENS, valid JSON)', resp({ finish: 'MAX_TOKENS' }), 'incomplete_response'],
    ['SAFETY', resp({ finish: 'SAFETY' }), 'incomplete_response'],
    ['truncated JSON', resp({ raw: text(70).slice(0, 25) }), 'malformed_json'],
    ['missing score', resp({ raw: JSON.stringify({ jobTitle: 'x' }) }), 'missing'],
    ['out-of-range score', resp({ score: 101 }), 'out_of_range'],
    ['negative score', resp({ score: -1 }), 'out_of_range'],
    ['string score', resp({ score: '80' }), 'not_a_number'],
    ['HTTP 200 with an empty payload', { status: 200, json: { usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 0, totalTokenCount: 4000 }, modelVersion: GEMINI_ANALYZE_MODEL } }, 'malformed_json'],
  ])('%s → invalid_output (%s): charged, run completed, never re-sent, not a valid result', async (_l, first, reason) => {
    const s = scripted([first as Resp]);
    const r = await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 0, maxAttempts: 4, transport: s.transport, softStops: null }));
    expect(r).toMatchObject({ stop: 'completed', attempts: 4, primaryDone: 4 });
    expect(s.calls).toHaveLength(4);
    const first0 = settled()[0];
    expect(first0).toMatchObject({ outcome: 'invalid_output', invalidReason: reason });
    expect(first0.matchScore).toBeUndefined();
    expect(first0.chargedUsd).toBeGreaterThan(0);
  });

  it.each([[82.5, 83], [59.5, 60], [79.5, 80], [0, 0], [100, 100], [70, 70]])('score %j is normalized once to %j (canonical-en-v2)', async (input, out) => {
    await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 0, maxAttempts: 4, transport: scripted([resp({ score: input })]).transport }));
    expect(settled()[0]).toMatchObject({ outcome: 'ok', matchScore: out });
  });
});

describe('protocol v3 order and checkpoints', () => {
  it('round-robin: run k of A, B, C, D before run k+1', async () => {
    await runBenchmark(cfg({ softStops: null }));
    const ids = A2_FIXTURES.map((f) => f.id);
    expect(reservedFixtures()).toEqual([1, 2, 3, 4, 5].flatMap((run) => ids.map((id) => `${id}#${run}`)));
  });

  it('checkpoints after call 1, the first round, call 12 and call 20; none advances without an owner resume', async () => {
    const c = (over: Partial<RunConfig> = {}) => cfg({ checkpoints: undefined, ...over });
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await runBenchmark(c());
      expect(r.stop).toBe('checkpoint');
      seen.push(r.attempts);
      const s = scripted();
      expect((await runBenchmark(c({ transport: s.transport }))).stop).toBe('stopped_requires_resume');
      expect(s.calls).toHaveLength(0);
      expect(() => appendResume(ledgerPath(), '')).toThrow(/approvalRef/);
      appendResume(ledgerPath(), `owner-approval-cp${i}`);
    }
    // Call 20 completes the plan: the final review point is the completed run.
    expect(await runBenchmark(c())).toMatchObject({ stop: 'completed', attempts: 20, primaryDone: 20 });
    expect(seen).toEqual([1, 4, 12]);
    expect(PROTOCOL_CHECKPOINTS).toEqual({ afterCalls: [1, 12, 20], afterFirstRound: true });
  });

  it('call 20 is a checkpoint when retries mean the plan is not finished yet', async () => {
    const r429: Resp = { status: 429, json: {} };
    // one retry inside the first round: calls 1..21 for 20 runs
    await runBenchmark(cfg({ softStops: null, checkpoints: { afterCalls: [20], afterFirstRound: false }, transport: scripted([resp(), r429]).transport }));
    expect(ledgerState(readLedger(ledgerPath()))).toMatchObject({ attempts: 20, stopped: 'checkpoint' });
  });
});

describe('retry accounting (429 / 5xx)', () => {
  it('every retry is a call: counts toward the 24-call ceiling and the reserved budget', async () => {
    const r = await runBenchmark(cfg({ softStops: null, transport: scripted([{ status: 429, json: {} }, { status: 500, json: {} }, { status: 503, json: {} }, { status: 429, json: {} }]).transport }));
    expect(r).toMatchObject({ stop: 'completed', attempts: 24, primaryDone: 20 });
    expect(settled().filter((x) => x.outcome === 'http_retryable')).toHaveLength(4);
  });

  it('with OD-G soft stops, one 429 is retried; two consecutive non-ok results stop durably', async () => {
    const one = scripted([{ status: 429, json: {} }]);
    expect((await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 1, maxAttempts: 5, transport: one.transport }))).stop).toBe('completed');
    dir = mkdtempSync(join(tmpdir(), 'm3b-a22-'));
    const two = scripted([{ status: 503, json: {} }, { status: 503, json: {} }]);
    expect((await runBenchmark(cfg({ transport: two.transport }))).stop).toBe('soft_stop_consecutive_failures');
    expect(two.calls).toHaveLength(2);
  });

  it('invalid outputs are never retried, and do not use the retry allowance', async () => {
    const r = await runBenchmark(cfg({ softStops: null, maxRetries: 0, maxAttempts: 20, transport: scripted([resp({ finish: 'MAX_TOKENS' }), resp({ score: 'x' })]).transport }));
    expect(r).toMatchObject({ stop: 'completed', attempts: 20 });
  });

  it('retry allowance exhausted → durable stop; call ceiling is a hard preflight', async () => {
    const s = scripted(Array.from({ length: 6 }, () => ({ status: 500, json: {} })));
    expect((await runBenchmark(cfg({ softStops: null, transport: s.transport }))).stop).toBe('retries_exhausted');
    expect(s.calls).toHaveLength(5);
    dir = mkdtempSync(join(tmpdir(), 'm3b-a22-'));
    expect((await runBenchmark(cfg({ maxAttempts: 23 }))).stop).toBe('attempts_exhausted');
    expect((await runBenchmark(cfg({ maxAttempts: 25 }))).stop).toBe('config_mismatch');
  });
});

describe('fail closed: unknown outcome, usage, model', () => {
  it('timeout / abort → unknown, charged at reservation, durable stop; no silent continuation', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([() => Promise.reject(new DOMException('t', 'TimeoutError'))]).transport }));
    expect(r.stop).toBe('unknown_outcome');
    const s = scripted();
    expect((await runBenchmark(cfg({ transport: s.transport }))).stop).toBe('stopped_requires_resume');
    expect(s.calls).toHaveLength(0);
  });

  it('missing usage metadata → accounting_uncertain (charged at reservation) even when the payload is valid', async () => {
    expect((await runBenchmark(cfg({ transport: scripted([resp({ noUsage: true })]).transport }))).stop).toBe('accounting_uncertain');
  });

  it.each([
    ['a different model', 'gemini-2.5-pro'],
    ['a missing modelVersion', null],
  ])('%s → model_mismatch stop; the run is not counted done', async (_l, model) => {
    const r = await runBenchmark(cfg({ transport: scripted([resp({ model })]).transport }));
    expect([r.stop, r.primaryDone]).toEqual(['model_mismatch', 0]);
    expect(settled()[0].outcome).toBe('model_mismatch');
  });

  it('the first response pins the model version; a change mid-run stops', async () => {
    const r = await runBenchmark(cfg({ softStops: null, transport: scripted([resp({ model: 'gemini-3-flash-preview' }), resp({ model: 'gemini-3-flash-preview-002' })]).transport }));
    expect([r.stop, r.attempts]).toEqual(['model_mismatch', 2]);
  });

  it('an owner-pinned expectedModelVersion is enforced from call 1', async () => {
    const r = await runBenchmark(cfg({ expectedModelVersion: 'gemini-3-flash-preview-001' }));
    expect([r.stop, r.attempts]).toEqual(['model_mismatch', 1]);
  });
});

describe('OD-G soft stops (post-settlement; not billing caps)', () => {
  it('values are the approved proposal', () => {
    expect(SOFT_STOPS).toEqual({ stageActualUsd: 1, perCallUsd: 0.1, maxOutputTokensPerCall: 17_408, maxInvalidOutputs: 2, maxConsecutiveNonOk: 2 });
    expect(APPROVED_CAPS).toEqual({ cumulativeBudgetUsd: 5, cumulativeAttempts: 88, a20Attempts: 24 });
  });

  it('a call above $0.10 stops after it settled (the call itself is already charged)', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([resp({ cand: 30_000, thoughts: 5_000 })]).transport }));
    expect([r.stop, r.attempts]).toEqual(['soft_stop_call_cost', 1]);
    expect(r.spentUsd).toBeCloseTo(usd(4000, 35_000), 10);
  });

  it('output above 16,384 + 1,024 tokens stops (H1 cost model falsified)', async () => {
    expect((await runBenchmark(cfg({ transport: scripted([resp({ cand: 15_000, thoughts: 3_000 })]).transport }))).stop).toBe('soft_stop_output_tokens');
  });

  it('stage actual spend above $1.00 stops', async () => {
    const heavy = Array.from({ length: 24 }, () => resp({ cand: 15_000, thoughts: 2_000 })); // ≈ $0.053 per call
    const r = await runBenchmark(cfg({ transport: scripted(heavy).transport }));
    expect(r.stop).toBe('soft_stop_stage_spend');
    expect(r.attempts).toBe(19);
    expect(r.spentUsd).toBeGreaterThan(1);
  });

  it('two invalid outputs stop', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([resp({ finish: 'MAX_TOKENS' }), resp(), resp({ score: 500 })]).transport }));
    expect([r.stop, r.attempts]).toEqual(['soft_stop_invalid_outputs', 3]);
  });

  it('resume after a soft stop needs an owner reference and does not reset the stop condition', async () => {
    await runBenchmark(cfg({ transport: scripted([resp({ cand: 15_000, thoughts: 3_000 })]).transport }));
    appendResume(ledgerPath(), 'owner-approval-soft');
    // the next over-limit call stops again
    expect((await runBenchmark(cfg({ transport: scripted([resp({ cand: 15_000, thoughts: 3_000 })]).transport }))).stop).toBe('soft_stop_output_tokens');
  });
});

describe('execution authorization', () => {
  const SHA = 'c'.repeat(40);
  const auth = { executionSha: SHA, executionApprovalRef: 'OD-H', costBoundRef: 'OD-A', labelsRef: 'OD-17', hostRef: 'OD-D' };

  it('live is hard-disabled regardless of authorization', async () => {
    expect(LIVE_ENABLED).toBe(false);
    const s = scripted();
    expect((await runBenchmark(cfg({ mode: 'live', authorization: auth, codeSha: SHA, transport: s.transport }))).stop).toBe('live_disabled');
    expect(s.calls).toHaveLength(0);
  });

  it.each([
    ['no authorization', {}, 'unauthorized'],
    ['an empty reference', { authorization: { ...auth, costBoundRef: ' ' } }, 'unauthorized'],
    ['SHA mismatch', { authorization: auth, codeSha: 'd'.repeat(40) }, 'unauthorized'],
    ['short SHA', { authorization: { ...auth, executionSha: 'c'.repeat(7) }, codeSha: 'c'.repeat(7) }, 'unauthorized'],
    ['soft stops overridden', { authorization: auth, codeSha: SHA, softStops: null }, 'config_mismatch'],
    ['checkpoints overridden', { authorization: auth, codeSha: SHA, checkpoints: { afterCalls: [], afterFirstRound: false } }, 'config_mismatch'],
  ])('%s → refused', (_l, over, stop) => {
    const c = { ...cfg(), checkpoints: undefined, softStops: undefined, ...over } as RunConfig;
    expect(checkLiveAuthorization(c, {})?.stop).toBe(stop);
  });

  it('forbidden production credentials in the environment → refused', () => {
    const c = { ...cfg(), checkpoints: undefined, authorization: auth, codeSha: SHA } as RunConfig;
    expect(checkLiveAuthorization(c, { GEMINI_API_KEY: 'x' })?.stop).toBe('credential_refused');
    expect(checkLiveAuthorization(c, { SUPABASE_SERVICE_ROLE_KEY: 'x' })?.stop).toBe('credential_refused');
    expect(checkLiveAuthorization(c, {})).toBeNull();
  });
});

describe('no credentials in fixtures, manifests or ledgers', () => {
  const SECRET = /AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_live_|service_role|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  it('benchmark sources and frozen JSON contain no credential-shaped strings', () => {
    const root = 'scripts/m3b-a1';
    const files = readdirSync(root).map((f) => join(root, f)).filter((p) => statSync(p).isFile());
    for (const p of files) expect([p, SECRET.test(readFileSync(p, 'utf8'))]).toEqual([p, false]);
  });

  it('a mock run ledger holds only accounting fields (no response text, no key)', async () => {
    await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 0, maxAttempts: 4 }));
    const raw = readFileSync(ledgerPath(), 'utf8');
    expect(raw).not.toMatch(SECRET);
    expect(raw).not.toContain('Synthetic'); // model text goes to the artifact, never the ledger
  });
});
