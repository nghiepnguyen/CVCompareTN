import {
  geminiBlockedReason,
  supabaseUrlBlockedReason,
  type DeployEnv,
} from '../src/lib/previewGuard.js';

export class PreviewCredentialError extends Error {
  constructor(reason: string) {
    super(`Refusing credentials on a non-production deployment: ${reason}`);
    this.name = 'PreviewCredentialError';
  }
}

function serverDeployEnv(): DeployEnv {
  return {
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    previewSupabaseHost: process.env.PREVIEW_SUPABASE_HOST,
    previewGeminiAllowed: process.env.PREVIEW_GEMINI_ALLOWED,
  };
}

export function isSupabaseUrlAllowed(url: string): boolean {
  return supabaseUrlBlockedReason(url, serverDeployEnv()) === null;
}

export function assertSupabaseUrlAllowed(url: string): void {
  const reason = supabaseUrlBlockedReason(url, serverDeployEnv());
  if (reason) throw new PreviewCredentialError(reason);
}

export function assertGeminiAllowed(): void {
  const reason = geminiBlockedReason(serverDeployEnv());
  if (reason) throw new PreviewCredentialError(reason);
}
