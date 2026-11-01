import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ storage: vi.fn(), cleanup: vi.fn(), secret: vi.fn() }));
vi.mock('../../_server-lib/storage/handler.js', () => ({ handleStorage: mocks.storage }));
vi.mock('../../_server-lib/storage/cleanup.js', () => ({ runStorageCleanup: mocks.cleanup, validCleanupSecret: mocks.secret }));
vi.mock('../../_server-lib/sentry.js', () => ({ initSentryServer: vi.fn(), Sentry: { captureException: vi.fn(), flush: vi.fn() } }));
import handler from '../extract-pdf.js';
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse; }
beforeEach(() => vi.clearAllMocks());
it('dispatches storage through the existing PDF function and disables caching', async () => {
  const res = response(); mocks.storage.mockResolvedValue({ status: 200, body: { ok: true } });
  const req = { method: 'POST', query: { resource: 'storage' }, headers: { authorization: 'Bearer token' }, body: { action: 'upload' } } as unknown as VercelRequest;
  await handler(req, res);
  expect(mocks.storage).toHaveBeenCalledWith('Bearer token', req.body);
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
});
it('does not run cleanup with a user token or absent scheduler secret', async () => {
  const res = response(); mocks.secret.mockReturnValue(false);
  await handler({ method: 'GET', query: { resource: 'storage', action: 'cleanup' }, headers: { authorization: 'Bearer user-token' } } as unknown as VercelRequest, res);
  expect(res.status).toHaveBeenCalledWith(401); expect(mocks.cleanup).not.toHaveBeenCalled();
});
it('runs scheduled cleanup only with its separate verified secret', async () => {
  const res = response(); mocks.secret.mockReturnValue(true); mocks.cleanup.mockResolvedValue({ completed: 1, failed: 0 });
  await handler({ method: 'GET', query: { resource: 'storage', action: 'cleanup' }, headers: { authorization: 'Bearer scheduler-secret' } } as unknown as VercelRequest, res);
  expect(mocks.cleanup).toHaveBeenCalledOnce(); expect(res.status).toHaveBeenCalledWith(200);
});

it('reports retry failures to the scheduler as a failed run', async () => {
  const res = response(); mocks.secret.mockReturnValue(true); mocks.cleanup.mockResolvedValue({ completed: 0, failed: 1 });
  await handler({ method: 'GET', query: { resource: 'storage', action: 'cleanup' }, headers: { authorization: 'Bearer scheduler-secret' } } as unknown as VercelRequest, res);
  expect(res.status).toHaveBeenCalledWith(503);
});
