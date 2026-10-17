import fs from "node:fs";
import { build } from "esbuild";
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "electron-dist/main.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  minify: false,
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "electron-dist/preload.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["electron/overlay-preload.ts"],
  outfile: "electron-dist/overlay-preload.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["electron/browser-preload.ts"],
  outfile: "electron-dist/browser-preload.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});

await build({
  entryPoints: ["electron/browser-ui.ts"],
  outfile: "electron-dist/browser-ui.js",
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
});
fs.copyFileSync("electron/browser.html", "electron-dist/browser.html");
