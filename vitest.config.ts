import { defineConfig } from "vitest/config";
import path from "path";

// Run tests in a non-ICT zone so code that forgets an explicit
// Asia/Ho_Chi_Minh timeZone fails instead of passing on a Vietnam machine.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Keep the local .env DSN out of tests; Sentry tests stub their own.
    env: { VITE_SENTRY_DSN: "" },
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, ".") }],
  },
});