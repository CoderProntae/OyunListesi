import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { Store } from "../electron/store";
import { Service } from "../electron/service";
import { webRequest } from "../electron/network";
import { hltbFromParent } from "../electron/catalogs";
import { Updater } from "../electron/updater";
import { GameMonitor, fpsFromFrames, lhmTemps } from "../electron/overlay/monitor";
import {
  detectGame,
  folderName,
  parseAcf,
  parseGogRegistry,
  parseVdfPaths,
  xboxName,
} from "../electron/overlay/detect";
import { baseTitles, parseStoreDate, titleMatch, titleRemainder } from "../shared/titles";
import {
  defaultOverlay,
  dueAlarms,
  emptyOverlayData,
  formatMetric,
  limitDue,
  metricLevel,
} from "../shared/overlay";
import { compareVersions, manifestFromTelegraph, parseManifest } from "../shared/update";
import { APP_VERSION } from "../shared/version";
import { RESEARCH_GROUP } from "../shared/types";
import pkg from "../package.json";
vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(async () => {
    throw new Error("offline in tests");
  }),
}));
const reply = (value: any) => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  url: "https://example.com/",
  body: Buffer.from(""),
  type: "application/json",
});
const nextPage = (game: any) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { game: { data: game } } },
  })}</script></html>`;
let root: string, store: Store;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/200-"));
  store = new Store(root);
  vi.mocked(webRequest).mockReset();
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("2.0 titles", () => {
  it("an episode without its subtitle matches the full episode name, nothing else", () => {
    expect(titleMatch("Life is Strange - Episode 2", "Life is Strange: Episode 2 - Out of Time")).toBe(true);
    expect(titleMatch("Life is Strange - Episode 2", "Life Is Strange - Episode 2: Out of Time")).toBe(true);
    expect(titleMatch("Life is Strange - Episode 2", "Life is Strange 2: Episode 2 - Rules")).toBe(false);
    expect(titleMatch("Life is Strange", "Life is Strange: Before the Storm")).toBe(false);
    expect(titleMatch("Life is Strange", "Life is Strange 2")).toBe(false);
    expect(titleMatch("Burial at Sea - Episode Two", "Burial at Sea: Episode 2")).toBe(true);
    expect(titleMatch("Episode 2", "Episode 2: Out of Time")).toBe(true);
  });
  it("base names and remainders of DLC titles", () => {
    expect(baseTitles("BioShock Infinite: Burial at Sea - Episode Two")).toEqual([
      "BioShock Infinite: Burial at Sea",
      "BioShock Infinite",
    ]);
    expect(titleRemainder("Life is Strange - Episode 2", "Life Is Strange")).toBe("episode 2");
  });
  it("store dates in English, Turkish and ISO form", () => {
    expect(parseStoreDate("24 Mar, 2015")).toBe("2015-03-24");
    expect(parseStoreDate("Mar 24, 2015")).toBe("2015-03-24");
    expect(parseStoreDate("29 Oca 2015")).toBe("2015-01-29");
    expect(parseStoreDate("2015-03-24")).toBe("2015-03-24");
    expect(parseStoreDate("")).toBeUndefined();
    expect(parseStoreDate("Coming soon")).toBeUndefined();
  });
});

describe("2.0 DLC times from the base game's HowLongToBeat page", () => {
  const base = nextPage({
    game: [{ game_id: 21702, game_name: "Life Is Strange" }],
    relationships: [
      { game_id: 23836, game_name: "Episode 1: Chrysalis", game_type: "dlc" },
      { game_id: 23845, game_name: "Episode 2: Out of Time", game_type: "dlc" },
    ],
  });
  const dlc = (steam: number) =>
    nextPage({
      game: [
        {
          game_id: 23845,
          game_name: "Life Is Strange - Episode 2: Out of Time",
          comp_main: 8727,
          comp_plus: 10649,
          comp_100: 11537,
          comp_all: 10113,
          release_world: "2015-03-24",
          profile_steam: steam,
        },
      ],
    });
  const network = (steam: number) =>
    vi.mocked(webRequest).mockImplementation(async (url: string, o: any = {}) => {
      if (url.includes("hltbapi.codepotatoes.de/hltb/search")) {
        const term = JSON.parse(o.body).searchTerm;
        return reply(
          term === "Life is Strange"
            ? [{ hltbId: 21702, title: "Life Is Strange" }]
            : `Searchterm '${term}' does not yield any results`,
        );
      }
      if (url.endsWith("/game/21702")) return reply(base);
      if (url.endsWith("/game/23845")) return reply(dlc(steam));
      throw new Error("offline " + url);
    });
  it("finds Episode 2 under Life Is Strange with times and release date", async () => {
    network(329880);
    const t = await hltbFromParent({
      name: "Life is Strange - Episode 2",
      appId: 329880,
      baseGame: { appId: 319630, name: "Life is Strange - Episode 1" },
    });
    expect(t).toMatchObject({
      status: "found",
      main: 2.42,
      url: "https://howlongtobeat.com/game/23845",
      releaseDate: "2015-03-24",
      title: "Life Is Strange - Episode 2: Out of Time",
    });
  });
  it("an entry whose page names another Steam app is not taken", async () => {
    network(999999);
    expect(await hltbFromParent({ name: "Life is Strange - Episode 2", appId: 329880 })).toBeUndefined();
  });
});

describe("2.0 chat groups", () => {
  it("the research group exists, holds automatic chats and cannot be deleted", () => {
    const research = store.createChat(true),
      chat = store.createChat();
    expect(store.state.chatGroups[0]).toMatchObject({ id: RESEARCH_GROUP, system: "research" });
    expect(research.groupId).toBe(RESEARCH_GROUP);
    expect(() => store.chatGroup("delete", { id: RESEARCH_GROUP })).toThrow();
    expect(() => store.moveChats([chat.id], RESEARCH_GROUP)).toThrow();
    const g = store.chatGroup("create", { name: "Yapımlar", color: "#ff6b9b" });
    store.moveChats([chat.id, research.id], g.id);
    expect(chat.groupId).toBe(g.id);
    expect(research.groupId).toBe(RESEARCH_GROUP);
    store.chatGroup("edit", { id: g.id, patch: { name: "Yeni ad", color: "#123456", collapsed: true } });
    expect(store.state.chatGroups.find((x) => x.id === g.id)).toMatchObject({ name: "Yeni ad", color: "#123456", collapsed: true });
    store.renameChat(chat.id, "  Sohbetin adı  ");
    expect(chat.title).toBe("Sohbetin adı");
    store.chatGroup("delete", { id: g.id });
    expect(chat.groupId).toBeUndefined();
    store.deleteChats([chat.id, research.id]);
    expect(store.state.chats).toHaveLength(0);
  });
  it("loading repairs unknown groups and puts research chats into their group", () => {
    const state: any = store.exportState();
    state.chats = [
      { id: "a", title: "A", createdAt: new Date().toISOString(), messages: [], apiHistory: [], allowedTools: [], groupId: "nope" },
      { id: "b", title: "B", automatic: true, createdAt: new Date().toISOString(), messages: [], apiHistory: [], allowedTools: [] },
    ];
    delete state.chatGroups;
    const v = store.validate(state);
    expect(v.chats.find((c: any) => c.id === "a")!.groupId).toBeUndefined();
    expect(v.chats.find((c: any) => c.id === "b")!.groupId).toBe(RESEARCH_GROUP);
    expect(v.chatGroups.map((g: any) => g.id)).toEqual([RESEARCH_GROUP]);
  });
});

describe("2.0 updates", () => {
  it("versions compare numerically and the channel text is parsed", () => {
    expect(compareVersions("2.0.1", "2.0.0")).toBe(1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    const manifest = {
      channel: "oyun-siralayici",
      version: "2.0.1",
      notes: "Notlar",
      assets: [{ name: "Oyun-Siralayici-2.0.1-Portable.exe", size: 2_000_000, sha256: "a".repeat(64), urls: ["https://x0.at/abc.exe", "http://insecure.example/x.exe"] }],
    };
    const page = { ok: true, result: { content: [{ tag: "pre", children: [JSON.stringify(manifest)] }] } };
    const parsed = manifestFromTelegraph(page);
    expect(parsed.version).toBe("2.0.1");
    expect(parsed.assets[0].urls).toEqual(["https://x0.at/abc.exe"]);
    expect(() => parseManifest({ channel: "baska", version: "9.9.9" })).toThrow();
    expect(APP_VERSION).toBe(pkg.version);
  });
  it("downloads to the desktop folder with progress and verifies SHA-256", async () => {
    const body = crypto.randomBytes(1_500_000);
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    let manifest: any;
    const server = http.createServer((req, res) => {
      if (req.url === "/manifest") return res.end(JSON.stringify(manifest));
      if (req.url === "/file.exe") {
        res.setHeader("Content-Length", body.length);
        return res.end(body);
      }
      if (req.url === "/file.exe.gz") return res.end(zlib.gzipSync(body));
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const desktop = path.join(root, "Desktop");
    try {
      manifest = {
        channel: "oyun-siralayici",
        version: "9.0.0",
        notes: "Yeni",
        assets: [{ name: "Oyun-Siralayici-9.0.0-Portable.exe", size: body.length, sha256: sha, urls: [`http://127.0.0.1:${port}/file.exe`] }],
      };
      const states: string[] = [];
      const u = new Updater("2.0.0", { channel: `http://127.0.0.1:${port}/manifest`, desktop: () => desktop, insecure: true, platform: "linux" });
      u.on("state", (s) => states.push(s.status));
      expect((await u.check()).status).toBe("available");
      const done = await u.start();
      expect(done.status).toBe("ready");
      expect(fs.readFileSync(path.join(desktop, "Oyun-Siralayici-9.0.0-Portable.exe")).equals(body)).toBe(true);
      expect(states).toContain("downloading");
      await expect(u.install()).rejects.toThrow(/Windows/);
      // A wrong checksum never leaves a file behind.
      manifest.assets[0].sha256 = "b".repeat(64);
      manifest.version = "9.0.1";
      manifest.assets[0].name = "Oyun-Siralayici-9.0.1-Portable.exe";
      const bad = new Updater("2.0.0", { channel: `http://127.0.0.1:${port}/manifest`, desktop: () => desktop, insecure: true, platform: "linux" });
      await bad.check();
      expect((await bad.start()).status).toBe("error");
      expect(fs.existsSync(path.join(desktop, "Oyun-Siralayici-9.0.1-Portable.exe"))).toBe(false);
      // Hosts that refuse .exe: the same EXE travels gzip-compressed.
      manifest.version = "9.0.2";
      manifest.assets[0] = {
        name: "Oyun-Siralayici-9.0.2-Portable.exe",
        size: body.length,
        sha256: sha,
        encoding: "gzip",
        transferSize: zlib.gzipSync(body).length,
        urls: [`http://127.0.0.1:${port}/file.exe.gz`],
      };
      const gz = new Updater("2.0.0", { channel: `http://127.0.0.1:${port}/manifest`, desktop: () => desktop, insecure: true, platform: "linux" });
      await gz.check();
      expect((await gz.start()).status).toBe("ready");
      expect(fs.readFileSync(path.join(desktop, "Oyun-Siralayici-9.0.2-Portable.exe")).equals(body)).toBe(true);
      // The current version is not offered again.
      manifest.version = "2.0.0";
      expect((await new Updater("2.0.0", { channel: `http://127.0.0.1:${port}/manifest`, insecure: true }).check()).status).toBe("current");
    } finally {
      server.close();
    }
  });
});

describe("2.0 overlay rules", () => {
  it("colors follow the limits and return when the value drops", () => {
    expect(metricLevel("fps", 25)).toBe("danger");
    expect(metricLevel("fps", 40)).toBe("warn");
    expect(metricLevel("fps", 90)).toBe("normal");
    expect(metricLevel("gpuTemp", 90)).toBe("danger");
    expect(metricLevel("gpuTemp", 60)).toBe("normal");
    expect(metricLevel("ram", 15.5, undefined, { ramGB: 16 })).toBe("danger");
    expect(metricLevel("cpu", 50, { id: "cpu", enabled: true, warn: 40, danger: 60 })).toBe("warn");
    expect(metricLevel("gpu", 100)).toBe("normal");
    const d = { ...emptyOverlayData(), metrics: { ram: 9.25, gpuTemp: 66.4 }, totals: { ramGB: 16 } };
    expect(formatMetric("ram", d)).toBe("9,3/16 GB");
    expect(formatMetric("gpuTemp", d)).toBe("66°C");
    expect(formatMetric("fps", d)).toBe("—");
  });
  it("alarms fire once a day at their minute; the session limit repeats", () => {
    const at = new Date(2026, 9, 16, 21, 30);
    const alarms = [
      { id: "a", time: "21:30", label: "Yemek", enabled: true },
      { id: "b", time: "21:30", label: "Kapalı", enabled: false },
      { id: "c", time: "21:30", label: "Bugün çaldı", enabled: true, lastFired: at.toISOString().slice(0, 10) },
    ];
    expect(dueAlarms(alarms, at).map((a) => a.id)).toEqual(["a"]);
    expect(limitDue(59, 60, 15)).toBe(false);
    expect(limitDue(60, 60, 15)).toBe(true);
    expect(limitDue(70, 60, 15, 60)).toBe(false);
    expect(limitDue(75, 60, 15, 60)).toBe(true);
    expect(limitDue(75, 0, 15)).toBe(false);
  });
  it("FPS, frame time and the 1% low come from frame intervals", () => {
    const frames = Array.from({ length: 300 }, (_, i) => (i % 100 === 0 ? 40 : 10));
    const f = fpsFromFrames(frames);
    expect(Math.round(f.fps!)).toBeGreaterThan(90);
    expect(f.low1).toBeCloseTo(25, 0);
    expect(fpsFromFrames([])).toEqual({});
  });
  it("LibreHardwareMonitor's tree gives the CPU package and GPU core temperature", () => {
    const tree = {
      Text: "Sensor",
      Children: [
        { Text: "DESKTOP", Children: [
          { Text: "Intel Core i5-4460", ImageURL: "images_icon/cpu.png", Children: [
            { Text: "Temperatures", Children: [{ Text: "CPU Package", Value: "63,0 °C" }] } ] },
          { Text: "NVIDIA GeForce GTX 1660 SUPER", ImageURL: "images_icon/nvidia.png", Children: [
            { Text: "Temperatures", Children: [{ Text: "GPU Core", Value: "71.0 °C" }] } ] },
        ] },
      ],
    };
    expect(lhmTemps(tree)).toEqual({ cpuTemp: 63, gpuTemp: 71 });
  });
});

describe("2.0 game detector", () => {
  const steamDir = "D:\\SteamLibrary\\steamapps\\common\\Max Payne";
  it("reads launcher records", () => {
    expect(parseVdfPaths('"1"\n{\n "path"\t\t"D:\\\\SteamLibrary"\n}')).toEqual(["D:\\SteamLibrary"]);
    expect(parseAcf('"AppState"\n{\n "appid" "12140"\n "name" "Max Payne"\n "installdir" "Max Payne"\n}')).toEqual({ appId: 12140, name: "Max Payne", installdir: "Max Payne" });
    expect(parseGogRegistry("HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1440166436\r\n    gameName    REG_SZ    Fallout 2\r\n    path    REG_SZ    C:\\GOG Games\\Fallout 2\r\n")).toEqual([{ name: "Fallout 2", dir: "C:\\GOG Games\\Fallout 2", source: "gog" }]);
    expect(xboxName("C:\\XboxGames\\Halo Infinite\\Content\\HaloInfinite.exe")).toBe("Halo Infinite");
    expect(folderName("C:\\Games\\Witcher 3\\bin\\x64\\witcher3.exe")).toBe("Witcher 3");
  });
  it("matches the library by Steam id, ignores browsers and the ignore list", () => {
    const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
    const games = store.state.games;
    const installed = [{ name: "Max Payne", dir: steamDir, appId: 12140, source: "steam" as const }];
    const o = { installed, games, mappings: [], ignore: [], fullscreen: false };
    expect(detectGame(steamDir + "\\maxpayne.exe", "Max Payne", o)).toMatchObject({ gameId: id, known: true, source: "steam" });
    expect(detectGame("C:\\Program Files\\Google\\Chrome\\chrome.exe", "YouTube", { ...o, fullscreen: true, gpu: 40 })).toBeUndefined();
    expect(detectGame(steamDir + "\\maxpayne.exe", "Max Payne", { ...o, ignore: ["maxpayne.exe"] })).toBeUndefined();
    expect(detectGame("C:\\Oyunlar\\x\\run.exe", "Bilinmeyen Oyun", { ...o, fullscreen: true, gpu: 55 })).toMatchObject({ known: false });
    expect(detectGame("C:\\Araçlar\\notlar.exe", "Notlar", { ...o, fullscreen: false })).toBeUndefined();
  });
  it("starts a session, follows focus, counts play time and ends with the process", () => {
    const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
    const monitor = new GameMonitor(store, root, { platform: "linux" });
    (monitor as any).installed = [{ name: "Max Payne", dir: steamDir, appId: 12140, source: "steam" }];
    const games: any[] = [];
    monitor.on("game", (g) => games.push(g && { ...g }));
    const fg = (pid: number, p: string) => ({ t: "tick", cpu: 20, memUsedMB: 8000, memTotalMB: 16000, fg: { pid, path: p, title: "x", hwnd: "0x1", full: true } });
    monitor.onHelper(fg(process.pid, steamDir + "\\maxpayne.exe"));
    expect(monitor.running).toMatchObject({ name: "Max Payne", gameId: id, foreground: true });
    expect(store.requireGames([id])[0].status).toBe("playing");
    monitor.onHelper(fg(process.ppid, "C:\\Windows\\explorer.exe"));
    expect(monitor.running?.foreground).toBe(false);
    for (let i = 0; i < 60; i++) (monitor as any).tick();
    expect(store.state.playtime[id]).toMatchObject({ minutes: 1, sessions: 1 });
    expect(monitor.data.game?.name).toBe("Max Payne");
    expect(monitor.data.totals.ramGB).toBeCloseTo(15.6, 1);
    (monitor as any).game.pid = 2 ** 22 + 12345;
    monitor.onHelper(fg(process.ppid, "C:\\Windows\\explorer.exe"));
    expect(monitor.running).toBeUndefined();
    expect(games.at(-1)).toBeUndefined();
    monitor.stop();
  });
  it("settings keep their defaults when a partial overlay is saved", async () => {
    const service = new Service(root + "-s");
    try {
      const o = await service.call("overlaySettings", { patch: { sessionLimit: 90 } });
      expect(o.sessionLimit).toBe(90);
      expect(o.presets).toHaveLength(defaultOverlay.presets.length);
      expect(o.hotkey).toBe("Control+Tab");
      await expect(service.call("overlayAction", { name: "state" })).rejects.toThrow(/Windows/);
    } finally {
      service.close();
      fs.rmSync(root + "-s", { recursive: true, force: true });
    }
  });
});

describe("2.0 agent tools", () => {
  it("edit_games changes several games in one undo step; get_game_info reads several", async () => {
    const service = new Service(root + "-a");
    try {
      service.store.settings({ lmModel: "x", requireApproval: false });
      const [a, b] = service.store.add([{ name: "A" }, { name: "B" }]).added;
      service.store.metadata(a, { screenshots: ["https://img/1.jpg"], description: "x".repeat(4000) });
      const chat = service.store.createChat();
      const message = { id: "m", role: "assistant", createdAt: new Date().toISOString(), blocks: [] };
      const execute = (name: string, args: any) => (service.agent as any).execute(chat, message, name, args, new AbortController().signal);
      const r = await execute("edit_games", { items: [{ gameId: a, patch: { status: "finished" } }, { gameId: b, patch: { rating: 8 } }] });
      expect(r).toMatchObject({ ok: true, updated: 2 });
      expect(service.store.requireGames([a])[0].status).toBe("finished");
      service.store.undo();
      expect(service.store.requireGames([a])[0].status).toBe("planned");
      expect(service.store.requireGames([b])[0].rating).not.toBe(8);
      const many = await execute("get_game_info", { gameIds: [a, b] });
      expect(many.games).toHaveLength(2);
      expect(many.games[0].screenshots).toBeUndefined();
      expect(many.games[0].description.length).toBeLessThan(2600);
      expect(many.games[0].analysis).toBeDefined();
    } finally {
      service.close();
      fs.rmSync(root + "-a", { recursive: true, force: true });
    }
  });
});
