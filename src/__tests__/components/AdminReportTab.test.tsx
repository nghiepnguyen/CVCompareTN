// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { AdminReportStats, ReportRange } from '../../services/adminReportService';

// Translation proxy: every key renders as its own name.
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    t: new Proxy({}, { get: (_t, key) => String(key) }),
    reportLanguage: 'vi',
  }),
}));

const pending = new Map<ReportRange, (s: AdminReportStats) => void>();
vi.mock('../../services/adminReportService', () => ({
  getAdminReportStats: (range: ReportRange) =>
    new Promise<AdminReportStats>((resolve) => pending.set(range, resolve)),
}));

import { AdminReportTab } from '../../components/views/AdminReportTab';

function stats(newUsersCount: number): AdminReportStats {
  return {
    newUsersCount,
    totalSuccess: 0,
    totalError: 0,
    totalAnalysesThisMonth: 0,
    dailyCounts: [],
    topUsers: [],
    avgInputTokens: 0,
    avgOutputTokens: 0,
    avgTotalTokens: 0,
    avgCostUsd: 0,
    totalCostUsd: 0,
  };
}

describe('AdminReportTab', () => {
  afterEach(() => {
    cleanup();
    pending.clear();
  });

  it('keeps the stats of the currently selected range when an older request resolves last', async () => {
    render(<AdminReportTab />);
    // Initial 7d request is still in flight; admin switches to "today".
    fireEvent.click(screen.getByText('adminReportFilterToday'));

    await act(async () => {
      pending.get('today')!(stats(111));
    });
    await act(async () => {
      pending.get('7d')!(stats(222)); // slower, stale response
    });

    expect(screen.queryByText('111')).not.toBeNull();
    expect(screen.queryByText('222')).toBeNull();
  });
});
