// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';

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

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ reportLanguage: 'en', t: {}, navigateToUpgrade: vi.fn() }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    userProfile: { role: 'user' },
    effectivePlan: 'pro',
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

import { AnalysisRunProvider, useAnalysisRun } from '../../context/analysis/AnalysisRunContext';

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

describe('Stage 3.14A parse scheduling', () => {
  it('starts parse before analyze and attaches a parse-first result without a second request', async () => {
    const order: string[] = [];
    const analyzeD = deferred<AnalysisResult>();
    const parseD = deferred<ParsedCV>();
    mocks.analyzeCV.mockImplementation(() => {
      order.push('analyze');
      return analyzeD.promise;
    });
    mocks.parseCV.mockImplementation(() => {
      order.push('parse');
      return parseD.promise;
    });

    const result = setup();
    const run = start(result);

    await waitFor(() => expect(order).toEqual(['parse', 'analyze']));

    // Let the parse promise settle before analysis resolves, proving the
    // parse-first attachment path (not just "parse starts first").
    await act(async () => {
      parseD.resolve(PARSED);
      // Flush the limiter/parse promise chain (no wall-clock sleep) so the job
      // is settled before analysis resolves.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    await act(async () => {
      analyzeD.resolve(makeResult('r1'));
      await run();
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].parsedCV).toEqual(PARSED);
    expect(result.current.parsedCVGeneratingIds.has('r1')).toBe(false);
    expect(mocks.parseCV).toHaveBeenCalledTimes(1);
    // Parse finished before the history upsert, so parsed_cv is in the upsert
    // and must not be written a second time.
    expect(mocks.updateHistoryField).not.toHaveBeenCalled();
    expect((mocks.saveToHistory.mock.calls[0][0] as AnalysisResult[])[0].parsedCV).toEqual(PARSED);
  });

  it('shows analysis immediately when analysis wins, then patches the exact result id', async () => {
    const analyzeD = deferred<AnalysisResult>();
    const parseD = deferred<ParsedCV>();
    mocks.analyzeCV.mockReturnValue(analyzeD.promise);
    mocks.parseCV.mockReturnValue(parseD.promise);

    const result = setup();
    const run = start(result);

    await act(async () => {
      analyzeD.resolve(makeResult('r2'));
      await run();
    });

    expect(result.current.results[0].parsedCV).toBeUndefined();
    expect(result.current.parsedCVGeneratingIds.has('r2')).toBe(true);

    await act(async () => {
      parseD.resolve(PARSED);
    });

    await waitFor(() => expect(result.current.results[0].parsedCV).toEqual(PARSED));
    expect(result.current.parsedCVGeneratingIds.has('r2')).toBe(false);
    expect(mocks.parseCV).toHaveBeenCalledTimes(1);
    expect(mocks.updateHistoryField).toHaveBeenCalledTimes(1);
    expect(mocks.updateHistoryField).toHaveBeenCalledWith('u1', 'r2', { parsed_cv: PARSED });
  });

  it('waits for the history save before persisting a parse that finished first', async () => {
    const analyzeD = deferred<AnalysisResult>();
    const parseD = deferred<ParsedCV>();
    const saveD = deferred<void>();
    mocks.analyzeCV.mockReturnValue(analyzeD.promise);
    mocks.parseCV.mockReturnValue(parseD.promise);
    mocks.saveToHistory.mockReturnValue(saveD.promise);

    const result = setup();
    const run = start(result);

    await act(async () => {
      analyzeD.resolve(makeResult('r3'));
      await run();
    });

    await act(async () => {
      parseD.resolve(PARSED);
    });
    await waitFor(() => expect(result.current.results[0].parsedCV).toEqual(PARSED));
    expect(mocks.updateHistoryField).not.toHaveBeenCalled();

    await act(async () => {
      saveD.resolve();
    });
    await waitFor(() => expect(mocks.updateHistoryField).toHaveBeenCalledTimes(1));
    expect(mocks.updateHistoryField).toHaveBeenCalledWith('u1', 'r3', { parsed_cv: PARSED });
  });

  it('starts parse for every CV independently before any analysis resolves', async () => {
    const analyzeDeferreds = [deferred<AnalysisResult>(), deferred<AnalysisResult>()];
    const parseDeferreds = [deferred<ParsedCV>(), deferred<ParsedCV>()];
    let analyzeCall = 0;
    let parseCall = 0;
    mocks.analyzeCV.mockImplementation(() => analyzeDeferreds[analyzeCall++].promise);
    mocks.parseCV.mockImplementation(() => parseDeferreds[parseCall++].promise);

    const result = setup([file('cv1.txt'), file('cv2.txt')]);
    const run = start(result);

    await waitFor(() => expect(mocks.parseCV).toHaveBeenCalledTimes(2));
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(2);

    await act(async () => {
      parseDeferreds[0].resolve(PARSED);
      parseDeferreds[1].resolve(PARSED);
      analyzeDeferreds[0].resolve(makeResult('b1'));
      analyzeDeferreds[1].resolve(makeResult('b2'));
      await run();
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results.every((r) => r.parsedCV)).toBe(true);
    expect(result.current.parsedCVGeneratingIds.size).toBe(0);
    expect(mocks.parseCV).toHaveBeenCalledTimes(2);
  });

  it('keeps the analysis usable when parse rejects, with no infinite spinner', async () => {
    const analyzeD = deferred<AnalysisResult>();
    mocks.analyzeCV.mockReturnValue(analyzeD.promise);
    mocks.parseCV.mockRejectedValue(new Error('parse failed'));

    const result = setup();
    const run = start(result);

    await act(async () => {
      analyzeD.resolve(makeResult('r4'));
      await run();
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].parsedCV).toBeUndefined();
    expect(result.current.parsedCVGeneratingIds.has('r4')).toBe(false);
    expect(mocks.updateHistoryField).not.toHaveBeenCalled();
  });

  it('uses the normal analysis failure path when both analyze and parse fail', async () => {
    mocks.analyzeCV.mockRejectedValue(new Error('analysis failed'));
    mocks.parseCV.mockRejectedValue(new Error('parse failed'));

    const result = setup();
    const run = start(result);

    await act(async () => {
      await run();
    });

    expect(result.current.results).toHaveLength(0);
    expect(mocks.setError).toHaveBeenCalled();
    expect(mocks.parseCV).toHaveBeenCalledTimes(1);
    expect(mocks.saveToHistory).not.toHaveBeenCalled();
  });

  it('does not create a result when analysis fails even if parse succeeds', async () => {
    const parseD = deferred<ParsedCV>();
    mocks.analyzeCV.mockRejectedValue(new Error('analysis failed'));
    mocks.parseCV.mockReturnValue(parseD.promise);

    const result = setup();
    const run = start(result);

    await act(async () => {
      parseD.resolve(PARSED);
      await run();
    });

    expect(result.current.results).toHaveLength(0);
    expect(mocks.setError).toHaveBeenCalled();
    expect(mocks.parseCV).toHaveBeenCalledTimes(1);
    expect(mocks.saveToHistory).not.toHaveBeenCalled();
  });
});
