// @vitest-environment node
// P1-D security regression. Every Vercel function entry (api/**) applies the
// fail-closed credential policy at load: unless VERCEL_ENV is exactly
// 'production' — including when Vercel's system env vars are not exposed at
// all — the production Supabase project is refused and GEMINI_API_KEY is
// removed (the frozen Gemini client then fails closed). Express and plain
// library use (no entry) are unchanged.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PRODUCTION_SUPABASE_HOST } from '../../src/lib/previewGuard.js';

const PROD_URL = `https://${PRODUCTION_SUPABASE_HOST}`;
const MARK = Symbol.for('cvfit.vercelFunction');

function apiEntries(dir = 'api'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : apiEntries(p);
    return e.name.endsWith('.ts') && /export default/.test(readFileSync(p, 'utf8')) ? [p] : [];
  });
}
const ENTRIES = apiEntries();

/** Credentials as if someone mis-scoped production values to this deployment. */
function misconfigured(extra: Record<string, string> = {}) {
  for (const k of ['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'PREVIEW_SUPABASE_HOST']) vi.stubEnv(k, undefined as unknown as string);
  vi.stubEnv('SUPABASE_URL', PROD_URL);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-value');
  vi.stubEnv('VITE_SUPABASE_URL', PROD_URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-value');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-value');
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}
async function load(entry: string) {
  vi.resetModules();
  await import(`../../${entry.replace(/\.ts$/, '.js')}`);
  return (await import('../payment/supabaseAdmin.js')).getSupabaseAdmin;
}
async function admin() {
  vi.resetModules();
  return (await import('../payment/supabaseAdmin.js')).getSupabaseAdmin;
}
async function config() {
  vi.resetModules();
  const handler = (await import('../../api/config.js')).default;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })), setHeader: vi.fn(), end: vi.fn() } as unknown as VercelResponse;
  handler({ method: 'GET', headers: {} } as unknown as VercelRequest, res);
  return json.mock.calls[0][0] as Record<string, string>;
}

describe('Vercel entry credential policy (P1-D)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<symbol, unknown>)[MARK];
  });

  it('covers every Vercel function entry', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(9);
    for (const e of ENTRIES) expect(readFileSync(e, 'utf8'), e).toMatch(/^enterVercelFunction\(\);$/m);
  });

  it.each(ENTRIES)('%s: with NO Vercel system vars (exposure off) removes Gemini and refuses production Supabase', async (entry) => {
    misconfigured();
    const getAdmin = await load(entry);
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    expect(() => getAdmin()).toThrow(/production_supabase_outside_production/);
  });

  it.each(['preview', 'development', 'staging', 'Production', ''])('VERCEL_ENV=%j: refused (preview, custom env, wrong case, empty)', async (env) => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: env });
    const getAdmin = await load('api/analyze.ts');
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    expect(() => getAdmin()).toThrow(/production_supabase_outside_production/);
  });

  it('production keeps Gemini and production Supabase (unchanged behaviour)', async () => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'production' });
    const getAdmin = await load('api/analyze.ts');
    expect(process.env.GEMINI_API_KEY).toBe('gemini-test-value');
    expect(getAdmin()).toBeTruthy();
  });

  it('production keeps them even if VERCEL itself is missing (only VERCEL_ENV matters)', async () => {
    misconfigured({ VERCEL_ENV: 'production' });
    const getAdmin = await load('api/admin.ts');
    expect(process.env.GEMINI_API_KEY).toBe('gemini-test-value');
    expect(getAdmin()).toBeTruthy();
  });

  it('a non-production deployment may use only an explicitly allowlisted non-production Supabase host', async () => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'preview', SUPABASE_URL: 'https://staging-ref.supabase.co' });
    await expect(load('api/admin.ts').then((f) => f())).rejects.toThrow(/supabase_host_not_allowlisted/);
    vi.stubEnv('PREVIEW_SUPABASE_HOST', 'staging-ref.supabase.co');
    expect((await load('api/admin.ts'))()).toBeTruthy();
    // ...and an allowlist naming production still refuses production.
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'preview', PREVIEW_SUPABASE_HOST: PRODUCTION_SUPABASE_HOST });
    await expect(load('api/admin.ts').then((f) => f())).rejects.toThrow(/production_supabase_outside_production/);
  });

  it('Gemini has no preview opt-in: no flag or variable restores the key on a non-production entry', async () => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'preview', PREVIEW_GEMINI_ALLOWED: 'true' });
    await load('api/rewrite-cv.ts');
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    const { getGeminiClient } = await import('../ai/geminiClient.js');
    expect(() => getGeminiClient()).toThrow(/GEMINI_API_KEY is not configured/);
  });

  it('Express / library use (no Vercel entry, no Vercel vars) is unchanged', async () => {
    misconfigured();
    expect((await admin())()).toBeTruthy();
    expect(process.env.GEMINI_API_KEY).toBe('gemini-test-value');
    vi.resetModules();
    const { getGeminiClient } = await import('../ai/geminiClient.js');
    expect(getGeminiClient()).toBeTruthy();
  });

  it('library use still refuses when Vercel says non-production (VERCEL=1 without the entry marker)', async () => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'preview' });
    await expect(admin().then((f) => f())).rejects.toThrow(/production_supabase_outside_production/);
  });

  it('/api/config hides the Supabase URL and anon key on any non-production entry, incl. no Vercel vars', async () => {
    for (const extra of [{}, { VERCEL: '1', VERCEL_ENV: 'preview' }]) {
      misconfigured(extra);
      const body = await config();
      expect(body).toMatchObject({ VITE_SUPABASE_URL: '', SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', SUPABASE_ANON_KEY: '' });
      expect(JSON.stringify(body)).not.toContain(PRODUCTION_SUPABASE_HOST);
      delete (globalThis as Record<symbol, unknown>)[MARK];
    }
  });

  it('/api/config serves production unchanged', async () => {
    misconfigured({ VERCEL: '1', VERCEL_ENV: 'production' });
    expect(await config()).toMatchObject({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_ANON_KEY: 'anon-test-value' });
  });
});
