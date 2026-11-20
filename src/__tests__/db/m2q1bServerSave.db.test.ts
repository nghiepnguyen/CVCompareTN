// M2-Q Phase 1B against a REAL local Supabase stack (Postgres + PostgREST +
// GoTrue): the real handleAnalyze, quota RPCs, claim and fenced save; only the
// Gemini client is mocked. Skipped unless M2Q_LOCAL_DB=1 and SUPABASE_URL is a
// local address (never runs in CI or against production).
//   M2Q_LOCAL_DB=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx vitest run src/__tests__/db/m2q1bServerSave.db.test.ts
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

describe.skipIf(!enabled)('M2-Q 1B server-side save on a real database', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;
  let saveForUser: typeof import('../../../_server-lib/recruiter/saveAnalysis').saveCandidateAnalysisForUser;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    ({ saveCandidateAnalysisForUser: saveForUser } = await import('../../../_server-lib/recruiter/saveAnalysis'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  async function newRecruiter(): Promise<User> {
    const email = `m2q1b-${randomUUID()}@example.test`;
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

  it('happy path: saved by the server once, charged once; a lost-response browser save is a replay', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const res = await analyze(u, { idempotencyKey: attempt, candidateId: c.id });
    expect(res).toMatchObject({ status: 200, body: { serverSave: 'saved', matchScore: 70 } });
    const done = await row(c.id);
    expect(done).toMatchObject({ status: 'done', analysis_attempt_id: attempt, match_score: 70 });
    expect(done.analysis_result).not.toHaveProperty('serverSave');
    expect(await analyzedCount(c.campaign)).toBe(1);
    expect((await ledger(u.id)).map((r) => r.state)).toEqual(['committed']);
    expect(await usage(u.id)).toBe(1);

    // The browser never saw the response and saves under the same attempt.
    const { serverSave: _s, ...result } = res.body;
    const replay = await saveForUser(u.id, { candidateId: c.id, analysisResult: result, matchScore: 70, attemptId: attempt });
    expect(replay.status).toBe(200);
    expect((await row(c.id)).analyzed_at).toBe(done.analyzed_at);
    expect(await analyzedCount(c.campaign)).toBe(1);
    expect(await usage(u.id)).toBe(1);
  });

  it('two parallel requests with one key: one Gemini call, one save, one charge; the other is 409', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const { attempt } = await claim(u, c.id);
    const out = await Promise.all([1, 2].map(() => analyze(u, { idempotencyKey: attempt, candidateId: c.id })));
    expect(out.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect((await ledger(u.id))).toHaveLength(1);
    expect(await usage(u.id)).toBe(1);
    expect(await analyzedCount(c.campaign)).toBe(1);
  });

  it('a stale attempt (row taken over) is refused before quota and Gemini', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const a = await claim(u, c.id);
    await expireAttempt(u, c.id, a.attempt);
    const b = await claim(u, c.id);
    expect(b.result.result).toBe('claimed');
    const res = await analyze(u, { idempotencyKey: a.attempt, candidateId: c.id });
    expect(res).toMatchObject({ status: 409, body: { code: 'not_owner' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(await ledger(u.id)).toHaveLength(0);
    expect(await row(c.id)).toMatchObject({ status: 'analyzing', analysis_attempt_id: b.attempt });
  });

  it('while the request is running, another tab cannot take the row (live reservation = active)', async () => {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const a = await claim(u, c.id);
    let during: Row | undefined;
    generateContent.mockReset().mockImplementation(async () => {
      await svc.from('candidate_cvs').update({ analysis_started_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq('id', c.id);
      during = (await claim(u, c.id, randomUUID(), true)).result;
      return reply(70);
    });
    const res = await analyze(u, { idempotencyKey: a.attempt, candidateId: c.id });
    expect(during?.result).toBe('active');
    expect(res.body.serverSave).toBe('saved');
  });

  it.each([['not_owner', false], ['superseded', true]])(
    'takeover between Gemini and save → %s; the newer attempt is never overwritten', async (expected, newerSaved) => {
      const u = await newRecruiter();
      const c = await newCandidate(u);
      const a = await claim(u, c.id);
      let b = '';
      generateContent.mockReset().mockImplementation(async () => {
        await expireAttempt(u, c.id, a.attempt);
        b = (await claim(u, c.id, randomUUID(), true)).attempt;
        if (newerSaved) await saveForUser(u.id, { candidateId: c.id, analysisResult: { matchScore: 90 }, matchScore: 90, attemptId: b });
        return reply(70);
      });
      const res = await analyze(u, { idempotencyKey: a.attempt, candidateId: c.id });
      expect(res).toMatchObject({ status: 200, body: { serverSave: expected } });
      expect(await row(c.id)).toMatchObject(newerSaved
        ? { status: 'done', analysis_attempt_id: b, match_score: 90 }
        : { status: 'analyzing', analysis_attempt_id: b, match_score: null });
    });

  it('commit not settled (reservation refunded mid-flight): 503, no save, row still owned and analyzing', async () => {
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const a = await claim(u, c.id);
    generateContent.mockReset().mockImplementation(async () => {
      const [r] = await ledger(u.id);
      await svc.rpc('release_analytics_quota', { p_user_id: u.id, p_reservation_id: r.id, p_outcome: 'pre_gemini' });
      return reply(70);
    });
    const res = await analyze(u, { idempotencyKey: a.attempt, candidateId: c.id });
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unavailable' } });
    expect(await row(c.id)).toMatchObject({ status: 'analyzing', analysis_attempt_id: a.attempt, analysis_result: null });
    expect(await usage(u.id)).toBe(0);
  });

  it('another user cannot run or save against this candidate', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const owner = await newRecruiter();
    const intruder = await newRecruiter();
    const c = await newCandidate(owner);
    const a = await claim(owner, c.id);
    const res = await analyze(intruder, { idempotencyKey: a.attempt, candidateId: c.id });
    expect(res).toMatchObject({ status: 409, body: { code: 'not_owner' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(await ledger(intruder.id)).toHaveLength(0);
    expect(await row(c.id)).toMatchObject({ status: 'analyzing', analysis_attempt_id: a.attempt });
  });

  it('a personal request (no candidateId) never writes a candidate row', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const u = await newRecruiter();
    const c = await newCandidate(u);
    const a = await claim(u, c.id);
    const res = await analyze(u, { idempotencyKey: a.attempt });
    expect(res.status).toBe(200);
    // M3-A: models a stale recruiter tab (pre-#88 bundle, no candidateId): the
    // server treats it as personal and saves to the user's history, never the
    // candidate row. Known debt R11 (M3-A phase 1 report).
    expect(res.body).toMatchObject({ serverSave: 'saved', id: a.attempt });
    expect(await row(c.id)).toMatchObject({ status: 'analyzing', analysis_result: null });
  });
});
