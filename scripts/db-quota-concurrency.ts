/**
 * M2-C2 real-database concurrency checks for the monthly quota ledger.
 * Runs against a LOCAL Supabase stack only (`supabase start`), through
 * PostgREST, so every RPC is its own transaction on a pooled connection.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/db-quota-concurrency.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['127.0.0.1', 'localhost'].includes(host) || !anonKey || !serviceKey) {
  console.error('Refusing to run: SUPABASE_URL must be a local stack and both keys set.');
  process.exit(2);
}

const svc: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

async function rpc(name: string, args: Row): Promise<Row> {
  const { data, error } = await svc.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as Row;
}
const reserve = (u: string, ttl = 360) => rpc('reserve_analytics_quota', { p_user_id: u, p_request_key: randomUUID(), p_ttl_seconds: ttl });
const commit = (u: string, r: string) => rpc('commit_analytics_quota', { p_user_id: u, p_reservation_id: r });
const release = (u: string, r: string, o: string) => rpc('release_analytics_quota', { p_user_id: u, p_reservation_id: r, p_outcome: o });

async function newUser(limit: number, usage = 0): Promise<{ id: string; email: string; password: string }> {
  const email = `m2c2-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;
  const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
  const { error: pErr } = await svc.from('profiles').upsert({
    id, role: 'user', plan: 'free', has_permission: true, quota_reset_day: 1,
    usage_count: usage, usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: limit,
  });
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  return { id, email, password };
}
async function usageOf(u: string): Promise<number> {
  const { data } = await svc.from('profiles').select('usage_count').eq('id', u).single();
  return (data as { usage_count: number }).usage_count;
}
async function ledger(u: string): Promise<Row[]> {
  const { data } = await svc.from('analytics_quota_reservations').select('*').eq('user_id', u);
  return (data ?? []) as Row[];
}

async function main() {
  // 1. 20 concurrent reservations, 1 unit left.
  {
    const u = await newUser(5, 4);
    const out = await Promise.all(Array.from({ length: 20 }, () => reserve(u.id)));
    const reserved = out.filter((r) => r.status === 'reserved').length;
    const denied = out.filter((r) => r.status === 'denied').length;
    check('20 concurrent reserves, 1 unit left', reserved === 1 && denied === 19, `reserved=${reserved} denied=${denied}`);
  }

  // 2. 3× quota concurrency: limit 10, 30 parallel reserve→commit flows.
  {
    const u = await newUser(10);
    const flows = await Promise.all(Array.from({ length: 30 }, async () => {
      const r = await reserve(u.id);
      if (r.status !== 'reserved') return 'denied';
      const c = await commit(u.id, r.reservation_id as string);
      return c.charged ? 'charged' : 'uncharged';
    }));
    const charged = flows.filter((f) => f === 'charged').length;
    const usage = await usageOf(u.id);
    check('3× quota (30 flows, limit 10)', charged === 10 && usage === 10, `charged=${charged} denied=${flows.filter((f) => f === 'denied').length} usage=${usage}`);
  }

  // 3a. commit vs release race on the same reservation (20 pairs).
  {
    const u = await newUser(50);
    const ids = (await Promise.all(Array.from({ length: 20 }, () => reserve(u.id)))).map((r) => r.reservation_id as string);
    await Promise.all(ids.flatMap((id) => [commit(u.id, id), release(u.id, id, 'pre_gemini')]));
    const rows = await ledger(u.id);
    const committed = rows.filter((r) => r.state === 'committed').length;
    const refunded = rows.filter((r) => r.state === 'refunded').length;
    const usage = await usageOf(u.id);
    check('commit vs release race (20 pairs)', committed + refunded === 20 && usage === committed && rows.every((r) => r.state !== 'reserved'),
      `committed=${committed} refunded=${refunded} usage=${usage}`);
  }

  // 3b. commit vs commit race (double charge).
  {
    const u = await newUser(50);
    const ids = (await Promise.all(Array.from({ length: 15 }, () => reserve(u.id)))).map((r) => r.reservation_id as string);
    await Promise.all(ids.flatMap((id) => [commit(u.id, id), commit(u.id, id), commit(u.id, id)]));
    const usage = await usageOf(u.id);
    check('triple concurrent commit per reservation (15)', usage === 15, `usage=${usage}`);
  }

  // 4. K = 2 forgiveness under concurrency: 10 uncertain releases at once.
  {
    const u = await newUser(50);
    const ids = (await Promise.all(Array.from({ length: 10 }, () => reserve(u.id)))).map((r) => r.reservation_id as string);
    const out = await Promise.all(ids.map((id) => release(u.id, id, 'uncertain')));
    const forgiven = out.filter((r) => r.settlement === 'forgiven').length;
    const charged = out.filter((r) => r.settlement === 'charged').length;
    const usage = await usageOf(u.id);
    const forgivenRows = (await ledger(u.id)).filter((r) => r.forgiven).length;
    check('K=2 boundary under concurrency (10 uncertain)', forgiven === 2 && charged === 8 && usage === 8 && forgivenRows === 2,
      `forgiven=${forgiven} charged=${charged} usage=${usage} forgivenRows=${forgivenRows}`);
  }

  // 5. Timeout / crash / late completion: TTL expiry raced with the late commit.
  {
    const u = await newUser(50);
    const stale = await Promise.all(Array.from({ length: 6 }, () => reserve(u.id, 1)));
    await new Promise((r) => setTimeout(r, 2100)); // let every TTL pass ("crashed" requests)
    const staleIds = stale.map((r) => r.reservation_id as string);
    // Concurrently: next requests expire the stale rows while the stale requests complete late.
    await Promise.all([
      ...Array.from({ length: 4 }, () => reserve(u.id)),
      ...staleIds.map((id) => commit(u.id, id)),
      ...staleIds.map((id) => commit(u.id, id)),
    ]);
    const rows = await ledger(u.id);
    const staleRows = rows.filter((r) => staleIds.includes(r.id as string));
    const usage = await usageOf(u.id);
    const allCommitted = staleRows.every((r) => r.state === 'committed' && r.charged === true);
    check('TTL expiry vs late completion (6 stale, double late commit)', allCommitted && usage === 6,
      `states=${[...new Set(staleRows.map((r) => `${r.state}/${r.charged}`))].join(',')} usage=${usage}`);
  }

  // 5b. Crash with no late completion: expired rows settle by K=2.
  {
    const u = await newUser(50);
    await Promise.all(Array.from({ length: 4 }, () => reserve(u.id, 1)));
    await new Promise((r) => setTimeout(r, 2100));
    await Promise.all(Array.from({ length: 3 }, () => reserve(u.id)));
    const expired = (await ledger(u.id)).filter((r) => String(r.outcome ?? '').startsWith('ttl_expired'));
    const usage = await usageOf(u.id);
    check('crash recovery: 4 expired → 2 forgiven, 2 charged', expired.length === 4 && expired.filter((r) => r.forgiven).length === 2 && usage === 2,
      `expired=${expired.length} forgiven=${expired.filter((r) => r.forgiven).length} usage=${usage}`);
  }

  // 6. Concurrent rollover: many reserves while the cycle label is stale.
  {
    const u = await newUser(5, 5);
    await svc.from('profiles').update({ usage_month: '1999-01-01' }).eq('id', u.id);
    const out = await Promise.all(Array.from({ length: 12 }, () => reserve(u.id)));
    const reserved = out.filter((r) => r.status === 'reserved').length;
    check('rollover under concurrency (limit 5, 12 reserves)', reserved === 5 && (await usageOf(u.id)) === 0, `reserved=${reserved}`);
  }

  // 7. Permissions through PostgREST with real JWTs.
  {
    const u = await newUser(5);
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email: u.email, password: u.password });
    if (signInErr) throw new Error(`signIn: ${signInErr.message}`);
    const r = await reserve(u.id);
    const attempts: [string, PromiseLike<{ error: unknown; data?: unknown }>][] = [];
    for (const [who, c] of [['anon', anon], ['authenticated', userClient]] as const) {
      attempts.push([`${who} reserve`, c.rpc('reserve_analytics_quota', { p_user_id: u.id, p_request_key: randomUUID() })]);
      attempts.push([`${who} commit`, c.rpc('commit_analytics_quota', { p_user_id: u.id, p_reservation_id: r.reservation_id })]);
      attempts.push([`${who} release`, c.rpc('release_analytics_quota', { p_user_id: u.id, p_reservation_id: r.reservation_id, p_outcome: 'pre_gemini' })]);
      attempts.push([`${who} lock_state`, c.rpc('analytics_quota_lock_state', { p_user_id: u.id })]);
    }
    const blocked: string[] = [];
    for (const [name, p] of attempts) { const { error } = await p; if (error) blocked.push(name); }
    const { data: readRows, error: readErr } = await userClient.from('analytics_quota_reservations').select('id');
    const { error: writeErr } = await userClient.from('analytics_quota_reservations').insert({ user_id: u.id, request_key: randomUUID(), cycle: 'x', expires_at: new Date().toISOString() });
    const { error: usageErr } = await userClient.from('profiles').update({ usage_count: 0 }).eq('id', u.id);
    const state = (await ledger(u.id)).find((x) => x.id === r.reservation_id)?.state;
    check('RPCs blocked for anon + authenticated (8 calls)', blocked.length === attempts.length, `blocked=${blocked.length}/${attempts.length}`);
    check('ledger not readable/writable by authenticated', (readErr !== null || (readRows ?? []).length === 0) && writeErr !== null,
      `read=${readErr ? 'denied' : `${(readRows ?? []).length} rows`} write=${writeErr ? 'denied' : 'ALLOWED'}`);
    check('user cannot reset own usage_count', usageErr !== null, usageErr ? 'denied' : 'ALLOWED');
    check('reservation untouched by blocked calls', state === 'reserved', `state=${state}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
