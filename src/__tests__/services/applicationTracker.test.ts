import { describe, it, expect, vi, beforeEach } from 'vitest';
import matrix from '../../../supabase/application_status_transitions.json';
import type { FakeDb } from '../components/trackerFakeSupabase';

const db = vi.hoisted(() => ({ calls: [], respond: () => ({ data: [], error: null }), rpc: vi.fn() }) as unknown as FakeDb);
// The shared fake has no `.in`; add it here (records into db.calls like the other methods).
vi.mock('../../lib/supabase', async () => {
  const fake = (await import('../components/trackerFakeSupabase')).fakeSupabase(db);
  const from = fake.supabase.from;
  return { ...fake, supabase: { ...fake.supabase, from: (table: string) => {
    const q = from(table) as Record<string, unknown>;
    q.in = (...args: unknown[]) => { db.calls.push([table, 'in', ...args]); return q; };
    return q;
  } } };
});

import {
  listApplications, getApplicationTimeline, transitionApplicationStatus, updateApplicationDetails, trackerErrorCode,
  ApplicationTrackerError, APPLICATIONS_PAGE_SIZE, TIMELINE_PAGE_SIZE,
  logApplicationContact, getFollowUpStates, listDueApplications, isDefiniteRejection,
} from '../../services/applicationService';
import { APPLICATION_STATUSES, APPLICATION_SORTS, allowedTransitions, isFinalStatus } from '../../services/applicationTypes';

const row = (i: number) => ({ id: `a${i}`, company_name: null, role_title: `Role ${i}`, status: 'drafted', deadline: null, applied_at: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', language: 'vi' });

beforeEach(() => {
  db.calls = [];
  db.rpc.mockReset();
  db.respond = () => ({ data: [], error: null });
});

describe('status authority', () => {
  it('client statuses equal the shared matrix file (the one the SQL test checks)', () => {
    expect([...APPLICATION_STATUSES]).toEqual(matrix.statuses);
    expect(Object.keys(matrix.transitions).sort()).toEqual([...APPLICATION_STATUSES].sort());
    for (const from of APPLICATION_STATUSES) {
      expect(allowedTransitions(from)).not.toContain(from); // same-state never offered
    }
  });

  it('final statuses are exactly the roadmap finals and all have a correction path', () => {
    expect(APPLICATION_STATUSES.filter(isFinalStatus)).toEqual(['hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn']);
    for (const s of APPLICATION_STATUSES.filter(isFinalStatus)) expect(allowedTransitions(s).length).toBeGreaterThan(0);
  });

  it('no meaningless jumps', () => {
    expect(allowedTransitions('drafted')).toEqual(['applied', 'withdrawn']);
    expect(allowedTransitions('no_response')).not.toContain('hired');
  });
});

describe('listApplications', () => {
  it('default: updated_at desc, id tiebreak, bounded range with one look-ahead row', async () => {
    db.respond = () => ({ data: Array.from({ length: APPLICATIONS_PAGE_SIZE + 1 }, (_, i) => row(i)), error: null });
    const res = await listApplications();
    expect(res.items).toHaveLength(APPLICATIONS_PAGE_SIZE);
    expect(res.hasMore).toBe(true);
    expect(db.calls).toContainEqual(['applications', 'order', 'updated_at', { ascending: false, nullsFirst: false }]);
    expect(db.calls).toContainEqual(['applications', 'order', 'id', { ascending: false }]);
    expect(db.calls).toContainEqual(['applications', 'range', 0, APPLICATIONS_PAGE_SIZE]);
    // List reads workflow columns only: no score, no documents.
    const select = db.calls.find((c) => c[1] === 'select')![2] as string;
    expect(select).not.toMatch(/score|probability|document/i);
  });

  it('page 2 asks the next range; last page has no more', async () => {
    db.respond = () => ({ data: [row(1)], error: null });
    const res = await listApplications({ page: 2 });
    expect(db.calls).toContainEqual(['applications', 'range', 40, 60]);
    expect(res.hasMore).toBe(false);
  });

  it.each(APPLICATION_SORTS)('allowed sort %s', async (sort) => {
    await listApplications({ sort });
    const asc = sort === 'deadline' || sort === 'company_name';
    expect(db.calls).toContainEqual(['applications', 'order', sort, { ascending: asc, nullsFirst: false }]);
  });

  it.each(['matchScore', 'passProbability', 'successProbability', 'status'])('rejects %s as a sort authority', async (sort) => {
    await expect(listApplications({ sort: sort as never })).rejects.toThrow(/unsupported application sort/);
    expect(db.calls).toHaveLength(0);
    expect(APPLICATION_SORTS as readonly string[]).not.toContain(sort);
  });
});

describe('errors', () => {
  it('maps RPC messages to the stable vocabulary and hides everything else', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'stale_status', details: 'row (secret note)' } });
    const err = await transitionApplicationStatus({ applicationId: 'a', expectedStatus: 'applied', toStatus: 'interview', occurredAt: null, note: 'secret note', idempotencyKey: 'k' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApplicationTrackerError);
    expect(err.code).toBe('stale_status');
    expect(String(err.message)).not.toContain('secret');
    expect(trackerErrorCode({ message: 'duplicate key value violates unique constraint "x"' })).toBe('unknown');
    expect(trackerErrorCode(new TypeError('Failed to fetch'))).toBe('unknown');
  });

  it('transition sends server-authoritative fields only (no from_status, no user id)', async () => {
    db.rpc.mockResolvedValue({ data: { event_id: 'e1', replayed: false }, error: null });
    const res = await transitionApplicationStatus({ applicationId: 'a', expectedStatus: 'drafted', toStatus: 'applied', occurredAt: null, note: null, idempotencyKey: 'k1' });
    expect(res).toEqual({ eventId: 'e1', replayed: false });
    const [name, params] = db.rpc.mock.calls[0];
    expect(name).toBe('transition_application_status');
    expect(Object.keys(params).sort()).toEqual(['p_application_id', 'p_expected_status', 'p_idempotency_key', 'p_note', 'p_occurred_at', 'p_to_status']);
  });
});

describe('timeline', () => {
  it('newest first by occurred_at, created_at, id (deterministic ties); bounded page + look-ahead', async () => {
    const ev = (i: number) => ({ id: `e${i}`, event_type: 'note', from_status: null, to_status: null, note: 'n', metadata: {}, occurred_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z' });
    db.respond = () => ({ data: Array.from({ length: TIMELINE_PAGE_SIZE + 1 }, (_, i) => ev(i)), error: null });
    const first = await getApplicationTimeline('a');
    expect(first.items).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const orders = db.calls.filter((c) => c[1] === 'order').map((c) => c[2]);
    expect(orders).toEqual(['occurred_at', 'created_at', 'id']);
    expect(db.calls).toContainEqual(['application_events', 'order', 'id', { ascending: false }]);
    expect(db.calls).toContainEqual(['application_events', 'range', 0, TIMELINE_PAGE_SIZE]);
    db.calls = [];
    db.respond = () => ({ data: [ev(1)], error: null });
    const last = await getApplicationTimeline('a', 2);
    expect(db.calls).toContainEqual(['application_events', 'range', 2 * TIMELINE_PAGE_SIZE, 3 * TIMELINE_PAGE_SIZE]);
    expect(last.hasMore).toBe(false);
  });

  it('details edit sends the exact row version string (microseconds intact)', async () => {
    db.rpc.mockResolvedValue({ data: { event_id: 'e1', changed: true, replayed: false, application: { company_name: 'Acme', role_title: null, deadline: null, updated_at: '2026-11-03T01:02:03.456789+00:00' } }, error: null });
    const res = await updateApplicationDetails({ applicationId: 'a', expectedUpdatedAt: '2026-11-02T03:00:00.123456+00:00', companyName: 'Acme', roleTitle: null, deadline: null, idempotencyKey: 'k' });
    expect(db.rpc.mock.calls[0][1].p_expected_updated_at).toBe('2026-11-02T03:00:00.123456+00:00');
    expect(res.application).toEqual({ companyName: 'Acme', roleTitle: null, deadline: null, updatedAt: '2026-11-03T01:02:03.456789+00:00' });
    db.rpc.mockResolvedValue({ data: null, error: { message: 'stale_application' } });
    await expect(updateApplicationDetails({ applicationId: 'a', expectedUpdatedAt: 'x', companyName: null, roleTitle: null, deadline: null, idempotencyKey: 'k2' })).rejects.toMatchObject({ code: 'stale_application' });
  });
});

describe('P2C follow-up: logApplicationContact', () => {
  const input = { applicationId: 'a1', eventType: 'follow_up_sent' as const, occurredAt: '2026-11-03T01:02:03.456789+00:00', note: 'SECRET-NOTE', idempotencyKey: 'k1' };

  it('sends exactly the five p_* params (no user id), passes occurredAt/note through, never touches application_events', async () => {
    db.rpc.mockResolvedValue({ data: { event_id: 'e9', replayed: true }, error: null });
    const res = await logApplicationContact(input);
    expect(res).toEqual({ eventId: 'e9', replayed: true });
    const [name, params] = db.rpc.mock.calls[0];
    expect(name).toBe('log_application_contact');
    expect(params).toEqual({ p_application_id: 'a1', p_event_type: 'follow_up_sent', p_occurred_at: '2026-11-03T01:02:03.456789+00:00', p_note: 'SECRET-NOTE', p_idempotency_key: 'k1' });
    expect(Object.keys(params)).not.toContain('p_user_id');
    expect(db.calls.filter((c) => c[0] === 'application_events')).toHaveLength(0);
  });

  it('null occurredAt and null note pass through unchanged', async () => {
    db.rpc.mockResolvedValue({ data: { event_id: 'e1', replayed: false }, error: null });
    await logApplicationContact({ ...input, eventType: 'contact_received', occurredAt: null, note: null });
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_event_type: 'contact_received', p_occurred_at: null, p_note: null });
  });

  it.each(['invalid_contact', 'contact_not_allowed'] as const)('%s is a definite rejection and never leaks the note', async (code) => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: code, details: 'row (SECRET-NOTE)', hint: 'SECRET-NOTE' } });
    const err = await logApplicationContact(input).catch((e) => e);
    expect(err).toBeInstanceOf(ApplicationTrackerError);
    expect(err.code).toBe(code);
    expect(trackerErrorCode({ message: code })).toBe(code);
    expect(isDefiniteRejection(err.code)).toBe(true);
    expect(JSON.stringify(err) + String(err.message)).not.toContain('SECRET');
  });

  it('unknown errors stay unknown and are not definite (key is retained)', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset by SECRET-NOTE' } });
    const err = await logApplicationContact(input).catch((e) => e);
    expect(err.code).toBe('unknown');
    expect(isDefiniteRejection(err.code)).toBe(false);
    expect(String(err.message)).not.toContain('SECRET');
  });
});

describe('P2C follow-up: getFollowUpStates', () => {
  it('empty ids makes no request', async () => {
    expect((await getFollowUpStates([])).size).toBe(0);
    expect(db.calls).toHaveLength(0);
  });

  it('one view request for all ids; maps snake_case to FollowUpInfo keyed by application id', async () => {
    db.respond = () => ({ data: [{ application_id: 'a1', stage_entered_at: 's', last_contact_at: 'l', follow_ups_since_reset: 2, follow_up_due_at: 'd', follow_up_state: 'limit_reached' }], error: null });
    const map = await getFollowUpStates(['a1', 'a2']);
    expect(db.calls.filter((c) => c[1] === 'select')).toHaveLength(1);
    expect(db.calls).toContainEqual(['application_follow_up_state', 'in', 'application_id', ['a1', 'a2']]);
    expect(map.get('a1')).toEqual({ state: 'limit_reached', dueAt: 'd', lastContactAt: 'l', stageEnteredAt: 's', followUpsSinceReset: 2 });
    expect(map.has('a2')).toBe(false); // no row = no automatic state, not an error
    const select = db.calls.find((c) => c[1] === 'select')![2] as string;
    expect(select).not.toContain('*');
    expect(select).not.toMatch(/score|probability/i);
  });
});

describe('P2C follow-up: listDueApplications', () => {
  const vrow = (id: string, due: string) => ({ application_id: id, stage_entered_at: 's', last_contact_at: 'l', follow_ups_since_reset: 0, follow_up_due_at: due, follow_up_state: 'due' });

  it('filters due only, orders by due_at then id, range(0,20); keeps view order, drops missing rows', async () => {
    db.respond = (table) => table === 'application_follow_up_state'
      ? { data: [vrow('b', '1'), vrow('gone', '2'), vrow('a', '3')], error: null }
      : { data: [row(1), { ...row(2), id: 'a' }, { ...row(3), id: 'b' }], error: null };
    const res = await listDueApplications();
    expect(db.calls).toContainEqual(['application_follow_up_state', 'eq', 'follow_up_state', 'due']);
    expect(db.calls.some((c) => c.includes('limit_reached'))).toBe(false);
    expect(db.calls.filter((c) => c[0] === 'application_follow_up_state' && c[1] === 'order').map((c) => [c[2], c[3]])).toEqual([['follow_up_due_at', { ascending: true }], ['application_id', { ascending: true }]]);
    expect(db.calls).toContainEqual(['application_follow_up_state', 'range', 0, APPLICATIONS_PAGE_SIZE]);
    expect(db.calls).toContainEqual(['applications', 'in', 'id', ['b', 'gone', 'a']]);
    expect(db.calls.some((c) => c[0] === 'applications' && c[1] === 'order')).toBe(false);
    expect(res.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(res.items[0].followUp).toEqual({ state: 'due', dueAt: '1', lastContactAt: 'l', stageEnteredAt: 's', followUpsSinceReset: 0 });
    expect(res.hasMore).toBe(false);
    const selects = db.calls.filter((c) => c[1] === 'select').map((c) => c[2] as string);
    expect(selects).toHaveLength(2);
    for (const s of selects) { expect(s).not.toMatch(/score|probability|\*/i); }
  });

  it('look-ahead row sets hasMore and is not returned; page 1 asks the next range', async () => {
    db.respond = (table) => table === 'application_follow_up_state'
      ? { data: Array.from({ length: APPLICATIONS_PAGE_SIZE + 1 }, (_, i) => vrow(`a${i}`, String(i))), error: null }
      : { data: Array.from({ length: APPLICATIONS_PAGE_SIZE + 1 }, (_, i) => ({ ...row(i), id: `a${i}` })), error: null };
    const res = await listDueApplications({ page: 1 });
    expect(db.calls).toContainEqual(['application_follow_up_state', 'range', 20, 40]);
    expect(res.items).toHaveLength(APPLICATIONS_PAGE_SIZE);
    expect(res.hasMore).toBe(true);
    expect((db.calls.find((c) => c[0] === 'applications' && c[1] === 'in')![3] as string[])).toHaveLength(APPLICATIONS_PAGE_SIZE);
  });

  it('empty first page makes no second query', async () => {
    const res = await listDueApplications();
    expect(res).toEqual({ items: [], hasMore: false });
    expect(db.calls.some((c) => c[0] === 'applications')).toBe(false);
  });
});
