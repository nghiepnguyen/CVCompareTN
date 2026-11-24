// P1-D: fail-closed guard so a non-production Vercel deployment (Preview,
// development, custom environment, or one where VERCEL_ENV is unavailable)
// can never use the production Supabase project, even if an env var is
// mis-scoped. Defense in depth on top of Production-only env scoping. Pure:
// the server (_server-lib/previewGuard.ts) and the browser (src/lib/supabase.ts)
// pass in their own env. Gemini is handled by the server entry policy
// (enterVercelFunction), because _server-lib/ai/geminiClient.ts is a frozen
// M3-B benchmark input and must stay byte-identical.

// Already public (index.html dns-prefetch); not a secret.
export const PRODUCTION_SUPABASE_HOST = 'pgchcnmpuknbgyljdlyp.supabase.co';

export type DeployEnv = {
  /** '1' when running as a Vercel deployment (system var VERCEL, or the server entry marker). */
  vercel?: string;
  /** VERCEL_ENV: 'production' | 'preview' | 'development'; may be unavailable. */
  vercelEnv?: string;
  /** Explicit non-production Supabase host the server may use (none today). */
  previewSupabaseHost?: string;
};

/** On Vercel, anything not explicitly production (including a missing VERCEL_ENV) is non-production. */
export function isNonProductionVercel(env: DeployEnv): boolean {
  return env.vercel === '1' && env.vercelEnv !== 'production';
}

export type GuardReason =
  | 'invalid_supabase_url'
  | 'production_supabase_outside_production'
  | 'supabase_host_not_allowlisted';

export function supabaseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** null = allowed. Outside Vercel (local dev, CI, Express) everything is allowed. */
export function supabaseUrlBlockedReason(url: string, env: DeployEnv): GuardReason | null {
  if (!isNonProductionVercel(env)) return null;
  const host = supabaseHost(url);
  if (!host) return 'invalid_supabase_url';
  if (host === PRODUCTION_SUPABASE_HOST) return 'production_supabase_outside_production';
  const allowed = env.previewSupabaseHost?.trim().toLowerCase();
  if (!allowed || host !== allowed) return 'supabase_host_not_allowlisted';
  return null;
}

/**
 * Browser: an INLINED (build-time) production URL is trusted only by a build
 * that knows it is production. Anything else (preview build, a build where
 * system env exposure was off, a local build) must ask /api/config, whose
 * answer the server's own fail-closed policy decides. Other hosts (local stack)
 * are used as before.
 */
export function inlineSupabaseUrlTrusted(url: string, buildVercelEnv: string | undefined): boolean {
  return supabaseHost(url) !== PRODUCTION_SUPABASE_HOST || buildVercelEnv === 'production';
}
