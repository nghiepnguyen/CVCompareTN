import { describe, it, expect, vi, beforeEach } from 'vitest';

const response = vi.fn();
const abortSignal = vi.fn((signal: AbortSignal) => response(signal));
const rpc = vi.fn((..._args: unknown[]) => ({ abortSignal }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import {
  fetchPublicPlanLimits,
  getCachedPublicPlanLimits,
} from '../../services/publicPlanLimitsService';

describe('publicPlanLimitsService', () => {
  beforeEach(() => {
    rpc.mockClear();
    abortSignal.mockClear();
    response.mockReset();
    response.mockResolvedValue({
      data: { free: 3, pro: 100, recruiter: 500 },
      error: null,
    });
  });

  it('has no verified cached quotas before the first response', () => {
    expect(getCachedPublicPlanLimits()).toBeNull();
  });

  it('loads plan limits from the public RPC', async () => {
    const limits = await fetchPublicPlanLimits(true);

    expect(rpc).toHaveBeenCalledWith('get_public_plan_limits');
    expect(limits).toEqual({ free: 3, pro: 100, recruiter: 500 });
    expect(getCachedPublicPlanLimits()).toEqual(limits);
  });

  it('uses the cached value unless force is requested', async () => {
    await fetchPublicPlanLimits(true);
    rpc.mockClear();

    const cached = await fetchPublicPlanLimits();
    expect(cached.free).toBe(3);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, { free: null, pro: 100, recruiter: 500 },
    { free: '3', pro: 100, recruiter: 500 }, { free: -1, pro: 100, recruiter: 500 },
    { free: 3, pro: Number.NaN, recruiter: 500 }])('rejects unverified quotas: %j', async (data) => {
    response.mockResolvedValue({ data, error: null });
    await expect(fetchPublicPlanLimits(true)).rejects.toThrow('Invalid public plan limits');
    expect(getCachedPublicPlanLimits()).toEqual({ free: 3, pro: 100, recruiter: 500 });
  });

  it('throws RPC errors instead of pretending the values are current', async () => {
    response.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(fetchPublicPlanLimits(true)).rejects.toEqual({ message: 'denied' });
  });
});

it('aborts a hung request so retry can start a new request', async () => {
  vi.useFakeTimers();
  response.mockImplementationOnce((signal: AbortSignal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }));
  try {
    const request = expect(fetchPublicPlanLimits(true)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(8000);
    await request;
    response.mockResolvedValue({ data: { free: 3, pro: 100, recruiter: 500 }, error: null });
    await expect(fetchPublicPlanLimits(true)).resolves.toEqual({ free: 3, pro: 100, recruiter: 500 });
  } finally {
    vi.useRealTimers();
  }
});
