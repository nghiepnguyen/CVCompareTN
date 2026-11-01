import { afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ nodeInit: vi.fn(), browserInit: vi.fn() }));
vi.mock('@sentry/node', () => ({ getClient: () => undefined, init: sdk.nodeInit, consoleLoggingIntegration: () => ({}) }));
vi.mock('@sentry/react', () => ({ init: sdk.browserInit, browserTracingIntegration: () => ({}), consoleLoggingIntegration: () => ({}) }));

import { initSentryServer } from '../../../_server-lib/sentry';
import { initSentry } from '../sentry';

afterEach(() => vi.unstubAllEnvs());

describe('Sentry privacy hooks', () => {
  it('scrubs nested error events and structured logs in both runtimes', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://fixture@example.test/1');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://fixture@example.test/1');
    initSentryServer();
    await initSentry();
    for (const init of [sdk.nodeInit, sdk.browserInit]) {
      const options = init.mock.calls.at(-1)![0];
      const event = { extra: { nested: { cvData: 'private' } } };
      expect(options.beforeSend(event, {})).toEqual({ extra: { nested: { cvData: '[Scrubbed]' } } });
      expect(options.beforeSendLog({ attributes: { nested: { jd: 'private' } } })).toEqual({ attributes: { nested: { jd: '[Scrubbed]' } } });
    }
  });
});
