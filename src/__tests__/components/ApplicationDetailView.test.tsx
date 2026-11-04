// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor, act } from '@testing-library/react';
import { UI_LABELS, formatLabel } from '../../translations';
import type { FakeDb } from './trackerFakeSupabase';

const ui = vi.hoisted(() => ({ lang: 'vi' as 'vi' | 'en' }));
const db = vi.hoisted(() => ({ calls: [], respond: () => ({ data: [], error: null }), rpc: vi.fn() }) as unknown as FakeDb);
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS: labels } = await import('../../translations');
  return { useUI: () => ({ t: labels[ui.lang], reportLanguage: ui.lang }) };
});
vi.mock('../../lib/supabase', async () => (await import('./trackerFakeSupabase')).fakeSupabase(db));
vi.mock('../../lib/sentry', () => sentry);

import type { ApplicationEvent } from '../../services/applicationTypes';
import { ApplicationDetailView } from '../../components/views/applications/ApplicationDetailView';
import * as intentsModule from '../../components/views/applications/useTrackerMutation';

let seq = 0;
let app: Record<string, unknown>;
let docs: Record<string, unknown>[];
let events: Record<string, unknown>[];
let followUp: Record<string, unknown>[] | Error;
const vi_ = UI_LABELS.vi;

const cvDoc = { document_type: 'cv', created_at: '2026-11-01T03:00:00Z', metadata: { snapshotVersion: 1, fileName: 'nguyen-cv.pdf' },
  content: { parsedCV: { personal_information: { full_name: 'Nguyen Van A', summary: 'Backend dev' }, work_experience: [{ job_title: 'Engineer', company: 'Old Co', duration: { start: '2020', end: '2024' } }], skills: { technical_skills: ['Go'] } } } };
const jdDoc = { document_type: 'jd', created_at: '2026-11-01T03:00:00Z', content: { text: 'We need Go and Postgres.' },
  metadata: { snapshotVersion: 1, analysis: { matchScore: 72, passProbability: 'Cao', requirements: [{ requirement: 'Go', status: 'matched', verification: 'met' }] } } };
const letterDoc = { document_type: 'cover_letter', created_at: '2026-11-01T03:00:00Z', content: { text: 'Kính gửi Acme' }, metadata: { snapshotVersion: 1, language: 'vi' } };

beforeEach(() => {
  ui.lang = 'vi';
  // Intent keys live in module scope per application: fresh id per test.
  app = { id: `app-${++seq}`, company_name: 'Acme', role_title: 'Backend Engineer', status: 'drafted', deadline: null, applied_at: null,
    created_at: '2026-11-01T03:00:00Z', updated_at: '2026-11-02T03:00:00.123456+00:00', language: 'vi' };
  docs = [cvDoc, jdDoc];
  events = [{ id: 'e0', event_type: 'created', from_status: null, to_status: null, note: null, metadata: {}, occurred_at: '2026-11-01T03:00:00Z', created_at: '2026-11-01T03:00:00Z' }];
  db.calls = [];
  db.rpc.mockReset();
  sentry.captureException.mockReset();
  followUp = [];
  db.respond = (table) => {
    if (table === 'application_follow_up_state') return followUp instanceof Error ? Promise.reject(followUp) : { data: followUp, error: null };
    return { data: table === 'applications' ? app : table === 'application_documents' ? docs : events, error: null };
  };
});
afterEach(cleanup);

const renderDetail = async () => {
  render(<ApplicationDetailView applicationId={app.id as string} onBack={() => {}} />);
  await screen.findByRole('tablist');
};
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const pending = () => { let resolve!: (v: unknown) => void; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };
const appFetches = () => db.calls.filter((c) => c[0] === 'applications' && c[1] === 'maybeSingle').length;
const keysOf = (name: string) => db.rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1].p_idempotency_key);

describe('Overview', () => {
  it.each(['vi', 'en'] as const)('first-applied label is historical, with a quiet explanation (%s)', async (lang) => {
    ui.lang = lang;
    const L = UI_LABELS[lang];
    app.applied_at = '2026-10-20T05:00:00Z';
    app.status = 'drafted'; // corrected back after applying: date stays
    await renderDetail();
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain(lang === 'vi' ? 'Nộp lần đầu' : 'First applied');
    expect(within(panel).getByText(L.trackerAppliedDateHint)).toBeTruthy();
    expect(L.trackerAppliedDateHint).toBe(lang === 'vi'
      ? 'Ngày ứng tuyển được ghi nhận lần đầu. Không thay đổi khi trạng thái được chỉnh sửa.'
      : 'The first recorded application date. It does not change when the status is corrected later.');
    expect(panel.textContent).toContain(lang === 'vi' ? '20 thg 10, 2026' : 'Oct 20, 2026');
  });

  it('shows workflow fields, actions, no score', async () => {
    app.deadline = '2026-11-15';
    await renderDetail();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Acme')).toBeTruthy();
    expect(within(panel).getByText(vi_.trackerStatusDrafted)).toBeTruthy();
    expect(panel.textContent).toContain('15 thg 11, 2026');
    for (const a of [vi_.trackerChangeStatus, vi_.trackerEditDetails, vi_.trackerAddNote]) expect(screen.getByRole('button', { name: a })).toBeTruthy();
    expect(panel.textContent).not.toContain(vi_.trackerScoreAtSave);
  });
});

describe('Documents', () => {
  it('renders immutable CV / JD / letter snapshots, score at save time as secondary context, no edit actions', async () => {
    docs = [cvDoc, jdDoc, letterDoc];
    await renderDetail();
    openTab(vi_.trackerTabDocuments);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Nguyen Van A')).toBeTruthy();
    expect(within(panel).getByText('nguyen-cv.pdf')).toBeTruthy();
    expect(within(panel).getByText('We need Go and Postgres.')).toBeTruthy();
    expect(within(panel).getByText('Kính gửi Acme')).toBeTruthy();
    expect(panel.textContent).toContain(`${vi_.trackerScoreAtSave}: 72/100`);
    expect(panel.textContent).toContain(vi_.trackerScoreAtSaveHint);
    expect(panel.textContent).toContain(vi_.trackerDocsReadOnly);
    fireEvent.click(within(panel).getByText(new RegExp(vi_.trackerRequirementsAtSave)));
    expect(panel.textContent).toContain(`Go — ${vi_.matched} · ${vi_.verificationMet}`);
    expect(panel.textContent).not.toMatch(/\b(matched|partial|missing|met|unmet|unknown)\b/);
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    // Snapshot is the authority: no analysis / history reads.
    expect(db.calls.some((c) => c[0] === 'history')).toBe(false);
  });

  it('cover letter absent', async () => {
    await renderDetail();
    openTab(vi_.trackerTabDocuments);
    expect(screen.getByText(vi_.trackerDocNoCoverLetter)).toBeTruthy();
  });

  it('EN score label', async () => {
    ui.lang = 'en';
    await renderDetail();
    openTab(UI_LABELS.en.trackerTabDocuments);
    expect(screen.getByRole('tabpanel').textContent).toContain('Score at save time: 72/100');
  });
});

describe('Timeline', () => {
  it('renders human meaning for every event type, notes as text, no raw JSON or raw statuses', async () => {
    events = [
      { id: 'e4', event_type: 'details_updated', from_status: null, to_status: null, note: null,
        metadata: { changedFields: ['deadline', 'company_name'], deadline: { from: null, to: '2026-11-15' }, company_name: { from: null, to: 'Acme' } },
        occurred_at: '2026-11-04T03:00:00Z', created_at: '2026-11-04T03:00:00Z' },
      { id: 'e3', event_type: 'note', from_status: null, to_status: null, note: '<b>Called</b> HR', metadata: {}, occurred_at: '2026-11-03T03:00:00Z', created_at: '2026-11-03T03:00:00Z' },
      { id: 'e2', event_type: 'status_changed', from_status: 'applied', to_status: 'no_response', note: null, metadata: {}, occurred_at: '2026-11-02T03:00:00Z', created_at: '2026-11-02T03:00:00Z' },
      ...events,
    ];
    await renderDetail();
    openTab(vi_.trackerTabTimeline);
    const list = screen.getByRole('tabpanel');
    const text = list.textContent!;
    expect(text).toContain(vi_.trackerEvCreated);
    expect(text).toContain(formatLabel(vi_.trackerEvStatus, { from: vi_.trackerStatusApplied, to: vi_.trackerStatusNoResponse }));
    expect(text).toContain(vi_.trackerEvNote);
    expect(text).toContain(formatLabel(vi_.trackerEvDeadline, { value: '15 thg 11, 2026' }));
    expect(text).toContain(formatLabel(vi_.trackerEvCompany, { value: 'Acme' }));
    expect(within(list).getByText('<b>Called</b> HR')).toBeTruthy();
    expect(list.querySelector('b')).toBeNull();
    expect(text).not.toMatch(/no_response|changedFields|\{"/);
    // Newest first, as returned.
    expect(text.indexOf(vi_.trackerEvDetails)).toBeLessThan(text.indexOf(vi_.trackerEvCreated));
  });
});

describe('Timeline unknown events', () => {
  const row = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, event_type: type, from_status: null, to_status: null, note: 'x', metadata: {},
    occurred_at: '2026-11-0' + id.slice(1) + 'T03:00:00Z', created_at: '2026-11-0' + id.slice(1) + 'T03:00:00Z', ...extra });

  it('unknown event type renders a generic title', async () => {
    // Simulates a DB event_type newer than this client; follow_up_sent/contact_received are known since P2C.
    const future = 'future_event_type' as ApplicationEvent['type'];
    events = [row('e5', future), row('e6', 'follow_up_sent'), row('e7', 'contact_received'),
      row('e1', 'status_changed', { from_status: 'applied', to_status: 'no_response', note: null }), row('e2', 'note'), row('e3', 'details_updated', { note: null }), ...events];
    await renderDetail();
    openTab(vi_.trackerTabTimeline);
    const list = screen.getByRole('tabpanel');
    expect(vi_.trackerEvUnknown).toBe('Hoạt động');
    expect(within(list).getAllByText('Hoạt động')).toHaveLength(1);
    expect(within(list).getAllByText('x')).toHaveLength(4); // 1 unknown + follow_up_sent + contact_received + note event
    expect(list.textContent).not.toMatch(/future_event_type|follow_up_sent|contact_received/);
    // Known titles unchanged.
    for (const known of [vi_.trackerEvFollowUpSent, vi_.trackerEvContactReceived, vi_.trackerEvCreated, vi_.trackerEvNote, vi_.trackerEvDetails, formatLabel(vi_.trackerEvStatus, { from: vi_.trackerStatusApplied, to: vi_.trackerStatusNoResponse })]) {
      expect(list.textContent).toContain(known);
    }
    expect(list.textContent).not.toContain('Activity');
  });

  it('unknown event type renders "Activity" in English', async () => {
    ui.lang = 'en';
    events = [row('e5', 'future_event_type'), ...events];
    await renderDetail();
    openTab(UI_LABELS.en.trackerTabTimeline);
    const list = screen.getByRole('tabpanel');
    expect(within(list).getByText('Activity')).toBeTruthy();
    expect(within(list).getByText('x')).toBeTruthy();
    expect(list.textContent).not.toContain('future_event_type');
    expect(list.textContent).toContain(UI_LABELS.en.trackerEvCreated);
  });
});

describe('Status change', () => {
  it('offers only allowed transitions; sends CAS + one key; double click = one RPC', async () => {
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    click(vi_.trackerChangeStatus);
    const select = screen.getByLabelText(vi_.trackerNewStatus) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['applied', 'withdrawn']);
    click(vi_.trackerSave);
    click(vi_.trackerSaving);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_application_id: app.id, p_expected_status: 'drafted', p_to_status: 'applied', p_occurred_at: null, p_note: null });
    app.status = 'applied';
    call.resolve({ data: { event_id: 'e9', replayed: false }, error: null });
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain(vi_.trackerStatusApplied));
    expect(screen.queryByLabelText(vi_.trackerNewStatus)).toBeNull();
  });

  it('uncertain failure keeps the key (retry is a replay), even across remount; next intent gets a new key', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await renderDetail();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrGeneric)).toBeTruthy();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    cleanup();
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e9', replayed: true }, error: null });
    await renderDetail();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(2));
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e10', replayed: false }, error: null });
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNewStatus)).toBeNull());
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(3));
    const [k1, k2, k3] = keysOf('transition_application_status');
    expect(k2).toBe(k1);
    expect(k3).not.toBe(k1);
  });

  it('stale_status: message survives the reload to the new status; options follow it; nothing to Sentry', async () => {
    // Another tab moved it to applied meanwhile.
    db.rpc.mockImplementation(async () => { app.status = 'applied'; return { data: null, error: { message: 'stale_status', details: 'Failing row contains (secret)' } }; });
    await renderDetail();
    const before = appFetches();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getAllByText(vi_.trackerStatusApplied).length).toBeGreaterThan(0));
    expect(screen.getByText(vi_.trackerErrStale)).toBeTruthy();
    const select = screen.getByLabelText(vi_.trackerNewStatus) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['drafted', 'interview', 'rejected', 'no_response', 'withdrawn']);
    expect(select.value).toBe('drafted');
    expect(document.body.textContent).not.toContain('secret');
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('invalid_transition and server errors are localized', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_transition' } });
    await renderDetail();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrInvalidTransition)).toBeTruthy();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'internal error: relation "x" violates check' } });
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrGeneric)).toBeTruthy();
    expect(document.body.textContent).not.toContain('relation');
    const [k1, k2] = keysOf('transition_application_status');
    expect(k2).not.toBe(k1);
  });

  it.each(['vi', 'en'] as const)('final-state correction requires confirmation (%s)', async (lang) => {
    ui.lang = lang;
    const L = UI_LABELS[lang];
    app.status = 'rejected';
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e9', replayed: false }, error: null });
    await renderDetail();
    click(L.trackerChangeStatus);
    fireEvent.change(screen.getByLabelText(L.trackerNewStatus), { target: { value: 'interview' } });
    click(L.trackerSave);
    expect(db.rpc).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(formatLabel(L.trackerFinalConfirm, { from: L.trackerStatusRejected, to: L.trackerStatusInterview }));
    fireEvent.click(within(dialog).getByRole('button', { name: L.trackerConfirm }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_expected_status: 'rejected', p_to_status: 'interview' });
  });

  it('a past date is sent as that ICT day; note optional and trimmed', async () => {
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e9', replayed: false }, error: null });
    await renderDetail();
    click(vi_.trackerChangeStatus);
    fireEvent.change(screen.getByLabelText(vi_.trackerOccurredOn), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText(vi_.trackerNoteOptional), { target: { value: '  via LinkedIn  ' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalled());
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_occurred_at: '2026-10-20T12:00:00+07:00', p_note: 'via LinkedIn' });
  });
});

describe('Notes', () => {
  it('empty / too long rejected client-side; trimmed note sent once; retry reuses key', async () => {
    await renderDetail();
    click(vi_.trackerAddNote);
    click(vi_.trackerSave);
    expect(screen.getByText(vi_.trackerNoteEmpty)).toBeTruthy();
    const box = screen.getByLabelText(vi_.trackerNoteLabel);
    fireEvent.change(box, { target: { value: 'x'.repeat(2001) } });
    click(vi_.trackerSave);
    expect(screen.getByText(formatLabel(vi_.trackerTooLong, { max: 2000 }))).toBeTruthy();
    expect(db.rpc).not.toHaveBeenCalled();

    const secret = 'Recruiter said salary 50M';
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    fireEvent.change(box, { target: { value: `  ${secret}  ` } });
    click(vi_.trackerSave);
    click(vi_.trackerSaving);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_note: secret });
    call.resolve({ data: null, error: { message: 'Failed to fetch' } });
    expect(await screen.findByText(vi_.trackerErrGeneric)).toBeTruthy();
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e5', replayed: true }, error: null });
    click(vi_.trackerRetry); // R1: unresolved mode replaces Save with Retry
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(2));
    const [k1, k2] = keysOf('add_application_note');
    expect(k2).toBe(k1);
    // Telemetry never carries note content.
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('salary');
  });
});

describe('Details concurrency', () => {
  it('sends the version the form opened with; on success shows the returned server row before any reload', async () => {
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e6', changed: true, replayed: false,
      application: { company_name: 'Beta', role_title: 'Backend Engineer', deadline: null, updated_at: '2026-11-03T00:00:00.5+00:00' } }, error: null });
    await renderDetail();
    // From here on the reload hangs: only the RPC's returned row can show "Beta".
    const respond = db.respond;
    db.respond = (table, calls) => (table === 'applications' ? new Promise(() => {}) : respond(table, calls));
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: 'Beta' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalled());
    expect(db.rpc.mock.calls[0][1].p_expected_updated_at).toBe('2026-11-02T03:00:00.123456+00:00');
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getAllByText('Beta').length).toBeGreaterThan(0));
  });

  it('stale_application: refetches, shows the newer data, never resends the rejected edit; retry after review is a new intent on the new version', async () => {
    db.rpc.mockImplementationOnce(async () => {
      // Another tab saved first.
      app.company_name = 'Server Co';
      app.updated_at = '2026-11-03T09:00:00.000001+00:00';
      return { data: null, error: { message: 'stale_application', details: 'secret row' } };
    });
    await renderDetail();
    const before = appFetches();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: 'Mine' } });
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrStaleApplication)).toBeTruthy();
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    await waitFor(() => expect((screen.getByLabelText(vi_.trackerCompanyLabel) as HTMLInputElement).value).toBe('Server Co'));
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('secret');
    expect(sentry.captureException).not.toHaveBeenCalled();

    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e7', changed: true, replayed: false }, error: null });
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: 'Mine again' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(2));
    const [first, second] = db.rpc.mock.calls.map((c) => c[1]);
    expect(second.p_idempotency_key).not.toBe(first.p_idempotency_key);
    expect(second.p_expected_updated_at).toBe('2026-11-03T09:00:00.000001+00:00');
    expect(second.p_company_name).toBe('Mine again');
  });

  it('EN stale message', async () => {
    ui.lang = 'en';
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'stale_application' } });
    await renderDetail();
    click(UI_LABELS.en.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(UI_LABELS.en.trackerCompanyLabel), { target: { value: 'X' } });
    click(UI_LABELS.en.trackerSave);
    expect(await screen.findByText('This application was updated elsewhere. The latest data has been reloaded; review it and try again.')).toBeTruthy();
  });
});

describe('Timeline pagination', () => {
  const types = ['note', 'status_changed', 'details_updated'] as const;
  const mkEvent = (i: number) => {
    const type = i === 119 ? 'created' : types[i % 3];
    return {
      id: `ev-${String(i).padStart(3, '0')}`, event_type: type,
      from_status: type === 'status_changed' ? 'applied' : null, to_status: type === 'status_changed' ? 'interview' : null,
      note: type === 'note' ? `note ${i}` : null,
      metadata: type === 'details_updated' ? { changedFields: ['company_name'], company_name: { from: null, to: `Co ${i}` } } : {},
      // Pairs share a timestamp: the server's id tiebreak keeps them ordered.
      occurred_at: new Date(Date.UTC(2026, 10, 1) - Math.floor(i / 2) * 60000).toISOString(), created_at: '2026-11-01T00:00:00Z',
    };
  };
  let all: ReturnType<typeof mkEvent>[];
  beforeEach(() => {
    all = Array.from({ length: 120 }, (_, i) => mkEvent(i));
    db.respond = (table, calls) => {
      if (table !== 'application_events') return { data: table === 'applications' ? app : docs, error: null };
      const [from, to] = calls.find((c) => c[1] === 'range')!.slice(2) as [number, number];
      return { data: all.slice(from, to + 1), error: null };
    };
  });
  const items = () => screen.getByRole('tabpanel').querySelectorAll('li');

  it('first page, load more, final page; all event types render across boundaries; no duplicates', async () => {
    await renderDetail();
    openTab(vi_.trackerTabTimeline);
    expect(items()).toHaveLength(50);
    click(vi_.trackerTimelineMore);
    await waitFor(() => expect(items()).toHaveLength(100));
    // A new event arrives between page loads: rows shift down one; the overlap is dropped.
    all.unshift({ ...mkEvent(0), id: 'ev-new', note: 'newer' });
    click(vi_.trackerTimelineMore);
    await waitFor(() => expect(items()).toHaveLength(120));
    expect(screen.queryByRole('button', { name: vi_.trackerTimelineMore })).toBeNull();
    const text = screen.getByRole('tabpanel').textContent!;
    expect(text).toContain('note 99');
    expect(text).toContain(formatLabel(vi_.trackerEvCompany, { value: 'Co 101' }));
    expect(text).toContain(formatLabel(vi_.trackerEvStatus, { from: vi_.trackerStatusApplied, to: vi_.trackerStatusInterview }));
    expect(text).toContain(vi_.trackerEvCreated);
    expect([...items()].filter((li) => li.textContent!.includes('note 99')).length).toBe(1);
    expect(new Set([...items()].map((li) => li.textContent)).size).toBe(120);
    // Order of rendered rows = server order.
    expect(text.indexOf('note 0')).toBeLessThan(text.indexOf('note 3'));
    const ranges = db.calls.filter((c) => c[0] === 'application_events' && c[1] === 'range').map((c) => c.slice(2));
    expect(ranges).toEqual([[0, 50], [50, 100], [100, 150]]);
  });

  it('empty timeline', async () => {
    all = [];
    await renderDetail();
    openTab(vi_.trackerTabTimeline);
    expect(screen.getByText(vi_.trackerTimelineEmpty)).toBeTruthy();
    expect(screen.queryByRole('button', { name: vi_.trackerTimelineMore })).toBeNull();
  });
});

describe('Details', () => {
  it('no-op does not call the server', async () => {
    await renderDetail();
    click(vi_.trackerEditDetails);
    click(vi_.trackerSave);
    expect(screen.getByText(vi_.trackerNoChanges)).toBeTruthy();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('edits company, role, deadline together (trimmed); clears to null; double click once; retry reuses key', async () => {
    app.deadline = '2026-11-15';
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: '  Beta  ' } });
    fireEvent.change(screen.getByLabelText(vi_.trackerRoleLabel), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(vi_.trackerDeadlineLabel), { target: { value: '' } });
    click(vi_.trackerSave);
    click(vi_.trackerSaving);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0]).toEqual(['update_application_details', expect.objectContaining({ p_company_name: 'Beta', p_role_title: null, p_deadline: null })]);
    call.resolve({ data: null, error: { message: 'Failed to fetch' } });
    expect(await screen.findByText(vi_.trackerErrGeneric)).toBeTruthy();
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e6', changed: true, replayed: false }, error: null });
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(2));
    const [k1, k2] = keysOf('update_application_details');
    expect(k2).toBe(k1);
    // Same intent = same key AND same base version.
    const [c1, c2] = db.rpc.mock.calls.map((c) => c[1]);
    expect(c2.p_expected_updated_at).toBe(c1.p_expected_updated_at);
    expect(c2).toEqual(c1);
  });

  it('edits only the deadline', async () => {
    db.rpc.mockResolvedValueOnce({ data: { event_id: 'e6', changed: true, replayed: false }, error: null });
    await renderDetail();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerDeadlineLabel), { target: { value: '2026-12-01' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalled());
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_company_name: 'Acme', p_role_title: 'Backend Engineer', p_deadline: '2026-12-01' });
  });

  it('too long text is rejected client-side', async () => {
    await renderDetail();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: 'x'.repeat(201) } });
    expect(screen.getByText(formatLabel(vi_.trackerTooLong, { max: 200 }))).toBeTruthy();
    expect((screen.getByRole('button', { name: vi_.trackerSave }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Follow-up and contact actions (P2C)', () => {
  const fuRow = (state: string, extra: Record<string, unknown> = {}) => ({ application_id: app.id, stage_entered_at: '2026-10-20T03:00:00Z', last_contact_at: '2026-10-20T03:00:00Z',
    follow_ups_since_reset: 0, follow_up_due_at: '2026-11-10T00:00:00Z', follow_up_state: state, ...extra });
  const fuFetches = () => db.calls.filter((c) => c[0] === 'application_follow_up_state' && c[1] === 'select').length;
  const logCalls = () => db.rpc.mock.calls.filter((c) => c[0] === 'log_application_contact').map((c) => c[1]);
  const ok = (id = 'e9', replayed = false) => ({ data: { event_id: id, replayed }, error: null });
  const overview = () => screen.getByRole('tabpanel');
  const timelineRow = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, event_type: type, from_status: null, to_status: null, note: null, metadata: {},
    occurred_at: '2026-11-0' + id.slice(1) + 'T03:00:00Z', created_at: '2026-11-0' + id.slice(1) + 'T03:00:00Z', ...extra });

  it.each(['vi', 'en'] as const)('applied: waiting / due / limit Field (%s)', async (lang) => {
    ui.lang = lang;
    const L = UI_LABELS[lang];
    app.status = 'applied';
    followUp = [fuRow('waiting')];
    await renderDetail();
    expect(overview().textContent).toContain(formatLabel(L.trackerFollowUpWaitingFrom, { date: lang === 'vi' ? '10 thg 11, 2026' : 'Nov 10, 2026' }));
    cleanup();
    followUp = [fuRow('due')];
    await renderDetail();
    expect(overview().textContent).toContain(L.trackerFollowUpDueDetail);
    cleanup();
    followUp = [fuRow('limit_reached', { follow_ups_since_reset: 2 })];
    await renderDetail();
    expect(overview().textContent).toContain(L.trackerFollowUpLimitDetail);
    expect(within(overview()).getByText(L.trackerFollowUpLimitHint)).toBeTruthy();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('exact copy', () => {
    expect(vi_.trackerFollowUpDueDetail).toBe('Nên follow-up');
    expect(UI_LABELS.en.trackerFollowUpDueDetail).toBe('Follow-up due');
    expect(vi_.trackerEmployerReplied).toBe('Nhà tuyển dụng đã phản hồi');
    expect(UI_LABELS.en.trackerEmployerReplied).toBe('Employer replied');
    expect(UI_LABELS.en.trackerMarkFollowUpSent).toBe('Mark as sent');
  });

  it.each(['drafted', 'interview', 'offer', 'rejected', 'hired'])('%s: no follow-up Field, no contact buttons', async (status) => {
    app.status = status;
    followUp = [fuRow('due')];
    await renderDetail();
    expect(overview().textContent).not.toContain(vi_.trackerFollowUpDueDetail);
    expect(screen.queryByRole('button', { name: vi_.trackerMarkFollowUpSent })).toBeNull();
    expect(screen.queryByRole('button', { name: vi_.trackerEmployerReplied })).toBeNull();
  });

  it('a follow-up read failure is non-fatal: detail still renders', async () => {
    app.status = 'applied';
    followUp = new Error('boom');
    await renderDetail();
    expect(overview().textContent).toContain('Acme');
    expect(overview().textContent).not.toContain(vi_.trackerFollowUpDueDetail);
    expect(screen.getByRole('button', { name: vi_.trackerMarkFollowUpSent })).toBeTruthy();
  });

  it('Mark as sent: today = null; one call, double click = one; success reloads detail AND follow-up state; form closes', async () => {
    app.status = 'applied';
    followUp = [fuRow('due')];
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    const before = { app: appFetches(), fu: fuFetches() };
    click(vi_.trackerMarkFollowUpSent);
    fireEvent.change(screen.getByLabelText(vi_.trackerNoteOptional), { target: { value: '  ping  ' } });
    click(vi_.trackerSave);
    click(vi_.trackerSaving);
    expect(logCalls()).toHaveLength(1);
    expect(logCalls()[0]).toMatchObject({ p_application_id: app.id, p_event_type: 'follow_up_sent', p_occurred_at: null, p_note: 'ping' });
    followUp = [fuRow('waiting')];
    call.resolve(ok());
    await waitFor(() => expect(fuFetches()).toBeGreaterThan(before.fu));
    expect(appFetches()).toBeGreaterThan(before.app);
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNoteOptional)).toBeNull());
    await waitFor(() => expect(overview().textContent).toContain('Đang chờ phản hồi'));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('limit_reached still shows Mark as sent and submitting calls the RPC', async () => {
    app.status = 'applied';
    followUp = [fuRow('limit_reached', { follow_ups_since_reset: 2 })];
    db.rpc.mockResolvedValueOnce(ok());
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    expect(db.rpc.mock.calls.every((c) => c[0] === 'log_application_contact')).toBe(true);
  });

  it('Employer replied sends contact_received with a past ICT day', async () => {
    app.status = 'applied';
    db.rpc.mockResolvedValueOnce(ok());
    await renderDetail();
    click(vi_.trackerEmployerReplied);
    fireEvent.change(screen.getByLabelText(vi_.trackerOccurredOn), { target: { value: '2026-10-20' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    expect(logCalls()[0]).toMatchObject({ p_event_type: 'contact_received', p_occurred_at: '2026-10-20T12:00:00+07:00', p_note: null });
  });

  it('date uses ICT: when UTC day != ICT day, today is null and the UTC day is a past day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-03T18:00:00Z')); // 2026-11-04 in ICT
      app.status = 'applied';
      db.rpc.mockResolvedValue(ok());
      await renderDetail();
      click(vi_.trackerMarkFollowUpSent);
      expect((screen.getByLabelText(vi_.trackerOccurredOn) as HTMLInputElement).value).toBe('2026-11-04');
      click(vi_.trackerSave);
      await waitFor(() => expect(logCalls()).toHaveLength(1));
      expect(logCalls()[0].p_occurred_at).toBeNull();
      click(vi_.trackerMarkFollowUpSent);
      fireEvent.change(screen.getByLabelText(vi_.trackerOccurredOn), { target: { value: '2026-11-03' } });
      click(vi_.trackerSave);
      await waitFor(() => expect(logCalls()).toHaveLength(2));
      expect(logCalls()[1].p_occurred_at).toBe('2026-11-03T12:00:00+07:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('replay is success: one reload, form closes, no error', async () => {
    app.status = 'applied';
    db.rpc.mockResolvedValueOnce(ok('e9', true));
    await renderDetail();
    const before = appFetches();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNoteOptional)).toBeNull());
    await waitFor(() => expect(appFetches()).toBe(before + 1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('unknown error: Sentry gets no note; retry and remount keep the key; success then new submit = new key', async () => {
    app.status = 'applied';
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    fireEvent.change(screen.getByLabelText(vi_.trackerNoteOptional), { target: { value: 'secret salary' } });
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrGeneric)).toBeTruthy();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('secret');
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    click(vi_.trackerRetry); // retry in place (R1: unresolved mode replaces Save with Retry)
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    cleanup(); // remount, not Cancel
    db.rpc.mockResolvedValueOnce(ok());
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerRetry);
    await waitFor(() => expect(logCalls()).toHaveLength(3));
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNoteOptional)).toBeNull());
    db.rpc.mockResolvedValueOnce(ok('e10'));
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(4));
    const [k1, k2, k3, k4] = logCalls().map((c) => c.p_idempotency_key);
    expect(k2).toBe(k1);
    expect(k3).toBe(k1);
    expect(k4).not.toBe(k1);
  });

  it('keys are scoped per event type and application; Close keeps an unresolved intent (R1)', async () => {
    app.status = 'applied';
    const idA = app.id as string;
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerUnresolvedClose); // R1: keeps follow_up_sent:A (outcome unknown)
    click(vi_.trackerEmployerReplied);
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerMarkFollowUpSent); // switches panel; contact_received:A key persists
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    click(vi_.trackerRetry);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerEmployerReplied);
    db.rpc.mockResolvedValueOnce(ok());
    click(vi_.trackerRetry);
    await waitFor(() => expect(logCalls()).toHaveLength(4));
    const keys = logCalls().map((c) => c.p_idempotency_key);
    expect(new Set([keys[0], keys[1]]).size).toBe(2); // scopes differ
    expect(keys[2]).toBe(keys[0]); // R1: Close kept follow_up_sent:A, its retry reuses the key
    expect(keys[3]).toBe(keys[1]); // retry of contact_received:A reuses its key
    // follow_up_sent:A (uncertain) vs another application
    cleanup();
    seq += 1;
    app = { ...app, id: `app-${seq}` };
    db.rpc.mockResolvedValueOnce(ok());
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(5));
    expect(logCalls()[4].p_idempotency_key).not.toBe(keys[2]);
    expect(logCalls()[4].p_application_id).not.toBe(idA);
  });

  it('contact_not_allowed: VI message stays after reload, nothing else sent, no Sentry, key cleared', async () => {
    app.status = 'applied';
    db.rpc.mockImplementation(async () => { app.status = 'interview'; return { data: null, error: { message: 'contact_not_allowed' } }; });
    await renderDetail();
    const before = appFetches();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    expect(await screen.findByText(vi_.trackerErrContactNotAllowed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: vi_.trackerMarkFollowUpSent })).toBeNull(); // buttons follow the fresh status
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.every((c) => c[0] === 'log_application_contact')).toBe(true);
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    const [k1, k2] = logCalls().map((c) => c.p_idempotency_key);
    expect(k2).not.toBe(k1);
    openTab(vi_.trackerTabTimeline);
    expect(screen.getByRole('tabpanel').textContent).not.toContain(vi_.trackerEvFollowUpSent);
  });

  it.each(['vi', 'en'] as const)('timeline: contact titles, text-only notes, future fallback (%s)', async (lang) => {
    ui.lang = lang;
    const L = UI_LABELS[lang];
    events = [timelineRow('e5', 'follow_up_sent', { note: '<b>x</b>' }), timelineRow('e6', 'contact_received'), timelineRow('e7', 'future_event_type'), ...events];
    await renderDetail();
    openTab(L.trackerTabTimeline);
    const list = screen.getByRole('tabpanel');
    expect(list.textContent).toContain(L.trackerEvFollowUpSent);
    expect(list.textContent).toContain(L.trackerEvContactReceived);
    expect(within(list).getAllByText(L.trackerEvUnknown)).toHaveLength(1);
    expect(list.querySelector('b')).toBeNull();
    expect(within(list).getByText('<b>x</b>')).toBeTruthy();
  });
});

describe('Draft follow-up', () => {
  const DRAFT = 'Chào chị, em xin hỏi thăm về hồ sơ Backend Engineer.';
  let fetchMock: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;
  const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const okBody = (content = DRAFT, language = 'vi') => reply(200, { content, language });
  const bodyOf = (i = 0) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);
  const draftBtn = () => screen.getByRole('button', { name: /Soạn follow-up|Draft follow-up/ });
  const gen = () => screen.getByRole('button', { name: vi_.trackerDraftGenerate });
  const open = async () => { await renderDetail(); fireEvent.click(draftBtn()); };
  const flush = () => act(async () => { await Promise.resolve(); });
  const noDraftInLogs = (spies: ReturnType<typeof vi.spyOn>[]) => {
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain('Chào chị');
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('Chào chị');
  };

  beforeEach(() => {
    app.status = 'applied';
    fetchMock = vi.fn(async () => okBody());
    vi.stubGlobal('fetch', fetchMock);
    writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    db.session = { access_token: 'tok-1' };
  });
  afterEach(() => { vi.unstubAllGlobals(); db.session = null; });

  it.each(['drafted', 'interview', 'offer', 'rejected', 'hired'])('button hidden for %s', async (status) => {
    app.status = status;
    await renderDetail();
    expect(screen.queryByRole('button', { name: /Soạn follow-up/ })).toBeNull();
  });

  it('button shown for applied, including limit_reached', async () => {
    followUp = [{ application_id: app.id, stage_entered_at: '2026-10-20T03:00:00Z', last_contact_at: '2026-10-20T03:00:00Z', follow_ups_since_reset: 2,
      follow_up_due_at: '2026-11-10T00:00:00Z', follow_up_state: 'limit_reached' }];
    await renderDetail();
    expect(draftBtn()).toBeTruthy();
    expect(vi_.trackerDraftButton).toBe('Soạn follow-up');
    expect(UI_LABELS.en.trackerDraftButton).toBe('Draft follow-up');
  });

  it('untouched toggle: body has no language; Authorization sent; UI en + app vi shows VI', async () => {
    ui.lang = 'en';
    await open();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.en.trackerDraftGenerate }));
    await screen.findByRole('textbox', { name: UI_LABELS.en.trackerDraftTextLabel });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rewrite-cv');
    expect(bodyOf()).toEqual({ action: 'follow_up', applicationId: app.id });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok-1' });
  });

  it('initial language: cover letter metadata beats application.language', async () => {
    app.language = 'en';
    docs = [cvDoc, jdDoc, letterDoc];
    await open();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('explicit toggle sends language, including toggling to VI from an EN initial', async () => {
    app.language = 'en';
    await open();
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    expect(bodyOf()).toEqual({ action: 'follow_up', applicationId: app.id, language: 'vi' });
  });

  it('toggle to EN sends language en; changing language never auto-regenerates', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    expect(bodyOf()).toEqual({ action: 'follow_up', applicationId: app.id, language: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loading is announced, Generate and toggle disabled, double click = one fetch', async () => {
    const d = pending();
    fetchMock.mockImplementation(() => d.p);
    await open();
    fireEvent.click(gen());
    fireEvent.click(gen());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status').textContent).toContain(vi_.trackerDraftGenerating);
    expect((gen() as HTMLButtonElement).disabled).toBe(true);
    expect(gen().getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: 'English' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { d.resolve(okBody()); await d.p; });
  });

  it('renders draft in an editable textarea; Copy writes the edited text; feedback visible; Regenerate = 2nd request', async () => {
    await open();
    fireEvent.click(gen());
    const ta = (await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel })) as HTMLTextAreaElement;
    expect(ta.value).toBe(DRAFT);
    fireEvent.change(ta, { target: { value: 'Bản đã sửa' } });
    fireEvent.click(screen.getByRole('button', { name: vi_.trackerDraftCopy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Bản đã sửa'));
    expect(await screen.findByText(vi_.trackerDraftCopied)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: vi_.trackerDraftRegenerate }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await flush();
  });

  it('hint is always visible; no "verified/grounded" claim', async () => {
    await open();
    expect(screen.getByText(vi_.trackerDraftHint)).toBeTruthy();
    expect(vi_.trackerDraftHint).toBe('Bản nháp không được lưu và chưa được ghi là đã gửi.');
    expect(UI_LABELS.en.trackerDraftHint).toBe("Drafts aren't saved and aren't logged as sent.");
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    expect(screen.getByText(vi_.trackerDraftHint)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/đã xác minh|verified/i);
  });

  it('fidelityFallback: exact copy, no draft textarea', async () => {
    fetchMock.mockImplementation(async () => reply(200, { content: '', language: 'vi', fidelityFallback: true }));
    await open();
    fireEvent.click(gen());
    expect((await screen.findByRole('alert')).textContent).toBe('Không tạo được bản nháp an toàn từ hồ sơ đã nộp. Vui lòng thử lại hoặc tự viết.');
    expect(UI_LABELS.en.trackerDraftFallback).toBe("Couldn't produce a draft grounded in the submitted application. Try again or write your own.");
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it.each([
    [401, 'trackerDraftErr401'], [403, 'trackerDraftErr403'], [404, 'trackerDraftErr404'], [409, 'trackerDraftErr409'],
    [422, 'trackerDraftErr422'], [429, 'trackerDraftErr429'], [503, 'trackerDraftErr503'], [500, 'trackerDraftErrGeneric'], [504, 'trackerDraftErrGeneric'],
  ] as const)('status %i shows its own message (vi + en)', async (status, key) => {
    for (const lang of ['vi', 'en'] as const) {
      ui.lang = lang;
      fetchMock.mockImplementation(async () => reply(status, { error: 'x' }));
      await open();
      fireEvent.click(screen.getByRole('button', { name: UI_LABELS[lang].trackerDraftGenerate }));
      expect((await screen.findByRole('alert')).textContent).toBe(UI_LABELS[lang][key]);
      expect(screen.queryByRole('textbox')).toBeNull();
      cleanup();
    }
  });

  it('messages are distinct; 503 is not a missing-document message; 429 is the shared hourly limit', () => {
    const keys = ['401', '403', '404', '409', '422', '429', '503'].map((c) => vi_[`trackerDraftErr${c}` as 'trackerDraftErr401']);
    expect(new Set(keys).size).toBe(keys.length);
    expect(vi_.trackerDraftErr503).not.toBe(vi_.trackerDraftErr422);
    expect(vi_.trackerDraftErr429 + UI_LABELS.en.trackerDraftErr429).not.toMatch(/follow-up|Analyze|tháng|month/i);
    expect(UI_LABELS.en.trackerDraftErr409).toMatch(/current status/);
  });

  it('TimeoutError and network errors show the generic retry message; no automatic retry', async () => {
    fetchMock.mockImplementation(async () => { throw new DOMException('t', 'TimeoutError'); });
    await open();
    fireEvent.click(gen());
    expect((await screen.findByRole('alert')).textContent).toBe(vi_.trackerDraftErrGeneric);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('unmount isolation: a response that arrives after the panel is gone renders nothing and warns nothing', async () => {
    const d = pending();
    fetchMock.mockImplementation(() => d.p);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await open();
    fireEvent.click(gen());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(draftBtn()); // close the panel (unmounts it)
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { d.resolve(okBody()); await d.p; });
    expect(document.body.textContent).not.toContain('Chào chị');
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('unmount isolation: reopening the panel starts clean; an older panel\'s late response never shows', async () => {
    const first = pending();
    const second = pending();
    fetchMock.mockImplementationOnce(() => first.p).mockImplementationOnce(() => second.p);
    await open();
    fireEvent.click(gen());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(draftBtn());
    fireEvent.click(draftBtn());
    fireEvent.click(gen());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => { second.resolve(okBody('NEW')); await second.p; });
    await act(async () => { first.resolve(okBody('OLD')); await first.p; });
    expect((screen.getByRole('textbox', { name: vi_.trackerDraftTextLabel }) as HTMLTextAreaElement).value).toBe('NEW');
    expect(document.body.textContent).not.toContain('OLD');
  });

  it('failed Regenerate keeps the edited draft and shows the error; fallback on Regenerate keeps it too', async () => {
    await open();
    fireEvent.click(gen());
    const ta = (await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel })) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Bản đã sửa' } });
    fetchMock.mockImplementationOnce(async () => reply(500));
    fireEvent.click(screen.getByRole('button', { name: vi_.trackerDraftRegenerate }));
    expect((await screen.findByRole('alert')).textContent).toBe(vi_.trackerDraftErrGeneric);
    expect((screen.getByRole('textbox', { name: vi_.trackerDraftTextLabel }) as HTMLTextAreaElement).value).toBe('Bản đã sửa');
    fetchMock.mockImplementationOnce(async () => reply(200, { content: '', language: 'vi', fidelityFallback: true }));
    fireEvent.click(screen.getByRole('button', { name: vi_.trackerDraftRegenerate }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(vi_.trackerDraftFallback));
    expect((screen.getByRole('textbox', { name: vi_.trackerDraftTextLabel }) as HTMLTextAreaElement).value).toBe('Bản đã sửa');
  });

  it('clicking the already-selected language does not send language', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    expect(bodyOf()).toEqual({ action: 'follow_up', applicationId: app.id });
  });

  it('generation never mutates the tracker nor reloads detail/timeline/follow-up state; no draft text in logs', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')].map((s) => s.mockImplementation(() => {}));
    await open();
    const before = db.calls.length;
    const notes = () => screen.queryAllByRole('textbox').filter((e) => !(e as HTMLTextAreaElement).value);
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    fireEvent.click(screen.getByRole('button', { name: vi_.trackerDraftCopy }));
    await flush();
    expect(db.calls.length).toBe(before);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(notes()).toHaveLength(0);
    noDraftInLogs(spies);
    spies.forEach((s) => s.mockRestore());
  });

  it('Mark as sent still works after a draft is generated; nothing goes to Sentry', async () => {
    db.rpc.mockResolvedValue({ data: { event_id: 'e9', replayed: false }, error: null });
    await open();
    fireEvent.click(gen());
    await screen.findByRole('textbox', { name: vi_.trackerDraftTextLabel });
    expect(sentry.captureException).not.toHaveBeenCalled();
    click(vi_.trackerMarkFollowUpSent);
    expect(screen.getByText(vi_.trackerMarkFollowUpSent, { selector: 'h4' })).toBeTruthy();
    click(vi_.trackerSave);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('log_application_contact', expect.anything()));
  });
});

describe('Unknown-outcome idempotency (R1: note / follow_up_sent / contact_received)', () => {
  const NET = { data: null, error: { message: 'Failed to fetch' } };
  const ok = (id = 'e9', replayed = false) => ({ data: { event_id: id, replayed }, error: null });
  const scopes = [
    { scope: 'note', rpc: 'add_application_note', open: vi_.trackerAddNote, noteLabel: vi_.trackerNoteLabel },
    { scope: 'follow_up_sent', rpc: 'log_application_contact', open: vi_.trackerMarkFollowUpSent, noteLabel: vi_.trackerNoteOptional },
    { scope: 'contact_received', rpc: 'log_application_contact', open: vi_.trackerEmployerReplied, noteLabel: vi_.trackerNoteOptional },
  ] as const;
  type Scope = typeof scopes[number];
  const unresolvedShown = () => screen.queryByText(vi_.trackerUnresolvedExplain) !== null;
  const noteBox = (s: Scope) => screen.getByLabelText(s.noteLabel) as HTMLTextAreaElement;
  // Opens the form, types a note, saves; the response is lost (unknown outcome).
  const failFirst = async (s: Scope, note: string, scripted = true) => {
    if (scripted) db.rpc.mockResolvedValueOnce(NET);
    click(s.open);
    fireEvent.change(noteBox(s), { target: { value: note } });
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
  };
  // Server that commits on first sight of a key but loses that response; a seen key replays.
  const commitThenLose = () => {
    const committed = new Map<string, string>();
    db.rpc.mockImplementation(async (name: string, a: Record<string, unknown>) => {
      const key = a.p_idempotency_key as string;
      if (committed.has(key)) return ok(committed.get(key), true);
      const id = `e${committed.size + 5}`;
      committed.set(key, id);
      const type = name === 'add_application_note' ? 'note' : a.p_event_type;
      events = [{ id, event_type: type, from_status: null, to_status: null, note: a.p_note, metadata: {}, occurred_at: '2026-11-03T03:00:00Z', created_at: '2026-11-03T03:00:00Z' }, ...events];
      return NET;
    });
    return committed;
  };

  beforeEach(() => {
    app.status = 'applied';
    intentsModule.resetIntents?.();
  });

  it('1. contact: request commits, response lost, Retry replays the same key: exactly one event', async () => {
    const committed = commitThenLose();
    await renderDetail();
    await failFirst(scopes[1], 'pinged HR', false);
    expect(committed.size).toBe(1);
    click(vi_.trackerRetry);
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNoteOptional)).toBeNull());
    const keys = keysOf('log_application_contact');
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(committed.size).toBe(1);
    openTab(vi_.trackerTabTimeline);
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getAllByText('pinged HR')).toHaveLength(1));
  });

  it.each(scopes)('2. $scope: unknown → Close → reopen → Retry reuses the original key and stored entry', async (s) => {
    await renderDetail();
    await failFirst(s, '  original  ');
    expect(unresolvedShown()).toBe(true);
    click(vi_.trackerUnresolvedClose);
    expect(screen.queryByLabelText(s.noteLabel)).toBeNull();
    click(s.open);
    expect(unresolvedShown()).toBe(true); // HEAD's Cancel/Close cleared the intent here
    expect(noteBox(s).disabled).toBe(true);
    expect(noteBox(s).value).toBe('original');
    db.rpc.mockResolvedValueOnce(ok('e9', true));
    click(vi_.trackerRetry);
    await waitFor(() => expect(keysOf(s.rpc)).toHaveLength(2));
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).toBe(k1);
    expect(db.rpc.mock.calls[1][1].p_note).toBe('original');
  });

  it.each(scopes)('3. $scope: unknown → unmount/remount → Retry reuses the original key', async (s) => {
    await renderDetail();
    await failFirst(s, 'kept');
    cleanup();
    await renderDetail();
    expect(screen.getByRole('button', { name: s.open }).getAttribute('title')).toBe(vi_.trackerUnconfirmedMarker);
    click(s.open);
    expect(unresolvedShown()).toBe(true);
    expect(screen.queryByText(vi_.trackerErrGeneric)).toBeNull(); // fresh mount: explanation only
    db.rpc.mockResolvedValueOnce(ok());
    click(vi_.trackerRetry);
    await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).toBe(k1);
    expect(screen.queryByText(vi_.trackerReplayNotice)).toBeNull(); // a fresh commit is not a replay
    expect(screen.getByRole('button', { name: s.open }).getAttribute('title')).toBeNull();
  });

  it('4. note: confirmed replay after unresolved shows the notice; one timeline item; first-attempt replay shows none', async () => {
    commitThenLose();
    await renderDetail();
    await failFirst(scopes[0], 'Recruiter said salary 50M', false);
    click(vi_.trackerRetry);
    expect(await screen.findByText(vi_.trackerReplayNotice)).toBeTruthy();
    expect(screen.getByText(vi_.trackerReplayNotice).getAttribute('role')).toBe('status');
    expect(screen.queryByLabelText(vi_.trackerNoteLabel)).toBeNull();
    openTab(vi_.trackerTabTimeline);
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getAllByText('Recruiter said salary 50M')).toHaveLength(1));
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('salary');
    cleanup();
    db.rpc.mockReset();
    db.rpc.mockResolvedValueOnce(ok('e9', true));
    await renderDetail();
    click(vi_.trackerAddNote);
    fireEvent.change(noteBox(scopes[0]), { target: { value: 'other' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(screen.queryByLabelText(vi_.trackerNoteLabel)).toBeNull());
    expect(screen.queryByText(vi_.trackerReplayNotice)).toBeNull();
  });

  it.each(scopes)('5. $scope: confirmed success then a genuinely new action gets a new key', async (s) => {
    db.rpc.mockResolvedValue(ok());
    await renderDetail();
    for (const n of ['one', 'two']) {
      click(s.open);
      expect(unresolvedShown()).toBe(false);
      fireEvent.change(noteBox(s), { target: { value: n } });
      click(vi_.trackerSave);
      await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    }
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).not.toBe(k1);
  });

  it('6. separate applications and action types keep separate intents', async () => {
    const appA = app;
    await renderDetail();
    await failFirst(scopes[1], 'fu A');
    click(vi_.trackerUnresolvedClose);
    click(vi_.trackerEmployerReplied);
    expect(unresolvedShown()).toBe(false); // contact_received:A is its own intent
    fireEvent.change(noteBox(scopes[2]), { target: { value: 'cr A' } });
    db.rpc.mockResolvedValueOnce(NET);
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerUnresolvedClose);
    await failFirst(scopes[0], 'note A');
    click(vi_.trackerUnresolvedClose);
    cleanup();
    seq += 1;
    app = { ...appA, id: `app-${seq}` };
    db.rpc.mockResolvedValue(ok());
    await renderDetail();
    for (const s of [scopes[1], scopes[0]]) {
      click(s.open);
      expect(unresolvedShown()).toBe(false); // application B is unaffected
      fireEvent.change(noteBox(s), { target: { value: `${s.scope} B` } });
      click(vi_.trackerSave);
      await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    }
    cleanup();
    app = appA;
    await renderDetail();
    for (const s of scopes) {
      click(s.open);
      expect(unresolvedShown()).toBe(true);
      click(vi_.trackerRetry);
      await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    }
    const calls = db.rpc.mock.calls.map((c) => ({ name: c[0], ...c[1] }));
    const keyOf = (i: number) => calls[i].p_idempotency_key;
    // 0 fu A, 1 cr A, 2 note A, 3 fu B, 4 note B, 5 note A retry, 6 fu A retry, 7 cr A retry
    expect(new Set([0, 1, 2, 3, 4].map(keyOf)).size).toBe(5);
    expect(calls[5].name).toBe('add_application_note');
    expect(keyOf(5)).toBe(keyOf(2));
    expect(keyOf(6)).toBe(keyOf(0));
    expect(keyOf(7)).toBe(keyOf(1));
    expect([calls[6].p_note, calls[7].p_note, calls[5].p_note]).toEqual(['fu A', 'cr A', 'note A']);
  });

  it('8a. status keeps CAS semantics: unknown → Cancel → different target → stale_status = rejection + reload', async () => {
    db.rpc.mockResolvedValueOnce(NET);
    await renderDetail();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerCancel); // still clears for CAS scopes
    db.rpc.mockImplementationOnce(async () => { app.status = 'interview'; return { data: null, error: { message: 'stale_status' } }; });
    const before = appFetches();
    click(vi_.trackerChangeStatus);
    expect(unresolvedShown()).toBe(false);
    fireEvent.change(screen.getByLabelText(vi_.trackerNewStatus), { target: { value: 'rejected' } });
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrStale)).toBeTruthy();
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    const [k1, k2] = keysOf('transition_application_status');
    expect(k2).not.toBe(k1);
    expect(db.rpc.mock.calls[1][1]).toMatchObject({ p_expected_status: 'applied', p_to_status: 'rejected' });
  });

  it('8b. details keeps CAS semantics: unknown → Cancel → different fields → stale_application = rejection + reload', async () => {
    db.rpc.mockResolvedValueOnce(NET);
    await renderDetail();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerCompanyLabel), { target: { value: 'First' } });
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerCancel);
    db.rpc.mockImplementationOnce(async () => { app.updated_at = '2026-11-03T09:00:00+00:00'; return { data: null, error: { message: 'stale_application' } }; });
    const before = appFetches();
    click(vi_.trackerEditDetails);
    fireEvent.change(screen.getByLabelText(vi_.trackerRoleLabel), { target: { value: 'Other role' } });
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrStaleApplication)).toBeTruthy();
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    const [k1, k2] = keysOf('update_application_details');
    expect(k2).not.toBe(k1);
  });

  it('9a. unresolved mode: fields disabled; Retry sends the STORED entry even if render state is changed', async () => {
    await renderDetail();
    await failFirst(scopes[0], '  stored text ');
    expect(noteBox(scopes[0]).disabled).toBe(true);
    fireEvent.change(noteBox(scopes[0]), { target: { value: 'tampered' } });
    expect(noteBox(scopes[0]).value).toBe('stored text');
    db.rpc.mockResolvedValueOnce(ok());
    click(vi_.trackerRetry);
    await waitFor(() => expect(keysOf('add_application_note')).toHaveLength(2));
    expect(db.rpc.mock.calls[1][1].p_note).toBe('stored text');
  });

  it('9b. midnight: unknown at 23:59 ICT with today (occurredAt null) → Retry after midnight still sends null', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-04T16:59:00Z')); // 23:59 ICT on 2026-11-04
      await renderDetail();
      await failFirst(scopes[1], 'late');
      expect(db.rpc.mock.calls[0][1].p_occurred_at).toBeNull();
      vi.setSystemTime(new Date('2026-11-04T17:01:00Z')); // 00:01 ICT on 2026-11-05
      cleanup();
      await renderDetail();
      click(vi_.trackerMarkFollowUpSent);
      const date = screen.getByLabelText(vi_.trackerOccurredOn) as HTMLInputElement;
      expect(date.disabled).toBe(true);
      expect(date.value).toBe('2026-11-04');
      db.rpc.mockResolvedValueOnce(ok());
      click(vi_.trackerRetry);
      await waitFor(() => expect(keysOf('log_application_contact')).toHaveLength(2));
      expect(db.rpc.mock.calls[1][1].p_occurred_at).toBeNull();
      expect(db.rpc.mock.calls[1][1].p_note).toBe('late');
      const [k1, k2] = keysOf('log_application_contact');
      expect(k2).toBe(k1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['vi', 'en'] as const)('9c. Abandon needs confirmation, then fields unlock empty and a new submit uses a NEW key (%s)', async (lang) => {
    ui.lang = lang;
    const L = UI_LABELS[lang];
    await renderDetail();
    db.rpc.mockResolvedValueOnce(NET);
    click(L.trackerEmployerReplied);
    fireEvent.change(screen.getByLabelText(L.trackerNoteOptional), { target: { value: 'first' } });
    click(L.trackerSave);
    expect(await screen.findByText(L.trackerUnresolvedExplain)).toBeTruthy();
    click(L.trackerUnresolvedAbandon);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(L.trackerAbandonMessage);
    fireEvent.click(within(dialog).getAllByRole('button', { name: L.trackerCancel })[0]);
    expect(screen.getByText(L.trackerUnresolvedExplain)).toBeTruthy(); // dismissing keeps the intent
    click(L.trackerUnresolvedAbandon);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: L.trackerAbandonConfirm }));
    expect(screen.queryByText(L.trackerUnresolvedExplain)).toBeNull();
    const box = screen.getByLabelText(L.trackerNoteOptional) as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    expect(box.value).toBe('');
    expect(db.rpc).toHaveBeenCalledTimes(1);
    db.rpc.mockResolvedValueOnce(ok());
    fireEvent.change(box, { target: { value: 'second' } });
    click(L.trackerSave);
    await waitFor(() => expect(keysOf('log_application_contact')).toHaveLength(2));
    const [k1, k2] = keysOf('log_application_contact');
    expect(k2).not.toBe(k1);
    expect(L.trackerUnresolvedExplain).not.toBe(L.trackerErrGeneric);
  });

  it.each(scopes)('11. $scope: Cancel while the request is in flight keeps the intent; a late unknown → reopen → Retry reuses the key', async (s) => {
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    click(s.open);
    fireEvent.change(noteBox(s), { target: { value: 'hung' } });
    click(vi_.trackerSave);
    click(vi_.trackerCancel); // user gives up while saving
    await act(async () => { call.resolve(NET); });
    click(s.open);
    expect(unresolvedShown()).toBe(true);
    db.rpc.mockResolvedValueOnce(ok('e9', true));
    click(vi_.trackerRetry);
    await waitFor(() => expect(keysOf(s.rpc)).toHaveLength(2));
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).toBe(k1);
  });

  // Save → Close while in flight → reopen: the reopened form must not accept new text under the in-flight key.
  const inFlightThenReopen = async (s: Scope) => {
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    click(s.open);
    fireEvent.change(noteBox(s), { target: { value: 'first' } });
    click(vi_.trackerSave);
    click(vi_.trackerCancel);
    click(s.open);
    expect(screen.queryByText(vi_.trackerInFlightExplain)).not.toBeNull();
    expect(noteBox(s).disabled).toBe(true);
    expect(noteBox(s).value).toBe('first');
    expect((screen.getByRole('button', { name: vi_.trackerSave }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(noteBox(s), { target: { value: 'different' } });
    click(vi_.trackerSave);
    expect(keysOf(s.rpc)).toHaveLength(1);
    return call;
  };

  it.each(scopes)('12. $scope: in flight → Close → reopen is locked; success closes + reloads; a new action gets a new key', async (s) => {
    const call = await inFlightThenReopen(s);
    const before = appFetches();
    await act(async () => { call.resolve(ok()); });
    await waitFor(() => expect(screen.queryByText(vi_.trackerInFlightExplain)).toBeNull());
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
    expect(keysOf(s.rpc)).toHaveLength(1); // the displayed-but-locked text was never sent under the old key
    expect(unresolvedShown()).toBe(false);
    // The settled save closes the panel (its onClose); reopening is a clean, unlocked form.
    await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    click(s.open);
    expect(noteBox(s).disabled).toBe(false);
    db.rpc.mockResolvedValueOnce(ok('e10'));
    fireEvent.change(noteBox(s), { target: { value: 'second' } });
    click(vi_.trackerSave);
    await waitFor(() => expect(keysOf(s.rpc)).toHaveLength(2));
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).not.toBe(k1);
    expect(db.rpc.mock.calls[1][1].p_note).toBe('second');
  });

  it.each(scopes)('13. $scope: in flight → Close → reopen; a late unknown turns the locked form into unresolved mode with the original entry', async (s) => {
    const call = await inFlightThenReopen(s);
    await act(async () => { call.resolve(NET); });
    await waitFor(() => expect(unresolvedShown()).toBe(true));
    expect(screen.queryByText(vi_.trackerInFlightExplain)).toBeNull();
    expect(noteBox(s).value).toBe('first');
    db.rpc.mockResolvedValueOnce(ok('e9', true));
    click(vi_.trackerRetry);
    await waitFor(() => expect(keysOf(s.rpc)).toHaveLength(2));
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).toBe(k1);
    expect(db.rpc.mock.calls[1][1].p_note).toBe('first');
    expect(await screen.findByText(vi_.trackerReplayNotice)).toBeTruthy();
  });

  // Save is pending; the detail view is left (Back) and reopened; the same form is opened again.
  const remountWhileInFlight = async (s: Scope, viaRetry = false) => {
    const call = pending();
    await renderDetail();
    if (viaRetry) {
      await failFirst(s, 'first');
      fireEvent.change(noteBox(s), { target: { value: 'local edit' } }); // hidden local state differs from the stored entry
      db.rpc.mockReturnValueOnce(call.p);
      click(vi_.trackerRetry);
      expect(noteBox(s).disabled).toBe(true); // M1: the retrying form shows the payload being sent
      expect(noteBox(s).value).toBe('first');
    } else {
      db.rpc.mockReturnValueOnce(call.p);
      click(s.open);
      fireEvent.change(noteBox(s), { target: { value: 'first' } });
      click(vi_.trackerSave);
    }
    cleanup();
    await renderDetail();
    click(s.open);
    expect(noteBox(s).disabled).toBe(true); // M1: the payload being sent, never editable local state
    expect(noteBox(s).value).toBe('first');
    expect((screen.getByRole('button', { name: vi_.trackerSave }) as HTMLButtonElement).disabled).toBe(true);
    return call;
  };
  const commitEvent = (s: Scope) => {
    events = [{ id: 'e50', event_type: s.scope, from_status: null, to_status: null, note: 'first', metadata: {}, occurred_at: '2026-11-03T03:00:00Z', created_at: '2026-11-03T03:00:00Z' }, ...events];
  };

  it.each(scopes)('14. I1 $scope: a settle after the detail view remounted reloads the NEW view and closes its form; one timeline item', async (s) => {
    const call = await remountWhileInFlight(s);
    expect(screen.queryByText(vi_.trackerInFlightExplain)).not.toBeNull();
    commitEvent(s);
    app.company_name = 'Reloaded Co'; // only a reload of the NEW view can show this (the dead view's fetch counts too)
    await act(async () => { call.resolve(ok()); });
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain('Reloaded Co'));
    await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    expect(keysOf(s.rpc)).toHaveLength(1);
    openTab(vi_.trackerTabTimeline);
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getAllByText('first')).toHaveLength(1));
  });

  it('15. I1 + M1: a replay of an unresolved Retry that settles after remount shows the notice in the NEW view', async () => {
    const s = scopes[0];
    const call = await remountWhileInFlight(s, true);
    await act(async () => { call.resolve(ok('e9', true)); });
    expect(await screen.findByText(vi_.trackerReplayNotice)).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText(s.noteLabel)).toBeNull());
    const [k1, k2] = keysOf(s.rpc);
    expect(k2).toBe(k1);
  });

  it('16. I1/M2: a definite rejection that settles after remount shows its message in the NEW form and unlocks it', async () => {
    const s = scopes[1];
    const call = await remountWhileInFlight(s);
    await act(async () => { call.resolve({ data: null, error: { message: 'contact_not_allowed' } }); });
    expect(await screen.findByText(vi_.trackerErrContactNotAllowed)).toBeTruthy();
    await waitFor(() => expect(noteBox(s).disabled).toBe(false));
    expect(unresolvedShown()).toBe(false);
  });

  it('17. I1: an unknown outcome that settles after remount turns the NEW form into unresolved mode', async () => {
    const s = scopes[2];
    const call = await remountWhileInFlight(s);
    await act(async () => { call.resolve(NET); });
    await waitFor(() => expect(unresolvedShown()).toBe(true));
    expect(noteBox(s).value).toBe('first');
    expect(noteBox(s).disabled).toBe(true);
  });

  it('18. M3: a late settle of a closed note form never closes another open panel', async () => {
    const call = pending();
    db.rpc.mockReturnValueOnce(call.p);
    await renderDetail();
    click(vi_.trackerAddNote);
    fireEvent.change(noteBox(scopes[0]), { target: { value: 'hung' } });
    click(vi_.trackerSave);
    click(vi_.trackerCancel);
    click(vi_.trackerChangeStatus);
    fireEvent.change(screen.getByLabelText(vi_.trackerNoteOptional), { target: { value: 'keep me' } });
    app.company_name = 'Reloaded Co';
    await act(async () => { call.resolve(ok()); });
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain('Reloaded Co'));
    expect((screen.getByLabelText(vi_.trackerNoteOptional) as HTMLTextAreaElement).value).toBe('keep me');
  });

  it('10. a definite rejection on Retry clears the intent: next submit uses a new key', async () => {
    await renderDetail();
    await failFirst(scopes[1], 'x');
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'contact_not_allowed' } });
    click(vi_.trackerRetry);
    expect(await screen.findByText(vi_.trackerErrContactNotAllowed)).toBeTruthy();
    expect(unresolvedShown()).toBe(false);
    db.rpc.mockResolvedValueOnce(ok());
    click(vi_.trackerSave);
    await waitFor(() => expect(keysOf('log_application_contact')).toHaveLength(3));
    const [k1, k2, k3] = keysOf('log_application_contact');
    expect(k2).toBe(k1);
    expect(k3).not.toBe(k1);
  });
});
