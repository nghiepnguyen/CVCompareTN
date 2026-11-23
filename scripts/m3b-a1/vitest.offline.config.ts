import { defineConfig, mergeConfig } from 'vitest/config';
import base, { BASE_EXCLUDE } from '../../vitest.config';

// M3-B A1: the repo's normal vitest config plus the fail-closed offline guard.
// The normal suite excludes the benchmark freeze tests; this config (used by
// `npm run test:benchmark`) puts them back.
const merged = mergeConfig(
  base,
  defineConfig({
    test: { setupFiles: ['scripts/m3b-a1/offlineGuard.ts'] },
  })
);
(merged.test ??= {}).exclude = [...BASE_EXCLUDE];
export default merged;
