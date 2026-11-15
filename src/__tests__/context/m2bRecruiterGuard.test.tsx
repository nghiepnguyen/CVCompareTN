// @vitest-environment jsdom
// M2-B regression for M2-A P1-2 in the recruiter campaign flow.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  analyzeCV: vi.fn(),
  checkAnalyticsQuota: vi.fn(),
  getCampaignCandidates: vi.fn(),
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
  uploadCandidateFile: vi.fn(), updateCandidateStatus: vi.fn(async () => {}), updateCandidateHrStatus: vi.fn(),
  saveCandidateAnalysis: vi.fn(async () => {}), deleteCandidate: vi.fn(),
  getCandidateFileUrl: async () => 'blob:cv',
}));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({ reportLanguage: 'en', t: { monthlyUsageLimitExceeded: 'MONTHLY' } }) }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectivePlan: 'recruiter', userProfile: { role: 'user' }, refreshUserProfile: vi.fn() }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) } },
}));

import { RecruiterProvider, useRecruiter } from '../../context/recruiter/RecruiterContext';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M2-B recruiter campaign guard', () => {
  it('a double click before the quota check resolves analyzes each candidate ONCE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['cv']), { status: 200 }));
    const candidate = {
      id: 'c1', campaignId: 'k1', candidateName: 'A', fileName: 'a.txt', filePath: 'p', fileSize: 2,
      parsedText: null, analysisResult: null, matchScore: null, status: 'pending', errorMessage: null,
      hrStatus: 'new', hrNote: null, analyzedAt: null, createdAt: '',
    };
    mocks.getCampaignCandidates.mockResolvedValue([candidate]);
    let releaseQuota!: (v: { allowed: boolean }) => void;
    mocks.checkAnalyticsQuota.mockReturnValue(new Promise((r) => { releaseQuota = r; }));
    mocks.analyzeCV.mockResolvedValue({ matchScore: 70 });

    const wrapper = ({ children }: { children: React.ReactNode }) => <RecruiterProvider>{children}</RecruiterProvider>;
    const { result } = renderHook(() => useRecruiter(), { wrapper });
    act(() => { result.current.setActiveCampaign({ id: 'k1', jdContent: 'Need SQL' } as never); });
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));

    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = result.current.analyzeCampaign('k1'); b = result.current.analyzeCampaign('k1'); });
    releaseQuota({ allowed: true });
    await act(async () => { await a; await b; });
    expect(mocks.checkAnalyticsQuota).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeCV).toHaveBeenCalledTimes(1);
  });
});
