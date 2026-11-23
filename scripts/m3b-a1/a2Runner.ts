// M3-B A2 benchmark runner — OFFLINE-SAFE (A2-P, aligned to canonical-en-v2 in
// A2.2). Live execution is hard-disabled by LIVE_ENABLED below; enabling it
// needs a reviewed code change AND a SHA-locked owner authorization
// (checkLiveAuthorization) covering execution, cost bound, labels and host.
// A2.2: an HTTP 200 is NOT a success — every response is classified with the
// production rules (classifyResponse); round-robin order; protocol checkpoints
// and OD-G soft stops are durable stops that need an owner resume.
// Lessons applied from CP6 (not its code): reservation durably recorded before
// any send; strict newline-framed, sequence-checked ledger; single-runner lock;
// unknown outcome = charged at the reservation bound + durable stop; a stop
// survives restarts until an operator appends a resume record with an approval
// reference; one request in flight; no hidden retries; config integrity first.
// A fetch-level allowlist is NOT transport isolation: live runs also need an
// egress-restricted host (see the A2-P runbook).
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fstatSync, fsyncSync, ftruncateSync, openSync, readFileSync, readSync, unlinkSync, writeSync } from 'node:fs';
import { FinishReason, GenerateContentResponse } from '@google/genai';
import { buildAnalyzePromptEn } from '../../src/services/ai/prompts';
import { ANALYSIS_RESPONSE_SCHEMA } from '../../_server-lib/ai/responseSchema';
import { GEMINI_ANALYZE_MODEL, thinkingConfigFor } from '../../_server-lib/ai/geminiClient';
import { normalizeMatchScore, type InvalidScoreReason } from '../../src/services/ai/scoreNormalization';
import type { A2Fixture } from './a2Fixtures';

export const LIVE_ENABLED = false as const;
export const ALLOWED_ORIGIN = 'https://generativelanguage.googleapis.com';
export const ALLOWED_URL = `${ALLOWED_ORIGIN}/v1beta/models/${GEMINI_ANALYZE_MODEL}:generateContent`;
/** Production literal in _server-lib/ai/analysisService.ts (generateContent config). */
export const MAX_OUTPUT_TOKENS = 16384;
/** Official pricing, gemini-3-flash-preview, paid Standard, text (aistudio.google.com/docs/pricing, retrieved 2026-11-22). Output price includes thinking tokens. */
export const PRICE = { inputUsdPerMTok: 0.5, outputUsdPerMTok: 3.0 } as const;
/**
 * aistudio.google.com/docs/models/gemini-3-flash-preview: "Output token limit 65,536".
 * The docs do NOT state that this (or maxOutputTokens) bounds thinking tokens for
 * generateContent. OD-16 (use it as the billable bound) was REJECTED; OD-A is
 * pending. It is used only to size reservations (assumption H2); it is NOT a
 * guaranteed billing bound.
 */
export const MODEL_OUTPUT_LIMIT = 65_536;
/** Allowance for provider-side prompt overhead (role/schema/control tokens) beyond the request bytes. Checked after every call. */
export const INPUT_OVERHEAD_TOKENS = 1_024;
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Owner-approved AUTHORIZATION ceilings (OD-1), enforced in code; a config cannot
 * raise them. While OD-A is unresolved these are NOT billing caps: the dollar
 * ceiling is reservation-based (H2), and one call's provider cost has no
 * documented upper bound.
 */
export const APPROVED_CAPS = { cumulativeBudgetUsd: 5.0, cumulativeAttempts: 88, a20Attempts: 24 } as const;

/**
 * OD-G soft stops (approved as the proposed configuration). Each is checked AFTER
 * a call has settled, so it prevents the next call and never caps the current
 * one. Not billing caps.
 */
export const SOFT_STOPS = {
  /** Usage-reported (usageMetadata) spend of the stage; reservation-charged outcomes are excluded. */
  stageActualUsd: 1.0,
  perCallUsd: 0.1,
  /** maxOutputTokens 16,384 + thinkingBudget 1,024: more means the H1 cost model is wrong. */
  maxOutputTokensPerCall: 17_408,
  maxInvalidOutputs: 2,
  maxConsecutiveNonOk: 2,
} as const;
export type SoftStops = { [K in keyof typeof SOFT_STOPS]: number };

/** Protocol v3 checkpoints (stage-relative call numbers + end of the first round). Each needs an owner resume. */
export const PROTOCOL_CHECKPOINTS = { afterCalls: [1, 12, 20], afterFirstRound: true } as const;
export type Checkpoints = { afterCalls: readonly number[]; afterFirstRound: boolean };

export type Stop =
  | 'live_disabled' | 'config_mismatch' | 'credential_refused' | 'unauthorized' | 'locked' | 'ledger_unresolved'
  | 'ledger_corrupt' | 'ledger_write_failed' | 'stopped_requires_resume' | 'plan_exceeds_budget' | 'budget_exhausted'
  | 'attempts_exhausted' | 'unknown_outcome' | 'accounting_uncertain' | 'accounting_mismatch' | 'provider_rejected'
  | 'retries_exhausted' | 'artifact_write_failed' | 'model_mismatch' | 'checkpoint'
  | 'soft_stop_stage_spend' | 'soft_stop_call_cost' | 'soft_stop_output_tokens' | 'soft_stop_invalid_outputs' | 'soft_stop_consecutive_failures';

// ── Response classification: the production canonical-en-v2 rules ──
// Mirrors _server-lib/ai/analysisService.ts:207-227 (finishReason/blockReason
// gate, JSON object, normalizeMatchScore). The SDK response class and
// normalizeMatchScore are the production ones; parseGeminiJson is a copy (the
// production helper is not exported). responseParity.test.ts runs production
// analyzeCV and this function on the same raw responses and requires identical
// outcomes; analysisService.ts is hash-frozen in the manifest.
export type InvalidReason = InvalidScoreReason | 'malformed_json' | 'blocked' | 'incomplete_response';
export type Classified = { valid: true; matchScore: number } | { valid: false; reason: InvalidReason };

const parseGeminiJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // eslint-disable-next-line no-control-regex
        return JSON.parse(jsonMatch[0].replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/,\s*([\}\]])/g, '$1'));
      } catch {
        throw e;
      }
    }
    throw new SyntaxError('No JSON object found in Gemini response');
  }
};

export function classifyResponse(json: unknown): Classified {
  const response = Object.assign(new GenerateContentResponse(), json && typeof json === 'object' ? json : {});
  if (response.promptFeedback?.blockReason) return { valid: false, reason: 'blocked' };
  const candidate = response.candidates?.[0];
  if (candidate && candidate.finishReason !== FinishReason.STOP) return { valid: false, reason: 'incomplete_response' };
  let parsed: unknown;
  try {
    parsed = parseGeminiJson(response.text || '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('not a JSON object');
  } catch {
    return { valid: false, reason: 'malformed_json' };
  }
  const v = normalizeMatchScore((parsed as { matchScore?: unknown }).matchScore);
  return 'reason' in v ? { valid: false, reason: v.reason } : { valid: true, matchScore: v.score };
}

// ── Request (must equal what production analyzeCV sends; see a2RequestParity.test.ts) ──
export function buildRequest(f: Pick<A2Fixture, 'jd' | 'cv'>, currentMonth: string) {
  const prompt = buildAnalyzePromptEn({ jdSection: `Job Description (JD):\n${f.jd}`, currentMonth });
  return {
    url: ALLOWED_URL,
    body: {
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: `CV Content:\n${f.cv}` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: thinkingConfigFor(GEMINI_ANALYZE_MODEL),
      },
    },
  };
}

/** Hash of everything that defines the request except the fixture text. */
export function configHash(currentMonth: string): string {
  const { url, body } = buildRequest({ jd: '<JD>', cv: '<CV>' }, currentMonth);
  return createHash('sha256').update(JSON.stringify({ url, body })).digest('hex');
}

// ── Cost bounds ──
/** Derived input bound: tokens never exceed UTF-8 bytes; plus a fixed overhead allowance. Not provider-enforced; checked after each call. */
export const inputBytes = (body: unknown) => Buffer.byteLength(JSON.stringify(body), 'utf8');
export const inputTokenBound = (bytes: number) => bytes + INPUT_OVERHEAD_TOKENS;
export const usd = (inTok: number, outTok: number) => (inTok * PRICE.inputUsdPerMTok + outTok * PRICE.outputUsdPerMTok) / 1e6;
/** Conservative per-attempt reservation: input bound + full model output limit (thinking included), rounded UP to $0.0001. */
export const reservationUsd = (bytes: number) => Math.ceil(usd(inputTokenBound(bytes), MODEL_OUTPUT_LIMIT) * 1e4) / 1e4;

/** Worst case for a plan: every primary attempt and every retry at its full reservation (retries at the largest one). */
export function planWorstCaseUsd(fixtures: Pick<A2Fixture, 'jd' | 'cv'>[], runsPerFixture: number, maxRetries: number, currentMonth: string): number {
  const res = fixtures.map((f) => reservationUsd(inputBytes(buildRequest(f, currentMonth).body)));
  return res.reduce((s, r) => s + r * runsPerFixture, 0) + Math.max(0, ...res) * maxRetries;
}

// ── Ledger: append-only JSONL, strict framing + sequence checks, fsync per record, shared across stages ──
export type LedgerRecord =
  | { t: 'reserved'; stage: string; attempt: number; fixture: string; run: number; reservationUsd: number; at: string }
  | { t: 'settled'; attempt: number; outcome: SettledOutcome; chargedUsd: number; inputTokens?: number; outputTokens?: number; exceededMaxOutputTokens?: boolean; latencyMs?: number; artifactSha256?: string; matchScore?: number; invalidReason?: InvalidReason; modelVersion?: string; at: string }
  | { t: 'stopped'; reason: Stop; attempt?: number; at: string }
  | { t: 'resume'; approvalRef: string; at: string }
  | { t: 'repair'; kind: 'torn_tail'; removedBytes: number; removedSha256: string; backup: string; approvalRef: string; at: string };

/** 'ok' = valid canonical-en-v2 result; 'invalid_output' = a completed run whose result production would reject (measured, never re-sent). */
export type SettledOutcome = 'ok' | 'invalid_output' | 'model_mismatch' | 'http_retryable' | 'http_rejected' | 'unknown' | 'artifact_failed';
/** Outcomes that complete a run: the run is never re-sent. */
const RUN_DONE: ReadonlySet<SettledOutcome> = new Set(['ok', 'invalid_output']);

const corrupt = (m: string) => Object.assign(new Error(m), { stop: 'ledger_corrupt' as Stop });

/** Parse + validate: canonical lines, attempt ids 1..n in order, each settled at most once and only after its reservation. */
export function readLedger(path: string): LedgerRecord[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  if (text === '') return [];
  if (!text.endsWith('\n')) throw corrupt('ledger tail not newline-terminated');
  const recs = text.slice(0, -1).split('\n').map((l) => {
    let r: LedgerRecord;
    try { r = JSON.parse(l) as LedgerRecord; } catch { throw corrupt('unparseable ledger line'); }
    if (JSON.stringify(r) !== l) throw corrupt('non-canonical ledger line');
    return r;
  });
  let last = 0;
  const settled = new Set<number>();
  for (const r of recs) {
    if (r.t === 'reserved') { if (r.attempt !== last + 1) throw corrupt(`attempt id ${r.attempt} out of sequence`); last = r.attempt; }
    if (r.t === 'settled') {
      if (r.attempt > last) throw corrupt(`settled attempt ${r.attempt} has no reservation`);
      if (settled.has(r.attempt)) throw corrupt(`attempt ${r.attempt} settled twice`);
      settled.add(r.attempt);
    }
  }
  return recs;
}

/** Test seam for short-write injection (ENOSPC-style partial writes). */
export const _io = { writeSync: writeSync as (fd: number, data: string) => number };

/**
 * Append one record, fsync, and VERIFY it landed whole: a short write (e.g.
 * ENOSPC) throws, so the caller never sends after a partial reservation. The
 * partial line then shows up as a torn tail; truncating it is safe because no
 * send followed it.
 */
export function appendLedger(path: string, rec: LedgerRecord): void {
  const fd = openSync(path, 'a+');
  try {
    const size = fstatSync(fd).size;
    if (size > 0) {
      const last = Buffer.alloc(1);
      readSync(fd, last, 0, 1, size - 1);
      if (last[0] !== 0x0a) throw corrupt('refusing append: torn tail');
    }
    const line = JSON.stringify(rec) + '\n';
    const len = Buffer.byteLength(line, 'utf8');
    const written = _io.writeSync(fd, line);
    fsyncSync(fd);
    if (written !== len || fstatSync(fd).size !== size + len) throw new Error(`short ledger write (${written}/${len} bytes)`);
  } finally {
    closeSync(fd);
  }
}

/** Operator action after reviewing a durable stop. */
export function appendResume(path: string, approvalRef: string): void {
  if (!approvalRef.trim()) throw new Error('approvalRef required');
  readLedger(path);
  appendLedger(path, { t: 'resume', approvalRef, at: new Date().toISOString() });
}

/**
 * Operator-only repair after a crash left an attempt reserved but unsettled:
 * settle it as unknown at its full reservation (never released, never erased)
 * and record a durable stop. Resuming still needs appendResume.
 */
export function resolveOpenAttempt(path: string, attempt: number, approvalRef: string): void {
  if (!approvalRef.trim()) throw new Error('approvalRef required');
  const recs = readLedger(path);
  const rec = recs.find((r) => r.t === 'reserved' && r.attempt === attempt) as Extract<LedgerRecord, { t: 'reserved' }> | undefined;
  if (!rec || !ledgerState(recs).openAttempts.includes(attempt)) throw new Error(`attempt ${attempt} is not open`);
  const at = new Date().toISOString();
  appendLedger(path, { t: 'settled', attempt, outcome: 'unknown', chargedUsd: rec.reservationUsd, at });
  appendLedger(path, { t: 'stopped', reason: 'unknown_outcome', attempt, at });
}

/**
 * Operator-only repair of a torn tail (a crash mid-append). Safe because a send
 * only happens after its reservation append returned (fsync'd): a torn
 * `reserved` line was never sent, and a torn `settled` line leaves its attempt
 * open → it must then be resolved with resolveOpenAttempt (charged in full).
 * Keeps a byte-exact backup; records what was removed; leaves the run stopped.
 */
export function repairTornTail(path: string, approvalRef: string): { removedBytes: number; backup: string } {
  if (!approvalRef.trim()) throw new Error('approvalRef required');
  const buf = readFileSync(path);
  if (buf.length === 0 || buf[buf.length - 1] === 0x0a) throw new Error('ledger tail is not torn');
  const cut = buf.lastIndexOf(0x0a) + 1;
  const removed = buf.subarray(cut);
  const backup = `${path}.torn-${createHash('sha256').update(buf).digest('hex').slice(0, 16)}`;
  copyFileSync(path, backup);
  const fd = openSync(path, 'r+');
  try { ftruncateSync(fd, cut); fsyncSync(fd); } finally { closeSync(fd); }
  readLedger(path); // the remaining ledger must be fully valid
  const at = new Date().toISOString();
  appendLedger(path, { t: 'repair', kind: 'torn_tail', removedBytes: removed.length, removedSha256: createHash('sha256').update(removed).digest('hex'), backup, approvalRef, at });
  appendLedger(path, { t: 'stopped', reason: 'ledger_corrupt', at });
  return { removedBytes: removed.length, backup };
}

/** Spent = settled charges + open attempts (unresolved = unknown outcome, counted at their full reservation). */
export function ledgerState(records: LedgerRecord[]) {
  const open = new Map<number, number>();
  const byAttempt = new Map<number, string>();
  const done = new Set<string>();
  let spentUsd = 0;
  let attempts = 0;
  let stopped: Stop | null = null;
  for (const r of records) {
    if (r.t === 'reserved') { open.set(r.attempt, r.reservationUsd); byAttempt.set(r.attempt, `${r.fixture}#${r.run}`); attempts = r.attempt; }
    else if (r.t === 'settled') { open.delete(r.attempt); spentUsd += r.chargedUsd; if (RUN_DONE.has(r.outcome)) done.add(byAttempt.get(r.attempt)!); }
    else if (r.t === 'stopped') stopped = r.reason;
    else if (r.t === 'resume') stopped = null;
  }
  for (const v of open.values()) spentUsd += v;
  return { spentUsd, attempts, done, stopped, openAttempts: [...open.keys()] };
}

// ── Single-runner lock (exclusive create). A stale lock is never removed automatically. ──
export function acquireLock(ledgerPath: string): (() => void) | null {
  const lock = `${ledgerPath}.lock`;
  let fd: number;
  try { fd = openSync(lock, 'wx'); } catch { return null; }
  try { writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  return () => { try { unlinkSync(lock); } catch { /* left for the operator */ } };
}

// ── Transport: injected; the live one is a2LiveTransport.ts ──
export interface Transport {
  send(url: string, body: unknown, signal: AbortSignal): Promise<{ status: number; json: unknown }>;
}

/** Environment that must be absent for a live run (no production credential discovery). */
export const FORBIDDEN_LIVE_ENV = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_\w*|SUPABASE\w*|VITE_SUPABASE\w*|VERCEL\w*|R2_\w*|RESEND\w*|PAYOS\w*)$/;

export interface RunConfig {
  stage: 'A2.0' | 'A2.1';
  fixtures: A2Fixture[];
  runsPerFixture: number;
  /** Cumulative across stages (shared ledger). */
  maxAttempts: number;
  /** Per stage: every non-ok settled attempt in this stage counts. */
  maxRetries: number;
  /** Cumulative across stages (shared ledger). */
  budgetUsd: number;
  currentMonth: string;
  expectedConfigHash: string;
  ledgerPath: string;
  /** Must persist durably and return the SHA-256 of what it wrote; throw on failure. */
  writeArtifact: (rec: unknown) => string;
  transport: Transport;
  mode: 'mock' | 'live';
  /** Live only: SHA-locked owner authorization (all references required). */
  authorization?: LiveAuthorization;
  /** Live only: git HEAD of the executing checkout, supplied by the CLI. */
  codeSha?: string;
  /** Pin the provider modelVersion; otherwise the first response pins it. */
  expectedModelVersion?: string;
  /** Mock only: override (null disables). Live must use SOFT_STOPS exactly. */
  softStops?: SoftStops | null;
  /** Mock only: override (null disables). Live must use PROTOCOL_CHECKPOINTS exactly. */
  checkpoints?: Checkpoints | null;
  env?: NodeJS.ProcessEnv;
}

/** Owner references for OD-H (execution), OD-A (cost bound), OD-17 (labels), OD-D (host). */
export interface LiveAuthorization {
  executionSha: string;
  executionApprovalRef: string;
  costBoundRef: string;
  labelsRef: string;
  hostRef: string;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Live preconditions beyond LIVE_ENABLED. Pure so it is testable while live is
 * hard-disabled. Returns the refusal, or null when every precondition holds.
 */
export function checkLiveAuthorization(cfg: RunConfig, env: NodeJS.ProcessEnv): { stop: Stop; detail?: string } | null {
  const bad = Object.keys(env).filter((k) => FORBIDDEN_LIVE_ENV.test(k) && env[k]);
  if (bad.length) return { stop: 'credential_refused', detail: `forbidden env present: ${bad.join(', ')}` };
  const a = cfg.authorization;
  const refs = a ? [a.executionApprovalRef, a.costBoundRef, a.labelsRef, a.hostRef] : [];
  if (!a || refs.some((r) => typeof r !== 'string' || !r.trim())) return { stop: 'unauthorized', detail: 'missing owner authorization reference(s)' };
  if (!/^[0-9a-f]{40}$/.test(a.executionSha) || a.executionSha !== cfg.codeSha) return { stop: 'unauthorized', detail: 'execution SHA does not match the running code' };
  if (cfg.softStops !== undefined && !sameJson(cfg.softStops, SOFT_STOPS)) return { stop: 'config_mismatch', detail: 'live must use the OD-G soft stops' };
  if (cfg.checkpoints !== undefined && !sameJson(cfg.checkpoints, PROTOCOL_CHECKPOINTS)) return { stop: 'config_mismatch', detail: 'live must use the protocol checkpoints' };
  return null;
}

export interface RunReport { stop: Stop | 'completed'; attempts: number; spentUsd: number; primaryDone: number; detail?: string }

export async function runBenchmark(cfg: RunConfig): Promise<RunReport> {
  const env = cfg.env ?? process.env;
  const key = (f: A2Fixture, run: number) => `${f.id}#${run}`;
  const report = (stop: RunReport['stop'], detail?: string): RunReport => {
    try {
      const s = ledgerState(readLedger(cfg.ledgerPath));
      const primaryDone = cfg.fixtures.reduce((n, f) => n + Array.from({ length: cfg.runsPerFixture }, (_, i) => s.done.has(key(f, i + 1))).filter(Boolean).length, 0);
      return { stop, attempts: s.attempts, spentUsd: s.spentUsd, primaryDone, detail };
    } catch { return { stop, attempts: NaN, spentUsd: NaN, primaryDone: NaN, detail }; }
  };

  if (cfg.mode === 'live' && !LIVE_ENABLED) return report('live_disabled');
  if (cfg.mode === 'live') {
    const refused = checkLiveAuthorization(cfg, env);
    if (refused) return report(refused.stop, refused.detail);
    // A stale freeze can never authorize a live run (freeze CI is non-required).
    const stale = (await import('./freezeCheck')).staleFreeze();
    if (stale) return report('config_mismatch', `freeze stale: ${stale}`);
  }
  if (configHash(cfg.currentMonth) !== cfg.expectedConfigHash) return report('config_mismatch');
  if (cfg.budgetUsd > APPROVED_CAPS.cumulativeBudgetUsd || cfg.maxAttempts > APPROVED_CAPS.cumulativeAttempts
    || (cfg.stage === 'A2.0' && (cfg.maxAttempts > APPROVED_CAPS.a20Attempts || cfg.fixtures.length * cfg.runsPerFixture + cfg.maxRetries > APPROVED_CAPS.a20Attempts))) {
    return report('config_mismatch', 'config exceeds the owner-approved caps');
  }

  const release = acquireLock(cfg.ledgerPath);
  if (!release) return report('locked', `${cfg.ledgerPath}.lock exists (another runner, or a crash: operator must inspect)`);
  try {
    return await runLocked(cfg, key, report);
  } finally {
    release();
  }
}

async function runLocked(cfg: RunConfig, key: (f: A2Fixture, run: number) => string, report: (s: RunReport['stop'], d?: string) => RunReport): Promise<RunReport> {
  const durableStop = (reason: Stop, attempt?: number, detail?: string): RunReport => {
    try { appendLedger(cfg.ledgerPath, { t: 'stopped', reason, attempt, at: new Date().toISOString() }); }
    catch (e) { return report('ledger_write_failed', `${reason}; stop record not written: ${(e as Error).message}`); }
    return report(reason, detail);
  };

  let records: LedgerRecord[];
  try { records = readLedger(cfg.ledgerPath); } catch (e) { return report('ledger_corrupt', (e as Error).message); }
  const s0 = ledgerState(records);
  if (s0.openAttempts.length) return report('ledger_unresolved', `open attempts: ${s0.openAttempts.join(',')}`);
  if (s0.stopped) return report('stopped_requires_resume', `last stop: ${s0.stopped}`);

  const stageOf = new Map(records.filter((r) => r.t === 'reserved').map((r) => [(r as { attempt: number }).attempt, (r as { stage: string }).stage]));
  // Every re-send of a run (any settlement that does not complete it) uses a retry.
  let retriesUsed = records.filter((r) => r.t === 'settled' && !RUN_DONE.has(r.outcome) && stageOf.get(r.attempt) === cfg.stage).length;
  const retriesLeft = cfg.maxRetries - retriesUsed;
  if (retriesLeft < 0) return report('retries_exhausted', 'stage retry allowance already used');

  // Protocol v3: round-robin — run k of every fixture before run k+1.
  const left = Array.from({ length: cfg.runsPerFixture }, (_, i) => i + 1)
    .flatMap((run) => cfg.fixtures.map((f) => ({ f, run })))
    .filter(({ f, run }) => !s0.done.has(key(f, run)));
  // Preflight: the whole remaining plan must fit both cumulative caps. No partial pilots.
  const worst = left.reduce((s, { f }) => s + reservationUsd(inputBytes(buildRequest(f, cfg.currentMonth).body)), 0)
    + planWorstCaseUsd(cfg.fixtures, 0, retriesLeft, cfg.currentMonth);
  if (s0.spentUsd + worst > cfg.budgetUsd + 1e-12) {
    return report('plan_exceeds_budget', `worst case ${worst.toFixed(4)} USD > remaining ${(cfg.budgetUsd - s0.spentUsd).toFixed(4)} USD`);
  }
  if (s0.attempts + left.length + retriesLeft > cfg.maxAttempts) return report('attempts_exhausted', 'plan exceeds the cumulative attempt ceiling');

  const soft: SoftStops | null = cfg.softStops === undefined ? SOFT_STOPS : cfg.softStops;
  const checkpoints: Checkpoints | null = cfg.checkpoints === undefined ? PROTOCOL_CHECKPOINTS : cfg.checkpoints;

  /** Soft stops and checkpoints, evaluated on the durable ledger after each settlement. */
  const afterSettle = (attempt: number, run: number, isLastItem: boolean, callUsd?: number, outputTokens?: number): RunReport | null => {
    const recs = readLedger(cfg.ledgerPath);
    const mine = recs.filter((r) => (r.t === 'settled' && stageOf.get(r.attempt) === cfg.stage));
    const settled = mine as Extract<LedgerRecord, { t: 'settled' }>[];
    const last = settled[settled.length - 1];
    if (soft) {
      if (callUsd !== undefined && callUsd > soft.perCallUsd) return durableStop('soft_stop_call_cost', attempt);
      if (outputTokens !== undefined && outputTokens > soft.maxOutputTokensPerCall) return durableStop('soft_stop_output_tokens', attempt);
      // Usage-reported spend only: reservation-charged outcomes (retryable HTTP, unknown) have no reported usage and are bounded by the hard ceiling instead.
      const reported = settled.reduce((s, r) => s + (r.inputTokens !== undefined && r.outputTokens !== undefined ? usd(r.inputTokens, r.outputTokens) : 0), 0);
      if (reported > soft.stageActualUsd) return durableStop('soft_stop_stage_spend', attempt);
      if (settled.filter((r) => r.outcome === 'invalid_output').length >= soft.maxInvalidOutputs) return durableStop('soft_stop_invalid_outputs', attempt);
      let streak = 0;
      for (let i = settled.length - 1; i >= 0 && settled[i].outcome !== 'ok'; i--) streak++;
      if (streak >= soft.maxConsecutiveNonOk) return durableStop('soft_stop_consecutive_failures', attempt);
    }
    if (checkpoints && !(isLastItem && RUN_DONE.has(last.outcome))) {
      const calls = recs.filter((r) => r.t === 'reserved' && r.stage === cfg.stage).length;
      const st = ledgerState(recs);
      const firstRoundJustDone = checkpoints.afterFirstRound && run === 1 && RUN_DONE.has(last.outcome)
        && cfg.fixtures.every((f) => st.done.has(key(f, 1)));
      if ((checkpoints.afterCalls as readonly number[]).includes(calls) || firstRoundJustDone) return durableStop('checkpoint', attempt, `call ${calls}`);
    }
    return null;
  };

  for (const [idx, { f, run }] of left.entries()) {
    const isLastItem = idx === left.length - 1;
    for (;;) {
      let state: ReturnType<typeof ledgerState>;
      let current: LedgerRecord[];
      try { current = readLedger(cfg.ledgerPath); state = ledgerState(current); } catch (e) { return report('ledger_corrupt', (e as Error).message); }
      if (state.attempts >= cfg.maxAttempts) return report('attempts_exhausted');
      const { url, body } = buildRequest(f, cfg.currentMonth);
      if (url !== ALLOWED_URL) return report('config_mismatch', 'endpoint not allowlisted');
      const bytes = inputBytes(body);
      const reservation = reservationUsd(bytes);
      if (state.spentUsd + reservation > cfg.budgetUsd + 1e-12) return report('budget_exhausted');
      const attempt = state.attempts + 1;
      // Model version pinned by the owner, else by the first ACCEPTED (ok / invalid_output) settlement on this ledger.
      const pinned = cfg.expectedModelVersion
        ?? (current.find((r) => r.t === 'settled' && r.modelVersion && RUN_DONE.has(r.outcome)) as Extract<LedgerRecord, { t: 'settled' }> | undefined)?.modelVersion;
      try {
        appendLedger(cfg.ledgerPath, { t: 'reserved', stage: cfg.stage, attempt, fixture: f.id, run, reservationUsd: reservation, at: new Date().toISOString() });
      } catch (e) { return report('ledger_write_failed', (e as Error).message); }
      stageOf.set(attempt, cfg.stage);

      const settle = (rec: Omit<Extract<LedgerRecord, { t: 'settled' }>, 't' | 'attempt' | 'at'>): RunReport | null => {
        try { appendLedger(cfg.ledgerPath, { t: 'settled', attempt, at: new Date().toISOString(), ...rec }); return null; }
        catch (e) { return report('ledger_write_failed', (e as Error).message); }
      };

      const started = Date.now();
      let res: { status: number; json: unknown };
      try {
        res = await cfg.transport.send(url, body, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      } catch {
        return settle({ outcome: 'unknown', chargedUsd: reservation }) ?? durableStop('unknown_outcome', attempt);
      }
      const latencyMs = Date.now() - started;

      if (res.status === 429 || res.status === 500 || res.status === 503) {
        // Docs: 400/500 errors are not charged; still counted at full reservation (conservative).
        const err = settle({ outcome: 'http_retryable', chargedUsd: reservation, latencyMs }) ?? afterSettle(attempt, run, isLastItem);
        if (err) return err;
        if (++retriesUsed > cfg.maxRetries) return durableStop('retries_exhausted', attempt);
        continue;
      }
      if (res.status !== 200) return settle({ outcome: 'http_rejected', chargedUsd: reservation, latencyMs }) ?? durableStop('provider_rejected', attempt, `HTTP ${res.status}`);

      const um = (res.json as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number; cachedContentTokenCount?: number; totalTokenCount?: number } })?.usageMetadata;
      const usable = !!um && typeof um.promptTokenCount === 'number' && typeof um.candidatesTokenCount === 'number';
      // Thinking tokens are billed as output: count candidates + thoughts exactly once.
      const outputTokens = usable ? um!.candidatesTokenCount! + (um!.thoughtsTokenCount ?? 0) : undefined;
      const inputTokens = usable ? um!.promptTokenCount! + (um!.toolUsePromptTokenCount ?? 0) : undefined;
      const actual = usable ? usd(inputTokens!, outputTokens!) : undefined;
      // totalTokenCount = prompt + tool-use prompt + thoughts + candidates (generate-content reference).
      const totalMismatch = usable && typeof um!.totalTokenCount === 'number' && um!.totalTokenCount !== inputTokens! + outputTokens!;
      // A cached/tool dimension means the request was not what we sent: never expected for this plan.
      const unexpectedDimension = usable && ((um!.cachedContentTokenCount ?? 0) > 0 || (um!.toolUsePromptTokenCount ?? 0) > 0);
      const mismatch = usable && (totalMismatch || unexpectedDimension || actual! > reservation + 1e-12 || outputTokens! > MODEL_OUTPUT_LIMIT || inputTokens! > inputTokenBound(bytes));
      const charged = !usable ? reservation : mismatch ? Math.max(actual!, reservation) : actual!;

      // HTTP 200 is not success: classify exactly as production would.
      const cls = classifyResponse(res.json);
      const mv = (res.json as { modelVersion?: unknown } | null)?.modelVersion;
      const modelVersion = typeof mv === 'string' && mv ? mv : undefined;
      // Owner pin: exact equality only. Otherwise the analyze model prefix and, once pinned, equality.
      const modelOk = !!modelVersion && (cfg.expectedModelVersion
        ? modelVersion === cfg.expectedModelVersion
        : modelVersion.startsWith(GEMINI_ANALYZE_MODEL) && (!pinned || modelVersion === pinned));

      // Artifact first: a run only counts as done once its response is durably captured.
      let artifactSha256: string;
      try { artifactSha256 = cfg.writeArtifact({ attempt, stage: cfg.stage, fixture: f.id, run, response: res.json }); }
      catch (e) {
        return settle({ outcome: 'artifact_failed', chargedUsd: charged, latencyMs }) ?? durableStop('artifact_write_failed', attempt, (e as Error).message);
      }
      const outcome: SettledOutcome = !modelOk ? 'model_mismatch' : 'reason' in cls ? 'invalid_output' : 'ok';
      const err = settle({
        outcome, chargedUsd: charged, inputTokens, outputTokens,
        exceededMaxOutputTokens: usable && outputTokens! > MAX_OUTPUT_TOKENS ? true : undefined, latencyMs, artifactSha256,
        ...('reason' in cls ? { invalidReason: cls.reason } : { matchScore: cls.matchScore }), modelVersion,
      });
      if (err) return err;
      if (!usable) return durableStop('accounting_uncertain', attempt, 'usageMetadata missing');
      if (mismatch) return durableStop('accounting_mismatch', attempt);
      if (!modelOk) return durableStop('model_mismatch', attempt, modelVersion ? `got ${modelVersion}, expected ${pinned ?? GEMINI_ANALYZE_MODEL}` : 'modelVersion missing');
      const next = afterSettle(attempt, run, isLastItem, actual, outputTokens);
      if (next) return next;
      break;
    }
  }
  return report('completed');
}
