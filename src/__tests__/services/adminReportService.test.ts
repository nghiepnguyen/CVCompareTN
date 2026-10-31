import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let rpcResult: unknown = null;
let opsResult: unknown = null;
let rpcError: { message: string } | null = null;
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: name === 'admin_report_ops' ? opsResult : rpcResult,
        error: rpcError,
      });
    },
  },
}));

import { getAdminReportStats } from '../../services/adminReportService';

function raw(overrides: Record<string, unknown> = {}) {
  return {
    new_users_count: 4,
    total_success: 10,
    total_error: 2,
    daily_counts: [{ date: '2026-10-31', success: 10, error: 2 }],
    top_users: [{ userId: 'u1', email: 'u1@x.com', displayName: 'U1', count: 7 }],
    total_input_tokens: 2_000_000,
    total_output_tokens: 2_000_000,
    tracked_success_count: 1,
    model_usage: [
      { model: 'gemini-3-flash-preview', input_tokens: 1_000_000, output_tokens: 1_000_000 },
      { model: 'gemini-3.5-flash-lite', input_tokens: 1_000_000, output_tokens: 1_000_000 },
    ],
    quota_used_current_cycle: 42,
    as_of: '2026-10-31T03:10:00.000Z',
    ...overrides,
  };
}

describe('getAdminReportStats', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcError = null;
    rpcResult = raw();
    opsResult = {
      latency_p50_ms: 320,
      latency_p95_ms: 1100,
      error_categories: [{ message: '[gemini_error]', count: 2 }],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps the aggregate RPC payload without transferring analysis rows', async () => {
    const stats = await getAdminReportStats('7d');

    expect(rpcCalls.map((call) => call.name)).toEqual([
      'admin_report_stats',
      'admin_report_ops',
    ]);
    expect(stats.newUsersCount).toBe(4);
    expect(stats.totalSuccess).toBe(10);
    expect(stats.totalError).toBe(2);
    expect(stats.dailyCounts).toEqual([{ date: '2026-10-31', success: 10, error: 2 }]);
    expect(stats.topUsers[0]).toEqual({
      userId: 'u1',
      email: 'u1@x.com',
      displayName: 'U1',
      count: 7,
    });
    expect(stats.quotaUsedCurrentCycle).toBe(42);
    expect(stats.quotaAsOf).toBe('2026-10-31T03:10:00.000Z');
    expect(stats.latencyP50Ms).toBe(320);
    expect(stats.latencyP95Ms).toBe(1100);
    expect(stats.errorCategories).toEqual([{ message: '[gemini_error]', count: 2 }]);
    expect(stats.modelUsage).toHaveLength(2);
  });

  it('prices each model bucket and averages over tracked successful analyses', async () => {
    const stats = await getAdminReportStats('today');

    // flash: 0.5 + 3.0; flash-lite: 0.3 + 2.5
    expect(stats.totalCostUsd).toBeCloseTo(6.3, 6);
    expect(stats.avgCostUsd).toBeCloseTo(6.3, 6);
    expect(stats.avgInputTokens).toBe(2_000_000);
    expect(stats.avgOutputTokens).toBe(2_000_000);
    expect(stats.avgTotalTokens).toBe(4_000_000);
    expect(stats.unpricedModels).toEqual([]);
  });

  it('prices NULL models as the legacy model and reports unknown models without guessing', async () => {
    rpcResult = raw({
      model_usage: [
        { model: null, input_tokens: 1_000_000, output_tokens: 1_000_000 },
        { model: 'gemini-9-ultra', input_tokens: 1_000_000, output_tokens: 1_000_000 },
      ],
    });

    const stats = await getAdminReportStats('today');

    expect(stats.totalCostUsd).toBeCloseTo(3.5, 6);
    expect(stats.unpricedModels).toEqual(['gemini-9-ultra']);
    // Tokens from the unpriced bucket still count toward token averages.
    expect(stats.avgInputTokens).toBe(2_000_000);
  });

  it('anchors the 7d start to the VN day boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T03:00:00.000Z')); // 2026-09-27 10:00 ICT

    await getAdminReportStats('7d');

    expect(rpcCalls[0].args.p_start).toBe('2026-09-20T17:00:00.000Z');
    expect(rpcCalls[0].args.p_end).toBe('2026-09-27T03:00:00.000Z');
  });

  it('surfaces RPC errors', async () => {
    rpcError = { message: 'permission denied' };

    await expect(getAdminReportStats('30d')).rejects.toEqual({ message: 'permission denied' });
  });
});
