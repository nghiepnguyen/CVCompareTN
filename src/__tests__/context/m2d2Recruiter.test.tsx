// @vitest-environment jsdom
// M2-D2 regressions for M2-D1 F1 (save failure after a paid analysis) and
// F2 (status-write failures, stuck 'analyzing', error text in parsed_text).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  analyzeCV: vi.fn(),
  checkAnalyticsQuota: vi.fn(),
  getCampaignCandidates: vi.fn(),
  updateCandidateStatus: vi.fn(),
  saveCandidateAnalysis: vi.fn(),
  getCandidateFileUrl: vi.fn(),
}));

vi.mock('../../services/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ai')>()),
  analyzeCV: mocks.analyzeCV,
}));
vi.mock('../../services/analyticsQuotaService', () => ({ checkAnalyticsQuota: mocks.checkAnalyticsQuota }));
vi.mock('../../hooks/useFileProcessor', () => ({
  cleanText: (s: string) => s,
  processFile: async () => ({ data: 'CV text', mimeType: 'text/plain' }),
}));
vi.mock('../../services/cvService', () => ({ cleanupTempAnalysisFiles: vi.fn() }));
vi.mock('../../lib/ga4', () => ({ trackEvent: vi.fn() }));
vi.mock('../../services/recruiterService', () => ({
  getUserCampaigns: async () => [],
  getCampaignCandidates: mocks.getCampaignCandidates,
  createCampaign: vi.fn(), updateCampaignStatus: vi.fn(), deleteCampaign: vi.fn(), createCandidate: vi.fn(),
  uploadCandidateFile: vi.fn(), updateCandidateStatus: mocks.updateCandidateStatus, updateCandidateHrStatus: vi.fn(),
  saveCandidateAnalysis: mocks.saveCandidateAnalysis, deleteCandidate: vi.fn(),
  getCandidateFileUrl: mocks.getCandidateFileUrl,
}));
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ reportLanguage: 'en', t: { monthlyUsageLimitExceeded: 'MONTHLY', recruiterSaveFailed: 'SAVE_FAILED', recruiterStatusWriteFailed: 'STATUS_WRITE_FAILED' } }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectivePlan: 'recruiter', userProfile: { role: 'user' }, refreshUserProfile: vi.fn() }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) } },
}));

import { RecruiterProvider, useRecruiter } from '../../context/recruiter/RecruiterContext';

const cand = (id: string, status = 'pending') => ({
  id, campaignId: 'k1', candidateName: id, fileName: `${id}.txt`, filePath: 'p', fileSize: 2,
  parsedText: null, analysisResult: null, matchScore: null, status, errorMessage: null,
  hrStatus: 'new', hrNote: null, analyzedAt: null, createdAt: '',
});

async function mount(list: unknown[]) {
  mocks.getCampaignCandidates.mockResolvedValue(list);
  const wrapper = ({ children }: { children: React.ReactNode }) => <RecruiterProvider>{children}</RecruiterProvider>;
  const { result } = renderHook(() => useRecruiter(), { wrapper });
  act(() => { result.current.setActiveCampaign({ id: 'k1', jdContent: 'Need SQL' } as never); });
  await waitFor(() => expect(result.current.candidates).toHaveLength(list.length));
  return result;
}

// Save backoff (500 ms + 1500 ms) runs on fake timers so these tests stay
// fast under CI load; mount() uses real timers for waitFor.
const run = async (result: Awaited<ReturnType<typeof mount>>) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await act(async () => {
      const p = result.current.analyzeCampaign('k1');
      await vi.runAllTimersAsync();
      await p;
    });
  } finally {
    vi.useRealTimers();
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Blob(['cv']), { status: 200 }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.checkAnalyticsQuota.mockResolvedValue({ allowed: true });
  mocks.updateCandidateStatus.mockResolvedValue(undefined);
  mocks.saveCandidateAnalysis.mockResolvedValue(undefined);
  mocks.getCandidateFileUrl.mockResolvedValue('blob:cv');
  mocks.analyzeCV.mockResolvedValue({ matchScore: 70 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M2-D2 F1: a save failure never re-runs a paid analysis', () => {
  it('a transient save failure is retried in the same run: analyze ×1, save ×2, done', async () => {
    mocks.saveCandidateAnalysis.mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.saveCandidateAnalysis).toHaveBeenCalledTimes(2);
    expect(result.current.candidates[0].status).toBe('done');
    // Never written to 'error' in the DB, never into parsed_text.
    expect(mocks.updateCandidateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateCandidateStatus).toHaveBeenCalledWith('c1', 'analyzing', undefined);
  });

  it('a persistent save failure keeps the result; the next run saves it with ZERO Gemini calls and no quota check', async () => {
    mocks.saveCandidateAnalysis.mockRejectedValue(new Error('Không lưu được kết quả phân tích'));
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.saveCandidateAnalysis).toHaveBeenCalledTimes(3);
    expect(result.current.candidates[0]).toMatchObject({ status: 'error', errorMessage: 'SAVE_FAILED' });
    // DB status is left 'analyzing' (not 'error'), so a reload cannot re-analyze it.
    expect(mocks.updateCandidateStatus.mock.calls.map((c) => c[1])).toEqual(['analyzing']);

    mocks.saveCandidateAnalysis.mockReset().mockResolvedValue(undefined);
    mocks.checkAnalyticsQuota.mockClear();
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.checkAnalyticsQuota).not.toHaveBeenCalled();
    expect(mocks.saveCandidateAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.saveCandidateAnalysis.mock.calls[0][2]).toBe(70);
    expect(result.current.candidates[0]).toMatchObject({ status: 'done', errorMessage: null, matchScore: 70 });
  });

  it('an unsaved result stays retryable after the candidate list reloads (DB row still analyzing)', async () => {
    mocks.saveCandidateAnalysis.mockRejectedValue(new Error('down'));
    const result = await mount([cand('c1')]);
    await run(result);
    mocks.getCampaignCandidates.mockResolvedValue([cand('c1', 'analyzing')]);
    await act(async () => { await result.current.loadCandidates('k1'); });
    expect(result.current.candidates[0]).toMatchObject({ status: 'error', errorMessage: 'SAVE_FAILED' });
    mocks.saveCandidateAnalysis.mockReset().mockResolvedValue(undefined);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(result.current.candidates[0].status).toBe('done');
  });

  it('a mixed batch quota-checks only the candidates that still need analysis', async () => {
    mocks.saveCandidateAnalysis.mockRejectedValue(new Error('down'));
    const result = await mount([cand('c1')]);
    await run(result);
    mocks.saveCandidateAnalysis.mockReset().mockResolvedValue(undefined);
    mocks.getCampaignCandidates.mockResolvedValue([cand('c1', 'analyzing'), cand('c2')]);
    await act(async () => { await result.current.loadCandidates('k1'); });
    mocks.checkAnalyticsQuota.mockClear();
    await run(result);
    expect(mocks.checkAnalyticsQuota).toHaveBeenCalledWith('u1', 1);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(2); // c1 once (first run) + c2 once
    expect(result.current.candidates.map((c) => c.status)).toEqual(['done', 'done']);
  });

  it('a double click during a save-only retry saves once', async () => {
    mocks.saveCandidateAnalysis.mockRejectedValue(new Error('down'));
    const result = await mount([cand('c1')]);
    await run(result);
    mocks.saveCandidateAnalysis.mockReset().mockResolvedValue(undefined);
    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = result.current.analyzeCampaign('k1'); b = result.current.analyzeCampaign('k1'); });
    await act(async () => { await a; await b; }); // no save failure here: no backoff timers
    expect(mocks.saveCandidateAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });
});

describe('M2-D2 F2: error isolation', () => {
  it('a failing error-status write does not end the batch; every candidate is attempted', async () => {
    mocks.analyzeCV.mockRejectedValue(new Error('boom'));
    mocks.updateCandidateStatus.mockImplementation(async (_id: string, s: string) => { if (s === 'error') throw new Error('network'); });
    const result = await mount([cand('c1'), cand('c2'), cand('c3')]);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(3);
    expect(result.current.candidates.map((c) => c.status)).toEqual(['error', 'error', 'error']);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('a failing analyzing-status write skips that candidate (no Gemini call, no charge); others continue', async () => {
    // Analyzing it anyway could leave a paid, unsaved result on a row still
    // 'pending' in the DB, which a reload would re-analyze and charge again.
    mocks.updateCandidateStatus.mockImplementation(async (id: string) => { if (id === 'c1') throw new Error('network'); });
    const result = await mount([cand('c1'), cand('c2')]);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(mocks.saveCandidateAnalysis.mock.calls.map((c) => c[0])).toEqual(['c2']);
    expect(result.current.candidates[0]).toMatchObject({ status: 'error', errorMessage: 'STATUS_WRITE_FAILED' });
    expect(result.current.candidates[1].status).toBe('done');
  });

  it('the analyze error goes to error_message (3rd arg), never parsed_text; later candidates continue', async () => {
    mocks.analyzeCV.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ matchScore: 60 });
    const result = await mount([cand('c1'), cand('c2')]);
    await run(result);
    const errorCall = mocks.updateCandidateStatus.mock.calls.find((c) => c[1] === 'error');
    expect(errorCall?.[0]).toBe('c1');
    expect(typeof errorCall?.[2]).toBe('string');
    expect(result.current.candidates.map((c) => c.status)).toEqual(['error', 'done']);
  });

  it('a file download failure marks only that candidate as error', async () => {
    mocks.getCandidateFileUrl.mockRejectedValueOnce(new Error('signed url failed'));
    const result = await mount([cand('c1'), cand('c2')]);
    await run(result);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
    expect(result.current.candidates.map((c) => c.status)).toEqual(['error', 'done']);
  });

  it('stale analyzing rows are NOT auto-recovered (deferred to M2-D3)', async () => {
    const result = await mount([cand('c1', 'analyzing')]);
    await run(result);
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(result.current.candidates[0].status).toBe('analyzing');
  });
});
