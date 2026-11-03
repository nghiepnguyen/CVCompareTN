import { vi } from 'vitest';

/** Minimal PostgREST stand-in for tracker tests: records calls, answers per table. */
export type Call = [table: string, method: string, ...args: unknown[]];
export interface FakeDb {
  calls: Call[];
  respond: (table: string, calls: Call[]) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;
  rpc: ReturnType<typeof vi.fn>;
}

export function fakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const own: Call[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'range', 'eq', 'in', 'maybeSingle']) {
      q[m] = (...args: unknown[]) => { const c: Call = [table, m, ...args]; own.push(c); db.calls.push(c); return q; };
    }
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(db.respond(table, own)).then(res, rej);
    return q;
  };
  return { supabase: { from, rpc: db.rpc }, withAuthRetry: (fn: () => unknown) => fn() };
}
