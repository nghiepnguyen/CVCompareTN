// M2-Q Phase 2A: the browser's release racing the server's fenced save, on a
// REAL local Supabase stack (Postgres + PostgREST + GoTrue). Real handleAnalyze,
// quota and claim RPCs and the exact browser release UPDATE; only Gemini is
// mocked, gated on a promise so every interleaving is deterministic. Skipped
// unless M2Q_LOCAL_DB=1 and SUPABASE_URL is local (never CI, never production).
//   M2Q_LOCAL_DB=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx vitest run src/__tests__/db/m2q2aTimeoutRace.db.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
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

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

type Row = Record<string, unknown>;
type User = { id: string; token: string; client: SupabaseClient };
const reply = (score: number) => ({ text: JSON.stringify({ matchScore: score }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);

// Gemini held until open(); started resolves once the call is in flight
// (the reservation exists by then).
function gatedGemini(score = 70) {
  let open!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const inFlight = new Promise<void>((r) => { started = r; });
  generateContent.mockReset().mockImplementation(async () => { started(); await gate; return reply(score); });
  return { open, inFlight };
}

describe.skipIf(!enabled)('M2-Q 2A browser release vs server save, real database', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  async function newRecruiter(): Promise<User> {
    const email = `m2q2a-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    const id = data.user.id;
    const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
    const { error: pErr } = await svc.from('profiles').upsert({
      id, email, role: 'user', plan: 'recruiter', has_permission: true, quota_reset_day: 1, usage_count: 0,
      usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: 100,
    });
    if (pErr) throw new Error(`profile: ${pErr.message}`);
    const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr || !s.session) throw new Error(`signIn: ${sErr?.message}`);
    return { id, token: s.session.access_token, client };
  }
  async function newCandidate(u: User): Promise<{ id: string; campaign: string }> {
    const { data: k, error: kErr } = await u.client.from('recruitment_campaigns')
      .insert({ user_id: u.id, title: 't', jd_title: 't', jd_content: 'jd' }).select('id').single();
    if (kErr) throw new Error(`campaign: ${kErr.message}`);
    const { data: c, error: cErr } = await u.client.from('candidate_cvs')
      .insert({ campaign_id: (k as Row).id, candidate_name: 'c', file_name: 'c.txt', file_path: `${u.id}/campaigns/x/${randomUUID()}.txt`, file_size: 1 })
      .select('id').single();
    if (cErr) throw new Error(`candidate: ${cErr.message}`);
    return { id: (c as Row).id as string, campaign: (k as Row).id as string };
  }
  const claim = async (u: User, candidate: string, attempt = randomUUID(), confirm = false) => {
    const { data, error } = await u.client.rpc('claim_candidate_analysis', { p_candidate_id: candidate, p_attempt_id: attempt, p_confirm_charge: confirm });
    if (error) throw new Error(`claim: ${error.message}`);
    return { attempt, result: data as Row };
  };
  const row = async (id: string) => (await svc.from('candidate_cvs').select('*').eq('id', id).single()).data as Row;
  const ledger = async (u: string) => ((await svc.from('analytics_quota_reservations').select('*').eq('user_id', u)).data ?? []) as Row[];
  const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count;
  const analyzedCount = async (k: string) => ((await svc.from('recruitment_campaigns').select('analyzed_count').eq('id', k).single()).data as Row).analyzed_count;
  const analyze = (u: User, body: Row) => handleAnalyze(`Bearer ${u.token}`, { jd: 'Need SQL analytics', cvData: CV, language: 'en', ...body });
  // Lease over and reservation TTL over: the only way another attempt can take the row.
  const expireAttempt = async (u: User, candidate: string, attempt: string) => {
    await svc.from('candidate_cvs').update({ analysis_started_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq('id', candidate);
    await svc.from('analytics_quota_reservations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('user_id', u.id).eq('request_key', attempt);
  };

  // Exactly what the browser runs on a failed request (recruiterService.releaseCandidateAnalysis).
  const browserRelease = async (u: User, candidate: string, attempt: string) => {
    const { data, error } = await u.client.from('candidate_cvs')
      .update({ status: 'error', error_message: 'timeout' })
      .eq('id', candidate).eq('analysis_attempt_id', attempt).eq('status', 'analyzing').select('id');
    if (error) throw new Error(`release: ${error.message}`);
    return (data ?? []).length > 0;
  };

  it('REPRO: release after the ownership gate, before the save: paid result lost, re-run needs confirmation', async () => {
    const g = gatedGemini();
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c.id });
    await g.inFlight; // gate passed, quota reserved, Gemini running
    expect(await browserRelease(u, c.id, attempt)).toBe(true); // client gave up (75 s timeout / network)
    g.open();
    const res = await pending;
    expect(res).toMatchObject({ status: 200, body: { serverSave: 'not_owner', matchScore: 70 } });
    expect(await row(c.id)).toMatchObject({ status: 'error', analysis_attempt_id: attempt, analysis_result: null });
    expect((await ledger(u.id)).map((r) => [r.state, r.charged])).toEqual([['committed', true]]);
    expect(await usage(u.id)).toBe(1);
    // The paid result is gone; the next run must ask before charging again.
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'needs_confirm', reason: 'paid_result_lost' });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('REPRO: re-clicking while the server still runs cannot take the row back (claim is active) and the save is still lost', async () => {
    const g = gatedGemini();
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c.id });
    await g.inFlight;
    await browserRelease(u, c.id, attempt);
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'active' }); // live reservation
    g.open();
    expect((await pending).body).toMatchObject({ serverSave: 'not_owner' });
    expect((await row(c.id)).status).toBe('error');
  });

  it('FIX: no release after dispatch: the server save lands, one charge, second tab sees active', async () => {
    const g = gatedGemini();
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c.id });
    await g.inFlight;
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'active' });
    g.open();
    expect(await pending).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect(await row(c.id)).toMatchObject({ status: 'done', analysis_attempt_id: attempt, match_score: 70 });
    expect((await ledger(u.id)).map((r) => [r.state, r.charged])).toEqual([['committed', true]]);
    expect(await usage(u.id)).toBe(1);
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'done' });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('window start: a release before the ownership gate is refused before quota (409, no reservation)', async () => {
    gatedGemini().open();
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    await browserRelease(u, c.id, attempt);
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c.id })).toMatchObject({ status: 409, body: { code: 'not_owner' } });
    expect(await ledger(u.id)).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('window end: a release after the server save changes nothing (returns false, row stays done)', async () => {
    gatedGemini().open();
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    expect((await analyze(u, { idempotencyKey: attempt, candidateId: c.id })).body).toMatchObject({ serverSave: 'saved' });
    expect(await browserRelease(u, c.id, attempt)).toBe(false);
    expect((await row(c.id)).status).toBe('done');
  });

  it('FIX cost: a request that never reached the server stays analyzing until the lease ends, then re-claims free', async () => {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    // No /api/analyze call ever arrived and the browser no longer releases.
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'active' });
    await svc.from('candidate_cvs').update({ analysis_started_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq('id', c.id);
    const again = await claim(u, c.id);
    expect(again.result).toMatchObject({ result: 'claimed' }); // no ledger row = never charged, no confirmation
    expect(again.attempt).not.toBe(attempt);
    expect(await ledger(u.id)).toEqual([]);
  });

  it('FIX recovery: server ran but its outcome is unknown (reservation expired unsettled): re-run asks first', async () => {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const { data: r } = await svc.rpc('reserve_analytics_quota', { p_user_id: u.id, p_request_key: attempt });
    expect((r as Row).status).toBe('reserved');
    await expireAttempt(u, c.id, attempt);
    expect((await claim(u, c.id)).result).toMatchObject({ result: 'needs_confirm', reason: 'outcome_unknown' });
  });
});
