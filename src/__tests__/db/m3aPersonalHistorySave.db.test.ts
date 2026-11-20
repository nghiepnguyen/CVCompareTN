// M3-A Phase 1 against a REAL local Supabase stack (Postgres + PostgREST +
// GoTrue): the real handleAnalyze, quota RPCs, history grants, RLS and the
// account-lock trigger; only the Gemini client is mocked. Skipped unless
// M2Q_LOCAL_DB=1 and SUPABASE_URL is a local address (never against production).
//   M2Q_LOCAL_DB=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx vitest run src/__tests__/db/m3aPersonalHistorySave.db.test.ts
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
const reply = (score: number) => ({ text: JSON.stringify({ matchScore: score }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);

describe.skipIf(!enabled)('M3-A personal server history save on a real database', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  async function newUser(): Promise<User> {
    const email = `m3a-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    const id = data.user.id;
    const { data: cycle } = await svc.rpc('current_quota_cycle', { p_reset_day: 1 });
    const { error: pErr } = await svc.from('profiles').upsert({
      id, email, role: 'user', plan: 'pro', has_permission: true, quota_reset_day: 1, usage_count: 0,
      usage_month: cycle, monthly_analytics_limit_custom: true, monthly_analytics_limit: 100,
    });
    if (pErr) throw new Error(`profile: ${pErr.message}`);
    const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr || !s.session) throw new Error(`signIn: ${sErr?.message}`);
    return { id, token: s.session.access_token, client };
  }
  const analyze = (u: User, body: Row) => handleAnalyze(`Bearer ${u.token}`, { jd: 'Need SQL analytics', cvData: CV, language: 'en', ...body });
  const historyRows = async (u: string, key: string) =>
    ((await svc.from('history').select('*').eq('user_id', u).eq('analysis_id', key)).data ?? []) as Row[];
  const ledger = async (u: string) => ((await svc.from('analytics_quota_reservations').select('*').eq('user_id', u)).data ?? []) as Row[];
  const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count;

  it('commit then save: one history row under the key, charged once, readable by its owner', async () => {
    generateContent.mockReset().mockResolvedValue(reply(70));
    const a = await newUser();
    const key = randomUUID();
    const res = await analyze(a, { idempotencyKey: key });
    expect(res).toMatchObject({ status: 200, body: { id: key, serverSave: 'saved', matchScore: 70 } });
    const rows = await historyRows(a.id, key);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: a.id, analysis_id: key, match_score: 70 });
    expect((await ledger(a.id)).map((r) => [r.request_key, r.state])).toEqual([[key, 'committed']]);
    expect(await usage(a.id)).toBe(1);

    // Lost response: the browser finds it by key through its own RLS session.
    const { data: own } = await a.client.from('history').select('analysis_id').eq('analysis_id', key).maybeSingle();
    expect(own).toMatchObject({ analysis_id: key });
  });

  it('browser replay upsert of the same analysis updates, never duplicates', async () => {
    generateContent.mockReset().mockResolvedValue(reply(71));
    const a = await newUser();
    const key = randomUUID();
    const res = await analyze(a, { idempotencyKey: key });
    const { toHistoryRow } = await import('../../lib/historyRow');
    const { serverSave: _s, ...result } = res.body;
    const { error } = await a.client.from('history')
      .upsert(toHistoryRow(a.id, result as never), { onConflict: 'user_id,analysis_id' });
    expect(error).toBeNull();
    expect(await historyRows(a.id, key)).toHaveLength(1);
  });

  it('same key resent: 409 before Gemini, row and charge unchanged', async () => {
    generateContent.mockReset().mockResolvedValue(reply(72));
    const a = await newUser();
    const key = randomUUID();
    await analyze(a, { idempotencyKey: key });
    generateContent.mockClear();
    const again = await analyze(a, { idempotencyKey: key });
    expect(again).toMatchObject({ status: 409, body: { code: 'duplicate_request', state: 'committed' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(await historyRows(a.id, key)).toHaveLength(1);
    expect(await usage(a.id)).toBe(1);
  });

  it('cross-user: the same key for another user is a separate row; neither can read or overwrite the other', async () => {
    const a = await newUser();
    const b = await newUser();
    const key = randomUUID();
    generateContent.mockReset().mockResolvedValue(reply(60));
    await analyze(a, { idempotencyKey: key });
    generateContent.mockResolvedValue(reply(90));
    const resB = await analyze(b, { idempotencyKey: key });
    expect(resB).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect((await historyRows(a.id, key))[0]).toMatchObject({ user_id: a.id, match_score: 60 });
    expect((await historyRows(b.id, key))[0]).toMatchObject({ user_id: b.id, match_score: 90 });

    const { data: seen } = await b.client.from('history').select('user_id').eq('analysis_id', key);
    expect(seen).toEqual([{ user_id: b.id }]);
    // B cannot write a row for A even with A's key (RLS).
    const { error } = await b.client.from('history').upsert({ user_id: a.id, analysis_id: key, match_score: 1 }, { onConflict: 'user_id,analysis_id' });
    expect(error).not.toBeNull();
    expect((await historyRows(a.id, key))[0]).toMatchObject({ match_score: 60 });
  });

  it('locked account: 403 before quota and Gemini, no history row', async () => {
    const a = await newUser();
    await svc.from('profiles').update({ has_permission: false }).eq('id', a.id);
    generateContent.mockReset().mockResolvedValue(reply(50));
    const key = randomUUID();
    const res = await analyze(a, { idempotencyKey: key });
    expect(res.status).toBe(403);
    expect(generateContent).not.toHaveBeenCalled();
    expect(await historyRows(a.id, key)).toHaveLength(0);
    expect(await ledger(a.id)).toHaveLength(0);
  });

  it('service_role holds INSERT/UPDATE on public.history (grant evidence for the release check)', async () => {
    const a = await newUser();
    const key = randomUUID();
    const ins = await svc.from('history').upsert({ user_id: a.id, analysis_id: key, match_score: 1 }, { onConflict: 'user_id,analysis_id' });
    expect(ins.error).toBeNull();
    const upd = await svc.from('history').upsert({ user_id: a.id, analysis_id: key, match_score: 2 }, { onConflict: 'user_id,analysis_id' });
    expect(upd.error).toBeNull();
    expect((await historyRows(a.id, key))[0]).toMatchObject({ match_score: 2 });
  });
});
