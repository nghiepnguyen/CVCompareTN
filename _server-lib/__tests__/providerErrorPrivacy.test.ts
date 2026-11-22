// SEC-2: provider error text from parse-cv and Full CV rewrite must not reach API bodies,
// console output, analysis_log or Sentry, while status/category/retryable stay as before.
// Gemini is a mock; Sentry goes to a 127.0.0.1 collector only.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startCollector } from '../../src/lib/__tests__/sentryCollector.js';

const gemini = vi.hoisted(() => ({ generateContent: vi.fn() }));
const logAttempt = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/geminiClient.js')>()),
  getGeminiClient: () => ({ models: { generateContent: gemini.generateContent } }),
}));
vi.mock('../analysisLog.js', () => ({ logAnalysisAttempt: logAttempt }));
vi.mock('../quota/monthlyQuota.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quota/monthlyQuota.js')>()),
  reserveMonthlyQuota: async () => ({ status: 'reserved', reservationId: 'res-1' }),
  commitMonthlyQuota: async () => 'committed',
  releaseMonthlyQuota: async () => true,
}));
vi.mock('../rateLimit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rateLimit.js')>()),
  reserveAiCall: async () => 'ok',
}));
vi.mock('../accountLock.js', () => ({ getAccountProfile: async () => ({ plan: 'free', role: 'user', has_permission: true }), checkAiAccess: async () => 'ok', getAiAccess: async () => ({ access: 'ok', plan: 'free' }), checkHourlyAiLimit: async () => 'ok', isLockedProfile: () => false, getEffectivePlan: () => 'free' }));
vi.mock('../payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'u1' }),
  getSupabaseAdmin: () => ({
    from: () => {
      const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: async () => ({ data: { plan: 'free', role: 'user' } }) };
      return query;
    },
    rpc: () => ({ abortSignal: async () => ({ data: { allowed: true }, error: null }) }),
  }),
}));

import { ControlledError, MIN_GEMINI_BUDGET_MS } from '../deadline.js';
import { generateParsedCV } from '../ai/parseCvService.js';
import { generateFullRewrite } from '../ai/rewriteService.js';
import { handleParseCv } from '../parseCv/handler.js';
import { handleRewriteCv } from '../rewriteCv/handler.js';

// Plain prose: nothing a pattern (email, phone, token) could catch.
const PROSE = 'Hoa Sen Sec2 project lead at Quiet Harbor Ltd';
const PROSE_RE = /Hoa Sen|Quiet Harbor/;
const body = { jd: 'JD fixture', cvData: 'CV fixture text', cvMimeType: 'text/plain' };
const withStatus = (status: number, message = `provider said: ${PROSE}`) => Object.assign(new Error(message), { status });

type Case = { name: string; reject?: () => unknown; resolveText?: string; status: number; retryable: boolean; category: string; kind: 'error' | 'busy' | 'timeout' };
const CASES: Case[] = [
  { name: 'Error with CV prose', reject: () => new Error(`provider echoed: ${PROSE}`), status: 500, retryable: false, category: 'gemini_error', kind: 'error' },
  { name: 'non-Error rejection', reject: () => ({ message: `provider echoed: ${PROSE}`, details: PROSE }), status: 500, retryable: false, category: 'gemini_error', kind: 'error' },
  { name: 'provider 429', reject: () => withStatus(429), status: 503, retryable: true, category: 'gemini_rate_limited', kind: 'busy' },
  { name: 'provider 503', reject: () => withStatus(503), status: 503, retryable: true, category: 'gemini_unavailable', kind: 'busy' },
  { name: 'provider 504 DEADLINE_EXCEEDED', reject: () => withStatus(504, `DEADLINE_EXCEEDED ${PROSE}`), status: 504, retryable: true, category: 'gemini_timeout', kind: 'timeout' },
  { name: 'provider 504 without deadline text', reject: () => withStatus(504), status: 503, retryable: true, category: 'gemini_unavailable', kind: 'busy' },
  { name: 'local timeout message', reject: () => new Error(`${PROSE} (Timeout)`), status: 504, retryable: true, category: 'gemini_timeout', kind: 'timeout' },
  { name: 'existing ControlledError', reject: () => new ControlledError('request_budget_exhausted'), status: 504, retryable: true, category: 'request_budget_exhausted', kind: 'timeout' },
  { name: 'malformed AI JSON', resolveText: `note {"name": "${PROSE}" broken}`, status: 500, retryable: false, category: 'gemini_error', kind: 'error' },
];
const HANDLERS = [['parse-cv', handleParseCv, 'Không thể đọc thông tin CV. Vui lòng thử lại.'], ['rewrite', handleRewriteCv, 'Không thể viết lại CV. Vui lòng thử lại.']] as const;

function arrange(c: Case) {
  gemini.generateContent.mockReset();
  if (c.reject) gemini.generateContent.mockRejectedValue(c.reject());
  else gemini.generateContent.mockResolvedValue({ text: c.resolveText, usageMetadata: {}, candidates: [{ finishReason: 'STOP' }] });
}

const consoleCalls: unknown[][] = [];
let collector: Awaited<ReturnType<typeof startCollector>>;
let Sentry: typeof import('@sentry/node');

beforeAll(async () => {
  collector = await startCollector();
  expect(new URL(collector.dsn).hostname).toBe('127.0.0.1');
  vi.stubEnv('SENTRY_DSN', collector.dsn);
  vi.stubEnv('VERCEL_ENV', 'preview');
  const sentry = await import('../sentry.js');
  sentry.initSentryServer();
  Sentry = sentry.Sentry;
  // Record console arguments; the SDK's own console instrumentation still builds the breadcrumbs.
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      consoleCalls.push(args);
      original.apply(console, args); // the SDK-patched console: real breadcrumb path
    };
  }
});

afterEach(() => logAttempt.mockClear());

afterAll(async () => {
  vi.unstubAllEnvs();
  await collector.close();
});

describe.each(HANDLERS)('%s handler', (_route, handler, genericMessage) => {
  it.each(CASES)('$name: status, retryable, message and logged category unchanged', async (c) => {
    arrange(c);
    const result = await handler('Bearer fixture', body);
    const expectedMessage = c.kind === 'error' ? genericMessage : undefined;
    expect(result.status).toBe(c.status);
    expect(result.body.retryable).toBe(c.retryable);
    if (expectedMessage) expect(result.body.error).toBe(expectedMessage);
    expect(logAttempt).toHaveBeenCalledWith('u1', 'error', expect.any(String), `[${c.category}]`, c.category === 'request_budget_exhausted' ? undefined : { model: expect.any(String) }, undefined, expect.anything());
    expect(JSON.stringify(result.body)).not.toMatch(PROSE_RE);
  });

  it.each(CASES)('$name: no provider text in console output or analysis_log', async (c) => {
    arrange(c);
    consoleCalls.length = 0;
    await handler('Bearer fixture', body);
    const flat = consoleCalls.map((args) => args.map((a) => (a instanceof Error ? `${a.name}: ${a.message} ${a.stack}` : typeof a === 'object' ? JSON.stringify(a) : String(a))));
    expect(JSON.stringify(flat)).not.toMatch(PROSE_RE);
    expect(JSON.stringify(logAttempt.mock.calls)).not.toMatch(PROSE_RE);
  });
});

describe('service-level local timeout and abort', () => {
  afterEach(() => vi.useRealTimers());
  const budget = MIN_GEMINI_BUDGET_MS + 1_000;
  it.each([
    ['parse-cv', () => generateParsedCV(`CV ${PROSE}`, 'text/plain', 'vi', budget)],
    ['rewrite', () => generateFullRewrite('JD', `CV ${PROSE}`, 'text/plain', 'vi', budget)],
  ])('%s: never-answering provider ends as a fixed (Timeout) error', async (_name, run) => {
    vi.useFakeTimers();
    gemini.generateContent.mockReset().mockImplementation(({ config }: { config: { abortSignal: AbortSignal } }) => new Promise((_, reject) => {
      config.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error(`aborted while sending ${PROSE}`), { name: 'AbortError' })));
    }));
    const outcome = run().then(() => null, (err: unknown) => err);
    await vi.advanceTimersByTimeAsync(budget + 10);
    const err = (await outcome) as Error;
    expect(err.message).toMatch(/\(Timeout\)$/);
    expect(err.message).not.toMatch(PROSE_RE);
  });
});

describe('Sentry envelopes after every failure above', () => {
  it('carry console breadcrumbs from the handlers but none of the provider text', async () => {
    for (const [, handler] of HANDLERS) {
      for (const c of CASES) {
        arrange(c);
        await handler('Bearer fixture', body);
      }
    }
    Sentry.captureMessage('sec2_provider_probe');
    await Sentry.flush(5000);
    const probe = collector.items('event').find((e) => e.message === 'sec2_provider_probe');
    expect(probe).toBeDefined();
    expect(probe.breadcrumbs.filter((b: { category: string }) => b.category === 'console').length).toBeGreaterThan(0);
    expect(collector.raw()).not.toMatch(PROSE_RE);
  });
});
