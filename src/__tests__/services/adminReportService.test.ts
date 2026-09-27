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
