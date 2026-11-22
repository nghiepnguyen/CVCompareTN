// M3-B R0 — SIMULATED production schema drift: history.match_score as INTEGER
// (comment in supabase/migrations/20261101140000_align_profiles_constraints.sql).
// The production column type is UNVERIFIED; this suite proves R0 also works
// if production is integer. It must run LAST on a disposable stack, after
//   ALTER TABLE public.history ALTER COLUMN match_score TYPE integer USING round(match_score)::integer;
// (scripts/ci/db-tests.sh step 5 does this). Skipped unless M3B_R0_DRIFT=1.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const enabled = process.env.M3B_R0_DRIFT === '1' && process.env.M2Q_LOCAL_DB === '1' && ['127.0.0.1', 'localhost'].includes(host)
  && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const reply = (score: string) => ({ text: `{"jobTitle":"Data Analyst","matchScore":${score},"detailedComparison":{"skills":[],"experience":[],"tools":[],"education":[],"keywords":[]}}`, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });

describe.skipIf(!enabled)('M3-B R0 with history.match_score INTEGER (simulated drift)', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('the column really is integer in this run', async () => {
    const { data, error } = await svc.from('history').insert({ user_id: (await svc.auth.admin.createUser({ email: `d-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true })).data.user!.id, analysis_id: randomUUID(), timestamp: new Date().toISOString(), match_score: 82.5 }).select('id');
    expect(error?.code).toBe('22P02'); // fractional values are rejected by an integer column
    expect(data).toBeNull();
  });

  it.each([['82.5', 83], ['59.5', 60], ['79.49', 79]])('fractional %s is saved as %j (was: charged, no row)', async (raw, score) => {
    const email = `m3b-drift-${randomUUID()}@example.test`; const password = randomUUID();
    const { data } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    const id = data.user!.id;
    const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
    await svc.from('profiles').upsert({ id, email, role: 'user', plan: 'pro', has_permission: true, quota_reset_day: 1, usage_count: 0, usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: 100 });
    const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: s } = await client.auth.signInWithPassword({ email, password });
    generateContent.mockReset().mockResolvedValue(reply(raw));
    const key = randomUUID();
    const res = await handleAnalyze(`Bearer ${s.session!.access_token}`, { jd: 'Need SQL', cvData: CV, language: 'en', idempotencyKey: key });
    expect(res).toMatchObject({ status: 200, body: { matchScore: score, serverSave: 'saved' } });
    const { data: row } = await svc.from('history').select('match_score').eq('user_id', id).eq('analysis_id', key).single();
    expect(row).toEqual({ match_score: score });
  });
});
