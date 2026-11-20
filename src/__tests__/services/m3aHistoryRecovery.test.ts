// M3-A: browser lookup of a server-saved row by request key (= analysis_id),
// and parity between the browser upsert and the shared row mapper.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  filters: [] as [string, unknown][],
  lookups: 0,
  fail: false,
  upsert: vi.fn(async () => ({ error: null })),
}));
vi.mock('../../lib/supabase', () => ({
  withAuthRetry: (fn: () => unknown) => fn(),
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        upsert: db.upsert,
        select: () => q,
        order: async () => ({ data: [] }),
        eq: (k: string, v: unknown) => { db.filters.push([k, v]); return q; },
        maybeSingle: async () => {
          db.lookups++;
          if (db.fail) return { data: null, error: { message: 'down' } };
          return { data: db.rows.shift() ?? null, error: null };
        },
      });
      return q;
    },
  },
}));

import { RECOVERY_POLL_MS, RECOVERY_WINDOW_MS, saveToHistory, waitForSavedAnalysis } from '../../services/historyService';
import { toHistoryRow } from '../../lib/historyRow';

const KEY = '22222222-2222-4222-8222-222222222222';
const row = { analysis_id: KEY, user_id: 'u1', timestamp: new Date(1).toISOString(), match_score: 80 };

beforeEach(() => { db.rows = []; db.filters = []; db.lookups = 0; db.fail = false; db.upsert.mockClear(); });

describe('waitForSavedAnalysis', () => {
  it('scopes the lookup to the user and the key, maps the row', async () => {
    db.rows = [row];
    const found = await waitForSavedAnalysis('u1', KEY, Date.now(), async () => {});
    expect(found).toMatchObject({ id: KEY, matchScore: 80 });
    expect(db.filters).toEqual([['user_id', 'u1'], ['analysis_id', KEY]]);
    expect(db.lookups).toBe(1);
  });

  it('early drop: keeps polling inside the window and finds a row that lands late', async () => {
    db.rows = [null as never, null as never, null as never, row];
    const sleeps: number[] = [];
    const found = await waitForSavedAnalysis('u1', KEY, Date.now(), async (ms) => { sleeps.push(ms); });
    expect(found?.id).toBe(KEY);
    expect(db.lookups).toBe(4);
    expect(sleeps.every((ms) => ms <= RECOVERY_POLL_MS)).toBe(true);
  });

  it('window already over (75 s timeout): exactly one immediate lookup, then gives up', async () => {
    const sleep = vi.fn(async () => {});
    const found = await waitForSavedAnalysis('u1', KEY, Date.now() - RECOVERY_WINDOW_MS - 1, sleep);
    expect(found).toBeUndefined();
    expect(db.lookups).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('lookup errors are treated as not found (never throws), window still bounded', async () => {
    db.fail = true;
    vi.useFakeTimers();
    const start = Date.now();
    const p = waitForSavedAnalysis('u1', KEY, start, async (ms) => { vi.advanceTimersByTime(ms); });
    await expect(p).resolves.toBeUndefined();
    expect(Date.now() - start).toBeLessThanOrEqual(RECOVERY_WINDOW_MS);
    expect(db.lookups).toBe(Math.ceil(RECOVERY_WINDOW_MS / RECOVERY_POLL_MS) + 1);
    vi.useRealTimers();
  });
});

describe('browser upsert uses the shared mapper', () => {
  it('saveToHistory rows equal toHistoryRow output', async () => {
    const r = { id: 'a1', userId: 'u1', timestamp: 1, matchScore: 80, jobTitle: 'DA', scoreVersion: 'v2' } as never;
    await saveToHistory([r], 'pro');
    expect(db.upsert).toHaveBeenCalledWith([toHistoryRow('u1', r)], { onConflict: 'user_id,analysis_id' });
  });
});
