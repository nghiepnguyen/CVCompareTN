// P1-D: fail-closed guard so a non-production Vercel deployment (Preview,
// development, custom environment, or a missing VERCEL_ENV) can never use the
// production Supabase project or Gemini, even if an env var is mis-scoped.
// Defense in depth on top of Production-only env scoping. Pure: the server
// (_server-lib/previewGuard.ts) and the browser (src/lib/supabase.ts) pass in
// their own env.

// Already public (index.html dns-prefetch); not a secret.
export const PRODUCTION_SUPABASE_HOST = 'pgchcnmpuknbgyljdlyp.supabase.co';

export type DeployEnv = {
  /** Vercel system var VERCEL ('1' on every Vercel build and function). */
  vercel?: string;
  /** VERCEL_ENV: 'production' | 'preview' | 'development'. */
  vercelEnv?: string;
  /** Explicit non-production Supabase host a Preview may use (none today). */
  previewSupabaseHost?: string;
  /** 'true' lets a non-production deployment call Gemini (own key, own quota). */
  previewGeminiAllowed?: string;
};

/** On Vercel, anything not explicitly production is treated as non-production. */
export function isNonProductionVercel(env: DeployEnv): boolean {
  return env.vercel === '1' && env.vercelEnv !== 'production';
}

export type GuardReason =
  | 'invalid_supabase_url'
  | 'production_supabase_outside_production'
  | 'supabase_host_not_allowlisted'
  | 'gemini_outside_production';

/** null = allowed. Outside Vercel (local dev, CI, Express) everything is allowed. */
export function supabaseUrlBlockedReason(url: string, env: DeployEnv): GuardReason | null {
  if (!isNonProductionVercel(env)) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'invalid_supabase_url';
  }
  if (host === PRODUCTION_SUPABASE_HOST) return 'production_supabase_outside_production';
  const allowed = env.previewSupabaseHost?.trim().toLowerCase();
  if (!allowed || host !== allowed) return 'supabase_host_not_allowlisted';
  return null;
}

export function geminiBlockedReason(env: DeployEnv): GuardReason | null {
  return isNonProductionVercel(env) && env.previewGeminiAllowed !== 'true' ? 'gemini_outside_production' : null;
}
