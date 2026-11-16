// @vitest-environment jsdom
// M2-D2 regressions for M2-D1 F3 (retry failed only), F4 (truthful history
// persistence), K0 (client JD/CV cap) and F7 (stored-CV temp lifecycle).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';

const T = vi.hoisted(() => ({
  aiErrorAuthRequired: 'AUTH', aiErrorAccountLocked: 'LOCKED', aiErrorInputTooLarge: 'TOO_LARGE {max}',
  aiErrorRateLimited: 'RATE', aiErrorBusy: 'BUSY', aiErrorTimeout: 'TIMEOUT', aiErrorDuplicateRequest: 'DUP', aiErrorQuotaUnavailable: 'QUOTA_UNAVAILABLE', monthlyUsageLimitExceeded: 'MONTHLY',
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

import { AnalysisRunProvider, useAnalysisRun, REWRITE_CONCURRENCY } from '../../context/analysis/AnalysisRunContext';

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

describe('M2-D2 K0: client JD/CV cap before any parse', () => {
  it('JD over 50,000 chars: no processFile, parse or analyze; localized 413 message', async () => {
    const result = setup([file('a.txt'), file('b.txt'), file('c.txt')], 'x'.repeat(50_001));
    await analyzeOnce(result);
    expect(mocks.processFile).not.toHaveBeenCalled();
    expect(mocks.parseCV).not.toHaveBeenCalled();
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(mocks.checkAnalyticsQuota).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith('TOO_LARGE 50000');
  });

  it('JD exactly at the limit still runs, parse and analyze in parallel (3.14A unchanged)', async () => {
    const analyzeD = deferred<AnalysisResult>();
    mocks.analyzeCV.mockReturnValue(analyzeD.promise);
    const result = setup([file('a.txt')], 'x'.repeat(50_000));
    let run!: Promise<void>;
    act(() => { run = result.current.handleAnalyze(); });
    await waitFor(() => expect(mocks.parseCV).toHaveBeenCalledTimes(1));
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1); // both in flight before analyze resolves
    await act(async () => { analyzeD.resolve(makeResult('r1')); await run; });
  });

  it('pasted CV text over 100,000 chars is rejected before any request', async () => {
    const result = setup();
    act(() => { result.current.setCvInputMode('text'); result.current.setCvText('z'.repeat(100_001)); });
    await analyzeOnce(result);
    expect(mocks.parseCV).not.toHaveBeenCalled();
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith('TOO_LARGE 100000');
  });
});

describe('M2-D2 F4: success is claimed only after persistence', () => {
  it('partial failure + history save failure: no "saved" claim, nothing in sidebar history, retry save works without Gemini', async () => {
    let n = 0;
    mocks.analyzeCV.mockImplementation(async () => { if (++n === 2) throw new Error('x'); return makeResult(`r${n}`); });
    mocks.saveToHistory.mockRejectedValueOnce(new Error('upsert failed'));
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('could not be saved to history'));
    expect(lastBanner()).not.toContain('were saved');
    expect(result.current.history).toHaveLength(0);
    expect(result.current.results).toHaveLength(1);

    const node = mocks.setError.mock.calls.at(-1)?.[0];
    render(<>{node}</>);
    await act(async () => { screen.getByRole('button', { name: 'Retry save' }).click(); });
    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(savedIds()).toEqual([['r1'], ['r1']]); // same analysis id → upsert, no duplicate
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(2);
    expect(mocks.parseCV).toHaveBeenCalledTimes(2);
  });

  it('single CV, history save failure: the user is told it was not saved', async () => {
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    mocks.saveToHistory.mockRejectedValue(new Error('upsert failed'));
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('Analysis finished but could not be saved to history.'));
    expect(result.current.history).toHaveLength(0);
  });

  it('save succeeds: result enters history only after the upsert, no banner', async () => {
    const saveD = deferred<void>();
    mocks.saveToHistory.mockReturnValue(saveD.promise);
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    const result = setup();
    await analyzeOnce(result);
    expect(result.current.history).toHaveLength(0);
    await act(async () => { saveD.resolve(); });
    await waitFor(() => expect(result.current.history.map((h) => h.id)).toEqual(['r1']));
    expect(mocks.setError.mock.calls.every((c) => c[0] === null)).toBe(true);
  });

  it('partial failure with save OK keeps the "saved" message', async () => {
    let n = 0;
    mocks.analyzeCV.mockImplementation(async () => { if (++n === 1) throw new Error('x'); return makeResult(`r${n}`); });
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('The rest were saved.'));
  });

  it('Full CV is not written to a history row that was never saved', async () => {
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    mocks.saveToHistory.mockRejectedValue(new Error('upsert failed'));
    mocks.rewriteFullCV.mockResolvedValue({ fullRewrittenCV: '# CV', fidelityFallback: false });
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(result.current.results[0].fullRewrittenCV).toBe('# CV'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.updateHistoryField).not.toHaveBeenCalled();
  });

  it('Full CV arriving after a successful Retry save is persisted', async () => {
    const rewriteD = deferred<{ fullRewrittenCV: string; fidelityFallback: boolean }>();
    mocks.rewriteFullCV.mockReturnValue(rewriteD.promise);
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    mocks.saveToHistory.mockRejectedValueOnce(new Error('upsert failed')).mockResolvedValue(undefined);
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('could not be saved'));
    render(<>{mocks.setError.mock.calls.at(-1)?.[0]}</>);
    await act(async () => { screen.getByRole('button', { name: 'Retry save' }).click(); });
    await waitFor(() => expect(result.current.history).toHaveLength(1));
    await act(async () => { rewriteD.resolve({ fullRewrittenCV: '# CV', fidelityFallback: false }); });
    await waitFor(() => expect(mocks.updateHistoryField).toHaveBeenCalledWith('u1', 'r1', { full_rewritten_cv: '# CV' }));
  });

  it('pasted-text CV, history save failure: the user is told it was not saved', async () => {
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    mocks.saveToHistory.mockRejectedValue(new Error('upsert failed'));
    const result = setup();
    act(() => { result.current.setCvInputMode('text'); result.current.setCvText('CV text'); });
    await analyzeOnce(result);
    await waitFor(() => expect(lastBanner()).toContain('Analysis finished but could not be saved to history.'));
    expect(result.current.history).toHaveLength(0);
  });

  it('Full CV is written once the history row exists', async () => {
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    mocks.rewriteFullCV.mockResolvedValue({ fullRewrittenCV: '# CV', fidelityFallback: false });
    const result = setup();
    await analyzeOnce(result);
    await waitFor(() => expect(mocks.updateHistoryField).toHaveBeenCalledWith('u1', 'r1', { full_rewritten_cv: '# CV' }));
  });

  it('a late banner from an earlier run never overwrites a newer run', async () => {
    const saveD = deferred<void>();
    mocks.saveToHistory.mockReturnValueOnce(saveD.promise).mockResolvedValue(undefined);
    mocks.analyzeCV.mockResolvedValue(makeResult('r1'));
    const result = setup();
    await analyzeOnce(result);
    mocks.analyzeCV.mockResolvedValue(makeResult('r2'));
    await analyzeOnce(result);
    mocks.setError.mockClear();
    await act(async () => { saveD.reject(new Error('late failure')); });
    expect(mocks.setError).not.toHaveBeenCalled();
  });
});

describe('M2-D2 F3: re-run after a partial failure retries the failed CVs only', () => {
  const failSecond = () => {
    let n = 0;
    mocks.analyzeCV.mockImplementation(async () => { if (++n === 2) throw new Error('504'); return makeResult(`r${n}`); });
  };

  it('3 CVs, 1 fails: the re-run analyzes 1, asks quota for 1, saves 1, keeps 3 results', async () => {
    failSecond();
    const result = setup([file('a.txt'), file('b.txt'), file('c.txt')]);
    await analyzeOnce(result);
    await waitFor(() => expect(savedIds()).toHaveLength(1));
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(lastBanner()).toContain('re-run the failed CVs'));

    await analyzeOnce(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(4);
    expect(mocks.parseCV).toHaveBeenCalledTimes(4);
    expect(mocks.checkAnalyticsQuota.mock.calls.at(-1)?.[1]).toBe(1);
    expect(mocks.analyzeCV.mock.calls.at(-1)?.[3]).toBe('b.txt');
    await waitFor(() => expect(savedIds()).toEqual([['r1', 'r3'], ['r4']]));
    expect(result.current.results.map((r) => r.id).sort()).toEqual(['r1', 'r3', 'r4']);
    const historyIds = result.current.history.map((h) => h.id);
    expect(new Set(historyIds).size).toBe(historyIds.length);
  });

  it('after the retry succeeds, the next click is a full run again (deliberate re-analysis)', async () => {
    failSecond();
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result); // r1 ok, b fails
    await analyzeOnce(result); // retry b → r3
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(3);
    await analyzeOnce(result); // full run
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(5);
  });

  it('a changed JD runs every CV', async () => {
    failSecond();
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    act(() => { result.current.setJd('Another JD'); });
    await analyzeOnce(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(4);
  });

  it('a CV added after the failure runs together with the failed one, not the successes', async () => {
    failSecond();
    const a = file('a.txt'), b = file('b.txt');
    const result = setup([a, b]);
    await analyzeOnce(result);
    act(() => { result.current.setFiles([a, b, file('c.txt')]); });
    await analyzeOnce(result);
    expect(mocks.analyzeCV.mock.calls.slice(2).map((c) => c[3]).sort()).toEqual(['b.txt', 'c.txt']);
  });

  it('a double click on the retry starts one retry', async () => {
    failSecond();
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    let x!: Promise<void>, y!: Promise<void>;
    act(() => { x = result.current.handleAnalyze(); y = result.current.handleAnalyze(); });
    await act(async () => { await x; await y; });
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(3);
  });

  it('an earlier unsaved result is saved with the retry run, once', async () => {
    failSecond();
    mocks.saveToHistory.mockRejectedValueOnce(new Error('upsert failed'));
    const result = setup([file('a.txt'), file('b.txt')]);
    await analyzeOnce(result);
    await waitFor(() => expect(savedIds()).toHaveLength(1));
    await analyzeOnce(result);
    await waitFor(() => expect(savedIds()).toEqual([['r1'], ['r3', 'r1']]));
    await waitFor(() => expect(result.current.history.map((h) => h.id).sort()).toEqual(['r1', 'r3']));
  });
});

describe('M2-D2 F7: stored CV temp files are never reused after cleanup', () => {
  it('second run of a stored >2MB PDF re-processes it and sends a fresh temp path', async () => {
    mocks.analyzeCV.mockImplementation(async () => makeResult(crypto.randomUUID()));
    const stored = new File(['pdf'], 'big.pdf', { type: 'application/pdf' });
    mocks.resolveToFile.mockResolvedValue(stored);
    mocks.processFile.mockResolvedValue({ data: 'text', mimeType: 'text/plain', pdfStoragePath: 'temp/u1/second.pdf' });
    const ref = {
      _storedRef: true, name: 'big.pdf', size: 3e6, cvId: 'cv1', filePath: 'u1/cv1/big.pdf', fileType: 'application/pdf',
      eagerProcessing: Promise.resolve({ data: 'text', mimeType: 'text/plain', pdfStoragePath: 'temp/u1/first.pdf' }),
    };
    const result = setup([ref]);
    await analyzeOnce(result);
    await waitFor(() => expect(mocks.cleanupTempAnalysisFiles).toHaveBeenCalledWith(['temp/u1/first.pdf']));
    await analyzeOnce(result);
    expect(mocks.analyzeCV.mock.calls.map((c) => c[8])).toEqual(['temp/u1/first.pdf', 'temp/u1/second.pdf']);
    expect(mocks.resolveToFile).toHaveBeenCalledTimes(1);
    expect(mocks.processFile).toHaveBeenCalledWith(stored, 'u1');
    await waitFor(() => expect(mocks.cleanupTempAnalysisFiles).toHaveBeenCalledWith(['temp/u1/second.pdf']));
  });
});
