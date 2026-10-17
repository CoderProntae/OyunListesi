import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "ui-audit.spec.ts",
  reporter: [["line"]],
  outputDir: "../.cache/audit-artifacts",
  webServer: (base.webServer as any[]).map((s) => ({ ...s, cwd: ".." })),
});
