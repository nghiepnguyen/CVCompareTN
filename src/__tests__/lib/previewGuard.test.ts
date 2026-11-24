import { describe, it, expect } from 'vitest';
import {
  PRODUCTION_SUPABASE_HOST,
  inlineSupabaseUrlTrusted,
  isNonProductionVercel,
  supabaseUrlBlockedReason,
  type DeployEnv,
} from '../../lib/previewGuard';

const PROD = `https://${PRODUCTION_SUPABASE_HOST}`;
const STAGING = 'https://staging-ref.supabase.co';
const preview: DeployEnv = { vercel: '1', vercelEnv: 'preview' };

describe('previewGuard (P1-D)', () => {
  it('matches the production host shipped in index.html', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('index.html', 'utf8')).toContain(`https://${PRODUCTION_SUPABASE_HOST}`);
  });

  it('allows everything in production and outside Vercel (local dev, CI, Express)', () => {
    for (const env of [{ vercel: '1', vercelEnv: 'production' }, {}, { vercelEnv: 'preview' }, { vercel: '0', vercelEnv: 'preview' }]) {
      expect(supabaseUrlBlockedReason(PROD, env)).toBeNull();
    }
  });

  it('treats every non-production Vercel deployment as non-production, including a missing VERCEL_ENV', () => {
    for (const vercelEnv of ['preview', 'development', 'staging', '', undefined, 'Production']) {
      expect(isNonProductionVercel({ vercel: '1', vercelEnv })).toBe(true);
    }
  });

  it('refuses the production Supabase host on a preview, however it is spelled', () => {
    for (const url of [PROD, `${PROD}/`, `${PROD}/rest/v1`, `https://${PRODUCTION_SUPABASE_HOST.toUpperCase()}`, `${PROD}:443`]) {
      expect(supabaseUrlBlockedReason(url, preview)).toBe('production_supabase_outside_production');
    }
  });

  it('still refuses production when the allowlist is mis-set to the production host', () => {
    expect(supabaseUrlBlockedReason(PROD, { ...preview, previewSupabaseHost: PRODUCTION_SUPABASE_HOST })).toBe(
      'production_supabase_outside_production'
    );
  });

  it('refuses any other host unless it is explicitly allowlisted', () => {
    expect(supabaseUrlBlockedReason(STAGING, preview)).toBe('supabase_host_not_allowlisted');
    expect(supabaseUrlBlockedReason(STAGING, { ...preview, previewSupabaseHost: 'other.supabase.co' })).toBe(
      'supabase_host_not_allowlisted'
    );
    expect(supabaseUrlBlockedReason(STAGING, { ...preview, previewSupabaseHost: ' STAGING-REF.supabase.co ' })).toBeNull();
  });

  it('refuses an unparseable URL on a preview', () => {
    expect(supabaseUrlBlockedReason('not a url', preview)).toBe('invalid_supabase_url');
    expect(supabaseUrlBlockedReason('', preview)).toBe('invalid_supabase_url');
  });

  it('trusts an inlined production URL only in a production build; other hosts unchanged', () => {
    expect(inlineSupabaseUrlTrusted(PROD, 'production')).toBe(true);
    for (const env of ['preview', 'development', '', undefined, 'Production']) {
      expect(inlineSupabaseUrlTrusted(PROD, env)).toBe(false);
      expect(inlineSupabaseUrlTrusted(`${PROD}/`, env)).toBe(false);
      expect(inlineSupabaseUrlTrusted('http://127.0.0.1:54321', env)).toBe(true);
    }
  });
});
