/**
 * M2-D3 real-database concurrency checks for candidate analysis ownership.
 * LOCAL Supabase stack only, through PostgREST as a signed-in user, so every
 * claim is its own transaction on a pooled connection (as two browser tabs).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/db-candidate-claim-concurrency.ts
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

async function newRecruiter(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `m2d3-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;
  const { error: pErr } = await svc.from('profiles').upsert({ id, email, role: 'user', plan: 'recruiter', has_permission: true });
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

const claim = async (client: SupabaseClient, id: string, confirm = false) => {
  const { data, error } = await client.rpc('claim_candidate_analysis', { p_candidate_id: id, p_attempt_id: randomUUID(), p_confirm_charge: confirm });
  if (error) throw new Error(`claim: ${error.message}`);
  return data as Row;
};
const row = async (id: string) => (await svc.from('candidate_cvs').select('*').eq('id', id).single()).data as Row;
const backdate = (id: string, minutes: number) =>
  svc.from('candidate_cvs').update({ analysis_started_at: new Date(Date.now() - minutes * 60_000).toISOString() }).eq('id', id);
const save = async (u: string, id: string, attempt: string, score: number) => {
  const { data, error } = await svc.rpc('save_candidate_analysis_attempt', {
    p_user_id: u, p_candidate_id: id, p_attempt_id: attempt, p_analysis_result: { matchScore: score }, p_match_score: score,
  });
  if (error) throw new Error(`save: ${error.message}`);
  return data as Row;
};
const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count;
const ledgerCount = async (u: string) => (await svc.from('analytics_quota_reservations').select('id', { count: 'exact', head: true }).eq('user_id', u)).count;

async function main() {
  // 1. Two tabs × 10: 20 parallel claims of one pending candidate → exactly one owner.
  {
    const u = await newRecruiter();
    const tab2 = createClient(url, anonKey, { auth: { persistSession: false } });
    await tab2.auth.setSession((await u.client.auth.getSession()).data.session!);
    const c = await newCandidate(u);
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => claim(i % 2 ? tab2 : u.client, c)));
    const won = out.filter((r) => r.result === 'claimed').length;
    const active = out.filter((r) => r.result === 'active').length;
    check('20 parallel claims (2 tabs), pending row', won === 1 && active === 19, `claimed=${won} active=${active}`);
  }

  // 2. 20 parallel claims of one STALE row (never dispatched) → exactly one new owner.
  {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    await claim(u.client, c);
    await backdate(c, 11);
    const before = (await row(c)).analysis_attempt_id;
    const out = await Promise.all(Array.from({ length: 20 }, () => claim(u.client, c)));
    const won = out.filter((r) => r.result === 'claimed').length;
    const after = (await row(c)).analysis_attempt_id;
    check('20 parallel claims, stale row', won === 1 && after !== before, `claimed=${won} attempt changed=${after !== before}`);
  }

  // 3. 20 parallel CONFIRMED claims of a paid-result-lost row → one owner (one possible charge, not 20).
  {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    await claim(u.client, c);
    const attempt = (await row(c)).analysis_attempt_id as string;
    await svc.from('analytics_quota_reservations').insert({
      user_id: u.id, request_key: attempt, cycle: 'x', state: 'committed', charged: true,
      expires_at: new Date().toISOString(), settled_at: new Date().toISOString(),
    });
    await backdate(c, 30);
    const unconfirmed = await claim(u.client, c);
    const out = await Promise.all(Array.from({ length: 20 }, () => claim(u.client, c, true)));
    const won = out.filter((r) => r.result === 'claimed').length;
    check('paid_result_lost: unconfirmed refused, 20 confirmed → 1 owner',
      unconfirmed.result === 'needs_confirm' && unconfirmed.reason === 'paid_result_lost' && won === 1,
      `unconfirmed=${unconfirmed.result}/${unconfirmed.reason} claimed=${won}`);
  }

  // 4. Expired ownership while the old worker still runs: A and B save concurrently;
  //    exactly one result lands, the other is superseded; replays are idempotent.
  {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    await claim(u.client, c);
    const a = (await row(c)).analysis_attempt_id as string;
    await backdate(c, 11);
    await claim(u.client, c);
    const b = (await row(c)).analysis_attempt_id as string;
    const out = await Promise.all([save(u.id, c, a, 40), save(u.id, c, b, 90), save(u.id, c, a, 40), save(u.id, c, b, 90)]);
    const r = await row(c);
    const winner = r.analysis_attempt_id;
    const supersededOk = out.every((o, i) => (o.result === 'saved') === ([a, b, a, b][i] === winner));
    check('concurrent saves A (stale) vs B (owner)', r.status === 'done' && supersededOk && r.match_score === (winner === a ? 40 : 90),
      `winner=${winner === a ? 'A' : 'B'} results=${out.map((o) => o.result).join(',')}`);
    const { data: k } = await svc.from('recruitment_campaigns').select('analyzed_count').eq('id', r.campaign_id as string).single();
    check('no double count after concurrent saves', (k as Row).analyzed_count === 1, `analyzed_count=${(k as Row).analyzed_count}`);
  }

  // 5. Claim storm never touches quota.
  {
    const u = await newRecruiter();
    const ids = await Promise.all(Array.from({ length: 5 }, () => newCandidate(u)));
    const u0 = await usage(u.id); const l0 = await ledgerCount(u.id);
    await Promise.all(ids.flatMap((c) => Array.from({ length: 6 }, () => claim(u.client, c, true))));
    check('claims do not consume quota', (await usage(u.id)) === u0 && (await ledgerCount(u.id)) === l0, `usage ${u0}→${await usage(u.id)} ledger ${l0}→${await ledgerCount(u.id)}`);
  }

  // 6. Another user cannot claim or see the row.
  {
    const owner = await newRecruiter();
    const intruder = await newRecruiter();
    const c = await newCandidate(owner);
    const r = await claim(intruder.client, c, true);
    check('foreign claim', r.result === 'not_found' && (await row(c)).status === 'pending', `result=${r.result}`);
  }

  // 7. Fenced release through RLS (what releaseCandidateAnalysis sends): the
  //    owner attempt releases; a stale attempt is a no-op.
  {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    await claim(u.client, c);
    const owner = (await row(c)).analysis_attempt_id as string;
    const rel = (attempt: string) => u.client.from('candidate_cvs').update({ status: 'error', error_message: 'x' })
      .eq('id', c).eq('analysis_attempt_id', attempt).eq('status', 'analyzing').select('id');
    const stale = await rel(randomUUID());
    const mine = await rel(owner);
    const r = await row(c);
    check('fenced release via RLS', !stale.error && stale.data?.length === 0 && mine.data?.length === 1 && r.status === 'error' && r.parsed_text === null,
      `stale=${stale.data?.length} owner=${mine.data?.length} status=${r.status}`);
  }

  // 8. M2-D2 app compatibility while the migration is live and old code deployed:
  //    direct status writes and the 5-arg legacy save still work.
  {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const w = await u.client.from('candidate_cvs').update({ status: 'analyzing', error_message: null }).eq('id', c);
    const { error } = await svc.rpc('save_candidate_analysis', {
      p_user_id: u.id, p_candidate_id: c, p_analysis_result: { matchScore: 55 }, p_match_score: 55, p_status: 'done',
    });
    const r = await row(c);
    check('legacy app path unchanged', !w.error && !error && r.status === 'done' && r.match_score === 55, `write=${w.error?.message ?? 'ok'} save=${error?.message ?? 'ok'}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
