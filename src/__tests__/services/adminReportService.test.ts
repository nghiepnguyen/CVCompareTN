import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Rows returned for the analysis_log range query; set per test.
let logRows: Array<Record<string, unknown>> = [];

vi.mock('../../lib/supabase', () => {
  const countQuery = () => {
    const q: Record<string, unknown> = {};
    q.gte = () => q;
    q.eq = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve({ count: 0, error: null });
    return q;
  };
  const rowsQuery = () => {
    const q: Record<string, unknown> = {};
    q.gte = () => q;
    q.order = () => q;
    q.in = () => Promise.resolve({ data: [], error: null });
    q.range = () => Promise.resolve({ data: logRows, error: null });
    return q;
  };
  return {
    supabase: {
      from: () => ({
        select: (_cols: string, opts?: { head?: boolean }) => (opts?.head ? countQuery() : rowsQuery()),
      }),
    },
  };
});

import { getAdminReportStats } from '../../services/adminReportService';

describe('getAdminReportStats — dailyCounts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-09-27 10:00 in Asia/Ho_Chi_Minh
    vi.setSystemTime(new Date('2026-09-27T03:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits one entry per VN day in the 7d range, zero-filling days without analyses', async () => {
    logRows = [
      { user_id: 'u1', status: 'success', kind: 'analyze', created_at: '2026-09-21T02:00:00.000Z', input_tokens: 0, output_tokens: 0 },
      { user_id: 'u1', status: 'error', kind: 'analyze', created_at: '2026-09-27T01:00:00.000Z', input_tokens: 0, output_tokens: 0 },
    ];

    const stats = await getAdminReportStats('7d');

    expect(stats.dailyCounts.map((d) => d.date)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
    expect(stats.dailyCounts[0]).toEqual({ date: '2026-09-21', success: 1, error: 0 });
    expect(stats.dailyCounts[3]).toEqual({ date: '2026-09-24', success: 0, error: 0 });
    expect(stats.dailyCounts[6]).toEqual({ date: '2026-09-27', success: 0, error: 1 });
  });

  it('buckets by VN calendar day, not UTC (23:30 UTC belongs to the next VN day)', async () => {
    logRows = [
      { user_id: 'u1', status: 'success', kind: 'analyze', created_at: '2026-09-26T23:30:00.000Z', input_tokens: 0, output_tokens: 0 },
    ];

    const stats = await getAdminReportStats('today');

    expect(stats.dailyCounts).toEqual([{ date: '2026-09-27', success: 1, error: 0 }]);
  });
});

describe('getAdminReportStats — cost by model', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T03:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const row = (kind: string, model: string | null, input: number, output: number, status = 'success') => ({
    user_id: 'u1', status, kind, created_at: '2026-10-28T01:00:00.000Z', input_tokens: input, output_tokens: output, model,
  });

  it('prices each row with its own model', async () => {
    logRows = [
      row('analyze', 'gemini-3-flash-preview', 1_000_000, 1_000_000), // 0.5 + 3.0
      row('parse_cv', 'gemini-3.5-flash-lite', 1_000_000, 1_000_000), // 0.3 + 2.5
    ];
    const stats = await getAdminReportStats('today');
    expect(stats.totalCostUsd).toBeCloseTo(6.3, 6);
    expect(stats.avgCostUsd).toBeCloseTo(6.3, 6); // one successful analyze row
    expect(stats.unpricedModels).toEqual([]);
  });

  it('prices historical rows without a model as gemini-3-flash-preview', async () => {
    logRows = [row('analyze', null, 1_000_000, 1_000_000)];
    const stats = await getAdminReportStats('today');
    expect(stats.totalCostUsd).toBeCloseTo(3.5, 6);
  });

  it('excludes unknown models from cost and reports them instead of guessing a price', async () => {
    logRows = [
      row('analyze', 'gemini-3-flash-preview', 1_000_000, 0),
      row('rewrite', 'gemini-9-ultra', 1_000_000, 1_000_000),
    ];
    const stats = await getAdminReportStats('today');
    expect(stats.totalCostUsd).toBeCloseTo(0.5, 6);
    expect(stats.unpricedModels).toEqual(['gemini-9-ultra']);
    // Tokens still count toward the token averages.
    expect(stats.avgInputTokens).toBe(2_000_000);
  });

  it('ignores error rows for cost', async () => {
    logRows = [row('analyze', 'gemini-3-flash-preview', 1_000_000, 1_000_000, 'error')];
    const stats = await getAdminReportStats('today');
    expect(stats.totalCostUsd).toBe(0);
  });
});
