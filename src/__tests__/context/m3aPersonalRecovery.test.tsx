// @vitest-environment jsdom
// M3-A Phase 1: per-CV request keys, server-saved rows, recovery by key after
// a request got no HTTP answer, truthful copy on quota_settlement_unknown.
// Harness copied from m2d2PersonalRun.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';

const T = vi.hoisted(() => ({
  aiErrorAuthRequired: 'AUTH', aiErrorAccountLocked: 'LOCKED', aiErrorInputTooLarge: 'TOO_LARGE {max}',
  aiErrorRateLimited: 'RATE', aiErrorBusy: 'BUSY', aiErrorTimeout: 'TIMEOUT', aiErrorDuplicateRequest: 'DUP', aiErrorQuotaUnavailable: 'QUOTA_UNAVAILABLE', aiErrorInvalidOutput: 'INVALID_RELEASED', aiErrorInvalidOutputUnconfirmed: 'INVALID_UNCONFIRMED', monthlyUsageLimitExceeded: 'MONTHLY',
  analysisResultMaybeSaving: 'MAYBE_SAVING', analysisSettlementUnknownPersonal: 'SETTLEMENT_UNKNOWN',
}));
const mocks = vi.hoisted(() => ({
  analyzeCV: vi.fn(),
  parseCV: vi.fn(),
  rewriteFullCV: vi.fn(),
  processFile: vi.fn(),
  saveToHistory: vi.fn(),
  updateHistoryField: vi.fn(),
  getUserHistory: vi.fn(),
  cleanupTempAnalysisFiles: vi.fn(),
  checkAnalyticsQuota: vi.fn(),
  trackEvent: vi.fn(),
  setError: vi.fn(),
  resolveToFile: vi.fn(),
  waitForSavedAnalysis: vi.fn(),
  plan: 'pro' as string,
}));

vi.mock('../../services/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ai')>();
  return {
    ...actual,
    analyzeCV: mocks.analyzeCV,
    parseCV: mocks.parseCV,
    rewriteFullCV: mocks.rewriteFullCV,
  };
});

vi.mock('../../services/historyService', () => ({
  saveToHistory: mocks.saveToHistory,
  updateHistoryField: mocks.updateHistoryField,
  getUserHistory: mocks.getUserHistory,
  waitForSavedAnalysis: mocks.waitForSavedAnalysis,
  deleteFromHistory: vi.fn(),
  clearUserHistory: vi.fn(),
  rateAnalysis: vi.fn(),
}));

vi.mock('../../services/cvService', () => ({
  isStoredCVRef: (f: { _storedRef?: boolean }) => f?._storedRef === true,
  resolveToFile: mocks.resolveToFile,
  makeStoredCVRef: vi.fn(),
  downloadCVFromStorage: vi.fn(),
  cleanupTempAnalysisFiles: mocks.cleanupTempAnalysisFiles,
}));

vi.mock('../../hooks/useFileProcessor', () => ({
  cleanText: (s: string) => s,
  processFile: mocks.processFile,
}));

vi.mock('../../hooks/useProgressSimulator', () => ({
  createProgressSimulator: () => ({ stop: vi.fn() }),
}));

vi.mock('../../services/analyticsQuotaService', () => ({
  checkAnalyticsQuota: mocks.checkAnalyticsQuota,
}));

vi.mock('../../lib/ga4', () => ({ trackEvent: mocks.trackEvent }));

vi.mock('../../lib/sentry', () => ({ captureException: vi.fn() }));

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ reportLanguage: 'en', t: T, navigateToUpgrade: vi.fn() }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    userProfile: { role: 'user' },
    get effectivePlan() { return mocks.plan; },
    setError: mocks.setError,
    refreshUserProfile: vi.fn(),
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })),
    },
  },
}));

import { AiRequestError } from '../../services/ai';
import { AnalysisRunProvider, useAnalysisRun } from '../../context/analysis/AnalysisRunContext';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const PARSED = { personal_information: { full_name: 'T' } } as unknown as ParsedCV;
const makeResult = (id: string) => ({ id, timestamp: 1, matchScore: 80, userId: 'u1' }) as unknown as AnalysisResult;
const file = (name: string) => new File(['cv'], name, { type: 'text/plain' });

function setup(files: (File | object)[] = [file('cv.txt')], jd = 'Senior Data Analyst') {
  const wrapper = ({ children }: { children: React.ReactNode }) => <AnalysisRunProvider>{children}</AnalysisRunProvider>;
  const { result } = renderHook(() => useAnalysisRun(), { wrapper });
  act(() => {
    result.current.setJd(jd);
    result.current.setCvInputMode('file');
    result.current.setFiles(files as File[]);
  });
  return result;
}
const analyzeOnce = async (result: ReturnType<typeof setup>) => {
  await act(async () => { await result.current.handleAnalyze(); });
};
/** Last banner passed to setError, rendered to text (it may be a ReactNode). */
function lastBanner(): string {
  const node = mocks.setError.mock.calls.at(-1)?.[0];
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const { container, unmount } = render(<>{node}</>);
  const text = container.textContent ?? '';
  unmount();
  return text;
}
const savedIds = () => mocks.saveToHistory.mock.calls.map((c) => (c[0] as AnalysisResult[]).map((r) => r.id));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processFile.mockResolvedValue({ data: 'CV text', mimeType: 'text/plain' });
  mocks.checkAnalyticsQuota.mockResolvedValue({ allowed: true });
  mocks.saveToHistory.mockResolvedValue(undefined);
  mocks.updateHistoryField.mockResolvedValue(undefined);
  mocks.getUserHistory.mockResolvedValue([]);
  mocks.rewriteFullCV.mockResolvedValue({ fullRewrittenCV: '', fidelityFallback: true });
  mocks.cleanupTempAnalysisFiles.mockResolvedValue(undefined);
  mocks.parseCV.mockResolvedValue(PARSED);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyOf = (call: unknown[]) => call[10] as string;
const keys = () => mocks.analyzeCV.mock.calls.map(keyOf);

describe('M3-A request keys', () => {
  it('batch: one distinct UUID key per CV', async () => {
    mocks.analyzeCV.mockImplementation(async (...a: unknown[]) => makeResult(keyOf(a)));
    const result = setup([file('a.txt'), file('b.txt'), file('c.txt')]);
    await analyzeOnce(result);
    expect(keys()).toHaveLength(3);
    for (const k of keys()) expect(k).toMatch(UUID);
    expect(new Set(keys()).size).toBe(3);
  });

  it('pasted text: the key is passed too', async () => {
    mocks.analyzeCV.mockImplementation(async (...a: unknown[]) => makeResult(keyOf(a)));
    const result = setup();
    act(() => { result.current.setCvInputMode('text'); result.current.setCvText('pasted cv'); });
    await analyzeOnce(result);
    expect(keys()[0]).toMatch(UUID);
  });

  it('a new run (after a definitive failure) mints a new key', async () => {
    mocks.analyzeCV.mockRejectedValueOnce(new AiRequestError('x', 500, false, {}));
    const result = setup();
    await analyzeOnce(result);
    mocks.analyzeCV.mockResolvedValueOnce(makeResult('r2'));
    await analyzeOnce(result);
    expect(keys()).toHaveLength(2);
    expect(keys()[0]).not.toBe(keys()[1]);
    expect(mocks.waitForSavedAnalysis).not.toHaveBeenCalled();
  });

  it('double click in one tab still sends one request', async () => {
    const d = deferred<AnalysisResult>();
    mocks.analyzeCV.mockReturnValue(d.promise);
    const result = setup();
    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = result.current.handleAnalyze(); b = result.current.handleAnalyze(); });
    await act(async () => { d.resolve(makeResult('r1')); await a; await b; });
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });
});

describe('M3-A serverSave = saved', () => {
  it('browser upsert fails: no "not saved" banner, row usable, serverSave not leaked into state', async () => {
    const parse = deferred<ParsedCV>();
    mocks.parseCV.mockReturnValue(parse.promise);
    mocks.analyzeCV.mockResolvedValue({ ...makeResult('k1'), serverSave: 'saved' });
    mocks.saveToHistory.mockRejectedValue(new Error('upsert failed'));
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(lastBanner()).not.toContain('could not be saved');
    expect(result.current.results[0]).not.toHaveProperty('serverSave');
    expect(mocks.saveToHistory.mock.calls[0][0][0]).not.toHaveProperty('serverSave');
    await act(async () => { parse.resolve(PARSED); });
    await waitFor(() => expect(mocks.updateHistoryField).toHaveBeenCalledWith('u1', 'k1', { parsed_cv: PARSED }));
  });

  it('serverSave failed + browser upsert fails: existing "not saved" banner unchanged', async () => {
    mocks.analyzeCV.mockResolvedValue({ ...makeResult('k1'), serverSave: 'failed' });
    mocks.saveToHistory.mockRejectedValueOnce(new Error('upsert failed'));
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('could not be saved to history'));
  });
});

describe('M3-A recovery after no HTTP answer', () => {
  it.each([
    ['network drop', new TypeError('Failed to fetch')],
    ['client timeout', Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })],
    ['unreadable 200 body', new SyntaxError('Unexpected end of JSON input')],
  ])('%s: found by key → normal success path, exactly one /api/analyze', async (_l, err) => {
    mocks.analyzeCV.mockRejectedValue(err);
    mocks.waitForSavedAnalysis.mockImplementation(async (_u: string, key: string) => makeResult(key));
    const result = setup();
    await analyzeOnce(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    const key = keys()[0];
    expect(mocks.waitForSavedAnalysis).toHaveBeenCalledWith('u1', key, expect.any(Number));
    expect(result.current.results.map((r) => r.id)).toEqual([key]);
    expect(result.current.results[0]).not.toHaveProperty('serverSave');
    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(lastBanner()).not.toContain('failed');
  });

  it('recovered result: temp files kept until parse settles, parse result still attaches', async () => {
    mocks.processFile.mockResolvedValue({ data: '', mimeType: 'application/pdf', pdfStoragePath: 'temp/u1/a.pdf' });
    const parse = deferred<ParsedCV>();
    mocks.parseCV.mockReturnValue(parse.promise);
    mocks.analyzeCV.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.waitForSavedAnalysis.mockImplementation(async (_u: string, key: string) => makeResult(key));
    const result = setup();
    await analyzeOnce(result);
    expect(result.current.results).toHaveLength(1);
    expect(mocks.cleanupTempAnalysisFiles).not.toHaveBeenCalled();
    await act(async () => { parse.resolve(PARSED); });
    await waitFor(() => expect(result.current.results[0].parsedCV).toEqual(PARSED));
    await waitFor(() => expect(mocks.cleanupTempAnalysisFiles).toHaveBeenCalledWith(['temp/u1/a.pdf']));
  });

  it('not found in the window: "may still be saving" copy, no automatic retry', async () => {
    mocks.analyzeCV.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.waitForSavedAnalysis.mockResolvedValue(undefined);
    const result = setup();
    await analyzeOnce(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.setError).toHaveBeenLastCalledWith('MAYBE_SAVING');
    expect(result.current.results).toHaveLength(0);
  });

  it('batch: one dropped CV recovers, the others are unaffected', async () => {
    let n = 0;
    mocks.analyzeCV.mockImplementation(async (...a: unknown[]) => { if (++n === 2) throw new TypeError('drop'); return makeResult(keyOf(a)); });
    mocks.waitForSavedAnalysis.mockImplementation(async (_u: string, key: string) => makeResult(key));
    const result = setup([file('a.txt'), file('b.txt'), file('c.txt')]);
    await analyzeOnce(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(3);
    expect(mocks.waitForSavedAnalysis).toHaveBeenCalledTimes(1);
    expect(result.current.results).toHaveLength(3);
  });
});

describe('M3-A HTTP answers are final (no lookup)', () => {
  it('quota_settlement_unknown: no lookup, truthful personal copy', async () => {
    mocks.analyzeCV.mockRejectedValue(new AiRequestError('x', 503, false, { code: 'quota_settlement_unknown' }));
    const result = setup();
    await analyzeOnce(result);
    expect(mocks.waitForSavedAnalysis).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith('SETTLEMENT_UNKNOWN');
  });

  it('quota_settlement_unknown in a batch item: truthful copy in the failure list', async () => {
    let n = 0;
    mocks.analyzeCV.mockImplementation(async () => {
      if (++n === 2) throw new AiRequestError('x', 503, false, { code: 'quota_settlement_unknown' });
      return makeResult(`r${n}`);
    });
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    expect(mocks.waitForSavedAnalysis).not.toHaveBeenCalled();
    await waitFor(() => expect(lastBanner()).toContain('b.txt'));
  });

  it.each([
    ['quota_settlement_unavailable', new AiRequestError('x', 503, true, { code: 'quota_settlement_unavailable' }), 'QUOTA_UNAVAILABLE'],
    ['duplicate 409', new AiRequestError('x', 409, false, { code: 'duplicate_request' }), 'DUP'],
    ['monthly limit 429', new AiRequestError('x', 429, false, { limit: 5 }), 'MONTHLY'],
  ])('%s: existing copy, no lookup', async (_l, err, copy) => {
    mocks.analyzeCV.mockRejectedValue(err);
    const result = setup();
    await analyzeOnce(result);
    expect(mocks.waitForSavedAnalysis).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(copy);
  });
});

describe('M3-B R0: 502 invalid_ai_output (personal)', () => {
  const invalid = (quotaReleased: boolean) =>
    new AiRequestError('server copy', 502, false, { code: 'invalid_ai_output', quotaReleased, retryable: false });

  it.each([[true, 'INVALID_RELEASED'], [false, 'INVALID_UNCONFIRMED']])(
    'quotaReleased=%s: final HTTP answer — no history save, no recovery lookup, copy %s', async (released, copy) => {
      mocks.analyzeCV.mockRejectedValueOnce(invalid(released));
      const result = setup();
      await analyzeOnce(result);
      expect(mocks.saveToHistory).not.toHaveBeenCalled();
      expect(mocks.waitForSavedAnalysis).not.toHaveBeenCalled();
      expect(mocks.analyzeCV).toHaveBeenCalledTimes(1); // no automatic retry
      expect(lastBanner()).toContain(copy);
    });

  it('mixed batch: only the valid result is saved; the invalid one cannot be restored by a fallback save', async () => {
    mocks.analyzeCV
      .mockImplementationOnce(async (...a: unknown[]) => makeResult(keyOf(a)))
      .mockRejectedValueOnce(invalid(true));
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    const ids = savedIds().flat();
    expect(ids).toEqual([keys()[0]]);
    expect(ids).not.toContain(keys()[1]);
  });

  it('KNOWN DEBT: a lost 502 (no HTTP answer reaches the browser) looks like any lost response — "may still be saving"', async () => {
    mocks.analyzeCV.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mocks.waitForSavedAnalysis.mockResolvedValueOnce(null);
    const result = setup();
    await analyzeOnce(result);
    expect(mocks.waitForSavedAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.saveToHistory).not.toHaveBeenCalled();
    expect(lastBanner()).toContain('MAYBE_SAVING');
  });
});
