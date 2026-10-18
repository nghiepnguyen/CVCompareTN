import { defineConfig } from "vitest/config";
import path from "path";

// Run tests in a non-ICT zone so code that forgets an explicit
// Asia/Ho_Chi_Minh timeZone fails instead of passing on a Vietnam machine.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, ".") }],
  },
});