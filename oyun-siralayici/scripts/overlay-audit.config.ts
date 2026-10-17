import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "overlay-audit.spec.ts",
  reporter: [["line"]],
  outputDir: "../.cache/overlay-audit-artifacts",
  webServer: (base.webServer as any[]).map((s) => ({ ...s, cwd: ".." })),
});
