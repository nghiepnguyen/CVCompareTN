import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sdk = {
  loaded: vi.fn(),
  createClient: vi.fn(),
  client: { auth: { getSession: vi.fn() } },
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  sdk.loaded.mockReset();
  sdk.createClient.mockReset().mockReturnValue(sdk.client);
  vi.doMock('@supabase/supabase-js', () => {
    sdk.loaded();
    return { createClient: sdk.createClient };
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('does not evaluate the SDK just to import the public app client', async () => {
  const { isSupabaseReady } = await import('../supabase');
  expect(sdk.loaded).not.toHaveBeenCalled();
  expect(isSupabaseReady()).toBe(false);
});

it('shares one initialization across concurrent callers and exposes the ready client', async () => {
  const { bootstrapSupabase, isSupabaseReady, supabase } = await import('../supabase');
  await expect(Promise.all([bootstrapSupabase(), bootstrapSupabase()])).resolves.toEqual([true, true]);
  expect(sdk.createClient).toHaveBeenCalledTimes(1);
  expect(sdk.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'public-test-key');
  expect(isSupabaseReady()).toBe(true);
  expect(supabase.auth).toBe(sdk.client.auth);
});

it('bounds a hung config request and can retry initialization', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  const { bootstrapSupabase, isSupabaseReady } = await import('../supabase');
  let result: boolean | undefined;
  void bootstrapSupabase().then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(8000);
  expect(result).toBe(false);
  expect(isSupabaseReady()).toBe(false);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  await expect(bootstrapSupabase()).resolves.toBe(true);
});

it('loads runtime configuration and the SDK concurrently', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  const { bootstrapSupabase } = await import('../supabase');
  let resolveSdk!: (value: { createClient: typeof sdk.createClient }) => void;
  vi.doMock('@supabase/supabase-js', () => new Promise(done => { resolveSdk = done; }));
  const fetchConfig = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-test-key' }),
  });
  vi.stubGlobal('fetch', fetchConfig);
  const request = bootstrapSupabase();
  await vi.waitFor(() => expect(fetchConfig).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(resolveSdk).toBeTypeOf('function'));
  resolveSdk({ createClient: sdk.createClient });
  await expect(request).resolves.toBe(true);
});

it('does not initialize a late SDK after the startup deadline', async () => {
  vi.useFakeTimers();
  const { bootstrapSupabase, isSupabaseReady } = await import('../supabase');
  let resolveSdk!: (value: { createClient: typeof sdk.createClient }) => void;
  vi.doMock('@supabase/supabase-js', () => new Promise(done => { resolveSdk = done; }));
  let result: boolean | undefined;
  void bootstrapSupabase().then(value => { result = value; });
  await vi.waitFor(() => expect(resolveSdk).toBeTypeOf('function'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(result).toBe(false);
  resolveSdk({ createClient: sdk.createClient });
  await vi.advanceTimersByTimeAsync(0);
  expect(isSupabaseReady()).toBe(false);
  expect(sdk.createClient).not.toHaveBeenCalled();
});
