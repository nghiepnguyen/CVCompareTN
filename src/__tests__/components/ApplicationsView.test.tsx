// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
import type { Call, FakeDb } from './trackerFakeSupabase';

const ui = vi.hoisted(() => ({ lang: 'vi' as 'vi' | 'en', setActiveTab: vi.fn() }));
const db = vi.hoisted(() => ({ calls: [], respond: () => ({ data: [], error: null }), rpc: vi.fn() }) as unknown as FakeDb);
vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS: labels } = await import('../../translations');
  return { useUI: () => ({ t: labels[ui.lang], reportLanguage: ui.lang, setActiveTab: ui.setActiveTab }) };
});
vi.mock('../../lib/supabase', async () => (await import('./trackerFakeSupabase')).fakeSupabase(db));
vi.mock('../../lib/sentry', () => ({ captureException: vi.fn() }));

import { ApplicationsView } from '../../components/views/ApplicationsView';

const row = (i: number, o: Record<string, unknown> = {}) => ({
  id: `a${i}`, company_name: `Company ${i}`, role_title: `Role ${i}`, status: 'drafted', deadline: null, applied_at: null,
  created_at: '2026-11-01T03:00:00Z', updated_at: '2026-11-02T03:00:00Z', language: 'vi', ...o,
});
const rangeOf = (calls: Call[]) => calls.find((c) => c[1] === 'range')!.slice(2) as [number, number];

beforeEach(() => {
  ui.lang = 'vi';
  db.calls = [];
  db.respond = () => ({ data: [], error: null });
});
afterEach(cleanup);

describe('ApplicationsView list', () => {
  it('loading then empty state with a way back to Analyze', async () => {
    let release!: (v: { data: unknown; error: unknown }) => void;
    db.respond = () => new Promise((r) => { release = r; });
    render(<ApplicationsView />);
    expect(screen.getByText(UI_LABELS.vi.trackerLoading)).toBeTruthy();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release({ data: [], error: null });
    expect(await screen.findByText(UI_LABELS.vi.trackerEmptyTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerGoAnalyze }));
    expect(ui.setActiveTab).toHaveBeenCalledWith('analyze');
  });

  it('error state retries', async () => {
    db.respond = () => ({ data: null, error: { message: 'boom' } });
    render(<ApplicationsView />);
    expect(await screen.findByText(UI_LABELS.vi.trackerLoadError)).toBeTruthy();
    db.respond = () => ({ data: [row(1)], error: null });
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerRetry }));
    expect(await screen.findByText('Role 1')).toBeTruthy();
  });

  it('cards: localized status labels, fallbacks for null company/role, deadline, applied date; no score', async () => {
    db.respond = () => ({ data: [
      row(1, { status: 'no_response', deadline: '2026-11-15', applied_at: '2026-11-01T18:30:00Z' }),
      row(2, { company_name: null, role_title: null, status: 'offer_declined' }),
    ], error: null });
    const { container } = render(<ApplicationsView />);
    await screen.findByText('Role 1');
    expect(screen.getByText(UI_LABELS.vi.trackerStatusNoResponse)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.vi.trackerStatusOfferDeclined)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.vi.trackerCompanyUnset)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.vi.trackerRoleUnset)).toBeTruthy();
    expect(container.textContent).not.toMatch(/no_response|offer_declined/);
    // Deadline is a plain date (no zone shift); applied_at is shown in ICT (01:30 on 2 Nov).
    expect(container.textContent).toContain('15 thg 11, 2026');
    expect(container.textContent).toContain('02 thg 11, 2026');
    expect(container.textContent).toContain('Nộp lần đầu:');
    expect(container.textContent).not.toMatch(/score|điểm/i);
  });

  it('EN labels', async () => {
    ui.lang = 'en';
    db.respond = () => ({ data: [row(1, { company_name: null, status: 'interview' })], error: null });
    render(<ApplicationsView />);
    expect(await screen.findByText(UI_LABELS.en.trackerCompanyUnset)).toBeTruthy();
    expect(screen.getByText('Interview')).toBeTruthy();
    expect(screen.getByText(UI_LABELS.en.trackerTitle)).toBeTruthy();
  });

  it('pagination: load more appends the next bounded page', async () => {
    db.respond = (_t, calls) => {
      const [from] = rangeOf(calls);
      return { data: from === 0 ? Array.from({ length: 21 }, (_, i) => row(i)) : [row(100)], error: null };
    };
    render(<ApplicationsView />);
    await screen.findByText('Role 0');
    expect(screen.queryByText('Role 20')).toBeNull(); // look-ahead row not rendered
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerLoadMore }));
    expect(await screen.findByText('Role 100')).toBeTruthy();
    expect(screen.getByText('Role 0')).toBeTruthy();
    expect(screen.queryByRole('button', { name: UI_LABELS.vi.trackerLoadMore })).toBeNull();
  });

  it('a failed "load more" keeps the loaded rows and can be retried', async () => {
    let failNext = false;
    db.respond = (_t, calls) => {
      const [from] = rangeOf(calls);
      if (from > 0 && failNext) return { data: null, error: { message: 'boom' } };
      return { data: from === 0 ? Array.from({ length: 21 }, (_, i) => row(i)) : [row(100)], error: null };
    };
    render(<ApplicationsView />);
    await screen.findByText('Role 0');
    failNext = true;
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerLoadMore }));
    expect(await screen.findByText(UI_LABELS.vi.trackerLoadError)).toBeTruthy();
    expect(screen.getByText('Role 0')).toBeTruthy();
    failNext = false;
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerLoadMore }));
    expect(await screen.findByText('Role 100')).toBeTruthy();
    expect(screen.queryByText(UI_LABELS.vi.trackerLoadError)).toBeNull();
  });

  it('sort options are the allowlist only (no score); changing sort reloads from page 0', async () => {
    db.respond = () => ({ data: [row(1)], error: null });
    render(<ApplicationsView />);
    await screen.findByText('Role 1');
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['updated_at', 'created_at', 'applied_at', 'deadline', 'company_name']);
    expect(db.calls).toContainEqual(['applications', 'order', 'updated_at', { ascending: false, nullsFirst: false }]);
    fireEvent.change(select, { target: { value: 'deadline' } });
    await screen.findByText('Role 1');
    expect(db.calls).toContainEqual(['applications', 'order', 'deadline', { ascending: true, nullsFirst: false }]);
  });

  it('opens the detail view', async () => {
    db.respond = (table) => table === 'applications'
      ? { data: [row(1)], error: null }
      : { data: [], error: null };
    render(<ApplicationsView />);
    fireEvent.click(await screen.findByText('Role 1'));
    expect(await screen.findByRole('tab', { name: UI_LABELS.vi.trackerTabOverview })).toBeTruthy();
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      UI_LABELS.vi.trackerTabOverview, UI_LABELS.vi.trackerTabDocuments, UI_LABELS.vi.trackerTabTimeline,
    ]);
  });
});
