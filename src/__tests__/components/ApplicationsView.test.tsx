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

const fu = (id: string, state: string, o: Record<string, unknown> = {}) => ({
  application_id: id, stage_entered_at: '2026-10-01T00:00:00Z', last_contact_at: '2026-10-01T00:00:00Z',
  follow_ups_since_reset: 0, follow_up_due_at: '2026-10-08T00:00:00Z', follow_up_state: state, ...o,
});
const fuCalls = () => db.calls.filter((c) => c[0] === 'application_follow_up_state');
const inCalls = () => fuCalls().filter((c) => c[1] === 'in');

describe('ApplicationsView follow-up', () => {
  const L = UI_LABELS;
  const respondWith = (fuRows: unknown[] | Error, apps: unknown[] = [row(1, { status: 'applied' }), row(2, { status: 'applied' }), row(3, { status: 'applied' }), row(4, { status: 'drafted' })]) => {
    db.respond = (table) => table === 'applications'
      ? { data: apps, error: null }
      : fuRows instanceof Error ? { data: null, error: { message: 'no relation' } } : { data: fuRows, error: null };
  };

  it.each(['vi', 'en'] as const)('badges per state (%s); no row renders nothing; chips wrap with status', async (lang) => {
    ui.lang = lang;
    respondWith([fu('a1', 'due'), fu('a2', 'limit_reached'), fu('a3', 'waiting')]);
    const { container } = render(<ApplicationsView />);
    const due = await screen.findByText(L[lang].trackerFollowUpDue);
    const limit = screen.getByText(L[lang].trackerFollowUpLimit);
    const waiting = screen.getByText(L[lang].trackerFollowUpWaiting);
    expect(due.className).toContain('border');
    expect(due.className).toContain('whitespace-nowrap');
    expect(limit.className).toContain('whitespace-nowrap');
    expect(waiting.className).not.toMatch(/border|bg-/);
    expect(due.parentElement!.className).toContain('flex-wrap');
    expect(container.querySelectorAll('li')).toHaveLength(4); // a4 (no row) has no badge
    expect(container.textContent!.match(new RegExp(`${L[lang].trackerFollowUpWaiting}|${L[lang].trackerFollowUpDue}|${L[lang].trackerFollowUpLimit}`, 'g'))).toHaveLength(3);
    expect(container.textContent).toContain(L[lang].trackerLastActivity);
    expect(container.textContent).toContain(lang === 'vi' ? '02 thg 11, 2026' : 'Nov 02, 2026');
  });

  it('hydrates once per page with exactly that page ids, never per card', async () => {
    db.respond = (table, calls) => {
      if (table !== 'applications') return { data: [], error: null };
      const [from] = rangeOf(calls);
      return { data: from === 0 ? Array.from({ length: 21 }, (_, i) => row(i, { status: 'applied' })) : [row(100, { status: 'applied' })], error: null };
    };
    render(<ApplicationsView />);
    await screen.findByText('Role 0');
    await vi.waitFor(() => expect(inCalls()).toHaveLength(1));
    expect(inCalls()[0].slice(2)).toEqual(['application_id', Array.from({ length: 20 }, (_, i) => `a${i}`)]);
    fireEvent.click(screen.getByRole('button', { name: L.vi.trackerLoadMore }));
    await screen.findByText('Role 100');
    await vi.waitFor(() => expect(inCalls()).toHaveLength(2));
    expect(inCalls()[1].slice(2)).toEqual(['application_id', ['a100']]);
    expect(fuCalls().filter((c) => c[1] === 'select')).toHaveLength(2);
  });

  it('a follow-up fetch failure keeps the list, shows no badge and a non-blocking notice', async () => {
    respondWith(new Error('x'));
    render(<ApplicationsView />);
    expect(await screen.findByText('Role 1')).toBeTruthy();
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe(L.vi.trackerFollowUpLoadError);
    expect(screen.queryByText(L.vi.trackerFollowUpDue)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a missing row is silent (no notice)', async () => {
    respondWith([]);
    render(<ApplicationsView />);
    await screen.findByText('Role 1');
    await vi.waitFor(() => expect(inCalls()).toHaveLength(1));
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('hydration vs load-more / list reset', () => {
    const twoPages = (fuResponse: () => Promise<{ data: unknown; error: unknown }>) => {
      db.respond = (table, calls) => {
        if (table === 'application_follow_up_state') return fuResponse();
        const [from] = rangeOf(calls);
        return { data: from === 0 ? Array.from({ length: 21 }, (_, i) => row(i, { status: 'applied' })) : [row(100, { status: 'applied' })], error: null };
      };
    };
    const deferred = () => { let res!: (v: { data: unknown; error: unknown }) => void; const p = new Promise<{ data: unknown; error: unknown }>((r) => { res = r; }); return { p, res }; };

    it('load-more before page-0 hydration settles still attaches page-0 badges', async () => {
      const d = deferred(); let n = 0;
      twoPages(() => (n++ === 0 ? d.p : Promise.resolve({ data: [], error: null })));
      render(<ApplicationsView />);
      await screen.findByText('Role 0');
      fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerLoadMore }));
      await screen.findByText('Role 100');
      d.res({ data: [fu('a0', 'due')], error: null });
      expect(await screen.findByText(UI_LABELS.vi.trackerFollowUpDue)).toBeTruthy();
    });

    it('a page-0 hydration rejection after load-more still shows the notice', async () => {
      const d = deferred(); let n = 0;
      twoPages(() => (n++ === 0 ? d.p : Promise.resolve({ data: [], error: null })));
      render(<ApplicationsView />);
      await screen.findByText('Role 0');
      fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.trackerLoadMore }));
      await screen.findByText('Role 100');
      d.res({ data: null, error: { message: 'boom' } });
      expect((await screen.findByRole('status')).textContent).toBe(UI_LABELS.vi.trackerFollowUpLoadError);
    });

    it('a late response from the previous list (sort change) attaches nothing to the new list', async () => {
      const d = deferred(); let n = 0;
      db.respond = (table) => table === 'application_follow_up_state'
        ? (n++ === 0 ? d.p : Promise.resolve({ data: [], error: null }))
        : { data: [row(1, { status: 'applied' })], error: null };
      render(<ApplicationsView />);
      await screen.findByText('Role 1');
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deadline' } });
      await vi.waitFor(() => expect(inCalls()).toHaveLength(2));
      d.res({ data: [fu('a1', 'due')], error: null });
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(UI_LABELS.vi.trackerFollowUpDue)).toBeNull();
    });
  });

  describe('Needs follow-up filter', () => {
    // Service order (due_at asc) deliberately differs from updated_at order.
    const dueResponder = (opts: { hasMore?: boolean; empty?: boolean } = {}) => {
      db.respond = (table, calls) => {
        if (table === 'application_follow_up_state') {
          const [from] = calls.some((c) => c[1] === 'range') ? rangeOf(calls) : [0];
          if (opts.empty) return { data: [], error: null };
          if (from === 0) return { data: opts.hasMore ? Array.from({ length: 21 }, (_, i) => fu(`d${i}`, 'due')) : [fu('d2', 'due'), fu('d1', 'due')], error: null };
          return { data: [fu('d9', 'due')], error: null };
        }
        const ids = (calls.find((c) => c[1] === 'in')?.[3] as string[] | undefined);
        if (ids) return { data: ids.map((id, i) => row(Number(id.slice(1)), { id, updated_at: `2026-11-0${i + 1}T03:00:00Z`, status: 'applied' })), error: null };
        return { data: [row(7, { status: 'applied' })], error: null };
      };
    };

    it('uses listDueApplications only, disables sort with hint, keeps service order, toggles back', async () => {
      dueResponder();
      const { container } = render(<ApplicationsView />);
      await screen.findByText('Role 7');
      const toggle = screen.getByRole('button', { name: L.vi.trackerFilterNeedsFollowUp });
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(toggle.className).toContain('cursor-pointer');
      db.calls = [];
      fireEvent.click(toggle);
      await screen.findByText('Role 2');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
      expect(screen.getByText(L.vi.trackerFollowUpSortHint)).toBeTruthy();
      expect(db.calls.some((c) => c[0] === 'applications' && c[1] === 'order')).toBe(false); // not listApplications
      expect(fuCalls().some((c) => c[1] === 'eq' && c[2] === 'follow_up_state' && c[3] === 'due')).toBe(true);
      expect(inCalls()).toHaveLength(0); // items carry followUp; no per-page hydration
      expect([...container.querySelectorAll('li')].map((li) => li.textContent!.match(/Role \d/)![0])).toEqual(['Role 2', 'Role 1']);
      expect(container.querySelectorAll('li')[0].textContent).toContain(L.vi.trackerFollowUpDue);
      db.calls = [];
      fireEvent.click(toggle);
      await screen.findByText('Role 7');
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false);
      expect(screen.queryByText(L.vi.trackerFollowUpSortHint)).toBeNull();
      expect(db.calls).toContainEqual(['applications', 'order', 'updated_at', { ascending: false, nullsFirst: false }]);
      expect(rangeOf(db.calls.filter((c) => c[0] === 'applications'))).toEqual([0, 20]);
    });

    it('load more in filter mode requests page 1 of the due list', async () => {
      dueResponder({ hasMore: true });
      render(<ApplicationsView />);
      await screen.findByText('Role 7');
      fireEvent.click(screen.getByRole('button', { name: L.vi.trackerFilterNeedsFollowUp }));
      await screen.findByText('Role 0');
      db.calls = [];
      fireEvent.click(screen.getByRole('button', { name: L.vi.trackerLoadMore }));
      await screen.findByText('Role 9');
      expect(rangeOf(fuCalls())).toEqual([20, 40]);
      expect(screen.getByText('Role 0')).toBeTruthy();
    });

    it('empty due list shows the follow-up empty copy, not the Analyze empty state (EN too)', async () => {
      ui.lang = 'en';
      dueResponder({ empty: true });
      render(<ApplicationsView />);
      await screen.findByText('Role 7');
      fireEvent.click(screen.getByRole('button', { name: L.en.trackerFilterNeedsFollowUp }));
      expect(await screen.findByText(L.en.trackerFollowUpEmpty)).toBeTruthy();
      expect(screen.getByText(L.en.trackerFollowUpSortHint)).toBeTruthy();
      expect(screen.queryByText(L.en.trackerEmptyTitle)).toBeNull();
      expect(screen.queryByRole('button', { name: L.en.trackerGoAnalyze })).toBeNull();
    });

    it('header controls wrap', async () => {
      dueResponder();
      const { container } = render(<ApplicationsView />);
      await screen.findByText('Role 7');
      const toggle = screen.getByRole('button', { name: L.vi.trackerFilterNeedsFollowUp });
      expect(toggle.parentElement!.className).toContain('flex-wrap');
      expect(container.querySelector('select')!.closest('div')!.className).toContain('flex-wrap');
    });
  });
});
