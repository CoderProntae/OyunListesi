import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
// 2.0.5: the new version's side of an update (see Updater.install).
//
// The previous version starts the new EXE with OYUN_GUNCELLEME in its
// environment: a one-time token (sent back to it so it closes) and the path of
// the old portable EXE, which the new version deletes once it is free.
export interface Handoff {
  token: string;
  eski: string;
}
export function readHandoff(env: NodeJS.ProcessEnv = process.env): Handoff | undefined {
  const raw = env.OYUN_GUNCELLEME;
  // Never handed down to programs this app starts later.
  delete env.OYUN_GUNCELLEME;
  if (!raw) return;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.token === "string" && /^[a-f0-9]{16,128}$/i.test(v.token))
      return { token: v.token, eski: typeof v.eski === "string" ? v.eski : "" };
  } catch {
    /* not ours */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busy = (e: any) => ["EBUSY", "EPERM", "EACCES"].includes(e?.code);
const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const samePath = (a: string, b: string) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// Deletes the previous version's EXE. Its launcher keeps the file locked for a
// few seconds after the old app has closed (it first deletes its unpacked
// copy), so this retries every second. A small record in the data folder lets
// the next start finish the job if the app is closed before that.
export async function removeOldExe(
  file: string,
  o: { own?: string; record: string; tries?: number; delay?: number },
): Promise<"removed" | "pending" | "skipped"> {
  if (!file || !path.isAbsolute(file) || !/\.exe$/i.test(file) || (o.own && samePath(o.own, file))) {
    fs.rmSync(o.record, { force: true });
    return "skipped";
  }
  const target = path.resolve(file);
  try {
    fs.mkdirSync(path.dirname(o.record), { recursive: true });
    fs.writeFileSync(o.record, JSON.stringify({ file: target, since: new Date().toISOString() }));
  } catch {
    /* the deletion itself still runs */
  }
  const tries = o.tries ?? 180,
    delay = o.delay ?? 1000;
  for (let i = 0; i < tries; i++) {
    try {
      if (!isFile(target)) break;
      fs.rmSync(target, { force: true });
      if (!isFile(target)) break;
    } catch (e) {
      if (!busy(e)) break;
    }
    await sleep(delay);
  }
  if (isFile(target)) return "pending";
  fs.rmSync(o.record, { force: true });
  return "removed";
}
// A deletion an earlier start could not finish (given up after a week).
export async function resumeOldExeCleanup(record: string, own?: string, tries = 30) {
  let saved: { file?: unknown; since?: unknown };
  try {
    saved = JSON.parse(fs.readFileSync(record, "utf8"));
  } catch {
    fs.rmSync(record, { force: true });
    return "skipped" as const;
  }
  const since = Date.parse(String(saved.since));
  if (typeof saved.file !== "string" || !(Date.now() - since < 7 * 86400000)) {
    fs.rmSync(record, { force: true });
    return "skipped" as const;
  }
  return removeOldExe(saved.file, { own, record, tries });
}
// 2.0.0–2.0.4 updated through an "oyun-siralayici-guncelle-<time>.cmd" script
// in the temporary folder. Its "find" could wait forever in an open terminal
// window. Such a script (and every program it started) is stopped — the script
// first, so it cannot go on and start another copy — and the files are
// deleted. Nothing runs when no such file exists.
export function legacyScripts(temp: string) {
  try {
    return fs
      .readdirSync(temp)
      .filter((n) => /^oyun-siralayici-guncelle-\d+\.cmd$/i.test(n))
      .map((n) => path.join(temp, n));
  } catch {
    return [];
  }
}
// $all: every process. This app and the programs that started it are never
// touched (when a 2.0.4 script started this version, that script is one of
// them); the stuck script's own programs ("find", "ping", their windows) go.
// The creation time check keeps a reused process ID from counting as a child.
export const LEGACY_STOP_LOGIC = [
  "$byId = @{}",
  "foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }",
  "$skip = @{}",
  "$p = $byId[[int]$PID]",
  "while ($p -and -not $skip.ContainsKey([int]$p.ProcessId)) {",
  "  $skip[[int]$p.ProcessId] = $true",
  "  $up = $byId[[int]$p.ParentProcessId]",
  "  if (-not $up -or $up.CreationDate -gt $p.CreationDate) { break }",
  "  $p = $up",
  "}",
  "foreach ($s in @($all | Where-Object { $_.Name -ieq 'cmd.exe' -and $_.CommandLine -like '*oyun-siralayici-guncelle-*.cmd*' -and -not $skip.ContainsKey([int]$_.ProcessId) })) {",
  "  Stop-Process -Id $s.ProcessId -Force",
  "  $skip[[int]$s.ProcessId] = $true",
  "  $todo = @($s)",
  "  while ($todo.Count -gt 0) {",
  "    $next = @()",
  "    foreach ($t in $todo) {",
  "      foreach ($k in @($all | Where-Object { $_.ParentProcessId -eq $t.ProcessId -and $_.CreationDate -ge $t.CreationDate -and -not $skip.ContainsKey([int]$_.ProcessId) })) {",
  "        Stop-Process -Id $k.ProcessId -Force",
  "        $skip[[int]$k.ProcessId] = $true",
  "        $next += $k",
  "      }",
  "    }",
  "    $todo = $next",
  "  }",
  "}",
].join("\n");
export const LEGACY_STOP_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$all = @(Get-CimInstance Win32_Process)",
  LEGACY_STOP_LOGIC,
].join("\n");
export async function stopLegacyUpdaters(temp: string, run: typeof spawn = spawn) {
  const files = legacyScripts(temp);
  if (!files.length) return 0;
  await new Promise<void>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = run(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          Buffer.from(LEGACY_STOP_SCRIPT, "utf16le").toString("base64"),
        ],
        { windowsHide: true, stdio: "ignore" },
      );
    } catch {
      return resolve();
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      resolve();
    }, 30000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("error", done);
    child.once("exit", done);
  });
  for (const f of files)
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* still in use: tried again on the next start */
    }
  return files.length;
}
