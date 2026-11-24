// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('../../sentry.js', () => ({ initSentryServer: vi.fn(), Sentry: { captureException: vi.fn(), flush: vi.fn() } }));
const rpc = vi.fn();
const getUserFromBearerToken = vi.fn();
vi.mock('../../payment/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ rpc }),
  getUserFromBearerToken: (...a: unknown[]) => getUserFromBearerToken(...a),
}));

import handler from '../../../api/admin.js';
import { handleCronHealth, parseJobList } from '../cronHealth.js';

const SECRET = 'x'.repeat(40);
function call(opts: { method?: string; auth?: string; jobs?: unknown; action?: string }) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const req = {
    method: opts.method ?? 'GET',
    url: `/api/admin/${opts.action ?? 'cron-health'}`,
    headers: { host: 'localhost', ...(opts.auth ? { authorization: opts.auth } : {}) },
    query: opts.jobs === undefined ? {} : { jobs: opts.jobs },
  } as unknown as VercelRequest;
  return handler(req, { status, setHeader, end: vi.fn() } as unknown as VercelResponse).then(() => ({
    code: (status.mock.calls[0] as unknown[])[0],
    body: json.mock.calls[0][0] as Record<string, unknown>,
    setHeader,
  }));
}

describe('parseJobList', () => {
  it('accepts 1–20 valid, de-duplicated names', () => {
    expect(parseJobList(' a-1 ,b,a-1 ')).toEqual(['a-1', 'b']);
    expect(parseJobList(Array.from({ length: 20 }, (_, i) => `j${i}`).join(','))).toHaveLength(20);
  });
  it('rejects anything else', () => {
    for (const bad of [undefined, 42, ['a'], '', ',', 'A', 'a;drop', '-a', 'a b', 'a'.repeat(64),
      Array.from({ length: 21 }, (_, i) => `j${i}`).join(',')]) {
      expect(parseJobList(bad)).toBeNull();
    }
  });
});

describe('handleCronHealth', () => {
  beforeEach(() => rpc.mockReset());
  const client = { rpc } as unknown as SupabaseClient;

  it('200 healthy when every job is ok; passes the validated list only', async () => {
    rpc.mockResolvedValue({ data: [{ job: 'a', state: 'ok', hours_since_success: 1, consecutive_failures: 0, runs_7d: 7 }], error: null });
    expect(await handleCronHealth('a', client)).toEqual({
      status: 200,
      body: { healthy: true, jobs: [{ job: 'a', state: 'ok', hours_since_success: 1, consecutive_failures: 0, runs_7d: 7 }] },
    });
    expect(rpc).toHaveBeenCalledWith('cron_job_health', { p_jobs: ['a'] });
  });

  it('503 when any job is not ok, a row is missing, or a state is unknown', async () => {
    rpc.mockResolvedValue({ data: [
      { job: 'a', state: 'ok', hours_since_success: 1, consecutive_failures: 0, runs_7d: 1 },
      { job: 'b', state: 'weird', hours_since_success: null, consecutive_failures: 0, runs_7d: 0 },
    ], error: null });
    const r = await handleCronHealth('a,b,c', client);
    expect(r.status).toBe(503);
    expect((r.body.jobs as { state: string }[]).map((j) => j.state)).toEqual(['ok', 'unknown', 'unknown']);
    for (const state of ['stale', 'failing', 'missing', 'inactive']) {
      rpc.mockResolvedValue({ data: [{ job: 'a', state, hours_since_success: null, consecutive_failures: 2, runs_7d: 0 }], error: null });
      expect((await handleCronHealth('a', client)).status).toBe(503);
    }
  });

  it('never forwards fields beyond the five enums/counts (no run text)', async () => {
    rpc.mockResolvedValue({ data: [{ job: 'a', state: 'failing', hours_since_success: 3, consecutive_failures: 2, runs_7d: 2,
      return_message: 'CANARY secret row text', command: 'CANARY cmd' }], error: null });
    const r = await handleCronHealth('a', client);
    expect(JSON.stringify(r)).not.toContain('CANARY');
    expect(Object.keys((r.body.jobs as object[])[0]).sort()).toEqual(['consecutive_failures', 'hours_since_success', 'job', 'runs_7d', 'state']);
  });

  it('400 on an invalid list without calling the database or echoing input', async () => {
    const r = await handleCronHealth('ok,<script>', client);
    expect(r).toEqual({ status: 400, body: { error: 'invalid_jobs' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('503 health_function_missing when the proposed SQL is not applied; generic code otherwise', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function CANARY' } });
    expect(await handleCronHealth('a', client)).toEqual({ status: 503, body: { healthy: false, error: 'health_function_missing' } });
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'CANARY internal' } });
    const r = await handleCronHealth('a', client);
    expect(r).toEqual({ status: 503, body: { healthy: false, error: 'health_query_failed' } });
  });
});

describe('GET /api/admin/cron-health (auth)', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [{ job: 'a', state: 'ok', hours_since_success: 1, consecutive_failures: 0, runs_7d: 1 }], error: null });
    getUserFromBearerToken.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is off (401) while CRON_HEALTH_SECRET is unset or shorter than 32 chars', async () => {
    expect((await call({ auth: 'Bearer ', jobs: 'a' })).code).toBe(401);
    vi.stubEnv('CRON_HEALTH_SECRET', 'short-secret');
    expect((await call({ auth: 'Bearer short-secret', jobs: 'a' })).code).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 on a missing or wrong secret; never falls back to admin JWT or the cleanup secret', async () => {
    vi.stubEnv('CRON_HEALTH_SECRET', SECRET);
    vi.stubEnv('STORAGE_CLEANUP_SECRET', 'y'.repeat(40));
    getUserFromBearerToken.mockResolvedValue({ id: 'admin' });
    for (const auth of [undefined, `Bearer ${SECRET}x`, SECRET, `bearer ${SECRET}`, `Bearer ${'y'.repeat(40)}`, 'Bearer admin-jwt']) {
      expect((await call({ auth, jobs: 'a' })).code).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(getUserFromBearerToken).not.toHaveBeenCalled();
  });

  it('200 with the right secret; no-store; GET only', async () => {
    vi.stubEnv('CRON_HEALTH_SECRET', SECRET);
    const r = await call({ auth: `Bearer ${SECRET}`, jobs: 'a' });
    expect(r.code).toBe(200);
    expect(r.body.healthy).toBe(true);
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect((await call({ method: 'POST', auth: `Bearer ${SECRET}`, jobs: 'a' })).code).toBe(405);
  });

  it('existing POST admin actions are unaffected (still need the admin JWT)', async () => {
    getUserFromBearerToken.mockResolvedValue(null);
    expect((await call({ method: 'POST', action: 'set-user-role', auth: `Bearer ${SECRET}` })).code).toBe(401);
    expect((await call({ method: 'GET', action: 'set-user-role' })).code).toBe(405);
  });
});
