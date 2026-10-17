#!/usr/bin/env node
// One command for a whole release (build sandbox only, not shipped):
//
//   node scripts/release.mjs <version> [--ui all|none|<spec,...>] [--audit]
//                            [--smokes all|none|<name,...>] [--publish] [--serial]
// (refreshes shared/hardware-db.json first — scripts/hardware-data.ts)
//
// version bump → typecheck ∥ unit tests → UI tests (production bundle) →
// build → package ∥ Electron smokes → package check → EXE to the workspace
// root + BUILD-INFO → (--publish) update channel → cleanup.
// Logs: .cache/release-logs/<step>.log (the tail is printed when a step fails).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(root, "..");
process.chdir(root);
const argv = process.argv.slice(2);
const version = argv.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const option = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
if (!version) {
  console.error("Kullanım: node scripts/release.mjs <sürüm> [--ui all|none|a.spec.ts,...] [--audit] [--smokes all|none|ad,...] [--publish] [--serial]");
  process.exit(2);
}
const ui = String(option("ui", "all"));
const smokesOpt = String(option("smokes", "default"));
const publish = argv.includes("--publish");
const serial = argv.includes("--serial");
const SMOKES_DEFAULT = ["electron", "research", "upgrade", "browser", "resume", "handoff"];
const SMOKES_ALL = [...SMOKES_DEFAULT, "overlay", "catalog-ui", "katman"];
const smokes =
  smokesOpt === "none"
    ? []
    : smokesOpt === "all"
      ? SMOKES_ALL
      : smokesOpt === "default"
        ? SMOKES_DEFAULT
        : smokesOpt.split(",");
const bin = (name) => path.join(root, "node_modules/.bin", name);
const logs = path.join(root, ".cache/release-logs");
fs.rmSync(logs, { recursive: true, force: true });
fs.mkdirSync(logs, { recursive: true });
const results = [];
const started = Date.now();
const secs = (ms) => (ms / 1000).toFixed(0) + " sn";

function run(name, cmd, args, env = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const file = path.join(logs, name + ".log");
    const out = fs.openSync(file, "w");
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ["ignore", out, out],
      env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", ...env },
    });
    const done = (code) => {
      fs.closeSync(out);
      const r = { name, code, ms: Date.now() - t0, file };
      results.push(r);
      console.log(`${code === 0 ? "✓" : "✗"} ${name.padEnd(22)} ${secs(r.ms)}${summary(r)}`);
      resolve(r);
    };
    child.on("error", (e) => {
      fs.writeSync(out, String(e));
      done(1);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}
// The result line a tool prints ("Tests 423 passed", "52 passed", JSON summary).
function summary(r) {
  const text = fs.readFileSync(r.file, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  const pick = (re) => text.match(re)?.[0]?.replace(/\s+/g, " ").trim();
  const line =
    pick(/Tests\s+\d+[^\n]*/) ||
    pick(/\d+ (passed|failed)[^\n]*/) ||
    pick(/AUDIT[^\n]*/) ||
    pick(/hardware-db\.json:[^\n]*|Donanım verisi yenilenemedi[^\n]*/) ||
    (r.name.startsWith("smoke:") ? pick(/\{"[^\n]{0,90}/) : undefined);
  return line ? "  · " + line : "";
}
function fail(r) {
  const tail = fs.readFileSync(r.file, "utf8").trimEnd().split("\n").slice(-40).join("\n");
  console.error(`\n--- ${r.name} başarısız (${r.file}) ---\n${tail}\n`);
  process.exit(1);
}
const must = async (p) => {
  const all = [].concat(await p);
  for (const r of all) if (r.code !== 0) fail(r);
  return all;
};
const parallel = (jobs) => (serial ? jobs.reduce((p, j) => p.then(async (acc) => [...acc, await j()]), Promise.resolve([])) : Promise.all(jobs.map((j) => j())));

// 1. Version (package.json, package-lock root entries, shared/version.ts).
const pkgFile = path.join(root, "package.json");
const old = JSON.parse(fs.readFileSync(pkgFile, "utf8")).version;
if (old !== version) {
  const bump = (file, count) => {
    let s = fs.readFileSync(file, "utf8"),
      n = 0;
    s = s.replace(new RegExp(`"version": "${old.replace(/\./g, "\\.")}"`, "g"), (m) =>
      n++ < count ? `"version": "${version}"` : m,
    );
    if (n < count) throw new Error(`${file}: ${count} sürüm alanı bekleniyordu, ${n} bulundu`);
    fs.writeFileSync(file, s);
  };
  bump(pkgFile, 1);
  bump(path.join(root, "package-lock.json"), 2);
  const vf = path.join(root, "shared/version.ts");
  fs.writeFileSync(vf, fs.readFileSync(vf, "utf8").replace(/APP_VERSION = "[^"]+"/, `APP_VERSION = "${version}"`));
  console.log(`• sürüm ${old} → ${version}`);
}
const notesFile = path.join(root, `.release/notes-${version}.md`);
if (!fs.readFileSync(path.join(root, "shared/release-notes.ts"), "utf8").includes(`## ${version}`))
  console.warn(`! shared/release-notes.ts içinde "## ${version}" yok`);
if (publish && !fs.existsSync(notesFile)) {
  console.error(`Kanal notu yok: ${notesFile}`);
  process.exit(1);
}

// 1b. 2.1.0: fresh hardware data (PassMark + TechPowerUp) for every release;
// when the sites cannot be reached the previous file stays (never fatal).
await must(run("hardware-data", bin("tsx"), ["scripts/hardware-data.ts"]));

// 2. Typecheck ∥ unit tests.
await must(
  parallel([
    () => run("typecheck", bin("tsc"), ["--noEmit", "-p", "."]),
    () => run("unit", bin("vitest"), ["run"]),
  ]),
);
// 3. UI tests on the production bundle (Playwright starts the servers).
if (ui !== "none") {
  fs.rmSync(path.join(root, ".cache/preview-data"), { recursive: true, force: true });
  const specs = ui === "all" ? [] : ui.split(",").map((s) => (s.includes("/") ? s : "tests/ui/" + s));
  await must(run("ui", bin("playwright"), ["test", ...specs]));
}
if (argv.includes("--audit")) {
  fs.rmSync(path.join(root, ".cache/preview-data"), { recursive: true, force: true });
  await must(run("ui-audit", bin("playwright"), ["test", "-c", "scripts/ui-audit.config.ts"]));
}
// 4. Build, Electron smokes, package. One after the other: the build sandbox
// has 2 GB of memory and the installer compression needs most of it.
await must(run("build", "npm", ["run", "-s", "build:code"]));
const out = path.join(process.env.HOME || "/home/user", ".cache/oyun-package");
if (fs.existsSync(out))
  for (const f of fs.readdirSync(out))
    if (/\.(exe|7z)$/i.test(f)) fs.rmSync(path.join(out, f), { force: true });
const smokeChain = async () => {
  const out = [];
  for (const s of smokes)
    out.push(await run("smoke:" + s, "xvfb-run", ["-a", process.execPath, `scripts/${s}-smoke.cjs`]));
  return out;
};
await must(smokeChain());
await must(run("package", process.execPath, ["scripts/package.mjs"]));
await must(run("verify", process.execPath, ["scripts/verify-package.cjs"]));

// 5. EXE to the workspace root (the old one goes), BUILD-INFO.
const name = `Oyun-Siralayici-${version}-Portable.exe`;
const exe = path.join(out, name);
const data = fs.readFileSync(exe);
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
for (const f of fs.readdirSync(workspace))
  if (/^Oyun-Siralayici-.*-Portable\.exe$/.test(f) && f !== name) fs.rmSync(path.join(workspace, f));
fs.copyFileSync(exe, path.join(workspace, name));
const infoFile = path.join(root, "BUILD-INFO.json");
const info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
Object.assign(info, {
  version,
  executable: name,
  bytes: data.length,
  sha256,
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
});
fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + "\n");
console.log(`• ${name}  ${(data.length / 1e6).toFixed(1)} MB  sha256 ${sha256.slice(0, 16)}…`);

// 6. Update channel.
if (publish) {
  const r = await must(run("publish", "python3", ["scripts/publish-update.py", exe, version, notesFile]));
  const text = fs.readFileSync(r[0].file, "utf8");
  const url = text.match(/https:\/\/\S+\.gz/g)?.pop();
  if (url) {
    info[`release${version.replace(/\./g, "_")}`] = { ...(info[`release${version.replace(/\./g, "_")}`] || {}), channelAsset: url };
    fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + "\n");
    console.log(`• kanal: ${url}`);
  }
}

// 7. Cleanup (the workspace keeps only sources and the EXE).
fs.rmSync(path.join(root, "electron-dist"), { recursive: true, force: true });
for (const f of fs.readdirSync(path.join(root, "docs")))
  if (f.endsWith(`-${version}.png`)) fs.rmSync(path.join(root, "docs", f));
console.log(`\nTamam: ${version} · toplam ${secs(Date.now() - started)}`);
