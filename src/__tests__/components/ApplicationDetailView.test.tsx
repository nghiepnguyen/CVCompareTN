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

import { ApplicationDetailView } from '../../components/views/applications/ApplicationDetailView';

let seq = 0;
let app: Record<string, unknown>;
let docs: Record<string, unknown>[];
let events: Record<string, unknown>[];
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
    created_at: '2026-11-01T03:00:00Z', updated_at: '2026-11-02T03:00:00Z', language: 'vi' };
  docs = [cvDoc, jdDoc];
  events = [{ id: 'e0', event_type: 'created', from_status: null, to_status: null, note: null, metadata: {}, occurred_at: '2026-11-01T03:00:00Z', created_at: '2026-11-01T03:00:00Z' }];
  db.calls = [];
  db.rpc.mockReset();
  sentry.captureException.mockReset();
  db.respond = (table) => ({
    data: table === 'applications' ? app : table === 'application_documents' ? docs : events,
    error: null,
  });
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

  it('stale_status: localized message, reloads, nothing reported to Sentry; definite rejection mints a new key', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'stale_status', details: 'Failing row contains (secret)' } });
    await renderDetail();
    const before = appFetches();
    click(vi_.trackerChangeStatus);
    click(vi_.trackerSave);
    expect(await screen.findByText(vi_.trackerErrStale)).toBeTruthy();
    await waitFor(() => expect(appFetches()).toBeGreaterThan(before));
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
