import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ loaded: vi.fn(), init: vi.fn(), setUser: vi.fn(), captureException: vi.fn() }));
vi.mock('@sentry/react', () => {
  sdk.loaded();
  return { ...sdk, browserTracingIntegration: () => ({}), consoleLoggingIntegration: () => ({}) };
});

beforeEach(() => {
  vi.resetModules();
  Object.values(sdk).forEach((fn) => fn.mockClear());
  vi.stubEnv('VITE_SENTRY_DSN', 'https://fixture@example.test/1');
});
afterEach(() => vi.unstubAllEnvs());

it('does not load the SDK for a user change, but applies the user once it loads', async () => {
  const { setSentryUser, initSentry } = await import('../sentry');
  setSentryUser('user-1');
  await Promise.resolve();
  expect(sdk.loaded).not.toHaveBeenCalled();
  await initSentry();
  expect(sdk.init).toHaveBeenCalledOnce();
  expect(sdk.setUser).toHaveBeenCalledWith({ id: 'user-1' });
});

it('loads and initializes the SDK before forwarding a captured error', async () => {
  const { captureException } = await import('../sentry');
  const err = new Error('boom');
  captureException(err, { tags: { feature: 'x' } });
  await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(err, { tags: { feature: 'x' } }));
  expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(sdk.captureException.mock.invocationCallOrder[0]);
});

it('never imports the SDK without a DSN', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', '');
  const { initSentry, captureException } = await import('../sentry');
  captureException(new Error('x'));
  await expect(initSentry()).resolves.toBeNull();
  expect(sdk.loaded).not.toHaveBeenCalled();
});
