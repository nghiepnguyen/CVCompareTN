// @vitest-environment jsdom
// P1-D browser rule: an inlined production Supabase URL is used only by a
// production build; every other build asks /api/config, which the server's
// fail-closed policy answers. This holds even when Vercel's system env vars
// were not exposed at build time, and a preview promoted without a rebuild
// still works because it reads the production runtime's /api/config.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRODUCTION_SUPABASE_HOST } from '../../lib/previewGuard';

const createClient = vi.fn((url: string) => ({ url }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (url: string) => createClient(url) }));
const PROD = `https://${PRODUCTION_SUPABASE_HOST}`;

async function boot(env: Record<string, string>, config: Record<string, string> | 'down') {
  vi.resetModules();
  createClient.mockClear();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const fetchMock = vi.fn(async () => config === 'down'
    ? new Response('', { status: 500 })
    : new Response(JSON.stringify(config), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const ok = await (await import('../../lib/supabase')).bootstrapSupabase();
  return { ok, fetched: fetchMock.mock.calls.length > 0, url: createClient.mock.calls[0]?.[0] };
}
const inlineProd = { VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' };
const empty = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
const serverRefuses = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
const serverServesProd = { VITE_SUPABASE_URL: PROD, VITE_SUPABASE_ANON_KEY: 'anon' };

describe('browser Supabase bootstrap (P1-D)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('production build uses the inlined production URL without asking the server', async () => {
    expect(await boot({ ...inlineProd, VITE_VERCEL_ENV: 'production' }, 'down')).toEqual({ ok: true, fetched: false, url: PROD });
  });

  it.each(['preview', 'development', ''])('build VERCEL_ENV=%j ignores an inlined production URL and defers to /api/config', async (env) => {
    expect(await boot({ ...inlineProd, VITE_VERCEL_ENV: env }, serverRefuses)).toEqual({ ok: false, fetched: true, url: undefined });
  });

  it('preview promoted to production without a rebuild boots from the production /api/config', async () => {
    expect(await boot({ ...empty, VITE_VERCEL_ENV: 'preview' }, serverServesProd)).toEqual({ ok: true, fetched: true, url: PROD });
  });

  it('local dev: a local stack URL inline is used as before; no inline URL uses /api/config (Express)', async () => {
    expect(await boot({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'anon', VITE_VERCEL_ENV: '' }, 'down'))
      .toEqual({ ok: true, fetched: false, url: 'http://127.0.0.1:54321' });
    expect(await boot({ ...empty, VITE_VERCEL_ENV: '' }, serverServesProd)).toEqual({ ok: true, fetched: true, url: PROD });
  });
});
