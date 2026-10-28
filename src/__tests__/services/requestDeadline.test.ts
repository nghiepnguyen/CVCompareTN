import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';

// Fake timers drive every deadline: no wall-clock waits. Real handlers,
// services and storage helpers; only Gemini, Supabase, R2 and unpdf are mocked.

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const extractText = vi.fn();
vi.mock('unpdf', () => ({ extractText: (...a: unknown[]) => extractText(...a) }));

const s3Send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(readonly input: unknown) {} }
  return {
    S3Client: class { send = (...a: unknown[]) => s3Send(...a); },
    GetObjectCommand: class GetObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    PutObjectCommand: Command, CopyObjectCommand: Command, DeleteObjectCommand: Command, ListObjectsV2Command: Command,
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

// Every signal handed to a mocked network call, to prove none is left running.
const signals: AbortSignal[] = [];
type Op = (signal?: AbortSignal) => Promise<unknown>;
const db: { insert: Op; rpc: (name: string, s?: AbortSignal) => Promise<unknown>; upload: Op; download: Op; profile: Op } = {} as never;
const inserts: Record<string, unknown>[] = [];
function builder(run: Op) {
  const b: Record<string, unknown> & { signal?: AbortSignal } = {};
  const exec = () => { if (b.signal) signals.push(b.signal); return run(b.signal); };
  Object.assign(b, {
    select: () => b, eq: () => b,
    abortSignal: (s: AbortSignal) => { b.signal = s; return b; },
    maybeSingle: () => exec(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej),
  });
  return b;
}
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'user-1' }),
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === 'analysis_log'
        ? { insert: (row: Record<string, unknown>) => { inserts.push(row); return builder((s) => db.insert(s)); } }
        : table === 'storage_uploads' ? builder((s) => db.upload(s)) : builder((s) => db.profile(s)),
    rpc: (name: string) => builder((s) => db.rpc(name, s)),
    storage: { from: () => ({ download: (_p: string, _o: unknown, params?: { signal?: AbortSignal }) => {
      if (params?.signal) signals.push(params.signal);
      return db.download(params?.signal);
    } }) },
  }),
}));

import {
  createDeadline, ControlledError, POST_RESERVE_MS, STORAGE_REF_TIMEOUT_MS, TOTAL_BUDGET_MS,
} from '../../../_server-lib/deadline';
import { readObject } from '../../../_server-lib/storage/r2';
import { resolveStorageRef } from '../../../_server-lib/storage/tempFile';
import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import { handleRewriteCv } from '../../../_server-lib/rewriteCv/handler';
import { handleParseCv } from '../../../_server-lib/parseCv/handler';

// A call that never settles on its own: it only ends when its signal aborts.
const hang = (signal?: AbortSignal) =>
  new Promise((_, reject) => {
    if (signal) signals.push(signal);
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
const after = <T>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms));

const CV_TEXT = 'Nguyen Van Secret, secret.person@example.com, 0912 345 678. Data Analyst at Acme. Improved conversion by 20%.';
const JD = 'Need SQL and self-serve analytics. JD-SECRET-MARKER';
const STORAGE_KEY = 'user-1/secret-file-name.pdf';
const PROVIDER_ERROR = 'PROVIDER_RAW_DETAIL quota project 12345';
const SAFE_CV = '# Name\n\n## Experience\n- Improved conversion by 20%';
const UNSAFE_CV = '# Name\n\n## Experience\n- Improved conversion by 35%';
const reply = (body: unknown) => ({ text: JSON.stringify(body), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
const blob = (text: string) => ({ data: { arrayBuffer: async () => Buffer.from(text) }, error: null });

/** Runs a handler under fake timers; `elapsed` is the fake time at which it answered. */
async function run<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  let doneAt = NaN;
  const p = fn().finally(() => { doneAt = Date.now(); });
  await vi.advanceTimersByTimeAsync(TOTAL_BUDGET_MS + 30_000);
  const res = await p;
  return { res, elapsed: doneAt - t0 };
}
const lastRow = () => inserts.at(-1)!;
const noFixtureLeak = (row: unknown) => {
  const json = JSON.stringify(row);
  for (const leak of ['Secret', 'secret', '0912', 'example.com', 'JD-SECRET-MARKER', 'PROVIDER_RAW_DETAIL', 'Acme']) {
    expect(json).not.toContain(leak);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  signals.length = 0;
  inserts.length = 0;
  generateContent.mockReset();
  extractText.mockReset();
  s3Send.mockReset();
  db.insert = async () => ({ error: null });
  db.rpc = async (name) => ({ data: name === 'check_analytics_quota' ? { allowed: true } : null, error: null });
  db.profile = async () => ({ data: null });
  db.upload = async () => ({ data: null, error: null });
  db.download = async () => blob(CV_TEXT);
  process.env.R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'; process.env.R2_ACCESS_KEY_ID = 'k'; process.env.R2_SECRET_ACCESS_KEY = 's';
  process.env.R2_TEMP_BUCKET = 'temp'; process.env.R2_SAVED_BUCKET = 'saved';
  for (const m of ['info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('createDeadline', () => {
  it('remaining time decreases and reaches zero (never negative)', () => {
    const d = createDeadline(1000);
    vi.advanceTimersByTime(400);
    expect(d.remainingMs()).toBe(600);
    vi.advanceTimersByTime(5000);
    expect(d.remainingMs()).toBe(0);
    expect(d.isExpired()).toBe(true);
  });

  it('child is capped by the shorter of its cap and the parent', () => {
    const parent = createDeadline(10_000);
    expect(parent.child(3000).remainingMs()).toBe(3000);
    expect(parent.child(60_000).remainingMs()).toBe(10_000);
    expect(parent.reserve(4000).remainingMs()).toBe(6000);
    expect(parent.reserve(20_000).remainingMs()).toBe(0);
  });

  it('signal fires at min(cap, remaining)', () => {
    const d = createDeadline(10_000);
    const capped = d.signal(2000);
    const full = d.signal();
    vi.advanceTimersByTime(1999);
    expect(capped.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(capped.aborted).toBe(true);
    expect(full.aborted).toBe(false);
    vi.advanceTimersByTime(8000);
    expect(full.aborted).toBe(true);
    expect((full.reason as DOMException).name).toBe('TimeoutError');
  });

  it('an exhausted deadline yields an already-aborted signal', () => {
    const d = createDeadline(100);
    vi.advanceTimersByTime(100);
    expect(d.signal().aborted).toBe(true);
    expect(createDeadline(0).signal(5000).aborted).toBe(true);
  });
});

describe('storage cancellation', () => {
  it('R2 HEAD is aborted by the per-ref deadline', async () => {
    s3Send.mockImplementation((_cmd, opts) => hang(opts.abortSignal));
    const signal = createDeadline(STORAGE_REF_TIMEOUT_MS).signal();
    const p = readObject('temp', 'k', 1000, signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(STORAGE_REF_TIMEOUT_MS);
    expect((await p).name).toBe('TimeoutError');
    expect(s3Send.mock.calls[0][1].abortSignal).toBe(signal);
  });

  it('HEAD + GET share one 15s window (not 15s each)', async () => {
    s3Send.mockImplementation((cmd, opts) =>
      cmd.constructor.name === 'HeadObjectCommand' ? after(10_000, { ContentLength: 5, ETag: 'e' }) : hang(opts.abortSignal)
    );
    const t0 = Date.now();
    let doneAt = NaN;
    const signal = createDeadline(STORAGE_REF_TIMEOUT_MS).signal();
    const p = readObject('temp', 'k', 1000, signal).catch((e) => e).finally(() => { doneAt = Date.now(); });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(await p).toBeInstanceOf(Error);
    expect(s3Send).toHaveBeenCalledTimes(2);
    expect(s3Send.mock.calls[1][1].abortSignal).toBe(signal);
    // GET aborted 5s after HEAD finished: 15s for the whole ref, not 10s + 15s.
    expect(doneAt - t0).toBe(STORAGE_REF_TIMEOUT_MS);
  });

  it('a streaming body is destroyed on abort', async () => {
    const body = new PassThrough();
    const destroy = vi.spyOn(body, 'destroy');
    s3Send.mockImplementation((cmd) =>
      cmd.constructor.name === 'HeadObjectCommand' ? Promise.resolve({ ContentLength: 100, ETag: 'e' }) : Promise.resolve({ Body: body })
    );
    const signal = createDeadline(STORAGE_REF_TIMEOUT_MS).signal();
    const p = readObject('temp', 'k', 1000, signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    body.write(Buffer.alloc(10)); // partial body, then the stream stalls
    await vi.advanceTimersByTimeAsync(STORAGE_REF_TIMEOUT_MS);
    expect(await p).toBeInstanceOf(Error);
    expect(destroy).toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
  });

  it('R2 path: loadUpload gets the signal; a hang ends as storage_timeout at 15s', async () => {
    db.upload = hang;
    const t0 = Date.now();
    let doneAt = NaN;
    const p = resolveStorageRef('r2:11111111-1111-4111-8111-111111111111', 'user-1')
      .catch((e) => e)
      .finally(() => { doneAt = Date.now(); });
    await vi.advanceTimersByTimeAsync(30_000);
    const err = await p;
    expect(err).toBeInstanceOf(ControlledError);
    expect(err.message).toBe('[storage_timeout]');
    expect(signals[0].aborted).toBe(true);
    expect(doneAt - t0).toBe(STORAGE_REF_TIMEOUT_MS);
  });

  it('Supabase download gets the signal; a hang ends as storage_timeout', async () => {
    db.download = hang;
    const p = resolveStorageRef(STORAGE_KEY, 'user-1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(STORAGE_REF_TIMEOUT_MS);
    expect((await p).message).toBe('[storage_timeout]');
    expect(new Set(signals).size).toBe(1);
    expect(signals[0].aborted).toBe(true);
  });

  it('the parent deadline caps the per-ref window', async () => {
    db.download = hang;
    const p = resolveStorageRef(STORAGE_KEY, 'user-1', createDeadline(3000)).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await p).message).toBe('[storage_timeout]');
  });
});

describe('/api/analyze deadline', () => {
  const analyze = (body: Record<string, unknown> = {}) =>
    handleAnalyze('Bearer t', { jd: JD, cvData: CV_TEXT, cvMimeType: 'text/plain', language: 'en', ...body });

  it('slow storage ends in a controlled 504 well before the request deadline', async () => {
    db.download = hang;
    const { res, elapsed } = await run(() => analyze({ cvData: undefined, cvDataStoragePath: STORAGE_KEY }));
    expect(res.status).toBe(504);
    expect(elapsed).toBe(STORAGE_REF_TIMEOUT_MS);
    expect(lastRow().error_message).toBe('[storage_timeout]');
    expect(generateContent).not.toHaveBeenCalled();
    noFixtureLeak(lastRow());
  });

  it('storage failure → [storage_error] row without the raw provider message or key', async () => {
    db.download = async () => ({ data: null, error: { message: `${PROVIDER_ERROR} ${STORAGE_KEY}` } });
    const { res } = await run(() => analyze({ cvData: undefined, cvDataStoragePath: STORAGE_KEY }));
    expect(res.status).toBe(400);
    expect(lastRow().error_message).toBe('[storage_error]');
    noFixtureLeak(lastRow());
  });

  it('PDF extraction that eats the AI budget stops Gemini from starting', async () => {
    extractText.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50_000)); // unpdf cannot be cancelled
      return { text: CV_TEXT.repeat(3) };
    });
    const { res, elapsed } = await run(() => analyze({ cvData: Buffer.from('pdf').toString('base64'), cvMimeType: 'application/pdf' }));
    expect(generateContent).not.toHaveBeenCalled();
    expect(res.status).toBe(504);
    expect(lastRow().error_message).toBe('[request_budget_exhausted]');
    expect(lastRow().model).toBeNull(); // no model ran
    expect(elapsed).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
  });

  it('Gemini gets a real AbortSignal and is cut at the AI deadline', async () => {
    generateContent.mockImplementation((req) => hang(req.config.abortSignal));
    const { res, elapsed } = await run(() => analyze());
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
    expect(res.status).toBe(504);
    expect(lastRow()).toMatchObject({ status: 'error', error_message: '[gemini_timeout]', model: 'gemini-3-flash-preview' });
    expect(elapsed).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
    noFixtureLeak(lastRow());
  });

  it('Gemini provider error → [gemini_error] row, raw message not persisted', async () => {
    generateContent.mockRejectedValue(new Error(PROVIDER_ERROR));
    const { res } = await run(() => analyze());
    expect(res.status).toBe(500);
    expect(lastRow().error_message).toBe('[gemini_error]');
    noFixtureLeak(lastRow());
  });

  it('slow Gemini + hung quota increment + hung telemetry still return the result within 65s', async () => {
    generateContent.mockImplementation(() => after(TOTAL_BUDGET_MS - POST_RESERVE_MS - 2000, reply({ matchScore: 70, rewriteSuggestions: [] })));
    db.rpc = (name, s) => (name === 'increment_usage_count' ? hang(s) : Promise.resolve({ data: { allowed: true }, error: null }));
    db.insert = hang;
    const { res, elapsed } = await run(() => analyze());
    expect(res.status).toBe(200);
    expect(res.body.matchScore).toBe(70);
    expect(elapsed).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
    // Nothing is left running toward the platform ceiling.
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('telemetry failure does not replace a successful result', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70, rewriteSuggestions: [] }));
    db.insert = async () => { throw new Error('insert failed'); };
    const { res } = await run(() => analyze());
    expect(res.status).toBe(200);
  });
});

describe('/api/rewrite-cv deadline', () => {
  const rewrite = (body: Record<string, unknown> = {}) =>
    handleRewriteCv('Bearer t', { jd: JD, cvData: CV_TEXT, cvMimeType: 'text/plain', language: 'en', ...body });
  const aiWindow = TOTAL_BUDGET_MS - POST_RESERVE_MS;

  it('first Gemini call is cut at the AI deadline → [gemini_timeout] row', async () => {
    generateContent.mockImplementation((req) => hang(req.config.abortSignal));
    const { res, elapsed } = await run(() => rewrite());
    expect(res.status).toBe(504);
    expect(elapsed).toBe(aiWindow);
    expect(lastRow()).toMatchObject({ kind: 'rewrite', status: 'error', error_message: '[gemini_timeout]' });
    noFixtureLeak(lastRow());
  });

  it('retry budget is measured against the AI deadline, not the request deadline', async () => {
    // 41s in: 18s left on the AI deadline (< 20s) but 24s on the request one.
    generateContent.mockImplementationOnce(() => after(41_000, reply({ fullRewrittenCV: UNSAFE_CV })));
    const { res } = await run(() => rewrite());
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ fullRewrittenCV: '', fidelityFallback: true });
    expect(lastRow().guard_metrics).toMatchObject({ fullCv: { retryOutcome: 'skipped_budget', fidelityFallback: true, geminiCalls: 1 } });
  });

  it('a hung retry cannot eat the post reserve: safe fallback, logged, within 65s', async () => {
    generateContent
      .mockImplementationOnce(() => after(5000, reply({ fullRewrittenCV: UNSAFE_CV })))
      .mockImplementationOnce((req) => hang(req.config.abortSignal));
    const { res, elapsed } = await run(() => rewrite());
    expect(res).toEqual({ status: 200, body: { fullRewrittenCV: '', fidelityFallback: true } });
    expect(lastRow().guard_metrics).toMatchObject({ fullCv: { retryOutcome: 'error', geminiCalls: 2 } });
    expect(elapsed).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
  });

  it('a valid first pass is unchanged (Stage 3.3/3.4 behavior)', async () => {
    generateContent.mockResolvedValue(reply({ fullRewrittenCV: SAFE_CV }));
    const { res } = await run(() => rewrite());
    expect(res).toEqual({ status: 200, body: { fullRewrittenCV: SAFE_CV } });
    expect(lastRow().guard_metrics).toMatchObject({ fullCv: { firstPassValid: true, retryOutcome: 'not_needed', geminiCalls: 1 } });
  });

  it('storage failure → categorical [storage_error] row', async () => {
    db.download = async () => ({ data: null, error: { message: PROVIDER_ERROR } });
    const { res } = await run(() => rewrite({ cvData: undefined, cvDataStoragePath: STORAGE_KEY }));
    expect(res.status).toBe(400);
    expect(lastRow()).toMatchObject({ kind: 'rewrite', error_message: '[storage_error]' });
    noFixtureLeak(lastRow());
  });
});

describe('/api/parse-cv deadline', () => {
  const parse = (body: Record<string, unknown> = {}) =>
    handleParseCv('Bearer t', { jd: JD, cvData: CV_TEXT, cvMimeType: 'text/plain', language: 'en', ...body });

  it('storage is bounded → [storage_timeout] row', async () => {
    db.download = hang;
    const { res, elapsed } = await run(() => parse({ cvData: undefined, cvDataStoragePath: STORAGE_KEY }));
    expect(res.status).toBe(504);
    expect(elapsed).toBe(STORAGE_REF_TIMEOUT_MS);
    expect(lastRow()).toMatchObject({ kind: 'parse_cv', error_message: '[storage_timeout]' });
  });

  it('Gemini is bounded → [gemini_timeout] row', async () => {
    generateContent.mockImplementation((req) => hang(req.config.abortSignal));
    const { res, elapsed } = await run(() => parse());
    expect(res.status).toBe(504);
    expect(elapsed).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
    expect(lastRow()).toMatchObject({ kind: 'parse_cv', error_message: '[gemini_timeout]', model: 'gemini-3.5-flash-lite' });
  });

  it('Gemini error → [gemini_error] row without the raw provider message', async () => {
    generateContent.mockRejectedValue(new Error(PROVIDER_ERROR));
    const { res } = await run(() => parse());
    expect(res.status).toBe(500);
    expect(lastRow().error_message).toBe('[gemini_error]');
    noFixtureLeak(lastRow());
  });
});
