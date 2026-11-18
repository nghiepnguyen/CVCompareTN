// M2-Q Phase 2C: atomic recruiter settlement (commit + fenced save in one
// transaction) on a REAL local Supabase stack. Real handleAnalyze and real
// quota / claim / save RPCs; only Gemini is mocked. Faults are injected
// deterministically on the server's admin client (.rpc): a call that lands in
// Postgres but whose answer is lost, a call that never leaves, a call sent with
// arguments Postgres rejects (a real SQLSTATE rollback). A late-landing commit
// is produced with a second Postgres session holding the user's profile row.
// Skipped unless M2Q_LOCAL_DB=1 and SUPABASE_URL is local (CI sets REQUIRE_DB_TESTS=1).
//   . <scratch>/db.env && npx vitest run src/__tests__/db/m2q2cAtomicSettlement.db.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const url = process.env.SUPABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const enabled = process.env.M2Q_LOCAL_DB === '1' && ['127.0.0.1', 'localhost'].includes(host)
  && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.DB_CONTAINER;
if (process.env.REQUIRE_DB_TESTS === '1' && !enabled) {
  throw new Error('REQUIRE_DB_TESTS=1 but no local Supabase stack (M2Q_LOCAL_DB=1, local SUPABASE_URL, both keys, DB_CONTAINER)');
}

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

// lose_response: really runs (and commits) in Postgres, the answer is replaced
// by a transport error. never_sent: rejected before leaving the process.
// sqlstate: really sent with a NULL reservation id → Postgres raises 22023.
type Fault = 'pass' | 'lose_response' | 'never_sent' | 'sqlstate';
const faults: Record<string, Fault[]> = {};
const calls: { name: string; fault: Fault }[] = [];
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', async (orig) => {
  const real = await orig<typeof import('../../../_server-lib/payment/supabaseAdmin')>();
  let wrapped: SupabaseClient | null = null;
  return {
    ...real,
    getSupabaseAdmin: () => {
      if (wrapped) return wrapped;
      const c = real.getSupabaseAdmin();
      wrapped = new Proxy(c, {
        get(target, prop, recv) {
          if (prop !== 'rpc') return Reflect.get(target, prop, recv);
          return (name: string, args: Record<string, unknown>) => {
            const fault = faults[name]?.shift() ?? 'pass';
            calls.push({ name, fault });
            if (fault === 'pass') return target.rpc(name, args);
            if (fault === 'sqlstate') return target.rpc(name, { ...args, p_reservation_id: null });
            const run = (signal?: AbortSignal) => {
              if (fault === 'never_sent') return Promise.reject(new TypeError('fetch failed (injected: never sent)'));
              const b = target.rpc(name, args);
              return (signal ? b.abortSignal(signal) : b).then(() => { throw new TypeError('fetch failed (injected: response lost)'); });
            };
            return { abortSignal: (s: AbortSignal) => run(s), then: (a: never, b: never) => run().then(a, b) };
          };
        },
      }) as SupabaseClient;
      return wrapped;
    },
  };
});

type Row = Record<string, unknown>;
type User = { id: string; token: string; client: SupabaseClient };
const reply = (score: number) => ({ text: JSON.stringify({ matchScore: score }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const ATOMIC = 'commit_analytics_quota_and_save_candidate';
const UNKNOWN = { status: 503, body: { error: 'Quota settlement outcome unknown', code: 'quota_settlement_unknown', retryable: false } };

function gatedGemini(score = 70) {
  let open!: () => void; let started!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const inFlight = new Promise<void>((r) => { started = r; });
  generateContent.mockReset().mockImplementation(async () => { started(); await gate; return reply(score); });
  return { open, inFlight };
}
const openGemini = (score = 70) => { generateContent.mockReset().mockResolvedValue(reply(score)); };

describe.skipIf(!enabled)('M2-Q 2C atomic recruiter settlement, real database', () => {
  let svc: SupabaseClient;
  let handleAnalyze: typeof import('../../../_server-lib/analyze/handler').handleAnalyze;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = 'test';
    svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    ({ handleAnalyze } = await import('../../../_server-lib/analyze/handler'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  beforeEach(() => { for (const k of Object.keys(faults)) delete faults[k]; calls.length = 0; });

  async function newUser(plan: 'recruiter' | 'free' = 'recruiter'): Promise<User> {
    const email = `m2q2c-${randomUUID()}@example.test`; const password = randomUUID();
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
  const claim = async (u: User, candidate: string, attempt = randomUUID(), confirm = false) => {
    const { data, error } = await u.client.rpc('claim_candidate_analysis', { p_candidate_id: candidate, p_attempt_id: attempt, p_confirm_charge: confirm });
    if (error) throw new Error(`claim: ${error.message}`);
    return { attempt, result: data as Row };
  };
  const row = async (id: string) => (await svc.from('candidate_cvs').select('status, analysis_attempt_id, match_score, analysis_result').eq('id', id).single()).data as Row;
  const ledger = async (u: string) => ((await svc.from('analytics_quota_reservations').select('request_key, state, charged, forgiven, outcome').eq('user_id', u).order('created_at')).data ?? []) as Row[];
  const states = async (u: string) => (await ledger(u)).map((r) => `${r.state}/${r.charged ? 'charged' : 'free'}${r.outcome ? `/${r.outcome}` : ''}`);
  const usage = async (u: string) => ((await svc.from('profiles').select('usage_count').eq('id', u).single()).data as Row).usage_count;
  const analyze = (u: User, body: Row) => handleAnalyze(`Bearer ${u.token}`, { jd: 'Need SQL analytics', cvData: CV, language: 'en', ...body });
  const atomicCalls = () => calls.filter((c) => c.name === ATOMIC).map((c) => c.fault);
  const psql = (sql: string) => new Promise<void>((resolve, reject) => {
    const p = spawn('docker', ['exec', '-i', process.env.DB_CONTAINER!, 'psql', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`psql exit ${code}`))));
  });

  it('1. normal: one atomic call charges once and saves under the attempt', async () => {
    openGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c })).toMatchObject({ status: 200, body: { serverSave: 'saved', matchScore: 70 } });
    expect(atomicCalls()).toEqual(['pass']);
    expect(calls.map((x) => x.name)).not.toContain('commit_analytics_quota');
    expect(calls.map((x) => x.name)).not.toContain('save_candidate_analysis_attempt');
    expect(await states(u.id)).toEqual(['committed/charged']);
    expect(await usage(u.id)).toBe(1);
    expect(await row(c)).toMatchObject({ status: 'done', analysis_attempt_id: attempt, match_score: 70 });
  });

  it('2. commit lands, first response lost: the replay answers from the ledger → 200, one charge', async () => {
    openGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    faults[ATOMIC] = ['lose_response'];
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c })).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect(atomicCalls()).toEqual(['lose_response', 'pass']);
    expect(await states(u.id)).toEqual(['committed/charged']);
    expect(await usage(u.id)).toBe(1);
    expect((await row(c)).status).toBe('done');
  });

  it('3. commit completes AFTER the server gave up: 503 unknown, then charge AND result land together', async () => {
    const g = gatedGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c });
    await g.inFlight;
    // Hold the user's profile row (first lock of every quota RPC) for 12 s: the
    // server's 3 attempts (~9.6 s) all time out; two hit the 8 s statement
    // timeout and roll back, the last is still queued when the server answers.
    const holder = psql(`begin; select 1 from public.profiles where id = '${u.id}' for update; select pg_sleep(12); commit;`);
    // Open Gemini only once the holder really owns the lock (no fixed sleep: slow CI runners).
    for (let i = 0; ; i++) {
      const { count } = await new Promise<{ count: number }>((resolve) => {
        const p = spawn('docker', ['exec', '-i', process.env.DB_CONTAINER!, 'psql', '-U', 'postgres', '-tAX', '-c',
          `select count(*) from pg_stat_activity where state = 'active' and query like '%pg_sleep(12)%' and query not like '%pg_stat_activity%'`]);
        let out = ''; p.stdout.on('data', (d) => { out += d; });
        p.on('exit', () => resolve({ count: Number(out.trim()) || 0 }));
      });
      if (count > 0) break;
      if (i > 100) throw new Error('lock holder never started');
      await new Promise((r) => setTimeout(r, 100));
    }
    g.open();
    const res = await pending;
    expect(res).toEqual(UNKNOWN);
    expect(res.body).not.toHaveProperty('matchScore');
    expect(await states(u.id)).toEqual(['reserved/free']); // a read in the window proves nothing
    await holder;
    await new Promise((r) => setTimeout(r, 1500));
    expect(await states(u.id)).toEqual(['committed/charged']);
    expect(await usage(u.id)).toBe(1);
    expect(await row(c)).toMatchObject({ status: 'done', analysis_attempt_id: attempt, match_score: 70 });
    expect((await claim(u, c)).result).toMatchObject({ result: 'done' }); // no paid_result_lost, no re-run
    expect(generateContent).toHaveBeenCalledTimes(1);
  }, 40_000);

  it('4. confirmed Postgres rollback on every attempt (real SQLSTATE) → 503 unavailable, nothing charged or saved', async () => {
    openGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    faults[ATOMIC] = ['sqlstate', 'sqlstate', 'sqlstate'];
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c })).toEqual({
      status: 503, body: { error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true },
    });
    expect(atomicCalls()).toEqual(['sqlstate', 'sqlstate', 'sqlstate']);
    expect(await states(u.id)).toEqual(['reserved/free']);
    expect(await usage(u.id)).toBe(0);
    expect(await row(c)).toMatchObject({ status: 'analyzing', analysis_result: null });
  });

  it('5a. unknown outcome (commit landed, every answer lost) is NEVER success: 503 unknown, and the result is on the row', async () => {
    openGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    faults[ATOMIC] = ['lose_response', 'never_sent', 'never_sent'];
    const res = await analyze(u, { idempotencyKey: attempt, candidateId: c });
    expect(res).toEqual(UNKNOWN);
    expect(await states(u.id)).toEqual(['committed/charged']);
    expect(await row(c)).toMatchObject({ status: 'done', analysis_attempt_id: attempt });
    expect((await claim(u, c)).result).toMatchObject({ result: 'done' });
  });

  it('5b. unknown outcome where nothing landed: 503 unknown (not "failed"), row kept analyzing, claim active', async () => {
    openGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    faults[ATOMIC] = ['never_sent', 'never_sent', 'never_sent'];
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c })).toEqual(UNKNOWN);
    expect(await states(u.id)).toEqual(['reserved/free']);
    expect((await row(c)).status).toBe('analyzing');
    expect((await claim(u, c)).result).toMatchObject({ result: 'active' }); // no silent re-run
  });

  it('6. save fails inside the transaction (row deleted during Gemini): charge kept, serverSave=failed, result returned', async () => {
    const g = gatedGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c });
    await g.inFlight;
    const { error } = await svc.from('candidate_cvs').delete().eq('id', c);
    expect(error).toBeNull();
    g.open();
    expect(await pending).toMatchObject({ status: 200, body: { serverSave: 'failed', matchScore: 70 } });
    expect(atomicCalls()).toEqual(['pass']); // a save failure is not retried as a settlement failure
    expect(await states(u.id)).toEqual(['committed/charged']);
    expect(await usage(u.id)).toBe(1);
  });

  it('7. decimal score 72.5: saved (integer column 73), exact value in the result', async () => {
    openGemini(72.5);
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const res = await analyze(u, { idempotencyKey: attempt, candidateId: c });
    expect(res).toMatchObject({ status: 200, body: { serverSave: 'saved', matchScore: 72.5 } });
    const r = await row(c);
    expect(r).toMatchObject({ status: 'done', match_score: 73 });
    expect((r.analysis_result as Row).matchScore).toBe(72.5);
  });

  it('8. same key: concurrent duplicate 409, replay after settle 409, one Gemini call, one charge, one save', async () => {
    const g = gatedGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const first = analyze(u, { idempotencyKey: attempt, candidateId: c });
    await g.inFlight;
    expect(await analyze(u, { idempotencyKey: attempt, candidateId: c })).toMatchObject({ status: 409, body: { code: 'duplicate_request' } });
    g.open();
    expect(await first).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect((await analyze(u, { idempotencyKey: attempt, candidateId: c })).status).toBe(409);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(await usage(u.id)).toBe(1);
    expect(atomicCalls()).toEqual(['pass']);
  });

  it('9. cross-account: B cannot run on A\'s candidate, and the RPC never writes A\'s row for B', async () => {
    openGemini();
    const a = await newUser(); const b = await newUser();
    const c = await newCandidate(a); const { attempt } = await claim(a, c);
    expect(await analyze(b, { idempotencyKey: attempt, candidateId: c })).toMatchObject({ status: 409, body: { code: 'not_owner' } });
    expect(await ledger(b.id)).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
    // Direct RPC as the server would call it for B (B's verified id, B's own
    // reservation, A's candidate + A's live attempt): B is charged for B's own
    // reservation, A's row is untouched, the save is refused (42501).
    const { data: rsv } = await svc.rpc('reserve_analytics_quota', { p_user_id: b.id, p_request_key: attempt });
    const { data, error } = await svc.rpc(ATOMIC, {
      p_user_id: b.id, p_reservation_id: (rsv as Row).reservation_id, p_candidate_id: c, p_attempt_id: attempt,
      p_analysis_result: { matchScore: 1 }, p_match_score: 1,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'committed', save: 'failed', save_error: '42501' });
    expect(await row(c)).toMatchObject({ status: 'analyzing', analysis_attempt_id: attempt, analysis_result: null });
    expect(await usage(a.id)).toBe(0);
    // A's reservation cannot be settled under B's id.
    const { data: ra } = await svc.rpc('reserve_analytics_quota', { p_user_id: a.id, p_request_key: randomUUID() });
    const { data: cross } = await svc.rpc(ATOMIC, {
      p_user_id: b.id, p_reservation_id: (ra as Row).reservation_id, p_candidate_id: c, p_attempt_id: attempt,
      p_analysis_result: { matchScore: 1 }, p_match_score: 1,
    });
    expect(cross).toMatchObject({ status: 'not_found', save: 'skipped' });
    expect((await ledger(a.id)).map((r) => r.state)).toEqual(['reserved']);
    // The browser roles cannot call it at all.
    const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const client of [anon, a.client]) {
      const { error: denied } = await client.rpc(ATOMIC, {
        p_user_id: a.id, p_reservation_id: (ra as Row).reservation_id, p_candidate_id: c, p_attempt_id: attempt,
        p_analysis_result: { matchScore: 1 }, p_match_score: 1,
      });
      expect(denied?.code).toBe('42501');
    }
  });

  it('10. stale attempt: row taken over during Gemini → charged, not_owner, newer attempt untouched', async () => {
    const g = gatedGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c });
    await g.inFlight;
    const newer = randomUUID();
    await psql(`update public.candidate_cvs set analysis_attempt_id = '${newer}' where id = '${c}'`); // forced
    g.open();
    expect(await pending).toMatchObject({ status: 200, body: { serverSave: 'not_owner' } });
    expect(await row(c)).toMatchObject({ status: 'analyzing', analysis_attempt_id: newer, analysis_result: null });
    expect(await states(u.id)).toEqual(['committed/charged']);
  });

  it('11. lease and reservation TTL expire during the run (forced): late commit charges once and still saves', async () => {
    const g = gatedGemini();
    const u = await newUser(); const c = await newCandidate(u); const { attempt } = await claim(u, c);
    const pending = analyze(u, { idempotencyKey: attempt, candidateId: c });
    await g.inFlight;
    await psql(`update public.candidate_cvs set analysis_started_at = now() - interval '20 minutes' where id = '${c}';
                update public.analytics_quota_reservations set expires_at = now() - interval '1 second' where user_id = '${u.id}'`);
    await svc.rpc('reserve_analytics_quota', { p_user_id: u.id, p_request_key: randomUUID() }); // user's next RPC settles expiry
    expect((await states(u.id))[0]).toBe('uncertain/free/ttl_expired:forgiven');
    g.open();
    expect(await pending).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect((await states(u.id))[0]).toBe('committed/charged/late_commit');
    expect(await usage(u.id)).toBe(1);
    expect((await row(c)).status).toBe('done');
  });

  it('12. personal flow: two-step commit as before, no candidate RPC; unknown outcome is 503 unknown', async () => {
    openGemini();
    const u = await newUser('free');
    expect(await analyze(u, { idempotencyKey: randomUUID() })).toMatchObject({ status: 200, body: { matchScore: 70 } });
    expect(calls.map((x) => x.name)).toContain('commit_analytics_quota');
    expect(calls.map((x) => x.name)).not.toContain(ATOMIC);
    expect(await states(u.id)).toEqual(['committed/charged']);
    calls.length = 0;
    faults.commit_analytics_quota = ['lose_response', 'never_sent', 'never_sent'];
    const res = await analyze(u, { idempotencyKey: randomUUID() });
    expect(res).toEqual(UNKNOWN);
    expect(await usage(u.id)).toBe(2); // landed: charged; result withheld (known personal-path debt, Q-D4)
  });
});
