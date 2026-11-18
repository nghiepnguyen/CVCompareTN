/**
 * M2-Q Phase 1A real-database checks: ledger evidence, replay and two-tab
 * dispatch under concurrency. LOCAL Supabase stack only, through PostgREST
 * (signed-in users for claims, service_role for the quota RPCs that
 * /api/analyze calls), so every call is its own transaction.
 *
 * A "Gemini call" here is a reservation in state 'reserved': /api/analyze only
 * reaches Gemini after reserve_analytics_quota returns 'reserved', and the
 * recruiter run loop only dispatches after claim_candidate_analysis returns
 * 'claimed' (RecruiterContext; vitest m2d3Recruiter covers that gate).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/db-m2q-quota-safety.ts
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
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail: string) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

async function rpc(client: SupabaseClient, name: string, args: Row): Promise<Row> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as Row;
}
const reserve = (u: string, key: string, ttl = 360) => rpc(svc, 'reserve_analytics_quota', { p_user_id: u, p_request_key: key, p_ttl_seconds: ttl });
const commit = (u: string, r: string) => rpc(svc, 'commit_analytics_quota', { p_user_id: u, p_reservation_id: r });
const release = (u: string, r: string, o: string) => rpc(svc, 'release_analytics_quota', { p_user_id: u, p_reservation_id: r, p_outcome: o });
const claim = (client: SupabaseClient, id: string, attempt = randomUUID(), confirm = false) =>
  rpc(client, 'claim_candidate_analysis', { p_candidate_id: id, p_attempt_id: attempt, p_confirm_charge: confirm });

async function newUser(plan: 'free' | 'recruiter', limit: number): Promise<{ id: string; client: SupabaseClient }> {
  const email = `m2q-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;
  const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
  const { error: pErr } = await svc.from('profiles').upsert({
    id, email, role: 'user', plan, has_permission: true, quota_reset_day: 1, usage_count: 0, usage_month: cycle,
    monthly_analytics_limit_custom: true, monthly_analytics_limit: limit,
  });
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn: ${sErr.message}`);
  return { id, client };
}
async function newCandidate(u: { id: string; client: SupabaseClient }): Promise<string> {
  const { data: k, error: kErr } = await u.client.from('recruitment_campaigns')
    .insert({ user_id: u.id, title: 't', jd_title: 't', jd_content: 'jd' }).select('id').single();
  if (kErr) throw new Error(`campaign: ${kErr.message}`);
  const { data: c, error: cErr } = await u.client.from('candidate_cvs')
    .insert({ campaign_id: (k as Row).id, candidate_name: 'c', file_name: 'c.txt', file_path: `${u.id}/campaigns/x/${randomUUID()}.txt`, file_size: 1 })
    .select('id').single();
  if (cErr) throw new Error(`candidate: ${cErr.message}`);
  return (c as Row).id as string;
}
const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count as number;
const ledger = async (u: string) => ((await svc.from('analytics_quota_reservations').select('*').eq('user_id', u)).data ?? []) as Row[];

async function main() {
  // 1. Two tabs × 10 run loops on one candidate → one owner, one Gemini call, one charge.
  {
    const u = await newUser('recruiter', 100);
    const tab2 = createClient(url, anonKey, { auth: { persistSession: false } });
    await tab2.auth.setSession((await u.client.auth.getSession()).data.session!);
    // Several candidates at once widen the race window (one is too narrow to
    // catch a missing row lock reliably).
    const CANDIDATES = 8;
    const cands = await Promise.all(Array.from({ length: CANDIDATES }, () => newCandidate(u)));
    const runLoop = async (tab: SupabaseClient, c: string) => {
      const attempt = randomUUID();
      const cl = await claim(tab, c, attempt);
      if (cl.result !== 'claimed') return { c, cl, res: null as Row | null, attempt };
      return { c, cl, res: await reserve(u.id, attempt), attempt };
    };
    const out = await Promise.all(cands.flatMap((c) => Array.from({ length: 20 }, (_, i) => runLoop(i % 2 ? tab2 : u.client, c))));
    const perCandidate = cands.map((c) => ({
      owners: out.filter((o) => o.c === c && o.cl.result === 'claimed').length,
      dispatched: out.filter((o) => o.c === c && o.res?.status === 'reserved'),
    }));
    const winners = perCandidate.flatMap((p) => p.dispatched);
    await Promise.all(winners.map((w) => commit(u.id, w.res!.reservation_id as string)));
    // The other tab re-sends an owner's key (double submit / retry): never a second run.
    const replays = await Promise.all(winners.flatMap((w) => Array.from({ length: 5 }, () => reserve(u.id, w.attempt))));
    const rows = await ledger(u.id);
    check(`two tabs × ${CANDIDATES} candidates: one owner, one Gemini dispatch, one charge each`,
      perCandidate.every((p) => p.owners === 1 && p.dispatched.length === 1) && replays.every((r) => r.status === 'duplicate')
        && rows.length === CANDIDATES && (await usage(u.id)) === CANDIDATES,
      `owners=${perCandidate.map((p) => p.owners).join(',')} dispatched=${winners.length} replays=${[...new Set(replays.map((r) => r.status))].join('/')} ledger=${rows.length} usage=${await usage(u.id)}`);
  }

  // 2. Replay of one key under concurrency: one reservation, one charge, in every state.
  {
    const u = await newUser('free', 100);
    const key = randomUUID();
    const first = await Promise.all(Array.from({ length: 20 }, () => reserve(u.id, key)));
    const won = first.filter((r) => r.status === 'reserved');
    const commits = won[0] ? await Promise.all(Array.from({ length: 10 }, () => commit(u.id, won[0].reservation_id as string))) : [];
    const later = await Promise.all(Array.from({ length: 10 }, () => reserve(u.id, key)));
    check('20 parallel reserves + 10 commits of one key',
      won.length === 1 && first.filter((r) => r.status === 'duplicate').length === 19
        && commits.every((r) => r.status === 'committed') && commits.filter((r) => r.replay === false).length === 1
        && later.every((r) => r.status === 'duplicate' && r.state === 'committed')
        && (await usage(u.id)) === 1 && (await ledger(u.id)).length === 1,
      `reserved=${won.length} firstReplays=${commits.filter((r) => r.replay === false).length} usage=${await usage(u.id)} ledger=${(await ledger(u.id)).length}`);

    const keys = { refunded: randomUUID(), uncertain: randomUUID() };
    const r1 = await reserve(u.id, keys.refunded); await release(u.id, r1.reservation_id as string, 'pre_gemini');
    const r2 = await reserve(u.id, keys.uncertain); await release(u.id, r2.reservation_id as string, 'uncertain');
    const replay = await Promise.all([...Array(10)].flatMap(() => [reserve(u.id, keys.refunded), reserve(u.id, keys.uncertain)]));
    check('replays of refunded / uncertain keys never reserve again',
      replay.every((r) => r.status === 'duplicate') && (await ledger(u.id)).length === 3 && (await usage(u.id)) === 1,
      `statuses=${[...new Set(replay.map((r) => `${r.status}:${r.state}`))].join(',')} ledger=${(await ledger(u.id)).length}`);
  }

  // 3. Open-candidate evidence survives parallel sweeps and claims.
  {
    const u = await newUser('recruiter', 100);
    const c = await newCandidate(u);
    const attempt = randomUUID();
    await claim(u.client, c, attempt);
    const r = await reserve(u.id, attempt);
    await commit(u.id, r.reservation_id as string);                       // Gemini delivered, save lost
    await u.client.from('candidate_cvs').update({ status: 'error', error_message: 'save failed' })
      .eq('id', c).eq('analysis_attempt_id', attempt).eq('status', 'analyzing');
    const stale = await reserve(u.id, randomUUID(), 1);                   // an expired row for the sweep
    await svc.from('analytics_quota_reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', stale.reservation_id as string);
    const mixed = await Promise.all([
      ...Array.from({ length: 15 }, () => reserve(u.id, randomUUID())),
      ...Array.from({ length: 15 }, () => claim(u.client, c)),
    ]);
    const claims = mixed.slice(15);
    const rows = await ledger(u.id);
    const evidence = rows.find((x) => x.request_key === attempt);
    check('paid_result_lost evidence kept under parallel sweeps',
      evidence?.state === 'committed' && rows.find((x) => x.id === stale.reservation_id)?.state === 'uncertain'
        && claims.every((x) => x.result === 'needs_confirm' && x.reason === 'paid_result_lost'),
      `evidence=${evidence?.state ?? 'MISSING'} claims=${[...new Set(claims.map((x) => `${x.result}:${x.reason}`))].join(',')} ledger=${rows.length}`);
  }

  // 4. An idle user's expired reservation is untouched by everybody else's traffic.
  {
    const idle = await newUser('free', 5);
    const busy = await newUser('free', 100);
    const r = await reserve(idle.id, randomUUID(), 1);
    await svc.from('analytics_quota_reservations').update({ expires_at: new Date(Date.now() - 86_400_000).toISOString() }).eq('id', r.reservation_id as string);
    await Promise.all(Array.from({ length: 20 }, async () => {
      const x = await reserve(busy.id, randomUUID());
      if (x.status === 'reserved') await release(busy.id, x.reservation_id as string, 'pre_gemini');
    }));
    const rows = await ledger(idle.id);
    check('idle user\'s expired reservation not deleted or swept',
      rows.length === 1 && rows[0].state === 'reserved' && (await usage(idle.id)) === 0,
      `rows=${rows.length} state=${rows[0]?.state ?? 'MISSING'}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
