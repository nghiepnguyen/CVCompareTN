import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Shared HTTP guards for the Vercel handlers. Express already has a CORS
 * allowlist and a 50 MB JSON limit in server.ts; api/*.ts had neither, so a
 * cross-origin page could call the endpoints and oversized bodies were only
 * bounded by the platform. Keep this list in sync with server.ts.
 */
const PRODUCTION_ORIGINS = ['https://cvfit.pro', 'https://www.cvfit.pro'];
const DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

export function allowedOrigins(env: string | undefined = process.env.NODE_ENV): string[] {
  return env === 'production' ? [...PRODUCTION_ORIGINS] : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];
}

export const BODY_LIMITS = {
  /** CV text / base64 payload endpoints (analyze, rewrite, parse, save-analysis). */
  ai: 16 * 1024 * 1024,
  /** extract-pdf accepts up to 10 MB decoded, ~13.4 MB base64 plus JSON overhead. */
  pdf: 16 * 1024 * 1024,
  /** Metadata-only endpoints (email, payment, admin, config POSTs). */
  json: 256 * 1024,
} as const;

function firstHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Echo an allowlisted Origin (never `*`); same-origin calls get no CORS headers. */
export function applyCors(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Vary', 'Origin');
  const origin = firstHeader(req, 'origin');
  if (!origin || !allowedOrigins().includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
  res.setHeader('Access-Control-Max-Age', '600');
}

/** Answer CORS preflight before method/body checks. Returns true when handled. */
export function handlePreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
}

export function declaredBodyBytes(req: VercelRequest): number | null {
  const raw = firstHeader(req, 'content-length');
  if (raw === undefined || raw === '') return null;
  const size = Number(raw);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

/** Reject a declared oversized body before parsing/handling it. */
export function rejectOversizedBody(req: VercelRequest, res: VercelResponse, maxBytes: number): boolean {
  const size = declaredBodyBytes(req);
  if (size === null || size <= maxBytes) return false;
  res.status(413).json({ error: 'Payload too large' });
  return true;
}
