/**
 * M2-C2A preflight: monthly quota ledger racing the REAL plan-change RPCs
 * (activate_pro_plan, admin_set_user_plan), plan expiry and cycle rollover.
 * LOCAL Supabase stack only. Invariant checked after every scenario:
 * 0 <= usage_count <= limit, every reservation settled at most once, no RPC
 * errors, and no new deadlocks (pg_stat_database.deadlocks via DB_DEADLOCKS_CMD
 * is read by the caller before/after).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/db-quota-plan-concurrency.ts
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['127.0.0.1', 'localhost'].includes(host) || !serviceKey) {
  console.error('Refusing to run: SUPABASE_URL must be a local stack.');
  process.exit(2);
}
const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
const results: boolean[] = [];
const errors: string[] = [];
const check = (name: string, ok: boolean, detail: string) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

async function rpc(name: string, args: Row): Promise<Row | boolean | null> {
  const { data, error } = await svc.rpc(name, args);
  if (error) { errors.push(`${name}: ${error.message}`); return null; }
  return data as Row;
}
const reserve = (u: string, ttl = 360) => rpc('reserve_analytics_quota', { p_user_id: u, p_request_key: randomUUID(), p_ttl_seconds: ttl }) as Promise<Row | null>;
const commit = (u: string, r: string) => rpc('commit_analytics_quota', { p_user_id: u, p_reservation_id: r }) as Promise<Row | null>;

async function newUser(opts: { plan?: string; expires?: string | null; usage?: number; custom?: number | null } = {}) {
  const { data, error } = await svc.auth.admin.createUser({ email: `m2c2a-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;
  const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
  const { error: pErr } = await svc.from('profiles').upsert({
    id, role: 'user', plan: opts.plan ?? 'free', plan_expires_at: opts.expires ?? null, has_permission: true,
    quota_reset_day: 1, usage_count: opts.usage ?? 0, usage_month: cycle,
    monthly_analytics_limit_custom: opts.custom != null, monthly_analytics_limit: opts.custom ?? null,
  });
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  return id;
}
async function profile(u: string) {
  const { data } = await svc.from('profiles').select('usage_count, plan, plan_expires_at, monthly_analytics_limit_custom, monthly_analytics_limit').eq('id', u).single();
  const p = data as { usage_count: number; plan: string; plan_expires_at: string | null };
  const effective = p.plan !== 'free' && (!p.plan_expires_at || new Date(p.plan_expires_at) > new Date()) ? p.plan : 'free';
  const limit = effective === 'recruiter' ? 500 : effective === 'pro' ? 100 : 5; // app_settings default = 5 locally and in prod
  return { ...p, effective, limit };
}
async function ledger(u: string): Promise<Row[]> {
  const { data } = await svc.from('analytics_quota_reservations').select('*').eq('user_id', u);
  return (data ?? []) as Row[];
}
async function pendingPayment(u: string, plan = 'pro') {
  const order = Math.floor(Math.random() * 1e12);
  const { error } = await svc.from('payments').insert({ user_id: u, order_code: order, amount: 1, plan, duration_days: 30, status: 'pending' });
  if (error) throw new Error(`payment: ${error.message}`);
  return order;
}
const invariant = async (u: string) => { const p = await profile(u); return { ok: p.usage_count >= 0 && p.usage_count <= p.limit, p }; };

async function main() {
  const before = errors.length;

  // P1. Burst of reserves racing a free→pro upgrade (activate_pro_plan).
  {
    const u = await newUser({ usage: 4 });
    const order = await pendingPayment(u);
    const [, ...res] = await Promise.all([
      rpc('activate_pro_plan', { p_user_id: u, p_order_code: order, p_duration_days: 30, p_plan: 'pro' }),
      ...Array.from({ length: 20 }, () => reserve(u)),
    ]);
    const reserved = res.filter((r) => r?.status === 'reserved') as Row[];
    await Promise.all(reserved.map((r) => commit(u, r.reservation_id as string)));
    const { ok, p } = await invariant(u);
    check('P1 reserve burst vs upgrade (activate_pro_plan)', ok && p.effective === 'pro' && p.usage_count === 4 + reserved.length,
      `reserved=${reserved.length}/20 usage=${p.usage_count} limit=${p.limit} plan=${p.effective}`);
  }

  // P2. Commits racing a pro→free downgrade (admin_set_user_plan), usage near pro limit.
  {
    const u = await newUser({ plan: 'pro', usage: 90 });
    const ids = ((await Promise.all(Array.from({ length: 10 }, () => reserve(u)))) as Row[]).map((r) => r.reservation_id as string);
    const out = await Promise.all([
      rpc('admin_set_user_plan', { p_user_id: u, p_plan: 'free', p_duration_days: 30 }),
      ...ids.map((id) => commit(u, id)),
    ]);
    const commits = out.slice(1) as Row[];
    const charged = commits.filter((c) => c?.charged === true).length;
    const waived = commits.filter((c) => c?.outcome === 'over_limit_waived').length;
    const { ok, p } = await invariant(u);
    const settled = (await ledger(u)).every((r) => r.state === 'committed');
    check('P2 commits vs downgrade (admin_set_user_plan)', ok && settled && charged + waived === 10,
      `charged=${charged} waived=${waived} usage=${p.usage_count} limit=${p.limit} plan=${p.effective}`);
  }

  // P3. Plan expiry mid-flight: lazy demotion raced by commits and new reserves.
  {
    const u = await newUser({ plan: 'pro', usage: 95, expires: new Date(Date.now() + 3000).toISOString() });
    const ids = ((await Promise.all(Array.from({ length: 5 }, () => reserve(u)))) as Row[]).map((r) => r.reservation_id as string);
    await new Promise((r) => setTimeout(r, 3500));
    const out = await Promise.all([...ids.map((id) => commit(u, id)), ...Array.from({ length: 10 }, () => reserve(u))]);
    const charged = (out.slice(0, 5) as Row[]).filter((c) => c?.charged === true).length;
    const newReserved = (out.slice(5) as Row[]).filter((r) => r?.status === 'reserved').length;
    const { ok, p } = await invariant(u);
    check('P3 expiry vs commits + reserves', ok && p.effective === 'free' && p.usage_count === charged && charged + newReserved <= 5,
      `charged=${charged} newReserved=${newReserved} usage=${p.usage_count} limit=${p.limit} plan=${p.plan}`);
  }

  // P4. Cycle rollover raced by prior-cycle commits and new reserves.
  {
    const u = await newUser({ usage: 5 });
    const old = await svc.from('analytics_quota_reservations').insert(
      Array.from({ length: 4 }, () => ({ user_id: u, request_key: randomUUID(), cycle: '1999-01-01', expires_at: new Date(Date.now() + 3.6e5).toISOString() }))
    ).select('id');
    const oldIds = ((old.data ?? []) as Row[]).map((r) => r.id as string);
    await svc.from('profiles').update({ usage_month: '1999-01-01' }).eq('id', u);
    const out = await Promise.all([...oldIds.map((id) => commit(u, id)), ...Array.from({ length: 10 }, () => reserve(u))]);
    const priorCycle = (out.slice(0, 4) as Row[]).filter((c) => c?.outcome === 'prior_cycle').length;
    const reserved = (out.slice(4) as Row[]).filter((r) => r?.status === 'reserved').length;
    const { ok, p } = await invariant(u);
    check('P4 rollover vs prior-cycle commits + reserves', ok && priorCycle === 4 && reserved === 5 && p.usage_count === 0,
      `priorCycle=${priorCycle} reserved=${reserved} usage=${p.usage_count}`);
  }

  // P5. Late commit after a plan change and TTL expiry: charged exactly once.
  {
    const u = await newUser({ usage: 4 });
    const r = (await reserve(u, 1)) as Row;
    const order = await pendingPayment(u);
    await rpc('activate_pro_plan', { p_user_id: u, p_order_code: order, p_duration_days: 30, p_plan: 'pro' });
    await new Promise((res) => setTimeout(res, 1500));
    await Promise.all([reserve(u), commit(u, r.reservation_id as string), commit(u, r.reservation_id as string)]);
    const row = (await ledger(u)).find((x) => x.id === r.reservation_id);
    const { ok, p } = await invariant(u);
    check('P5 late commit after upgrade + TTL expiry', ok && row?.state === 'committed' && p.usage_count === 5,
      `state=${row?.state} charged=${row?.charged} outcome=${row?.outcome} usage=${p.usage_count}`);
  }

  // P6. Mixed storm on one user: reserves, commits, releases, upgrade, downgrade.
  {
    const u = await newUser({ usage: 0 });
    const order = await pendingPayment(u);
    const first = ((await Promise.all(Array.from({ length: 5 }, () => reserve(u)))) as Row[]).map((r) => r.reservation_id as string);
    await Promise.all([
      ...first.slice(0, 3).map((id) => commit(u, id)),
      ...first.slice(3).map((id) => rpc('release_analytics_quota', { p_user_id: u, p_reservation_id: id, p_outcome: 'uncertain' })),
      rpc('activate_pro_plan', { p_user_id: u, p_order_code: order, p_duration_days: 30, p_plan: 'pro' }),
      ...Array.from({ length: 15 }, () => reserve(u)),
      rpc('admin_set_user_plan', { p_user_id: u, p_plan: 'free', p_duration_days: 30 }),
    ]);
    const rows = await ledger(u);
    const { ok, p } = await invariant(u);
    check('P6 mixed storm (no errors, invariant holds)', ok && rows.every((r) => ['reserved', 'committed', 'uncertain', 'refunded'].includes(r.state as string)),
      `rows=${rows.length} usage=${p.usage_count} limit=${p.limit} plan=${p.effective}`);
  }

  const newErrors = errors.slice(before);
  check('no RPC errors across scenarios', newErrors.length === 0, newErrors.length ? newErrors.slice(0, 3).join(' | ') : 'none');
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
