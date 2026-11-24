// @vitest-environment jsdom
// P1-D: the browser refuses to create a Supabase client for the production
// project on a non-production Vercel build, from inlined env or /api/config.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRODUCTION_SUPABASE_HOST } from '../../lib/previewGuard';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: {} })) }));
const PROD = `https://${PRODUCTION_SUPABASE_HOST}`;

async function boot(env: Record<string, string>, configBody?: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(configBody ?? {}), { status: 200 })));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mod = await import('../../lib/supabase');
  return mod.bootstrapSupabase();
}

describe('browser Supabase bootstrap guard', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('refuses inlined production credentials on a preview build', async () => {
    expect(await boot({ VITE_VERCEL: '1', VITE_VERCEL_ENV: 'preview', VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' })).toBe(false);
  });

  it('refuses production credentials served by /api/config on a preview build', async () => {
    expect(await boot({ VITE_VERCEL: '1', VITE_VERCEL_ENV: 'preview', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
      { VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' })).toBe(false);
  });

  it('boots on a production build and on a local (non-Vercel) build', async () => {
    expect(await boot({ VITE_VERCEL: '1', VITE_VERCEL_ENV: 'production', VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' })).toBe(true);
    expect(await boot({ VITE_VERCEL: '', VITE_VERCEL_ENV: '', VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' })).toBe(true);
  });
});
