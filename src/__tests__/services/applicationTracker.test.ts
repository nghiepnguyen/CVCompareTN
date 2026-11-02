import { describe, it, expect, vi, beforeEach } from 'vitest';
import matrix from '../../../supabase/application_status_transitions.json';
import type { FakeDb } from '../components/trackerFakeSupabase';

const db = vi.hoisted(() => ({ calls: [], respond: () => ({ data: [], error: null }), rpc: vi.fn() }) as unknown as FakeDb);
vi.mock('../../lib/supabase', async () => (await import('../components/trackerFakeSupabase')).fakeSupabase(db));

import {
  listApplications, getApplicationTimeline, transitionApplicationStatus, trackerErrorCode,
  ApplicationTrackerError, APPLICATIONS_PAGE_SIZE,
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
  it('newest first by occurred_at then created_at, bounded', async () => {
    await getApplicationTimeline('a');
    expect(db.calls).toContainEqual(['application_events', 'order', 'occurred_at', { ascending: false }]);
    expect(db.calls).toContainEqual(['application_events', 'order', 'created_at', { ascending: false }]);
    expect(db.calls.some((c) => c[0] === 'application_events' && c[1] === 'range')).toBe(true);
  });
});
