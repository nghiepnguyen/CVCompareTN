// M3-B A1 offline guard (vitest setupFiles). Fail closed: provider/DB secrets
// must be absent, and every non-loopback network path throws. Not imported by
// production code; used only by scripts/m3b-a1/vitest.offline.config.ts.
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { appendFileSync } from 'node:fs';

export const FORBIDDEN_ENV = /^(GEMINI|GOOGLE_API|GOOGLE_APPLICATION|SUPABASE|VITE_SUPABASE|RESEND|PAYOS|R2_|RECAPTCHA|VERCEL_|CLOUDFLARE|SENTRY_AUTH)/;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '']);
const hostname = (u: string) => { try { return new URL(u).hostname.replace(/^\[|\]$/g, ''); } catch { return 'invalid'; } };

// Local-DB mode (A1.1 R3/R4 reproduction): only a disposable local Supabase stack
// on loopback, with the CLI's well-known demo keys (JWT iss "supabase-demo").
const LOCAL_DB_ENV = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
const isDemoKey = (jwt: string | undefined) => {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString()).iss === 'supabase-demo'; } catch { return false; }
};
export const LOCAL_DB_MODE = process.env.M3B_LOCAL_DB === '1';
if (LOCAL_DB_MODE) {
  if (!LOOPBACK.has(hostname(process.env.SUPABASE_URL ?? ''))) throw new Error('[m3b-offline-guard] M3B_LOCAL_DB=1 but SUPABASE_URL is not loopback');
  if (!isDemoKey(process.env.SUPABASE_ANON_KEY) || !isDemoKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('[m3b-offline-guard] M3B_LOCAL_DB=1 but keys are not local demo keys');
  }
}

const present = Object.keys(process.env).filter((k) => FORBIDDEN_ENV.test(k) && process.env[k] && !(LOCAL_DB_MODE && LOCAL_DB_ENV.has(k)));
if (present.length) {
  throw new Error(`[m3b-offline-guard] refusing to run: secret-like env present: ${present.join(', ')}`);
}
const log = (what: string) => {
  const file = process.env.M3B_GUARD_LOG;
  if (file) appendFileSync(file, `${new Date().toISOString()} BLOCKED ${what}\n`);
};

export class OfflineGuardError extends Error {
  constructor(what: string) {
    super(`[m3b-offline-guard] network blocked: ${what}`);
    this.name = 'OfflineGuardError';
  }
}

const block = (what: string): never => {
  log(what);
  throw new OfflineGuardError(what);
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as { url?: string })?.url ?? input);
  // Loopback fetch only in local-DB mode; everything else always throws.
  if (LOCAL_DB_MODE && LOOPBACK.has(hostname(url))) return realFetch(input as RequestInfo, init);
  return block(`fetch ${url}`);
}) as typeof fetch;

const hostOf = (args: unknown[]): string | undefined => {
  const a0 = args[0] as { host?: string; path?: string } | number | string | undefined;
  if (Array.isArray(a0)) return hostOf(a0);
  if (typeof a0 === 'object' && a0) return a0.path ? 'unix' : (a0.host ?? 'localhost');
  if (typeof a0 === 'number') return typeof args[1] === 'string' ? (args[1] as string) : 'localhost';
  if (typeof a0 === 'string') return 'unix';
  return undefined;
};

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const host = hostOf(args);
  if (host !== 'unix' && !LOOPBACK.has(host ?? '')) block(`socket ${host}`);
  return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;

const origTls = tls.connect;
(tls as { connect: unknown }).connect = (...args: unknown[]) => {
  const opts = args.find((a) => typeof a === 'object' && a) as { host?: string; servername?: string } | undefined;
  const host = opts?.host ?? opts?.servername ?? (typeof args[1] === 'string' ? args[1] : undefined);
  if (!LOOPBACK.has(host ?? '')) block(`tls ${host}`);
  return (origTls as (...a: unknown[]) => unknown)(...args);
};

const origLookup = dns.lookup;
(dns as { lookup: unknown }).lookup = (host: string, ...rest: unknown[]) => {
  if (!LOOPBACK.has(host)) block(`dns ${host}`);
  return (origLookup as (...a: unknown[]) => unknown)(host, ...rest);
};

(globalThis as { __M3B_OFFLINE_GUARD__?: boolean }).__M3B_OFFLINE_GUARD__ = true;
