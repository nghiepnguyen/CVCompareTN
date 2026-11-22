import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

// Run tests in a non-ICT zone so code that forgets an explicit
// Asia/Ho_Chi_Minh timeZone fails instead of passing on a Vietnam machine.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Vitest 4 shrank the default exclude to node_modules/.git; keep the Vitest 3 list (dist/ etc.).
    exclude: [
      ...configDefaults.exclude,
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
    ],
    // Keep the local .env DSN out of tests; Sentry tests stub their own.
    env: { VITE_SENTRY_DSN: "" },
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, ".") }],
  },
});