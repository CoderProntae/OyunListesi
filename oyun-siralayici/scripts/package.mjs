import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("electron-builder/cli.js"), "--win", "portable", "--x64", "--publish", "never"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_BUILDER_COMPRESSION_LEVEL:
        process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "3",
    },
  },
);
process.exit(result.status ?? 1);
