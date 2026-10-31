import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  profile: vi.fn(),
  locked: vi.fn(),
  plan: vi.fn(),
  hourly: vi.fn(),
  analyze: vi.fn(),
  log: vi.fn(),
  storage: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: mocks.user,
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));
vi.mock('../accountLock.js', () => ({
  getAccountProfile: mocks.profile,
  isLockedProfile: mocks.locked,
  getEffectivePlan: mocks.plan,
  checkHourlyAiLimit: mocks.hourly,
}));
vi.mock('../ai/analysisService.js', () => ({ analyzeCV: mocks.analyze }));
vi.mock('../ai/geminiClient.js', () => ({ GEMINI_ANALYZE_MODEL: 'test-model' }));
vi.mock('../analysisLog.js', () => ({ logAnalysisAttempt: mocks.log }));
vi.mock('../storage/tempFile.js', () => ({ resolveStorageRef: mocks.storage }));

import { handleAnalyze } from '../analyze/handler.js';

const body = { jd: 'JD fixture', cvData: 'CV fixture', cvMimeType: 'text/plain' };

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ id: 'u1' });
  mocks.profile.mockReset().mockResolvedValue({ plan: 'free', plan_expires_at: null, role: 'user', has_permission: true });
  mocks.locked.mockReset().mockReturnValue(false);
  mocks.plan.mockReset().mockReturnValue('free');
  mocks.hourly.mockReset().mockResolvedValue('ok');
  mocks.analyze.mockReset();
  mocks.log.mockReset().mockResolvedValue(undefined);
  mocks.storage.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: { allowed: true }, error: null });
});

describe('analyze batch entitlement', () => {
  it('rejects a declared batch above the plan limit before any rate/AI work', async () => {
    const result = await handleAnalyze('Bearer fixture', { ...body, batchTotal: 2 });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('Batch size 2 exceeds plan limit (1)');
    expect(mocks.hourly).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('caps actual analyze calls per hour so understating batchTotal cannot buy extra work', async () => {
    mocks.hourly.mockResolvedValue('rate_limited');

    const result = await handleAnalyze('Bearer fixture', { ...body, batchTotal: 1 });

    expect(result.status).toBe(429);
    expect(result.body.error).toBe('Too many requests. Please try again later.');
    expect(mocks.hourly).toHaveBeenCalledWith('u1', 'analyze', 'free', expect.any(Number), expect.anything());
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('uses the effective plan (recruiter cap) for the hourly entitlement', async () => {
    mocks.profile.mockResolvedValue({ plan: 'recruiter', plan_expires_at: null, role: 'user', has_permission: true });
    mocks.plan.mockReturnValue('recruiter');
    mocks.hourly.mockResolvedValue('rate_limited');

    const result = await handleAnalyze('Bearer fixture', { ...body, batchTotal: 1 });

    expect(result.status).toBe(429);
    expect(mocks.hourly).toHaveBeenCalledWith('u1', 'analyze', 'recruiter', expect.any(Number), expect.anything());
  });

  it('fails closed with 503 when the profile lookup fails', async () => {
    mocks.profile.mockRejectedValue(new Error('lookup down'));

    const result = await handleAnalyze('Bearer fixture', body);

    expect(result.status).toBe(503);
    expect(result.body.error).toBe('Account verification unavailable');
    expect(mocks.hourly).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('blocks locked accounts before the entitlement check', async () => {
    mocks.locked.mockReturnValue(true);

    const result = await handleAnalyze('Bearer fixture', body);

    expect(result.status).toBe(403);
    expect(mocks.hourly).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
