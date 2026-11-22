// Separate file: initSentryServer keeps the first client, so each environment needs its own process.
import { afterAll, expect, it, vi } from 'vitest';
import { MARK, startCollector } from '../../src/lib/__tests__/sentryCollector.js';

let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
afterAll(async () => {
  vi.unstubAllEnvs();
  await collector?.close();
});

it('tags Vercel Production events as production with the commit SHA', async () => {
  collector = await startCollector();
  expect(new URL(collector.dsn).hostname).toBe('127.0.0.1');
  vi.stubEnv('SENTRY_DSN', collector.dsn);
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', MARK.sha);
  const { initSentryServer, Sentry } = await import('../sentry.js');
  initSentryServer();
  Sentry.captureMessage('sec2_env_probe');
  await Sentry.flush(5000);
  const [event] = collector.items('event');
  expect(event).toMatchObject({ message: 'sec2_env_probe', environment: 'production', release: MARK.sha });
});
