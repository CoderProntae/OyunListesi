import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  workers: 1,
  fullyParallel: false,
  timeout: 35000,
  expect: { timeout: 7000 },
  reporter: [["list"], ["json", { outputFile: ".cache/ui-results.json" }]],
  outputDir: ".cache/ui-artifacts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1510, height: 960 },
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--no-sandbox"] },
  },
  webServer: [
    {
      command: "npm run preview:server",
      url: "http://127.0.0.1:4317/api/health",
      reuseExistingServer: true,
      timeout: 20000,
    },
    // The production bundle (own folder, never the packaged dist/): pages load
    // in a fraction of the dev server's time.
    {
      command:
        "npx vite build --outDir .cache/ui-dist --emptyOutDir --logLevel error && npx vite preview --outDir .cache/ui-dist --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 90000,
    },
  ],
});
