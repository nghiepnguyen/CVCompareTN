// Real @sentry/node → local collector. Asserts on the serialized outbound envelopes, not in-memory events.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { leaksIn, MARK, startCollector } from '../../src/lib/__tests__/sentryCollector.js';

type Collector = Awaited<ReturnType<typeof startCollector>>;
let collector: Collector;
let options: Record<string, unknown>;

beforeAll(async () => {
  collector = await startCollector();
  expect(new URL(collector.dsn).hostname).toBe('127.0.0.1');
  vi.stubEnv('SENTRY_DSN', collector.dsn);
  vi.stubEnv('NODE_ENV', 'production'); // what Vercel sets in Preview too
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', MARK.sha);
  vi.spyOn(Math, 'random').mockReturnValue(0); // force trace sampling so transactions are emitted

  const { initSentryServer, Sentry } = await import('../sentry.js');
  const { parseRewriteText } = await import('../ai/rewriteService.js');
  // Init before the server exists: the worst case (Express preload), where request bodies are instrumented.
  initSentryServer();
  options = Sentry.getClient()!.getOptions() as unknown as Record<string, unknown>;

  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    console.log(`welcome email sent to ${MARK.email}`);
    console.warn('Candidate ownership check failed:', `phone ${MARK.phone}`);
    console.error('Profile deletion failed:', { code: '23505', message: 'duplicate key', details: `Key (email)=(${MARK.email}) already exists.` });
    console.error('CV parsing failed:', new Error(`upstream rejected ${MARK.email}`));
    Sentry.captureException(new Error(`User ${MARK.email} not found (phone ${MARK.phone})`), { tags: { route: 'analyze' } });
    try {
      parseRewriteText(`note {"fullRewrittenCV": "${MARK.cv}" trailing}`);
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'rewrite-cv' } });
    }
    Sentry.captureMessage('quota_commit_failed', { level: 'error', tags: { route: 'analyze' } });
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"x"}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}/api/analyze?email=${encodeURIComponent(MARK.email)}&access_token=${MARK.jwt}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MARK.jwt}`,
      cookie: `sb-access-token=${MARK.jwt}; theme=dark-sec2`,
      'content-type': 'application/json',
      'x-forwarded-for': MARK.ip,
      'x-custom-secret': 'custom-header-sec2',
    },
    body: JSON.stringify({ cvText: `${MARK.cv} ${'x'.repeat(30_000)}`, jd: MARK.jd, email: MARK.email }),
  });
  await new Promise((resolve) => setTimeout(resolve, 200)); // let the server span end
  await Sentry.flush(5000);
  server.close();
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await collector.close();
});

describe('server Sentry envelopes (Preview)', () => {
  it('delivers errors, a message and a transaction (positive control)', () => {
    expect(collector.items('event').length).toBeGreaterThanOrEqual(3);
    expect(collector.items('transaction').length).toBeGreaterThanOrEqual(1);
  });

  it('contains none of the sensitive markers anywhere in the raw envelopes', () => {
    expect(leaksIn(collector.raw())).toEqual([]);
    for (const fragment of ['theme=dark-sec2', 'custom-header-sec2', 'x'.repeat(200)]) expect(collector.raw()).not.toContain(fragment);
  });

  it('forwards no console output as Sentry Logs', () => {
    expect(collector.items('log')).toEqual([]);
  });

  it('server session aggregates carry only counts, release and environment', () => {
    for (const s of collector.items('sessions')) {
      expect(Object.keys(s).sort()).toEqual(['aggregates', 'attrs']);
      expect(s.attrs).toEqual({ release: MARK.sha, environment: 'preview' });
    }
  });

  it('keeps redacted diagnostics in exception values', () => {
    const values = collector.items('event').flatMap((e) => e.exception?.values?.map((v: { value: string }) => v.value) ?? []);
    expect(values).toContain('User [email] not found (phone [phone])');
    expect(values).toContain('Malformed JSON in Gemini response');
  });

  it('keeps categorical messages and tags unchanged', () => {
    const message = collector.items('event').find((e) => e.message === 'quota_commit_failed');
    expect(message?.level).toBe('error');
    expect(message?.tags).toMatchObject({ route: 'analyze' });
  });

  it('rebuilds console breadcrumbs from allowlisted arguments only', () => {
    const crumbs = collector.items('event').flatMap((e) => e.breadcrumbs ?? []).filter((b: { category?: string }) => b.category === 'console');
    const messages = crumbs.map((b: { message: string }) => b.message);
    expect(messages).toContain('Profile deletion failed: [code=23505]');
    expect(messages).toContain('CV parsing failed: Error: upstream rejected [email]');
    expect(crumbs.every((b: { data?: { arguments?: unknown } }) => b.data?.arguments === undefined)).toBe(true);
  });

  it('sends only allowlisted request metadata on events and transactions', () => {
    const payloads = [...collector.items('event'), ...collector.items('transaction')].filter((p) => p.request);
    expect(payloads.length).toBeGreaterThan(0);
    for (const { request } of payloads) {
      expect(Object.keys(request).every((k) => ['method', 'url', 'headers'].includes(k))).toBe(true);
      expect(Object.keys(request.headers ?? {}).every((k) => ['user-agent', 'content-type', 'content-length', 'accept-language'].includes(k.toLowerCase()))).toBe(true);
      expect(request.url).not.toMatch(/\?(?!\[redacted\])/);
    }
    for (const t of collector.items('transaction')) {
      for (const [key, value] of Object.entries(t.contexts.trace.data ?? {})) {
        if (/ip$|address$|addr$/.test(key)) expect([key, value]).toEqual([key, "[Scrubbed]"]);
      }
    }
  });

  it('tags everything preview with the exact release SHA', () => {
    for (const p of [...collector.items('event'), ...collector.items('transaction')]) {
      expect(p.environment).toBe('preview');
      expect(p.release).toBe(MARK.sha);
    }
    for (const e of collector.envelopes) {
      if (e.header.trace) expect(e.header.trace).toMatchObject({ environment: 'preview', release: MARK.sha });
    }
  });

  it('leaves trace and span ids valid and linked', () => {
    for (const t of collector.items('transaction')) {
      const { trace_id, span_id } = t.contexts.trace;
      expect(trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(span_id).toMatch(/^[0-9a-f]{16}$/);
      const ids = new Set([span_id, ...(t.spans ?? []).map((s: { span_id: string }) => s.span_id)]);
      for (const s of t.spans ?? []) {
        expect(s.span_id).toMatch(/^[0-9a-f]{16}$/);
        expect(s.trace_id).toBe(trace_id);
        expect(ids.has(s.parent_span_id)).toBe(true);
      }
    }
  });

  it('turns off SDK-side collection of PII, bodies, headers, AI I/O and frame variables', () => {
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      queryParams: false,
      httpBodies: [],
      httpHeaders: { request: { allow: ['user-agent', 'content-type', 'content-length', 'accept-language'] }, response: { allow: ['content-type', 'content-length'] } },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    });
    expect(options.enableLogs).toBeFalsy();
    expect((options.integrations as { name: string }[]).map((i) => i.name)).not.toContain('ConsoleLogs');
  });
});
