import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveTransport, loadBenchmarkKey, MAX_RESPONSE_BYTES, MAX_REQUEST_BYTES, TransportRefusal } from '../a2LiveTransport';
import { ALLOWED_URL, buildRequest, runBenchmark, configHash } from '../a2Runner';
import { A2_FIXTURES } from '../a2Fixtures';

// Synthetic key built at runtime (not a real credential, no literal in the repo).
const FAKE_KEY = 'AIza' + 'Q'.repeat(35);
type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  return { calls, fetchImpl: async (url: string, init: RequestInit) => { const c = { url, init }; calls.push(c); return respond(c); } };
}
const json = (o: unknown, init: ResponseInit = { status: 200 }) => new Response(JSON.stringify(o), { ...init, headers: { 'content-type': 'application/json' } });
const body = buildRequest(A2_FIXTURES[0], '11/2026').body;

describe('A2 live transport (mock fetch only)', () => {
  it('sends exactly one POST to the allowlisted URL with the key header, redirect:error, and the given signal', async () => {
    const f = fakeFetch(() => json({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }));
    const signal = new AbortController().signal;
    const r = await createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(ALLOWED_URL, body, signal);
    expect(r.status).toBe(200);
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe(ALLOWED_URL);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBe(signal);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY);
    expect(JSON.parse(String(init.body))).toEqual(body); // byte-equivalent production contract preserved
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it.each([
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    'https://generativelanguage.googleapis.com/v1/models/gemini-3-flash-preview:generateContent',
    'https://evil.example/v1beta/models/gemini-3-flash-preview:generateContent',
    ALLOWED_URL + '?alt=sse',
  ])('refuses non-allowlisted URL %s before any fetch (no model/provider fallback)', async (url) => {
    const f = fakeFetch(() => json({}));
    await expect(createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(url, body, new AbortController().signal)).rejects.toThrow(TransportRefusal);
    expect(f.calls).toHaveLength(0);
  });

  it('refuses an oversized request before any fetch', async () => {
    const f = fakeFetch(() => json({}));
    const big = { contents: [{ role: 'user', parts: [{ text: 'x'.repeat(MAX_REQUEST_BYTES) }] }] };
    await expect(createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(ALLOWED_URL, big, new AbortController().signal)).rejects.toThrow(/too large/);
    expect(f.calls).toHaveLength(0);
  });

  it('refuses an oversized response (declared and streamed)', async () => {
    const t = createLiveTransport({ key: FAKE_KEY, fetchImpl: fakeFetch(() => new Response('x', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } })).fetchImpl });
    await expect(t.send(ALLOWED_URL, body, new AbortController().signal)).rejects.toThrow(/too large/);
    const t2 = createLiveTransport({ key: FAKE_KEY, fetchImpl: fakeFetch(() => new Response('y'.repeat(MAX_RESPONSE_BYTES + 10))).fetchImpl });
    await expect(t2.send(ALLOWED_URL, body, new AbortController().signal)).rejects.toThrow(/too large/);
  });

  it('a redirected response is refused', async () => {
    const res = json({});
    Object.defineProperty(res, 'redirected', { value: true });
    await expect(createLiveTransport({ key: FAKE_KEY, fetchImpl: fakeFetch(() => res).fetchImpl }).send(ALLOWED_URL, body, new AbortController().signal)).rejects.toThrow(/another URL/);
  });

  it('abort propagates as a rejection (the runner then records an unknown outcome)', async () => {
    const ctrl = new AbortController();
    const f = fakeFetch(({ init }) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const p = createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(ALLOWED_URL, body, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow(/aborted/);
  });

  it('timeout: AbortSignal.timeout fires and rejects without retry', async () => {
    const f = fakeFetch(({ init }) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));
    await expect(createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(ALLOWED_URL, body, AbortSignal.timeout(20))).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });

  it('non-JSON body → json null; HTTP status passed through untouched (no retry inside transport)', async () => {
    const f = fakeFetch(() => new Response('<html>oops</html>', { status: 503 }));
    const r = await createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }).send(ALLOWED_URL, body, new AbortController().signal);
    expect(r).toEqual({ status: 503, json: null });
    expect(f.calls).toHaveLength(1);
  });

  it('runner + live transport over mock fetch: a 200 without usage fails closed (accounting_uncertain)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm3b-lt-'));
    const f = fakeFetch(() => json({ candidates: [] }));
    const r = await runBenchmark({
      stage: 'A2.0', fixtures: A2_FIXTURES, runsPerFixture: 5, maxAttempts: 24, maxRetries: 4, budgetUsd: 5, currentMonth: '11/2026',
      expectedConfigHash: configHash('11/2026'), ledgerPath: join(dir, 'l.jsonl'), writeArtifact: () => 'sha',
      transport: createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }), mode: 'mock',
    });
    expect(r.stop).toBe('accounting_uncertain');
    expect(f.calls).toHaveLength(1);
  });

  it('runner still refuses live mode (LIVE_ENABLED=false) even with a real-looking transport', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm3b-lt-'));
    const f = fakeFetch(() => json({}));
    const r = await runBenchmark({
      stage: 'A2.0', fixtures: A2_FIXTURES, runsPerFixture: 5, maxAttempts: 24, maxRetries: 4, budgetUsd: 5, currentMonth: '11/2026',
      expectedConfigHash: configHash('11/2026'), ledgerPath: join(dir, 'l.jsonl'), writeArtifact: () => 'sha',
      transport: createLiveTransport({ key: FAKE_KEY, fetchImpl: f.fetchImpl }), mode: 'live', codeSha: 'a'.repeat(40),
      authorization: { executionSha: 'a'.repeat(40), executionApprovalRef: 'x', costBoundRef: 'x', labelsRef: 'x', hostRef: 'x' },
    });
    expect(r.stop).toBe('live_disabled');
    expect(f.calls).toHaveLength(0);
  });
});

describe('dedicated benchmark key loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm3b-key-'));
  const write = (name: string, content: string, mode: number) => { const p = join(dir, name); writeFileSync(p, content); chmodSync(p, mode); return p; };

  it('accepts an owner-only file containing one Google API key', () => {
    expect(loadBenchmarkKey(write('ok', FAKE_KEY + '\n', 0o400))).toBe(FAKE_KEY);
  });
  it('refuses group/other-readable files', () => {
    expect(() => loadBenchmarkKey(write('wide', FAKE_KEY, 0o644))).toThrow(/0400/);
  });
  it('refuses malformed content and directories', () => {
    expect(() => loadBenchmarkKey(write('bad', 'not-a-key', 0o600))).toThrow(/one Google API key/);
    const d = join(dir, 'd'); mkdirSync(d);
    expect(() => loadBenchmarkKey(d)).toThrow(/regular file/);
  });
  it('the transport never reads process.env for credentials', () => {
    const src = readFileSync('scripts/m3b-a1/a2LiveTransport.ts', 'utf8');
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/@google\/genai/);
  });
});
