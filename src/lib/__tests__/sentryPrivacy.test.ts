import { afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ nodeInit: vi.fn(), browserInit: vi.fn() }));
vi.mock('@sentry/node', () => ({ getClient: () => undefined, init: sdk.nodeInit }));
vi.mock('@sentry/react', () => ({ init: sdk.browserInit, browserTracingIntegration: () => ({}) }));

import { initSentryServer } from '../../../_server-lib/sentry';
import { initSentry } from '../sentry';

afterEach(() => vi.unstubAllEnvs());

describe('Sentry privacy hooks', () => {
  it('scrubs errors, transactions, spans and breadcrumbs and sends no Logs in both runtimes', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://fixture@example.test/1');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://fixture@example.test/1');
    initSentryServer();
    await initSentry();
    for (const init of [sdk.nodeInit, sdk.browserInit]) {
      const options = init.mock.calls.at(-1)![0];
      expect(options.beforeSend({ extra: { nested: { cvData: 'private' } } }, {})).toEqual({ extra: { nested: { cvData: '[Scrubbed]' } } });
      expect(options.beforeSendTransaction({ request: { url: '/x?email=a@b.co', headers: { authorization: 'Bearer t' } } })).toEqual({ request: { url: '/x?[redacted]', headers: {} } });
      expect(options.beforeSendSpan({ span_id: 'a0912345678b4c5d', data: { note: 'a@b.co' } })).toEqual({ span_id: 'a0912345678b4c5d', data: { note: '[email]' } });
      expect(options.beforeBreadcrumb({ category: 'fetch', data: { url: '/x?token=t' } })).toEqual({ category: 'fetch', data: { url: '/x?[redacted]' } });
      expect(options.enableLogs).toBeUndefined();
      expect(options.beforeSendLog).toBeUndefined();
    }
  });
});
