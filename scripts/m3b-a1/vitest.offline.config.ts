import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

// M3-B A1: the repo's normal vitest config plus the fail-closed offline guard.
export default mergeConfig(
  base,
  defineConfig({
    test: { setupFiles: ['scripts/m3b-a1/offlineGuard.ts'] },
  })
);
