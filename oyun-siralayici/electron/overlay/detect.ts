import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { titleKey, titleMatch } from "../../shared/titles";
import { NOT_GAMES, type GameMapping } from "../../shared/overlay";
import type { Game } from "../../shared/types";
// Which program in the foreground is a game, and which library game it is.
// Launcher records are read locally (Steam manifests, Epic manifests, GOG
// registry); nothing is sent anywhere.
export interface InstalledGame {
  name: string;
  dir: string;
  appId?: number;
  source: "steam" | "epic" | "gog";
}
export interface Detection {
  name: string;
  gameId?: string;
  appId?: number;
  known: boolean;
  source: string;
}
const win = path.win32;
export function parseVdfPaths(text: string) {
  return [...text.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, "\\"));
}
export function parseAcf(text: string) {
  const get = (k: string) => text.match(new RegExp(`"${k}"\\s+"([^"]*)"`, "i"))?.[1];
  return {
    appId: Number(get("appid")) || undefined,
    name: get("name"),
    installdir: get("installdir"),
  };
}
export function steamGames(steamPath: string): InstalledGame[] {
  const libs = new Set([win.join(steamPath, "steamapps")]);
  try {
    const vdf = fs.readFileSync(win.join(steamPath, "steamapps", "libraryfolders.vdf"), "utf8");
    for (const p of parseVdfPaths(vdf)) libs.add(win.join(p, "steamapps"));
  } catch {
    /* no library list */
  }
  const out: InstalledGame[] = [];
  for (const lib of libs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch {
      continue;
    }
    for (const f of files)
      try {
        const m = parseAcf(fs.readFileSync(win.join(lib, f), "utf8"));
        if (m.installdir && m.name)
          out.push({
            name: m.name,
            dir: win.join(lib, "common", m.installdir),
            appId: m.appId,
            source: "steam",
          });
      } catch {
        /* unreadable manifest */
      }
  }
  return out;
}
export function epicGames(
  dir = "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
): InstalledGame[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".item"))
      .flatMap((f) => {
        try {
          const j = JSON.parse(fs.readFileSync(win.join(dir, f), "utf8"));
          return j.DisplayName && j.InstallLocation
            ? [{ name: String(j.DisplayName), dir: String(j.InstallLocation), source: "epic" as const }]
            : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
export function parseGogRegistry(text: string): InstalledGame[] {
  const out: InstalledGame[] = [];
  for (const block of text.split(/\r?\n(?=HKEY_)/)) {
    const name = block.match(/^\s+gameName\s+REG_SZ\s+(.+)$/im)?.[1]?.trim(),
      dir = block.match(/^\s+path\s+REG_SZ\s+(.+)$/im)?.[1]?.trim();
    if (name && dir) out.push({ name, dir, source: "gog" });
  }
  return out;
}
export function regQuery(args: string[]) {
  return new Promise<string>((resolve) =>
    execFile("reg.exe", ["query", ...args], { windowsHide: true, timeout: 8000, maxBuffer: 8_000_000 }, (e, out) =>
      resolve(e ? "" : String(out)),
    ),
  );
}
export async function installedGames(): Promise<InstalledGame[]> {
  const steamReg = await regQuery(["HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]);
  const steamPath = steamReg.match(/SteamPath\s+REG_SZ\s+(.+)/i)?.[1]?.trim().replace(/\//g, "\\");
  const gog = parseGogRegistry(await regQuery(["HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games", "/s"]));
  return [...(steamPath ? steamGames(steamPath) : []), ...epicGames(), ...gog];
}
// Xbox / Microsoft Store games: ...\XboxGames\<Name>\Content\... or WindowsApps.
export function xboxName(exePath: string) {
  const m =
    exePath.match(/\\XboxGames\\([^\\]+)\\/i) ||
    exePath.match(/\\WindowsApps\\([^\\_]+?)(?:_[^\\]*)?\\/i);
  if (!m) return;
  return m[1]
    .replace(/^[A-Z0-9]+\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}
const GENERIC = new Set([
  "bin",
  "bin64",
  "bin32",
  "x64",
  "x86",
  "win64",
  "win32",
  "binaries",
  "game",
  "retail",
  "shipping",
  "release",
  "content",
  "system",
]);
export function folderName(exePath: string) {
  let dir = win.dirname(exePath);
  for (let i = 0; i < 4; i++) {
    const name = win.basename(dir);
    if (!name || !GENERIC.has(name.toLowerCase())) return name;
    dir = win.dirname(dir);
  }
  return win.basename(dir);
}
export function detectGame(
  exePath: string,
  title: string,
  o: {
    installed: InstalledGame[];
    games: Game[];
    mappings: GameMapping[];
    ignore: string[];
    fullscreen: boolean;
    gpu?: number;
  },
): Detection | undefined {
  const exe = win.basename(exePath || "").toLowerCase();
  if (!exe || NOT_GAMES.has(exe) || o.ignore.includes(exe)) return;
  const library = (name?: string, appId?: number) =>
    (appId && o.games.find((g) => g.appId === appId)) ||
    (name &&
      (o.games.find((g) => titleKey(g.name) === titleKey(name)) ||
        o.games.find((g) => titleMatch(g.name, name)))) ||
    undefined;
  const mapped = o.mappings.find((m) => m.exe === exe);
  if (mapped) {
    const g = mapped.gameId ? o.games.find((x) => x.id === mapped.gameId) : undefined;
    return { name: g?.name || mapped.name, gameId: g?.id, known: true, source: "manual" };
  }
  const lower = exePath.toLowerCase();
  const inst = o.installed
    .filter((i) => lower.startsWith(i.dir.toLowerCase().replace(/[\\/]+$/, "") + "\\"))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
  if (inst) {
    const g = library(inst.name, inst.appId);
    return { name: g?.name || inst.name, gameId: g?.id, appId: inst.appId, known: true, source: inst.source };
  }
  const xbox = xboxName(exePath);
  if (xbox) {
    const g = library(xbox);
    return { name: g?.name || xbox, gameId: g?.id, known: true, source: "xbox" };
  }
  for (const candidate of [title, folderName(exePath), exe.replace(/\.exe$/, "")]) {
    if (!candidate || candidate.length < 3) continue;
    const g = o.games.find((x) => titleKey(x.name) === titleKey(candidate));
    if (g) return { name: g.name, gameId: g.id, known: true, source: "library" };
  }
  // An unknown program counts only when it fills the screen and uses the GPU.
  if (o.fullscreen && (o.gpu ?? 0) >= 10)
    return { name: title || folderName(exePath) || exe, known: false, source: "fullscreen" };
  return;
}
