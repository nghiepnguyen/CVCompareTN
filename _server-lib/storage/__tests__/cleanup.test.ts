import { afterEach, expect, it } from 'vitest';
import { validCleanupSecret } from '../cleanup.js';
afterEach(() => { delete process.env.STORAGE_CLEANUP_SECRET; });
it('requires a configured strong secret and exact bearer value', () => {
  expect(validCleanupSecret('Bearer x')).toBe(false);
  process.env.STORAGE_CLEANUP_SECRET = 'x';
  expect(validCleanupSecret('Bearer x')).toBe(false);
  process.env.STORAGE_CLEANUP_SECRET = 'x'.repeat(32);
  expect(validCleanupSecret(`Bearer ${'x'.repeat(32)}`)).toBe(true);
  expect(validCleanupSecret(`Bearer ${'x'.repeat(31)}y`)).toBe(false);
});
