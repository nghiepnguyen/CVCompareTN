import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, chmodSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runBenchmark, configHash, buildRequest, inputBytes, reservationUsd, usd, readLedger, ledgerState, appendResume, resolveOpenAttempt,
  repairTornTail, acquireLock, planWorstCaseUsd, LIVE_ENABLED, _io, MODEL_OUTPUT_LIMIT, MAX_OUTPUT_TOKENS, type RunConfig, type Transport,
} from '../a2Runner';
import { GEMINI_ANALYZE_MODEL } from '../../../_server-lib/ai/geminiClient';
import { A2_FIXTURES, type A2Fixture } from '../a2Fixtures';

const MONTH = '11/2026';
const BUDGET = 5.0; // OD-1: cumulative A2 hard cap
// A complete, valid canonical response (finishReason STOP, JSON object, valid matchScore, model version).
export const VALID_TEXT = JSON.stringify({ jobTitle: 'Synthetic', matchScore: 82.5, detailedComparison: { skills: [], experience: [], tools: [], education: [], keywords: [] } });
const ok = (inTok = 4000, cand = 1500, thoughts = 300, over: Record<string, unknown> = {}) => ({ status: 200, json: {
  candidates: [{ content: { role: 'model', parts: [{ text: VALID_TEXT }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: cand, thoughtsTokenCount: thoughts, totalTokenCount: inTok + cand + thoughts },
  modelVersion: GEMINI_ANALYZE_MODEL, ...over,
} });
type Resp = { status: number; json: unknown };
const RES0 = reservationUsd(inputBytes(buildRequest(A2_FIXTURES[0], MONTH).body));

function scripted(responses: Array<(() => Promise<Resp>) | Resp> = []) {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const transport: Transport = {
    async send(url) {
      calls.push(url);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const next = responses.shift() ?? ok();
        return typeof next === 'function' ? await next() : next;
      } finally { inFlight--; }
    },
  };
  return { transport, calls, maxInFlight: () => maxInFlight };
}

let dir: string;
let artifacts: unknown[];
const store = (r: unknown) => { artifacts.push(r); return createHash('sha256').update(JSON.stringify(r)).digest('hex'); };
const ledgerPath = () => join(dir, 'ledger.jsonl');
const reserved = (attempt: number, run = attempt) => JSON.stringify({ t: 'reserved', stage: 'A2.0', attempt, fixture: 'a2-strong', run, reservationUsd: RES0, at: 'x' }) + '\n';
const cfg = (over: Partial<RunConfig> = {}): RunConfig => ({
  stage: 'A2.0', fixtures: A2_FIXTURES, runsPerFixture: 5, maxAttempts: 24, maxRetries: 4, budgetUsd: BUDGET,
  currentMonth: MONTH, expectedConfigHash: configHash(MONTH), ledgerPath: ledgerPath(), writeArtifact: store,
  transport: scripted().transport, mode: 'mock', softStops: null, checkpoints: null, ...over,
});

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'm3b-a2-')); artifacts = []; });

describe('cost bounds (no maxOutputTokens assumption)', () => {
  it('reservation = input bytes + overhead at input price + full 65,536-token output at output price, rounded up', () => {
    const b = inputBytes(buildRequest(A2_FIXTURES[0], MONTH).body);
    expect(RES0).toBeGreaterThanOrEqual(usd(b + 1024, MODEL_OUTPUT_LIMIT));
    expect(RES0 - usd(b + 1024, MODEL_OUTPUT_LIMIT)).toBeLessThan(1e-4);
    expect(RES0).toBeGreaterThan(usd(b, MAX_OUTPUT_TOKENS) * 3); // far above the maxOutputTokens-based estimate
  });

  it('the approved plan (4×5 + 4 = 24 attempts) worst case fits $5.00', () => {
    const w = planWorstCaseUsd(A2_FIXTURES, 5, 4, MONTH);
    expect(w).toBeLessThanOrEqual(5.0);
    expect(w).toBeGreaterThan(4.9);
  });

  it('a budget below the conservative plan total is refused before any send', async () => {
    const s = scripted();
    expect((await runBenchmark(cfg({ budgetUsd: 4.98, transport: s.transport }))).stop).toBe('plan_exceeds_budget');
    expect(s.calls).toHaveLength(0);
  });
});

describe('gating', () => {
  it('live execution is hard-disabled', async () => {
    expect(LIVE_ENABLED).toBe(false);
    const s = scripted();
    expect((await runBenchmark(cfg({ mode: 'live', transport: s.transport }))).stop).toBe('live_disabled');
    expect(s.calls).toHaveLength(0);
  });

  it('config mismatch stops before any send', async () => {
    const s = scripted();
    expect((await runBenchmark(cfg({ expectedConfigHash: configHash('12/2026'), transport: s.transport }))).stop).toBe('config_mismatch');
    expect(s.calls).toHaveLength(0);
  });

  it('a plan above the cumulative attempt ceiling is refused', async () => {
    expect((await runBenchmark(cfg({ maxAttempts: 23 }))).stop).toBe('attempts_exhausted');
  });

  it('concurrent runner startup: second runner refuses while the lock is held; stale lock is never auto-removed', async () => {
    const release = acquireLock(ledgerPath())!;
    const s = scripted();
    expect((await runBenchmark(cfg({ transport: s.transport }))).stop).toBe('locked');
    expect(s.calls).toHaveLength(0);
    release();
    expect((await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 0, maxAttempts: 4 }))).stop).toBe('completed');
    expect(existsSync(`${ledgerPath()}.lock`)).toBe(false);
  });

  it('two runners started at the same moment: exactly one sends', async () => {
    const slow = () => new Promise<Resp>((r) => setTimeout(() => r(ok()), 5));
    const a = scripted(Array.from({ length: 30 }, () => slow));
    const b = scripted();
    const [ra, rb] = await Promise.all([runBenchmark(cfg({ transport: a.transport })), runBenchmark(cfg({ transport: b.transport }))]);
    expect([ra.stop, rb.stop].sort()).toEqual(['completed', 'locked']);
    expect(a.calls.length + b.calls.length).toBe(20);
  });
});

describe('execution and accounting', () => {
  it('happy path: 20 attempts, 1 in flight, artifact hash per settled attempt, thinking billed once', async () => {
    const s = scripted();
    const r = await runBenchmark(cfg({ transport: s.transport }));
    expect(r).toMatchObject({ stop: 'completed', attempts: 20, primaryDone: 20 });
    expect(s.maxInFlight()).toBe(1);
    expect(readLedger(ledgerPath()).filter((x) => x.t === 'settled' && x.artifactSha256)).toHaveLength(20);
    expect(r.spentUsd).toBeCloseTo(20 * usd(4000, 1800), 10);
  });

  it('4 retries + 20 primary = exactly 24; 5th failure → durable stop', async () => {
    const r429 = { status: 429, json: {} };
    expect(await runBenchmark(cfg({ transport: scripted([r429, r429, r429, r429]).transport }))).toMatchObject({ stop: 'completed', attempts: 24 });
    dir = mkdtempSync(join(tmpdir(), 'm3b-a2-'));
    const s = scripted(Array.from({ length: 10 }, () => ({ status: 503, json: {} })));
    expect((await runBenchmark(cfg({ transport: s.transport }))).stop).toBe('retries_exhausted');
    expect(s.calls).toHaveLength(5);
  });

  it('non-retryable 4xx → durable stop', async () => {
    expect((await runBenchmark(cfg({ transport: scripted([{ status: 400, json: {} }]).transport }))).stop).toBe('provider_rejected');
  });

  it('spend never exceeds $5 even if every call costs its full conservative bound', async () => {
    const b = Math.min(...A2_FIXTURES.map((f) => inputBytes(buildRequest(f, MONTH).body)));
    const worst = ok(b + 1000, MODEL_OUTPUT_LIMIT - 5000, 5000);
    const r = await runBenchmark(cfg({ transport: scripted(Array.from({ length: 30 }, () => worst)).transport }));
    expect(r.stop).toBe('completed');
    expect(r.spentUsd).toBeLessThanOrEqual(5);
  });

  it('output above maxOutputTokens but within the model limit is recorded, not a stop', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([ok(4000, 15000, 20000)]).transport }));
    expect(r.stop).toBe('completed');
    expect(readLedger(ledgerPath()).find((x) => x.t === 'settled' && x.exceededMaxOutputTokens)).toBeTruthy();
  });

  it.each([
    ['output above the model limit', ok(4000, MODEL_OUTPUT_LIMIT, 1)],
    ['prompt above the byte + overhead bound', ok(30_000, 100, 0)],
    ['totalTokenCount inconsistent (thoughts double-counted)', { status: 200, json: { usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 1800, thoughtsTokenCount: 300, totalTokenCount: 5800 } } }],
    ['unexpected cached-content dimension', { status: 200, json: { usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 1500, cachedContentTokenCount: 100, totalTokenCount: 5500 } } }],
  ])('%s → accounting_mismatch stop', async (_l, resp) => {
    expect((await runBenchmark(cfg({ transport: scripted([resp as Resp]).transport }))).stop).toBe('accounting_mismatch');
  });

  it('missing usageMetadata (fail closed) → charged at full reservation, durable stop', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([{ status: 200, json: {} }]).transport }));
    expect(r.stop).toBe('accounting_uncertain');
    expect(r.spentUsd).toBeCloseTo(RES0, 10);
  });
});

describe('ledger durability — crash points and repair', () => {
  it('crash before reservation (no record) → restart runs the plan normally', async () => {
    writeFileSync(ledgerPath(), '');
    expect((await runBenchmark(cfg())).stop).toBe('completed');
  });

  it.each([
    'crash after reservation, before send',
    'crash after send, before response',
    'crash after response, before settlement',
  ])('%s → open attempt counted at full reservation; every restart refuses', async () => {
    // All three leave the same durable state: a reservation without settlement.
    writeFileSync(ledgerPath(), reserved(1));
    const s = scripted();
    const r = await runBenchmark(cfg({ transport: s.transport }));
    expect([r.stop, r.spentUsd]).toEqual(['ledger_unresolved', RES0]);
    expect(s.calls).toHaveLength(0);
  });

  it('operator repair: resolveOpenAttempt charges in full (never releases), stops; resume needs approval', async () => {
    writeFileSync(ledgerPath(), reserved(1));
    expect(() => resolveOpenAttempt(ledgerPath(), 1, ' ')).toThrow();
    expect(() => resolveOpenAttempt(ledgerPath(), 2, 'ref')).toThrow(/not open/);
    resolveOpenAttempt(ledgerPath(), 1, 'owner-approval-crash-repair');
    const st = ledgerState(readLedger(ledgerPath()));
    expect([st.openAttempts, st.stopped, st.spentUsd]).toEqual([[], 'unknown_outcome', RES0]);
    expect((await runBenchmark(cfg())).stop).toBe('stopped_requires_resume');
    appendResume(ledgerPath(), 'owner-approval-resume');
    // RES0 + 20 primary (incl. the re-run) + 3 retries left still fits $5.
    expect((await runBenchmark(cfg())).stop).toBe('completed');
  });

  it('unknown outcome (timeout/abort/network) → charged in full, durable stop; restart refuses until resume', async () => {
    const r = await runBenchmark(cfg({ transport: scripted([ok(), () => Promise.reject(new Error('aborted'))]).transport }));
    expect(r.stop).toBe('unknown_outcome');
    expect(r.spentUsd).toBeCloseTo(usd(4000, 1800) + RES0, 10);
    const s = scripted();
    expect((await runBenchmark(cfg({ transport: s.transport }))).stop).toBe('stopped_requires_resume');
    expect(s.calls).toHaveLength(0);
  });

  it('unexpected restart after a clean partial run resumes without re-sending completed runs', async () => {
    await runBenchmark(cfg({ transport: scripted([ok(), ok(), () => Promise.reject(new Error('kill'))]).transport }));
    appendResume(ledgerPath(), 'owner-approval-after-restart');
    const s = scripted();
    const r = await runBenchmark(cfg({ transport: s.transport }));
    expect(r).toMatchObject({ stop: 'completed', primaryDone: 20, attempts: 21 });
    expect(s.calls).toHaveLength(18);
  });

  it('partial ledger write (torn tail) → refuse; repairTornTail keeps a backup, records the removal, leaves the run stopped', async () => {
    writeFileSync(ledgerPath(), reserved(1) + JSON.stringify({ t: 'settled', attempt: 1, outcome: 'ok', chargedUsd: 0.01, at: 'x' }).slice(0, 20));
    expect((await runBenchmark(cfg())).stop).toBe('ledger_corrupt');
    expect(() => repairTornTail(ledgerPath(), '')).toThrow();
    const { backup, removedBytes } = repairTornTail(ledgerPath(), 'owner-approval-torn-tail');
    expect(removedBytes).toBe(20);
    expect(readFileSync(backup, 'utf8').endsWith('\n')).toBe(false);
    const st = ledgerState(readLedger(ledgerPath()));
    // The torn settled line is gone, so attempt 1 is OPEN again (never silently released).
    expect([st.openAttempts, st.stopped, st.spentUsd]).toEqual([[1], 'ledger_corrupt', RES0]);
    expect((await runBenchmark(cfg())).stop).toBe('ledger_unresolved');
    resolveOpenAttempt(ledgerPath(), 1, 'owner-approval-resolve');
    expect(() => repairTornTail(ledgerPath(), 'x')).toThrow(/not torn/);
  });

  it('duplicate attempt id, settle without reservation, double settle → ledger_corrupt', async () => {
    for (const bad of [
      reserved(1) + reserved(1),
      JSON.stringify({ t: 'settled', attempt: 1, outcome: 'ok', chargedUsd: 0, at: 'x' }) + '\n',
      reserved(1) + JSON.stringify({ t: 'settled', attempt: 1, outcome: 'ok', chargedUsd: 0, at: 'x' }) + '\n' + JSON.stringify({ t: 'settled', attempt: 1, outcome: 'ok', chargedUsd: 0, at: 'x' }) + '\n',
      '{"t": "resume"}\n',
    ]) {
      writeFileSync(ledgerPath(), bad);
      const s = scripted();
      expect((await runBenchmark(cfg({ transport: s.transport }))).stop).toBe('ledger_corrupt');
      expect(s.calls).toHaveLength(0);
    }
  });

  it('short write of the reservation (ENOSPC-style) → no send; the partial line is a torn tail that is safe to truncate', async () => {
    const real = _io.writeSync;
    _io.writeSync = (fd, data) => real(fd, data.slice(0, 10));
    const s = scripted();
    let r;
    try { r = await runBenchmark(cfg({ transport: s.transport })); } finally { _io.writeSync = real; }
    expect(r.stop).toBe('ledger_write_failed');
    expect(s.calls).toHaveLength(0);
    expect((await runBenchmark(cfg())).stop).toBe('ledger_corrupt');
    repairTornTail(ledgerPath(), 'owner-approval-enospc');
    expect(ledgerState(readLedger(ledgerPath())).openAttempts).toEqual([]); // nothing was sent, nothing billable lost
  });

  it('short write of a settlement → stop; the attempt stays open (never lost) after repair', async () => {
    const real = _io.writeSync;
    let n = 0;
    _io.writeSync = (fd, data) => (++n === 2 ? real(fd, data.slice(0, 10)) : real(fd, data));
    const s = scripted();
    let r;
    try { r = await runBenchmark(cfg({ transport: s.transport })); } finally { _io.writeSync = real; }
    expect([r.stop, s.calls.length]).toEqual(['ledger_write_failed', 1]);
    repairTornTail(ledgerPath(), 'owner-approval-enospc');
    const st = ledgerState(readLedger(ledgerPath()));
    expect([st.openAttempts, st.spentUsd]).toEqual([[1], RES0]);
  });

  it('configs above the owner-approved caps are refused (no expansion by config)', async () => {
    for (const over of [{ budgetUsd: 5.01 }, { maxAttempts: 25 }, { runsPerFixture: 6 }, { stage: 'A2.1' as const, maxAttempts: 89 }]) {
      const s = scripted();
      expect((await runBenchmark(cfg({ ...over, transport: s.transport }))).stop).toBe('config_mismatch');
      expect(s.calls).toHaveLength(0);
    }
  });

  it('ledger write failure → stop before sending', async () => {
    writeFileSync(ledgerPath(), '');
    chmodSync(ledgerPath(), 0o444);
    const s = scripted();
    const r = await runBenchmark(cfg({ transport: s.transport }));
    chmodSync(ledgerPath(), 0o644);
    expect(r.stop).toBe('ledger_write_failed');
    expect(s.calls).toHaveLength(0);
  });

  it('artifact write failure → run NOT counted done, durable stop; after approval the run is re-done', async () => {
    const r = await runBenchmark(cfg({ writeArtifact: () => { throw new Error('disk full'); } }));
    expect([r.stop, r.primaryDone]).toEqual(['artifact_write_failed', 0]);
    appendResume(ledgerPath(), 'owner-approval-artifact-fixed');
    const s = scripted();
    expect((await runBenchmark(cfg({ transport: s.transport }))).primaryDone).toBe(20);
    expect(s.calls).toHaveLength(20);
  });

  it('resume without owner approval reference is impossible', () => {
    writeFileSync(ledgerPath(), '');
    expect(() => appendResume(ledgerPath(), '')).toThrow(/approvalRef/);
  });

  it('prior spend is deducted before the plan is accepted (no silent overspend)', async () => {
    writeFileSync(ledgerPath(), reserved(1) + JSON.stringify({ t: 'settled', attempt: 1, outcome: 'ok', chargedUsd: 0.05, at: 'x' }) + '\n');
    // 0.05 spent + 19 primary + 4 retries at ~$0.2079 ≈ $4.83: refused under $4.80, accepted under $5.
    expect((await runBenchmark(cfg({ budgetUsd: 4.8 }))).stop).toBe('plan_exceeds_budget');
    expect((await runBenchmark(cfg())).stop).toBe('completed');
    unlinkSync(ledgerPath());
  });
});

describe('A2.1 on the shared ledger: cumulative 88 attempts / $5', () => {
  const heldOut: A2Fixture[] = Array.from({ length: 4 }, (_, i) => ({ ...A2_FIXTURES[i], id: `a21-heldout-${i}` }));

  it('after A2.0 settles at actual cost, A2.1 may only reserve what is left of $5', async () => {
    await runBenchmark(cfg()); // spends 20 × ~$0.0074 actual
    const spent = ledgerState(readLedger(ledgerPath())).spentUsd;
    const s = scripted();
    // 4 × 5 + 3 retries at ~$0.2079 = ~$4.78 ≤ $5 − spent.
    const r = await runBenchmark(cfg({ stage: 'A2.1', fixtures: heldOut, runsPerFixture: 5, maxRetries: 3, maxAttempts: 88, transport: s.transport }));
    expect(r.stop).toBe('completed');
    expect(r.spentUsd).toBeLessThanOrEqual(5);
    expect(spent).toBeLessThan(0.2);
    // A larger A2.1 is refused by the cumulative budget, not silently trimmed.
    expect((await runBenchmark(cfg({ stage: 'A2.1', fixtures: [...heldOut].map((f) => ({ ...f, id: f.id + '-b' })), runsPerFixture: 5, maxRetries: 4, maxAttempts: 88 }))).stop).toBe('plan_exceeds_budget');
  });

  it('outstanding A2.0 reservations (open attempts) block A2.1', async () => {
    writeFileSync(ledgerPath(), reserved(1));
    expect((await runBenchmark(cfg({ stage: 'A2.1', fixtures: heldOut, maxAttempts: 88 }))).stop).toBe('ledger_unresolved');
  });
});

describe('ledger file format', () => {
  it('lines are canonical JSON, newline-terminated', async () => {
    await runBenchmark(cfg({ runsPerFixture: 1, maxRetries: 0, maxAttempts: 4 }));
    expect(readFileSync(ledgerPath(), 'utf8').endsWith('\n')).toBe(true);
    appendFileSync(ledgerPath(), '{"t": "settled"}\n');
    expect(() => readLedger(ledgerPath())).toThrow(/non-canonical/);
  });
});
