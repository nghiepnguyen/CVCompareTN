import { supabaseUrlBlockedReason, type DeployEnv } from '../src/lib/previewGuard.js';

export class PreviewCredentialError extends Error {
  constructor(reason: string) {
    super(`Refusing credentials on a non-production deployment: ${reason}`);
    this.name = 'PreviewCredentialError';
  }
}

const VERCEL_FUNCTION = Symbol.for('cvfit.vercelFunction');
type Marked = typeof globalThis & { [VERCEL_FUNCTION]?: boolean };

/**
 * Call at the top of every Vercel function entry (api/**). Marks the process as
 * a Vercel deployment by construction, so the guard does not depend on Vercel
 * exposing system env vars, and — unless VERCEL_ENV is exactly 'production' —
 * removes GEMINI_API_KEY so the (frozen, lazy-reading) Gemini client fails
 * closed with "not configured". Express (server.ts) and local scripts never call
 * this, so their behaviour is unchanged.
 */
export function enterVercelFunction(): void {
  (globalThis as Marked)[VERCEL_FUNCTION] = true;
  if (process.env.VERCEL_ENV !== 'production') delete process.env.GEMINI_API_KEY;
}

function serverDeployEnv(): DeployEnv {
  const marked = (globalThis as Marked)[VERCEL_FUNCTION] === true;
  return {
    vercel: marked || process.env.VERCEL === '1' ? '1' : process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    previewSupabaseHost: process.env.PREVIEW_SUPABASE_HOST,
  };
}

export function isSupabaseUrlAllowed(url: string): boolean {
  return supabaseUrlBlockedReason(url, serverDeployEnv()) === null;
}

export function assertSupabaseUrlAllowed(url: string): void {
  const reason = supabaseUrlBlockedReason(url, serverDeployEnv());
  if (reason) throw new PreviewCredentialError(reason);
}
