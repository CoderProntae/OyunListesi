import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "compare-shots.spec.ts",
  reporter: [["line"]],
  outputDir: "../.cache/compare-artifacts",
  webServer: (base.webServer as any[]).map((s) => ({ ...s, cwd: ".." })),
});
