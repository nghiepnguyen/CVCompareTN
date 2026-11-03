// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
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
    click(vi_.trackerSave);
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
    click(vi_.trackerSave); // retry in place
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    cleanup(); // remount, not Cancel
    db.rpc.mockResolvedValueOnce(ok());
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
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

  it('keys are scoped per event type and application; Cancel clears', async () => {
    app.status = 'applied';
    const idA = app.id as string;
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await renderDetail();
    click(vi_.trackerMarkFollowUpSent);
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerCancel); // clears follow_up_sent:A
    click(vi_.trackerEmployerReplied);
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerMarkFollowUpSent); // switches panel; contact_received:A key persists
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    click(vi_.trackerSave);
    await screen.findByText(vi_.trackerErrGeneric);
    click(vi_.trackerEmployerReplied);
    db.rpc.mockResolvedValueOnce(ok());
    click(vi_.trackerSave);
    await waitFor(() => expect(logCalls()).toHaveLength(4));
    const keys = logCalls().map((c) => c.p_idempotency_key);
    expect(new Set([keys[0], keys[1], keys[2]]).size).toBe(3); // Cancel gave follow_up_sent a new key; scopes differ
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
