import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup-offline.ts"],
    // Two CPUs in the build sandbox.
    maxWorkers: 2,
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
