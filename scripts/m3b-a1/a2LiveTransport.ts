// M3-B A2 live transport (A2-P). NOT wired to any live entry point: runBenchmark
// refuses mode 'live' while LIVE_ENABLED is false. Plain fetch, no SDK (no SDK
// retries, no credential discovery), exact URL allowlist, redirects refused,
// request/response size bounds, abort via the caller's signal, no retries.
// Tested only with an injected fetch (a2LiveTransport.test.ts).
import { readFileSync, statSync } from 'node:fs';
import { ALLOWED_URL, type Transport } from './a2Runner';

export const MAX_REQUEST_BYTES = 256 * 1024;
/** 65,536 output tokens of JSON text stay well under this; anything larger is not a valid analyze response. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/** Google API keys: "AIza" + 35 URL-safe chars. Anything else is refused. */
const KEY_SHAPE = /^AIza[0-9A-Za-z_-]{35}$/;

export class TransportRefusal extends Error {
  constructor(m: string) { super(`[a2-transport] ${m}`); this.name = 'TransportRefusal'; }
}

/**
 * Dedicated benchmark key from an owner-provisioned file (never env, never the
 * production key). The file must be a regular file readable by its owner only.
 */
export function loadBenchmarkKey(path: string): string {
  const st = statSync(path);
  if (!st.isFile()) throw new TransportRefusal('key path is not a regular file');
  if ((st.mode & 0o077) !== 0) throw new TransportRefusal('key file must be mode 0400/0600 (no group/other access)');
  const key = readFileSync(path, 'utf8').trim();
  if (!KEY_SHAPE.test(key)) throw new TransportRefusal('key file does not contain one Google API key');
  return key;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createLiveTransport(opts: { key: string; fetchImpl?: FetchLike }): Transport {
  if (!KEY_SHAPE.test(opts.key)) throw new TransportRefusal('invalid key shape');
  const doFetch: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  return {
    async send(url, body, signal) {
      if (url !== ALLOWED_URL) throw new TransportRefusal(`url not allowlisted: ${url}`);
      const payload = JSON.stringify(body);
      if (Buffer.byteLength(payload, 'utf8') > MAX_REQUEST_BYTES) throw new TransportRefusal('request too large');
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.key },
        body: payload,
        redirect: 'error',
        signal,
      });
      if (res.redirected || (res.url && res.url !== url)) throw new TransportRefusal('response came from another URL');
      const text = await readBounded(res, MAX_RESPONSE_BYTES);
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { /* non-JSON body: runner fails closed on missing usage */ }
      return { status: res.status, json };
    },
  };
}

async function readBounded(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > max) throw new TransportRefusal('response too large (content-length)');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new TransportRefusal('response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
