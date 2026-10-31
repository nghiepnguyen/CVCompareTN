import { describe, it, expect, vi, beforeEach } from 'vitest';

const updatePayloads: Array<Record<string, unknown>> = [];

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}));

import { updateUserMonthlyAnalyticsLimit } from '../../services/userService';

describe('updateUserMonthlyAnalyticsLimit', () => {
  beforeEach(() => {
    updatePayloads.length = 0;
  });

  it('writes a custom non-negative integer limit', async () => {
    await updateUserMonthlyAnalyticsLimit('u1', 20);

    expect(updatePayloads).toEqual([
      { monthly_analytics_limit: 20, monthly_analytics_limit_custom: true },
    ]);
  });

  it.each([-1, 1.5, Number.NaN])('rejects invalid limit %s before writing', async (limit) => {
    await expect(updateUserMonthlyAnalyticsLimit('u1', limit)).rejects.toThrow(
      'Monthly analytics limit must be a non-negative integer'
    );

    expect(updatePayloads).toHaveLength(0);
  });
});
