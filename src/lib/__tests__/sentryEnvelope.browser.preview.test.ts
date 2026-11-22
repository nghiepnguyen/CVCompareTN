// @vitest-environment jsdom
// Real @sentry/react → local collector. Asserts on the serialized outbound envelopes, not in-memory events.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { leaksIn, MARK, startCollector } from './sentryCollector';

type Collector = Awaited<ReturnType<typeof startCollector>>;
let collector: Collector;
let options: Record<string, unknown>;
let browserSession: unknown;

beforeAll(async () => {
  collector = await startCollector();
  expect(new URL(collector.dsn).hostname).toBe('127.0.0.1');
  vi.stubEnv('VITE_SENTRY_DSN', collector.dsn);
  vi.stubEnv('VITE_VERCEL_ENV', 'preview');
  vi.stubEnv('VITE_VERCEL_GIT_COMMIT_SHA', MARK.sha);
  vi.spyOn(Math, 'random').mockReturnValue(0); // force trace sampling

  // Supabase implicit-flow OAuth return: tokens in the fragment.
  history.replaceState({}, '', `/auth/callback#access_token=${MARK.jwt}&refresh_token=rt-sec2-private`);
  const { initSentry, captureException } = await import('../sentry');
  const sdk = await initSentry();
  expect(sdk).not.toBeNull();
  const Sentry = await import('@sentry/react');
  options = Sentry.getClient()!.getOptions() as unknown as Record<string, unknown>;
  browserSession = Sentry.getClient()!.getIntegrationByName('BrowserSession');

  console.log(`user signed in ${MARK.email}`);
  console.warn('profile loaded', { email: MARK.email, phone: MARK.phone });
  console.error('Lỗi khi gửi email chào mừng:', new Error(`resend rejected ${MARK.email}`));
  history.pushState({}, '', `/vi/app?email=${encodeURIComponent(MARK.email)}`);
  await fetch(`${collector.base}/probe?email=${encodeURIComponent(MARK.email)}&token=${MARK.jwt}`);

  Sentry.startSpan({ name: 'sec2-browser-span', op: 'ui.action', parentSpan: null, attributes: { 'url.full': `${location.origin}/vi/app?email=${MARK.email}`, note: `call ${MARK.phone}` } }, () => {});
  captureException(new Error(`Cannot load profile for ${MARK.email} ${MARK.phone}`));
  captureException(new Error(`Supabase: Key (email)=(${MARK.email}) already exists.`));
  try {
    JSON.parse(`Nguyen Van Sec2 ${MARK.email}`);
  } catch (err) {
    captureException(err);
  }
  captureException(new Error('Load failed (lh3.googleusercontent.com)')); // classification: must stay dropped
  await new Promise((resolve) => setTimeout(resolve, 200));
  await Sentry.flush(5000);
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await collector.close();
});

describe('browser Sentry envelopes (Preview)', () => {
  it('delivers error events and a transaction (positive control)', () => {
    expect(collector.items('event').length).toBe(3);
    expect(collector.items('transaction').length).toBeGreaterThanOrEqual(1);
  });

  it('contains none of the sensitive markers anywhere in the raw envelopes', () => {
    expect(leaksIn(collector.raw())).toEqual([]);
    expect(collector.raw()).not.toContain('rt-sec2-private');
  });

  it('does not install the BrowserSession integration', () => {
    expect(browserSession).toBeUndefined();
  });

  it('sends no Release Health session envelopes', () => {
    expect([...collector.items('session'), ...collector.items('sessions')]).toEqual([]);
  });

  it('forwards no console output as Sentry Logs', () => {
    expect(collector.items('log')).toEqual([]);
  });

  it('keeps redacted diagnostics and still drops classified noise', () => {
    const values = collector.items('event').flatMap((e) => e.exception.values.map((v: { value: string }) => v.value));
    expect(values).toContain('Cannot load profile for [email] [phone]');
    expect(values).toContain('Supabase: Key (email)=([email]) already exists.');
    expect(values.some((v: string) => v.startsWith('Unexpected token') && v.includes('"[redacted]" is not valid JSON'))).toBe(true);
    expect(values.some((v: string) => v.includes('Load failed'))).toBe(false);
  });

  it('strips query strings and OAuth fragments from URLs and breadcrumbs', () => {
    const [event] = collector.items('event');
    expect(event.request.url).toMatch(/\/vi\/app\?\[redacted\]$/);
    const nav = event.breadcrumbs.find((b: { category: string }) => b.category === 'navigation');
    expect(nav.data.from).toMatch(/\/auth\/callback\?\[redacted\]$/);
    const fetchCrumb = event.breadcrumbs.find((b: { category: string; data?: { url?: string } }) => b.category === 'fetch' && b.data?.url?.includes('/probe'));
    expect(fetchCrumb.data.url).toMatch(/\/probe\?\[redacted\]$/);
  });

  it('rebuilds console breadcrumbs from allowlisted arguments only', () => {
    const [event] = collector.items('event');
    const crumbs = event.breadcrumbs.filter((b: { category: string }) => b.category === 'console');
    const messages = crumbs.map((b: { message: string }) => b.message);
    expect(messages).toContain('user signed in [email]');
    expect(messages).toContain('profile loaded');
    expect(messages).toContain('Lỗi khi gửi email chào mừng: Error: resend rejected [email]');
    expect(crumbs.every((b: { data?: { arguments?: unknown } }) => b.data?.arguments === undefined)).toBe(true);
  });

  it('tags preview with the exact release and keeps ids valid', () => {
    for (const p of [...collector.items('event'), ...collector.items('transaction')]) {
      expect(p.environment).toBe('preview');
      expect(p.release).toBe(MARK.sha);
    }
    const span = collector.items('transaction').find((t) => t.transaction === 'sec2-browser-span');
    expect(span.contexts.trace.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(span.contexts.trace.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(span.contexts.trace.data['url.full']).toMatch(/\/vi\/app\?\[redacted\]$/);
    expect(span.contexts.trace.data.note).toBe('call [phone]');
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
  });
});
