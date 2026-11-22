// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest';
import { MARK, startCollector } from './sentryCollector';

let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
afterAll(async () => {
  vi.unstubAllEnvs();
  await collector?.close();
});

it('tags the Vercel Production bundle as production with the commit SHA', async () => {
  collector = await startCollector();
  expect(new URL(collector.dsn).hostname).toBe('127.0.0.1');
  vi.stubEnv('VITE_SENTRY_DSN', collector.dsn);
  vi.stubEnv('VITE_VERCEL_ENV', 'production');
  vi.stubEnv('VITE_VERCEL_GIT_COMMIT_SHA', MARK.sha);
  const { initSentry, captureException } = await import('../sentry');
  await initSentry();
  captureException(new Error('sec2_env_probe'));
  const Sentry = await import('@sentry/react');
  await new Promise((resolve) => setTimeout(resolve, 50));
  await Sentry.flush(5000);
  const [event] = collector.items('event');
  expect(event).toMatchObject({ environment: 'production', release: MARK.sha });
});
