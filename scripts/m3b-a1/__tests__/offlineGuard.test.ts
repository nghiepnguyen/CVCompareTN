import { describe, it, expect } from 'vitest';
import https from 'node:https';
import net from 'node:net';

const guarded = Boolean((globalThis as { __M3B_OFFLINE_GUARD__?: boolean }).__M3B_OFFLINE_GUARD__);

// Runs only under scripts/m3b-a1/vitest.offline.config.ts (skipped in `npm test`).
describe.skipIf(!guarded)('M3-B A1 offline guard', () => {
  it('has no provider or database secret in env (local-DB mode: only loopback demo-key Supabase vars)', async () => {
    const { FORBIDDEN_ENV, LOCAL_DB_MODE } = await import('../offlineGuard');
    const allowed = LOCAL_DB_MODE ? ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] : [];
    expect(Object.keys(process.env).filter((k) => FORBIDDEN_ENV.test(k) && process.env[k] && !allowed.includes(k))).toEqual([]);
    if (LOCAL_DB_MODE) expect(new URL(process.env.SUPABASE_URL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  });

  it('blocks fetch to the Gemini API', async () => {
    await expect(fetch('https://generativelanguage.googleapis.com/v1beta/models')).rejects.toThrow(/network blocked/);
  });

  it('blocks fetch to a Supabase host', async () => {
    await expect(fetch('https://example.supabase.co/rest/v1/history')).rejects.toThrow(/network blocked/);
  });

  it('blocks raw https.request', () => {
    expect(() => https.request('https://generativelanguage.googleapis.com/').end()).toThrow(/network blocked/);
  });

  it('blocks raw TCP to a public host', () => {
    expect(() => new net.Socket().connect(443, 'generativelanguage.googleapis.com')).toThrow(/network blocked/);
  });

  it('real Gemini client cannot be built without a key', async () => {
    const { getGeminiClient } = await import('../../../_server-lib/ai/geminiClient');
    expect(() => getGeminiClient()).toThrow(/GEMINI_API_KEY is not configured/);
  });
});
