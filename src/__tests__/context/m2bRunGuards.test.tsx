// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';

const T = vi.hoisted(() => ({
  aiErrorAuthRequired: 'AUTH', aiErrorAccountLocked: 'LOCKED', aiErrorInputTooLarge: 'TOO_LARGE {max}',
  aiErrorRateLimited: 'RATE', aiErrorBusy: 'BUSY', aiErrorTimeout: 'TIMEOUT', monthlyUsageLimitExceeded: 'MONTHLY',
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
  isStoredCVRef: () => false,
  resolveToFile: vi.fn(),
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
import { AiRequestError } from '../../services/ai/analysisService';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const PARSED = {
  personal_information: { full_name: 'Test', contact: { email: '', phone: '', location: '' }, summary: '' },
  education: [],
  work_experience: [],
  skills: { technical_skills: [], soft_skills: [], hard_skills: [], tools_software: [], languages: [] },
  projects: [],
  certifications: [],
  ats_evaluation: { years_of_experience: 5 },
} as ParsedCV;

function makeResult(id: string): AnalysisResult {
  return {
    id,
    timestamp: 1,
    matchScore: 80,
    categoryScores: {},
    matchingPoints: [],
    missingGaps: [],
    successProbability: 'High',
    passProbability: 'High',
    passExplanation: '',
    probabilityVersion: 'canonical-score-v1',
    mainFactor: '',
    atsKeywords: [],
    rewriteSuggestions: [],
    detailedComparison: { skills: [], experience: [], tools: [], education: [], keywords: [] },
  } as unknown as AnalysisResult;
}

function file(name: string) {
  return new File(['cv'], name, { type: 'text/plain' });
}

function setup(files = [file('cv.txt')]) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AnalysisRunProvider>{children}</AnalysisRunProvider>
  );
  const { result } = renderHook(() => useAnalysisRun(), { wrapper });
  act(() => {
    result.current.setJd('Senior Data Analyst');
    result.current.setCvInputMode('file');
    result.current.setFiles(files);
  });
  return result;
}

function start(result: ReturnType<typeof setup>) {
  let run!: Promise<void>;
  act(() => {
    run = result.current.handleAnalyze();
  });
  return () => run;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processFile.mockResolvedValue({ data: 'CV text', mimeType: 'text/plain' });
  mocks.checkAnalyticsQuota.mockResolvedValue({ allowed: true });
  mocks.saveToHistory.mockResolvedValue(undefined);
  mocks.updateHistoryField.mockResolvedValue(undefined);
  mocks.getUserHistory.mockResolvedValue([]);
  // fidelityFallback avoids the unrelated Full CV history update.
  mocks.rewriteFullCV.mockResolvedValue({ fullRewrittenCV: '', fidelityFallback: true });
  mocks.cleanupTempAnalysisFiles.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});


// M2-B regression tests for M2-A P1-2 (double submit), P1-3 (rewrite fan-out)
// and P2-5 (typed, localized errors) in the personal analysis flow.
describe('M2-B analysis run guards', () => {
  it('a double click before the quota check resolves starts ONE run (was: two)', async () => {
    const quota = deferred<{ allowed: boolean }>();
    mocks.checkAnalyticsQuota.mockReturnValue(quota.promise);
    mocks.analyzeCV.mockImplementation(async () => makeResult(crypto.randomUUID()));
    mocks.parseCV.mockResolvedValue(PARSED);
    const result = setup();
    const a = start(result);
    const b = start(result);
    quota.resolve({ allowed: true });
    await act(async () => { await a(); await b(); });
    expect(mocks.checkAnalyticsQuota).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.parseCV).toHaveBeenCalledTimes(1);
  });

  it('the guard is released after a run, including an early return', async () => {
    mocks.analyzeCV.mockImplementation(async () => makeResult(crypto.randomUUID()));
    mocks.parseCV.mockResolvedValue(PARSED);
    mocks.checkAnalyticsQuota.mockResolvedValueOnce({ allowed: false });
    const result = setup();
    const blocked = start(result);
    await act(async () => { await blocked(); });
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    const run = start(result);
    await act(async () => { await run(); });
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });

  it('automatic Full CV rewrites run at most REWRITE_CONCURRENCY at once (was: 50)', async () => {
    mocks.plan = 'recruiter';
    let active = 0, peak = 0;
    mocks.analyzeCV.mockImplementation(async () => makeResult(crypto.randomUUID()));
    mocks.parseCV.mockResolvedValue(PARSED);
    const gates: Array<() => void> = [];
    mocks.rewriteFullCV.mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((r) => gates.push(r));
      active--;
      return { fullRewrittenCV: '', fidelityFallback: true };
    });
    const result = setup(Array.from({ length: 50 }, (_, i) => file(`cv${i}.txt`)));
    const run = start(result);
    await act(async () => { await run(); });
    await waitFor(() => expect(mocks.rewriteFullCV).toHaveBeenCalledTimes(REWRITE_CONCURRENCY));
    expect(peak).toBe(REWRITE_CONCURRENCY);
    // Drain: every queued rewrite still runs, never more than 5 in flight.
    while (gates.length || mocks.rewriteFullCV.mock.calls.length < 50) {
      await act(async () => { gates.splice(0).forEach((g) => g()); await Promise.resolve(); });
      await waitFor(() => expect(gates.length > 0 || mocks.rewriteFullCV.mock.calls.length === 50).toBe(true));
      if (mocks.rewriteFullCV.mock.calls.length === 50 && gates.length === 0) break;
    }
    expect(mocks.rewriteFullCV).toHaveBeenCalledTimes(50);
    expect(peak).toBe(REWRITE_CONCURRENCY);
    mocks.plan = 'pro';
  });

  it('a typed 503 failure surfaces the localized busy message', async () => {
    mocks.analyzeCV.mockRejectedValue(new AiRequestError('raw server text', 503, true, { retryable: true }));
    mocks.parseCV.mockResolvedValue(PARSED);
    const result = setup();
    const run = start(result);
    await act(async () => { await run(); });
    expect(mocks.setError).toHaveBeenLastCalledWith(T.aiErrorBusy);
  });
});
