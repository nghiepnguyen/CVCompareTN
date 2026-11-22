// M3-B R0 against a REAL local Supabase stack built from the COMMITTED schema
// (history.match_score numeric): real handleAnalyze, quota ledger, hourly AI
// slot, M3-A history save, recruiter atomic settlement and fenced transitions.
// Only Gemini is mocked. Replaces the A1.1 R3/R4 characterization with the R0
// contract. Simulated production drift (integer column) is a separate suite:
// src/__tests__/schemaDrift/m3bR0IntegerDrift.db.test.ts.
//   M2Q_LOCAL_DB=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx vitest run src/__tests__/db/m3bR0ScoreIntegrity.db.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const enabled = process.env.M2Q_LOCAL_DB === '1' && ['127.0.0.1', 'localhost'].includes(host)
  && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
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
const CV = 'Data analyst with SQL experience at Acme since 2020. Built Tableau dashboards. '.repeat(2);
const USAGE = { promptTokenCount: 3829, candidatesTokenCount: 1500, thoughtsTokenCount: 275 };
const body = (score: string) => `{"jobTitle":"Data Analyst","matchScore":${score},"detailedComparison":{"skills":[{"requirement":"SQL","status":"matched","cvEvidence":"SQL experience at Acme","priority":"required"}],"experience":[],"tools":[],"education":[],"keywords":[]}}`;
const reply = (score: string) => ({ text: score === 'MISSING' ? body('0').replace('"matchScore":0,', '') : body(score), usageMetadata: USAGE });

describe.skipIf(!enabled)('M3-B R0 score integrity on a real database (committed schema)', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;
  let saveCandidateAnalysisForUser: typeof import('../../../_server-lib/recruiter/saveAnalysis').saveCandidateAnalysisForUser;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    ({ saveCandidateAnalysisForUser } = await import('../../../_server-lib/recruiter/saveAnalysis'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  async function newUser(plan: 'pro' | 'recruiter' = 'pro'): Promise<User> {
    const email = `m3b-r0-${randomUUID()}@example.test`; const password = randomUUID();
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    const id = data.user.id;
    const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
    const { error: pErr } = await svc.from('profiles').upsert({
      id, email, role: 'user', plan, has_permission: true, quota_reset_day: 1, usage_count: 0,
      usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: 100,
    });
    if (pErr) throw new Error(`profile: ${pErr.message}`);
    const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr || !s.session) throw new Error(`signIn: ${sErr?.message}`);
    return { id, token: s.session.access_token, client };
  }
  async function newCandidate(u: User) {
    const { data: k, error: kErr } = await u.client.from('recruitment_campaigns').insert({ user_id: u.id, title: 't', jd_title: 't', jd_content: 'jd' }).select('id').single();
    if (kErr) throw new Error(`campaign: ${kErr.message}`);
    const { data: c, error } = await u.client.from('candidate_cvs')
      .insert({ campaign_id: (k as Row).id, candidate_name: 'c', file_name: 'c.txt', file_path: `${u.id}/campaigns/x/${randomUUID()}.txt`, file_size: 1 }).select('id').single();
    if (error) throw new Error(`candidate: ${error.message}`);
    return (c as Row).id as string;
  }
  const claim = async (u: User, candidate: string, attempt = randomUUID()) => {
    let { data, error } = await u.client.rpc('claim_candidate_analysis', { p_candidate_id: candidate, p_attempt_id: attempt, p_confirm_charge: false });
    if (!error && (data as Row)?.result === 'needs_confirm') ({ data, error } = await u.client.rpc('claim_candidate_analysis', { p_candidate_id: candidate, p_attempt_id: attempt, p_confirm_charge: true }));
    if (error) throw new Error(`claim: ${error.message}`);
    return attempt;
  };
  const ledger = async (u: string) => ((await svc.from('analytics_quota_reservations').select('request_key, state, charged, outcome').eq('user_id', u)).data ?? []) as Row[];
  const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count;
  const history = async (u: string, key: string) => ((await svc.from('history').select('match_score, pass_probability, score_version').eq('user_id', u).eq('analysis_id', key)).data ?? []) as Row[];
  const candidate = async (id: string) => (await svc.from('candidate_cvs').select('status, match_score, analysis_attempt_id, error_message, analysis_result').eq('id', id).single()).data as Row;
  const lastLog = async (u: string) => ((await svc.from('analysis_log').select('status, error_message, input_tokens, output_tokens, model').eq('user_id', u).order('created_at', { ascending: false }).limit(1)).data ?? [])[0] as Row;
  const aiSlots = async (u: string) => ((await svc.from('api_rate_limits').select('hits').eq('subject', `u:${u}`).eq('bucket', 'ai_analyze')).data ?? []).reduce((s, r) => s + Number((r as Row).hits), 0);
  const analyze = (u: User, b: Row) => handleAnalyze(`Bearer ${u.token}`, { jd: 'Data Analyst. Requirements: SQL.', cvData: CV, language: 'en', ...b });

  it.each(['null', 'MISSING', '"abc"', '"70"', '-5', '150', '100.4', '1e309'])('personal invalid %s: 502, refunded, no row, tokens logged, slot consumed', async (score) => {
    generateContent.mockReset().mockResolvedValue(reply(score));
    const u = await newUser();
    const key = randomUUID();
    const res = await analyze(u, { idempotencyKey: key });
    expect(res).toMatchObject({ status: 502, body: { code: 'invalid_ai_output', quotaReleased: true } });
    expect(await ledger(u.id)).toEqual([{ request_key: key, state: 'refunded', charged: false, outcome: 'provider_error' }]);
    expect(await usage(u.id)).toBe(0);
    expect(await history(u.id, key)).toHaveLength(0);
    expect(await lastLog(u.id)).toMatchObject({ status: 'error', input_tokens: 3829, output_tokens: 1775, model: 'gemini-3-flash-preview' });
    expect(String((await lastLog(u.id)).error_message)).toMatch(/^\[invalid_ai_output:\w+:release_refunded\]$/);
    expect(await aiSlots(u.id)).toBe(1);
  });

  it('malformed JSON: 502, refunded (no longer uncertain/forgiven)', async () => {
    generateContent.mockReset().mockResolvedValue({ text: 'not json', usageMetadata: USAGE });
    const u = await newUser();
    const key = randomUUID();
    expect((await analyze(u, { idempotencyKey: key })).status).toBe(502);
    expect(await ledger(u.id)).toEqual([{ request_key: key, state: 'refunded', charged: false, outcome: 'provider_error' }]);
  });

  it('duplicate submission with the same key after a refund: 409 state refunded, no Gemini call, no second release', async () => {
    generateContent.mockReset().mockResolvedValue(reply('null'));
    const u = await newUser();
    const key = randomUUID();
    await analyze(u, { idempotencyKey: key });
    generateContent.mockClear();
    const again = await analyze(u, { idempotencyKey: key });
    expect(again).toMatchObject({ status: 409, body: { code: 'duplicate_request', state: 'refunded' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(await ledger(u.id)).toHaveLength(1);
    expect(await usage(u.id)).toBe(0);
  });

  it('concurrent requests with the same key: one Gemini call, one 502, one 409', async () => {
    generateContent.mockReset().mockImplementation(async () => { await new Promise((r) => setTimeout(r, 150)); return reply('-1'); });
    const u = await newUser();
    const key = randomUUID();
    const res = await Promise.all([analyze(u, { idempotencyKey: key }), analyze(u, { idempotencyKey: key })]);
    expect(res.map((r) => r.status).sort()).toEqual([409, 502]);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect((await ledger(u.id)).map((r) => r.state)).toEqual(['refunded']);
  });

  it.each([[0, 0, 'Low'], [59, 59, 'Low'], [59.5, 60, 'Medium'], [60, 60, 'Medium'], [79, 79, 'Medium'], [79.5, 80, 'High'], [80, 80, 'High'], [100, 100, 'High'], [82.5, 83, 'High']])(
    'personal valid %j → %j/%s identical in API body, stored row and owner reload; charged once', async (raw, score, band) => {
      generateContent.mockReset().mockResolvedValue(reply(String(raw)));
      const u = await newUser();
      const key = randomUUID();
      const res = await analyze(u, { idempotencyKey: key });
      expect(res).toMatchObject({ status: 200, body: { matchScore: score, passProbability: band, scoreVersion: 'canonical-en-v2', serverSave: 'saved' } });
      expect(await history(u.id, key)).toEqual([{ match_score: score, pass_probability: band, score_version: 'canonical-en-v2' }]);
      const { data: own } = await u.client.from('history').select('match_score, pass_probability').eq('analysis_id', key).single();
      expect(own).toEqual({ match_score: score, pass_probability: band });
      expect((await ledger(u.id)).map((r) => [r.state, r.charged])).toEqual([['committed', true]]);
    });

  it('legacy history rows are never rewritten by new analyses', async () => {
    const u = await newUser();
    const legacy = [
      { user_id: u.id, analysis_id: randomUUID(), timestamp: new Date().toISOString(), match_score: 82.5, pass_probability: 'High' },
      { user_id: u.id, analysis_id: randomUUID(), timestamp: new Date().toISOString(), match_score: null, pass_probability: 'Low', score_version: 'canonical-en-v1' },
    ];
    expect((await svc.from('history').insert(legacy)).error).toBeNull();
    generateContent.mockReset().mockResolvedValue(reply('59.5'));
    await analyze(u, { idempotencyKey: randomUUID() });
    for (const l of legacy) {
      const { data } = await svc.from('history').select('match_score, pass_probability, score_version').eq('analysis_id', l.analysis_id).single();
      expect(data).toEqual({ match_score: l.match_score, pass_probability: l.pass_probability, score_version: l.score_version ?? null });
    }
  });

  it('recruiter invalid: current owner → candidate error (fenced), refunded, no save', async () => {
    generateContent.mockReset().mockResolvedValue(reply('150'));
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    const res = await analyze(u, { idempotencyKey: attempt, candidateId: c });
    expect(res).toMatchObject({ status: 502, body: { code: 'invalid_ai_output', quotaReleased: true } });
    expect(await candidate(c)).toMatchObject({ status: 'error', analysis_attempt_id: attempt, match_score: null, analysis_result: null });
    expect((await ledger(u.id)).map((r) => r.state)).toEqual(['refunded']);
    expect(await usage(u.id)).toBe(0);
  });

  it('recruiter invalid while a newer attempt took over: fence rejects, the newer attempt is untouched', async () => {
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    const newer = randomUUID();
    generateContent.mockReset().mockImplementation(async () => {
      await svc.from('candidate_cvs').update({ analysis_attempt_id: newer, analysis_started_at: new Date().toISOString() }).eq('id', c);
      return reply('null');
    });
    expect((await analyze(u, { idempotencyKey: attempt, candidateId: c })).status).toBe(502);
    expect(await candidate(c)).toMatchObject({ status: 'analyzing', analysis_attempt_id: newer });
  });

  it('recruiter invalid after the row was completed elsewhere: a done result is never overwritten', async () => {
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    generateContent.mockReset().mockImplementation(async () => {
      await svc.from('candidate_cvs').update({ status: 'done', match_score: 77, analysis_result: { matchScore: 77 } }).eq('id', c);
      return reply('null');
    });
    expect((await analyze(u, { idempotencyKey: attempt, candidateId: c })).status).toBe(502);
    expect(await candidate(c)).toMatchObject({ status: 'done', match_score: 77 });
  });

  it('M2-D3 stale recovery still works if the failure fence never ran (browser gone, DB write lost)', async () => {
    generateContent.mockReset().mockResolvedValue(reply('null'));
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    await analyze(u, { idempotencyKey: attempt, candidateId: c });
    // Simulate a lost failure transition: row back to analyzing, lease long expired.
    await svc.from('candidate_cvs').update({ status: 'analyzing', analysis_started_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('id', c);
    const next = randomUUID();
    const { data, error } = await u.client.rpc('claim_candidate_analysis', { p_candidate_id: c, p_attempt_id: next, p_confirm_charge: false });
    expect(error).toBeNull();
    // The prior attempt's reservation is refunded: reclaim without a charge confirmation.
    expect((data as Row).result).toBe('claimed');
    expect(await candidate(c)).toMatchObject({ status: 'analyzing', analysis_attempt_id: next });
  });

  it('recruiter duplicate request after a failed attempt: 409, no Gemini call, row stays error', async () => {
    generateContent.mockReset().mockResolvedValue(reply('null'));
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    await analyze(u, { idempotencyKey: attempt, candidateId: c });
    generateContent.mockClear();
    const again = await analyze(u, { idempotencyKey: attempt, candidateId: c });
    expect(again.status).toBe(409);
    expect(generateContent).not.toHaveBeenCalled();
    expect((await candidate(c)).status).toBe('error');
  });

  it('recruiter batch with mixed valid and invalid results; retry of the failed one succeeds with a new attempt', async () => {
    const u = await newUser('recruiter');
    const good = await newCandidate(u);
    const bad = await newCandidate(u);
    const aGood = await claim(u, good);
    const aBad = await claim(u, bad);
    generateContent.mockReset().mockResolvedValueOnce(reply('72.5')).mockResolvedValueOnce(reply('"n/a"'));
    const [rg, rb] = [await analyze(u, { idempotencyKey: aGood, candidateId: good }), await analyze(u, { idempotencyKey: aBad, candidateId: bad })];
    expect([rg.status, rg.body.serverSave, rb.status]).toEqual([200, 'saved', 502]);
    expect(await candidate(good)).toMatchObject({ status: 'done', match_score: 73 });
    expect(((await candidate(good)).analysis_result as Row).matchScore).toBe(73);
    expect(await candidate(bad)).toMatchObject({ status: 'error' });
    const retry = await claim(u, bad);
    generateContent.mockReset().mockResolvedValue(reply('64'));
    expect((await analyze(u, { idempotencyKey: retry, candidateId: bad })).status).toBe(200);
    expect(await candidate(bad)).toMatchObject({ status: 'done', match_score: 64, analysis_attempt_id: retry });
    expect((await ledger(u.id)).map((r) => r.state).sort()).toEqual(['committed', 'committed', 'refunded']);
    expect(await usage(u.id)).toBe(2);
  });

  it('recruiter browser fallback save refuses invalid scores (no 0) and stores the same integer for valid ones', async () => {
    const u = await newUser('recruiter');
    const c = await newCandidate(u);
    const attempt = await claim(u, c);
    for (const bad of [null, undefined, 'abc', -1, 101, Number.NaN]) {
      const r = await saveCandidateAnalysisForUser(u.id, { candidateId: c, attemptId: attempt, analysisResult: { matchScore: bad }, matchScore: bad });
      expect(r).toMatchObject({ status: 400, body: { code: 'invalid_match_score' } });
    }
    expect((await candidate(c)).status).toBe('analyzing');
    expect(await saveCandidateAnalysisForUser(u.id, { candidateId: c, attemptId: attempt, analysisResult: { matchScore: 79.5 }, matchScore: 79.5 })).toMatchObject({ status: 200 });
    expect((await candidate(c)).match_score).toBe(80);
  });
});
