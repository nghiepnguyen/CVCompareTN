import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

// Run tests in a non-ICT zone so code that forgets an explicit
// Asia/Ho_Chi_Minh timeZone fails instead of passing on a Vietnam machine.
process.env.TZ = "UTC";

// Vitest 4 shrank the default exclude to node_modules/.git; keep the Vitest 3 list (dist/ etc.).
export const BASE_EXCLUDE = [
  ...configDefaults.exclude,
  "**/dist/**",
  "**/cypress/**",
  "**/.{idea,git,cache,output,temp}/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
  // Nested agent worktrees are other branches' checkouts, not this tree's tests.
  "**/.claude/**",
];

// M3-B benchmark freeze checks (hashes of scoring files) run only in the
// non-required benchmark-freeze workflow (`npm run test:benchmark`), so an
// edit to a scoring file never blocks unrelated CI. Parity, isolation and
// characterization tests under scripts/m3b-a1 stay in the normal suite.
export const BENCHMARK_FREEZE_TESTS = [
  "scripts/m3b-a1/__tests__/a2Manifest.test.ts",
  "scripts/m3b-a1/__tests__/rubricFreeze.test.ts",
  "scripts/m3b-a1/__tests__/freezeCheck.test.ts",
];

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [...BASE_EXCLUDE, ...BENCHMARK_FREEZE_TESTS],
    // Keep the local .env DSN out of tests; Sentry tests stub their own.
    env: { VITE_SENTRY_DSN: "", SENTRY_DSN: "" },
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, ".") }],
  },
});