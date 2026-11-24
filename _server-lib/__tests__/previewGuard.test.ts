// @vitest-environment node
// P1-D security regression: server factories and the public config endpoint
// refuse production Supabase / Gemini on any non-production Vercel deployment,
// even when the env vars are (mis)configured with production values.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PRODUCTION_SUPABASE_HOST } from '../../src/lib/previewGuard.js';

const PROD_URL = `https://${PRODUCTION_SUPABASE_HOST}`;

function stub(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
}
const misconfiguredPreview = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  SUPABASE_URL: PROD_URL,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value',
  VITE_SUPABASE_URL: PROD_URL,
  VITE_SUPABASE_ANON_KEY: 'anon-test-value',
  GEMINI_API_KEY: 'gemini-test-value',
};

async function freshAdmin() {
  vi.resetModules();
  return (await import('../payment/supabaseAdmin.js')).getSupabaseAdmin;
}
async function freshGemini() {
  vi.resetModules();
  return (await import('../ai/geminiClient.js')).getGeminiClient;
}
async function config() {
  vi.resetModules();
  const handler = (await import('../../api/config.js')).default;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })), setHeader: vi.fn(), end: vi.fn() } as unknown as VercelResponse;
  handler({ method: 'GET', headers: {} } as unknown as VercelRequest, res);
  return json.mock.calls[0][0] as Record<string, string>;
}

describe('preview fail-closed guard (server)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('getSupabaseAdmin refuses production credentials on a preview (SUPABASE_URL or VITE fallback)', async () => {
    stub(misconfiguredPreview);
    await expect(freshAdmin().then((f) => f())).rejects.toThrow(/production_supabase_outside_production/);
    stub({ SUPABASE_URL: '' });
    await expect(freshAdmin().then((f) => f())).rejects.toThrow(/production_supabase_outside_production/);
  });

  it('getSupabaseAdmin refuses on development and on a missing VERCEL_ENV', async () => {
    for (const vercelEnv of ['development', '']) {
      stub({ ...misconfiguredPreview, VERCEL_ENV: vercelEnv });
      await expect(freshAdmin().then((f) => f())).rejects.toThrow(/production_supabase_outside_production/);
    }
  });

  it('getSupabaseAdmin refuses a non-allowlisted host and allows only the allowlisted one', async () => {
    stub({ ...misconfiguredPreview, SUPABASE_URL: 'https://staging-ref.supabase.co' });
    await expect(freshAdmin().then((f) => f())).rejects.toThrow(/supabase_host_not_allowlisted/);
    stub({ PREVIEW_SUPABASE_HOST: 'staging-ref.supabase.co' });
    expect((await freshAdmin())()).toBeTruthy();
  });

  it('getSupabaseAdmin works in production and outside Vercel', async () => {
    stub({ ...misconfiguredPreview, VERCEL_ENV: 'production' });
    expect((await freshAdmin())()).toBeTruthy();
    stub({ ...misconfiguredPreview, VERCEL: '', VERCEL_ENV: '' });
    expect((await freshAdmin())()).toBeTruthy();
  });

  it('getGeminiClient refuses on a preview unless PREVIEW_GEMINI_ALLOWED=true', async () => {
    stub(misconfiguredPreview);
    expect((await freshGemini()).bind(null)).toThrow(/gemini_outside_production/);
    stub({ PREVIEW_GEMINI_ALLOWED: 'yes' });
    expect((await freshGemini()).bind(null)).toThrow(/gemini_outside_production/);
    stub({ PREVIEW_GEMINI_ALLOWED: 'true' });
    expect((await freshGemini())()).toBeTruthy();
    stub({ VERCEL_ENV: 'production', PREVIEW_GEMINI_ALLOWED: '' });
    expect((await freshGemini())()).toBeTruthy();
  });

  it('/api/config returns no Supabase URL or anon key on a misconfigured preview', async () => {
    stub(misconfiguredPreview);
    const body = await config();
    expect(body.VITE_SUPABASE_URL).toBe('');
    expect(body.SUPABASE_URL).toBe('');
    expect(body.VITE_SUPABASE_ANON_KEY).toBe('');
    expect(body.SUPABASE_ANON_KEY).toBe('');
    expect(JSON.stringify(body)).not.toContain(PRODUCTION_SUPABASE_HOST);
  });

  it('/api/config still serves production', async () => {
    stub({ ...misconfiguredPreview, VERCEL_ENV: 'production' });
    const body = await config();
    expect(body.VITE_SUPABASE_URL).toBe(PROD_URL);
    expect(body.VITE_SUPABASE_ANON_KEY).toBe('anon-test-value');
  });
});
