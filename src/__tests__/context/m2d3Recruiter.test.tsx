// @vitest-environment jsdom
// M2-D3 client behaviour for stale-analyzing recovery. DB atomicity is proven
// separately against a real database (scripts/db-candidate-claim-concurrency.ts);
// these tests only pin what the client does with each claim outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ANALYSIS_LEASE_MS, isRetryableCandidate, leaseAllowsDispatch } from '../../context/recruiter/analysisLease';

const mocks = vi.hoisted(() => ({
  analyzeCV: vi.fn(),
  checkAnalyticsQuota: vi.fn(),
  getCampaignCandidates: vi.fn(),
  claimCandidateAnalysis: vi.fn(),
  releaseCandidateAnalysis: vi.fn(),
  saveCandidateAnalysis: vi.fn(),
  processFile: vi.fn(),
}));

vi.mock('../../services/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ai')>()),
  analyzeCV: mocks.analyzeCV,
}));
vi.mock('../../services/analyticsQuotaService', () => ({ checkAnalyticsQuota: mocks.checkAnalyticsQuota }));
vi.mock('../../hooks/useFileProcessor', () => ({ cleanText: (s: string) => s, processFile: mocks.processFile }));
vi.mock('../../services/cvService', () => ({ cleanupTempAnalysisFiles: vi.fn() }));
vi.mock('../../lib/ga4', () => ({ trackEvent: vi.fn() }));
vi.mock('../../services/recruiterService', () => ({
  getUserCampaigns: async () => [],
  getCampaignCandidates: mocks.getCampaignCandidates,
  createCampaign: vi.fn(), updateCampaignStatus: vi.fn(), deleteCampaign: vi.fn(), createCandidate: vi.fn(),
  uploadCandidateFile: vi.fn(), updateCandidateHrStatus: vi.fn(),
  claimCandidateAnalysis: mocks.claimCandidateAnalysis, releaseCandidateAnalysis: mocks.releaseCandidateAnalysis,
  saveCandidateAnalysis: mocks.saveCandidateAnalysis, deleteCandidate: vi.fn(),
  getCandidateFileUrl: async () => 'blob:cv',
}));
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    reportLanguage: 'en',
    t: {
      monthlyUsageLimitExceeded: 'MONTHLY', recruiterSaveFailed: 'SAVE_FAILED', recruiterStatusWriteFailed: 'STATUS_WRITE_FAILED',
      recruiterLeaseExpired: 'LEASE_EXPIRED', recruiterRecoveryPaidLost: 'PAID_LOST', recruiterRecoveryUnknown: 'UNKNOWN',
    },
  }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectivePlan: 'recruiter', userProfile: { role: 'user' }, refreshUserProfile: vi.fn() }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) } },
}));

import { RecruiterProvider, useRecruiter } from '../../context/recruiter/RecruiterContext';
import { AiRequestError } from '../../services/ai';
const serverError = (msg: string) => new AiRequestError(msg, 500, false, {});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const cand = (id: string, status = 'pending', analysisStartedAt: string | null = null) => ({
  id, campaignId: 'k1', candidateName: id, fileName: `${id}.txt`, filePath: 'p', fileSize: 2,
  parsedText: null, analysisResult: null, matchScore: null, status, errorMessage: null,
  hrStatus: 'new', hrNote: null, analyzedAt: null, analysisStartedAt, createdAt: '',
});
const claimed = () => ({ result: 'claimed', startedAt: new Date().toISOString(), recovered: null });

async function mount(list: unknown[]) {
  mocks.getCampaignCandidates.mockResolvedValue(list);
  const wrapper = ({ children }: { children: React.ReactNode }) => <RecruiterProvider>{children}</RecruiterProvider>;
  const { result } = renderHook(() => useRecruiter(), { wrapper });
  act(() => { result.current.setActiveCampaign({ id: 'k1', jdContent: 'Need SQL' } as never); });
  await waitFor(() => expect(result.current.candidates).toHaveLength(list.length));
  return result;
}
const run = async (result: Awaited<ReturnType<typeof mount>>, confirm?: string[]) => {
  let out: unknown;
  await act(async () => { out = await result.current.analyzeCampaign('k1', confirm); });
  return out as { id: string; reason: string }[];
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Blob(['cv']), { status: 200 }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.checkAnalyticsQuota.mockResolvedValue({ allowed: true });
  mocks.claimCandidateAnalysis.mockImplementation(async () => claimed());
  mocks.releaseCandidateAnalysis.mockResolvedValue(true);
  mocks.saveCandidateAnalysis.mockResolvedValue('saved');
  mocks.processFile.mockResolvedValue({ data: 'CV text', mimeType: 'text/plain' });
  mocks.analyzeCV.mockResolvedValue({ matchScore: 70 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('analysisLease', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  const at = (ms: number) => new Date(now - ms).toISOString();
  it('fresh analyzing is not retryable; stale or legacy (no start) is; done never', () => {
    expect(isRetryableCandidate(cand('a', 'analyzing', at(ANALYSIS_LEASE_MS - 1)) as never, now)).toBe(false);
    expect(isRetryableCandidate(cand('a', 'analyzing', at(ANALYSIS_LEASE_MS)) as never, now)).toBe(true);
    expect(isRetryableCandidate(cand('a', 'analyzing', null) as never, now)).toBe(true);
    expect(isRetryableCandidate(cand('a', 'pending') as never, now)).toBe(true);
    expect(isRetryableCandidate(cand('a', 'error') as never, now)).toBe(true);
    expect(isRetryableCandidate(cand('a', 'done') as never, now)).toBe(false);
  });
  it('dispatch is refused in the last 2 minutes of the lease', () => {
    expect(leaseAllowsDispatch(now, now + 7 * 60_000)).toBe(true);
    expect(leaseAllowsDispatch(now, now + 8 * 60_000)).toBe(false);
  });
});

describe('M2-D3 recovery flow', () => {
  it('a fresh analyzing row (reload mid-run, or another tab) is not claimed', async () => {
    const result = await mount([cand('c1', 'analyzing', ago(60_000))]);
    await run(result);
    expect(mocks.claimCandidateAnalysis).not.toHaveBeenCalled();
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
  });

  it('a stale row the server proves never dispatched is claimed and analyzed under the claim attempt id', async () => {
    const result = await mount([cand('c1', 'analyzing', ago(ANALYSIS_LEASE_MS + 1))]);
    await run(result);
    const [, attemptId, confirm] = mocks.claimCandidateAnalysis.mock.calls[0];
    expect(confirm).toBe(false);
    expect(mocks.analyzeCV.mock.calls[0][10]).toBe(attemptId); // idempotency key = attempt id
    expect(mocks.saveCandidateAnalysis.mock.calls[0][3]).toBe(attemptId);
    expect(result.current.candidates[0].status).toBe('done');
  });

  it.each([['paid_result_lost', 'PAID_LOST'], ['outcome_unknown', 'UNKNOWN']])(
    'needs_confirm (%s): no Gemini call, no quota spent, returned for confirmation', async (reason, msg) => {
      mocks.claimCandidateAnalysis.mockResolvedValue({ result: 'needs_confirm', reason });
      const result = await mount([cand('c1', 'analyzing', null), cand('c2')]);
      mocks.claimCandidateAnalysis.mockImplementation(async (id: string) =>
        id === 'c1' ? { result: 'needs_confirm', reason } : claimed());
      const pending = await run(result);
      expect(pending).toEqual([{ id: 'c1', name: 'c1', reason }]);
      expect(mocks.analyzeCV).toHaveBeenCalledTimes(1); // c2 only
      expect(result.current.candidates.find((c) => c.id === 'c1')).toMatchObject({ status: 'error', errorMessage: msg });
    });

  it('a confirmed re-run claims with confirm=true and touches only the confirmed candidates', async () => {
    mocks.claimCandidateAnalysis.mockImplementation(async (id: string, _a: string, confirm: boolean) =>
      id === 'c1' && !confirm ? { result: 'needs_confirm', reason: 'paid_result_lost' } : claimed());
    const result = await mount([cand('c1', 'error'), cand('c2', 'error')]);
    mocks.analyzeCV.mockRejectedValueOnce(serverError('boom')); // c2 fails in the first run
    await run(result);
    mocks.claimCandidateAnalysis.mockClear();
    mocks.analyzeCV.mockClear();
    await run(result, ['c1']);
    expect(mocks.claimCandidateAnalysis.mock.calls.map((c) => [c[0], c[2]])).toEqual([['c1', true]]);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });

  it('a claim reported active (two tabs) is skipped without a Gemini call', async () => {
    mocks.claimCandidateAnalysis.mockResolvedValue({ result: 'active', startedAt: new Date().toISOString() });
    const result = await mount([cand('c1', 'error')]);
    await run(result);
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(result.current.candidates[0].status).toBe('analyzing');
  });

  it('ownership acquisition failure (RPC error / lost response) skips the candidate', async () => {
    mocks.claimCandidateAnalysis.mockRejectedValue(new Error('network'));
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(mocks.releaseCandidateAnalysis).not.toHaveBeenCalled();
    expect(result.current.candidates[0]).toMatchObject({ status: 'error', errorMessage: 'STATUS_WRITE_FAILED' });
  });

  it('a lease that expires before dispatch (slow file, suspended tab) never calls Gemini', async () => {
    const realNow = Date.now();
    mocks.processFile.mockImplementation(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(realNow + 9 * 60_000);
      return { data: 'CV text', mimeType: 'text/plain' };
    });
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    const [id, attemptId, msg] = mocks.releaseCandidateAnalysis.mock.calls[0];
    expect([id, msg]).toEqual(['c1', 'LEASE_EXPIRED']);
    expect(attemptId).toBe(mocks.claimCandidateAnalysis.mock.calls[0][1]);
  });

  it('a superseded save keeps the newer result: no retry, nothing kept for save-only', async () => {
    mocks.saveCandidateAnalysis.mockResolvedValue('superseded');
    const result = await mount([cand('c1')]);
    mocks.getCampaignCandidates.mockResolvedValue([{ ...cand('c1', 'done'), matchScore: 90 }]);
    await run(result);
    expect(mocks.saveCandidateAnalysis).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.candidates[0]).toMatchObject({ status: 'done', matchScore: 90 }));
    mocks.saveCandidateAnalysis.mockClear();
    await run(result);
    expect(mocks.saveCandidateAnalysis).not.toHaveBeenCalled();
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });

  it('quota pre-check counts stale rows that may be claimed, not fresh ones', async () => {
    const result = await mount([cand('c1', 'analyzing', ago(ANALYSIS_LEASE_MS + 1)), cand('c2', 'analyzing', ago(1_000)), cand('c3')]);
    await run(result);
    expect(mocks.checkAnalyticsQuota).toHaveBeenCalledWith('u1', 2);
  });
});

describe('M2-Q 1B server-side save', () => {
  it('sends the candidate id with the attempt key, and skips the browser save when the server saved', async () => {
    mocks.analyzeCV.mockResolvedValue({ matchScore: 70, serverSave: 'saved' });
    const result = await mount([cand('c1')]);
    await run(result);
    const args = mocks.analyzeCV.mock.calls[0];
    expect(args[10]).toBe(mocks.claimCandidateAnalysis.mock.calls[0][1]); // key = claim attempt
    expect(args[11]).toBe('c1');
    expect(mocks.saveCandidateAnalysis).not.toHaveBeenCalled();
    expect(result.current.candidates[0]).toMatchObject({ status: 'done', matchScore: 70 });
    expect(result.current.candidates[0].analysisResult).toEqual({ matchScore: 70 }); // serverSave stripped
  });

  it.each([['failed'], [undefined]])('serverSave %s (or an old server) falls back to the browser save under the same attempt', async (serverSave) => {
    mocks.analyzeCV.mockResolvedValue(serverSave ? { matchScore: 70, serverSave } : { matchScore: 70 });
    const result = await mount([cand('c1')]);
    await run(result);
    const [id, saved, score, attemptId] = mocks.saveCandidateAnalysis.mock.calls[0];
    expect([id, score, attemptId]).toEqual(['c1', 70, mocks.claimCandidateAnalysis.mock.calls[0][1]]);
    expect(saved).toEqual({ matchScore: 70 }); // serverSave never persisted
    expect(result.current.candidates[0].status).toBe('done');
  });

  it.each([['superseded'], ['not_owner']])('serverSave %s drops the result and reloads, no browser save', async (serverSave) => {
    mocks.analyzeCV.mockResolvedValue({ matchScore: 70, serverSave });
    const result = await mount([cand('c1')]);
    const loadsBefore = mocks.getCampaignCandidates.mock.calls.length;
    await run(result);
    expect(mocks.saveCandidateAnalysis).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getCampaignCandidates.mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it('a server error whose row was not released (already settled) reloads the row', async () => {
    mocks.analyzeCV.mockRejectedValue(serverError('busy'));
    mocks.releaseCandidateAnalysis.mockResolvedValue(false);
    const result = await mount([cand('c1')]);
    const loadsBefore = mocks.getCampaignCandidates.mock.calls.length;
    mocks.getCampaignCandidates.mockResolvedValue([{ ...cand('c1', 'done'), matchScore: 70 }]);
    await run(result);
    await waitFor(() => expect(result.current.candidates[0]).toMatchObject({ status: 'done', matchScore: 70 }));
    expect(mocks.getCampaignCandidates.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(mocks.saveCandidateAnalysis).not.toHaveBeenCalled();
  });

  it('a released row (server answered with a failure) keeps the local error and does not reload', async () => {
    mocks.analyzeCV.mockRejectedValue(serverError('boom'));
    const result = await mount([cand('c1')]);
    const loadsBefore = mocks.getCampaignCandidates.mock.calls.length;
    await run(result);
    expect(result.current.candidates[0].status).toBe('error');
    expect(mocks.getCampaignCandidates.mock.calls.length).toBe(loadsBefore);
  });
});

describe('M2-Q 2A: no release while the server may still save', () => {
  const timeout = () => new DOMException('signal timed out', 'TimeoutError');
  it.each([
    ['client timeout (75 s)', timeout],
    ['network drop', () => new TypeError('Failed to fetch')],
    ['unreadable 200 body', () => new SyntaxError('Unexpected end of JSON input')],
  ])('%s after dispatch: row not released, kept analyzing, reloaded; no browser save, no second Gemini call', async (_l, err) => {
    mocks.analyzeCV.mockRejectedValue(err());
    const result = await mount([cand('c1'), cand('c2')]);
    const loadsBefore = mocks.getCampaignCandidates.mock.calls.length;
    mocks.getCampaignCandidates.mockResolvedValue([{ ...cand('c1', 'done'), matchScore: 70 }, { ...cand('c2', 'done'), matchScore: 60 }]);
    await run(result);
    expect(mocks.releaseCandidateAnalysis).not.toHaveBeenCalled();
    expect(mocks.saveCandidateAnalysis).not.toHaveBeenCalled();
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(2); // one per candidate, the batch continues
    expect(mocks.getCampaignCandidates.mock.calls.length).toBeGreaterThan(loadsBefore);
    await waitFor(() => expect(result.current.candidates.map((c) => c.status)).toEqual(['done', 'done']));
  });

  it('kept analyzing locally (not error) until the reload, so no retry button re-dispatches it', async () => {
    mocks.analyzeCV.mockRejectedValue(timeout());
    const result = await mount([cand('c1')]);
    mocks.getCampaignCandidates.mockImplementation(() => new Promise(() => {})); // reload still pending
    await run(result);
    expect(result.current.candidates[0]).toMatchObject({ status: 'analyzing', errorMessage: null });
    expect(result.current.candidates[0].analysisStartedAt).toBeTruthy(); // lease clock kept
  });

  it('failures before dispatch still release (nothing can be saved for them)', async () => {
    mocks.processFile.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.analyzeCV).not.toHaveBeenCalled();
    expect(mocks.releaseCandidateAnalysis).toHaveBeenCalledTimes(1);
    expect(result.current.candidates[0].status).toBe('error');
  });

  it('a server answer (AiRequestError) still releases with the localized message', async () => {
    mocks.analyzeCV.mockRejectedValue(new AiRequestError('x', 504, true, {}));
    const result = await mount([cand('c1')]);
    await run(result);
    expect(mocks.releaseCandidateAnalysis).toHaveBeenCalledTimes(1);
    expect(result.current.candidates[0].status).toBe('error');
  });
});
