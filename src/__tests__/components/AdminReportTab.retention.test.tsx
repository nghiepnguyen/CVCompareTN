// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { AdminReportStats } from '../../services/adminReportService';

// Translation proxy: every key renders as its own name.
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    t: new Proxy({}, { get: (_t, key) => String(key) }),
    reportLanguage: 'vi',
  }),
}));
vi.mock('../../services/adminReportService', () => ({
  getAdminReportStats: () => new Promise<AdminReportStats>(() => {}),
}));

import { AdminReportTab } from '../../components/views/AdminReportTab';
import { vnStartOfDay } from '../../lib/vnTime';

function vnDay(addDays: number): string {
  // YYYY-MM-DD of the VN calendar day `addDays` from today.
  return new Date(vnStartOfDay(new Date(), addDays).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function renderAt(search: string) {
  window.history.replaceState(null, '', `/admin${search}`);
  return render(<AdminReportTab />);
}

describe('AdminReportTab retention notice (P1-B G3)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('is hidden while the retention policy is not active (flag unset or not exactly "true")', () => {
    renderAt('?range=custom&start=2020-01-01&end=2020-02-01');
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText('adminReportRetentionNotice')).toBeNull();
    cleanup();
    vi.stubEnv('VITE_ANALYSIS_LOG_RETENTION_ACTIVE', '1');
    renderAt('');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows the 90/400-day notice below the range selector once active', () => {
    vi.stubEnv('VITE_ANALYSIS_LOG_RETENTION_ACTIVE', 'true');
    renderAt('');
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('adminReportRetentionNotice');
    expect(note.textContent).not.toContain('adminReportRetentionOldRange');
    // Placed after the range buttons in document order.
    const today = screen.getByText('adminReportFilterToday');
    expect(today.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Static text only: nothing in it takes focus.
    expect(note.querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('warns that error categories may be empty when a custom range starts before the first fully-detailed day', () => {
    vi.stubEnv('VITE_ANALYSIS_LOG_RETENTION_ACTIVE', 'true');
    renderAt(`?range=custom&start=${vnDay(-90)}&end=${vnDay(0)}`);
    expect(screen.getByRole('note').textContent).toContain('adminReportRetentionOldRange');
  });

  it('does not warn when the custom range starts on the first fully-detailed day or later', () => {
    vi.stubEnv('VITE_ANALYSIS_LOG_RETENTION_ACTIVE', 'true');
    renderAt(`?range=custom&start=${vnDay(-89)}&end=${vnDay(0)}`);
    expect(screen.getByRole('note').textContent).not.toContain('adminReportRetentionOldRange');
    cleanup();
    renderAt('?range=30d&start=2020-01-01&end=2020-02-01'); // stale custom dates ignored
    expect(screen.getByRole('note').textContent).not.toContain('adminReportRetentionOldRange');
  });
});
