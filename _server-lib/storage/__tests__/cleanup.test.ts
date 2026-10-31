import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), remove: vi.fn() }));

vi.mock('../../payment/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));

import { runStorageCleanup, validCleanupSecret } from '../cleanup.js';

function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'lt', 'neq', 'lte', 'order', 'limit', 'delete', 'eq', 'update', 'upsert']) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  mocks.from.mockReset().mockReturnValue(chain({ data: [], error: null }));
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.remove.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  delete process.env.STORAGE_CLEANUP_SECRET;
  vi.restoreAllMocks();
});

it('requires a configured strong secret and exact bearer value', () => {
  expect(validCleanupSecret('Bearer x')).toBe(false);
  process.env.STORAGE_CLEANUP_SECRET = 'x';
  expect(validCleanupSecret('Bearer x')).toBe(false);
  process.env.STORAGE_CLEANUP_SECRET = 'x'.repeat(32);
  expect(validCleanupSecret(`Bearer ${'x'.repeat(32)}`)).toBe(true);
  expect(validCleanupSecret(`Bearer ${'x'.repeat(31)}y`)).toBe(false);
});

it('sweeps legacy temp objects that never reached the cleanup queue', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ name: 'user/old-report.pdf' }], error: null });

  const result = await runStorageCleanup();

  expect(mocks.rpc).toHaveBeenCalledWith('list_expired_temp_objects', { p_limit: 100 });
  expect(mocks.remove).toHaveBeenCalledWith(['user/old-report.pdf']);
  expect(result).toEqual({ completed: 0, failed: 0 });
});

it('skips the storage call when nothing is expired', async () => {
  const result = await runStorageCleanup();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(result).toEqual({ completed: 0, failed: 0 });
});

it('keeps cleanup running when the temp sweep lookup fails', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private detail' } });

  const result = await runStorageCleanup();

  expect(mocks.remove).not.toHaveBeenCalled();
  expect(result).toEqual({ completed: 0, failed: 0 });
  expect(errorSpy).toHaveBeenCalledWith('Temp storage sweep failed:', 'Error');
});
