import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import {
  fetchPublicPlanLimits,
  getCachedPublicPlanLimits,
  DEFAULT_PUBLIC_PLAN_LIMITS,
} from '../../services/publicPlanLimitsService';

describe('publicPlanLimitsService', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { free: 3, pro: 100, recruiter: 500 },
      error: null,
    });
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

  it('falls back to documented plan limits if fields are missing', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });

    const limits = await fetchPublicPlanLimits(true);
    expect(limits).toEqual(DEFAULT_PUBLIC_PLAN_LIMITS);
  });

  it('throws RPC errors instead of pretending the values are current', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(fetchPublicPlanLimits(true)).rejects.toEqual({ message: 'denied' });
  });
});
