// M2-Q H1 (Q-6) against a REAL local Supabase stack: the ledger cannot be
// deleted through PostgREST with the service key, billing RPCs still work, and
// the real GoTrue account delete still cascades ledger rows. Skipped unless
// M2Q_LOCAL_DB=1 and SUPABASE_URL is a local address (never production).
//   M2Q_LOCAL_DB=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx vitest run src/__tests__/db/m2qH1LedgerGrants.db.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const enabled = process.env.M2Q_LOCAL_DB === '1' && ['127.0.0.1', 'localhost'].includes(host)
  && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
// CI (scripts/ci/db-tests.sh) sets REQUIRE_DB_TESTS=1: a missing stack is a failure, not a skip.
if (process.env.REQUIRE_DB_TESTS === '1' && !enabled) {
  throw new Error('REQUIRE_DB_TESTS=1 but no local Supabase stack (M2Q_LOCAL_DB=1, local SUPABASE_URL, both keys)');
}

describe.skipIf(!enabled)('M2-Q H1 ledger grants on a real database', () => {
  let svc: SupabaseClient;
  const ledgerCount = async (u: string) =>
    (await svc.from('analytics_quota_reservations').select('id', { count: 'exact', head: true }).eq('user_id', u)).count;

  beforeAll(() => {
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  });

  async function userWithLedgerRow(): Promise<string> {
    const email = `m2qh1-${randomUUID()}@example.test`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    const id = data.user.id;
    const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
    const { error: pErr } = await svc.from('profiles').upsert({
      id, email, role: 'user', plan: 'free', has_permission: true, quota_reset_day: 1, usage_count: 0,
      usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: 10,
    });
    if (pErr) throw new Error(`profile: ${pErr.message}`);
    const { data: r, error: rErr } = await svc.rpc('reserve_analytics_quota', { p_user_id: id, p_request_key: randomUUID() });
    if (rErr || (r as { status?: string })?.status !== 'reserved') throw new Error(`reserve: ${rErr?.message ?? JSON.stringify(r)}`);
    return id;
  }

  it('PostgREST DELETE with the service key is refused and removes nothing', async () => {
    const u = await userWithLedgerRow();
    const { error } = await svc.from('analytics_quota_reservations').delete().eq('user_id', u);
    expect(error?.code).toBe('42501');
    expect(await ledgerCount(u)).toBe(1);
    // The broadest filter a caller could use is refused too.
    const { error: all } = await svc.from('analytics_quota_reservations').delete().not('id', 'is', null);
    expect(all?.code).toBe('42501');
  });

  it('commit and release through the service key still settle the ledger', async () => {
    const u = await userWithLedgerRow();
    const { data: open } = await svc.from('analytics_quota_reservations').select('id').eq('user_id', u).single();
    const { data: c } = await svc.rpc('commit_analytics_quota', { p_user_id: u, p_reservation_id: (open as { id: string }).id });
    expect(c).toMatchObject({ status: 'committed', charged: true });
    const { data: r2 } = await svc.rpc('reserve_analytics_quota', { p_user_id: u, p_request_key: randomUUID() });
    const { data: rel } = await svc.rpc('release_analytics_quota', {
      p_user_id: u, p_reservation_id: (r2 as { reservation_id: string }).reservation_id, p_outcome: 'pre_gemini',
    });
    expect(rel).toMatchObject({ status: 'refunded' });
  });

  it('GoTrue auth.admin.deleteUser still cascades the profile and its ledger rows', async () => {
    const u = await userWithLedgerRow();
    expect(await ledgerCount(u)).toBe(1);
    const { error } = await svc.auth.admin.deleteUser(u);
    expect(error).toBeNull();
    expect(await ledgerCount(u)).toBe(0);
    const { data: p } = await svc.from('profiles').select('id').eq('id', u);
    expect(p).toEqual([]);
  });
});
