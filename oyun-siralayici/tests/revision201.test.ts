import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { GameMonitor } from "../electron/overlay/monitor";
import { detectGame } from "../electron/overlay/detect";
import { initialState, OVERLAY_INTRO_MIGRATION } from "../shared/domain";
import { defaultOverlay } from "../shared/overlay";

// 2.0.1: the game is found without focus, the overlay follows the game
// window (visible / minimized), the panel closes when another program comes
// to the front, the name is a short notice at the start.
let root: string, store: Store;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/201-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const dir = "D:\\SteamLibrary\\steamapps\\common\\Max Payne";
const win = (extra: any = {}) => ({
  pid: process.pid,
  hwnd: "0x10",
  path: dir + "\\maxpayne.exe",
  title: "Max Payne",
  iconic: false,
  rect: [0, 0, 1920, 1080],
  client: [0, 0, 1920, 1080],
  ...extra,
});
const tick = (fg: any, wins: any[]) => ({ t: "tick", cpu: 10, memUsedMB: 4000, memTotalMB: 8000, fg, wins });
const explorer = { pid: process.ppid, hwnd: "0x20", path: "C:\\Windows\\explorer.exe", title: "Masaüstü", full: false };
function monitor() {
  const m = new GameMonitor(store, root, { platform: "linux" });
  (m as any).installed = [{ name: "Max Payne", dir, appId: 12140, source: "steam" }];
  const sent: string[] = [];
  (m as any).send = (line: string) => sent.push(line);
  return { m, sent };
}
describe("2.0.1 game detector without focus", () => {
  it("an open game window is recognised while another program is in front", () => {
    const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
    const { m } = monitor();
    m.onHelper(tick(explorer, [win()]));
    expect(m.running).toMatchObject({ gameId: id, foreground: false, visible: true });
    (m as any).tick();
    expect(m.data.game).toMatchObject({ name: "Max Payne", visible: true, foreground: false });
    // FPS measuring starts at once (PresentMon missing here → reported).
    expect(["starting", "unavailable", "ok"]).toContain(m.data.fps);
    m.stop();
  });
  it("minimized means hidden; restored means shown; focus is a separate state", () => {
    store.add([{ name: "Max Payne", appId: 12140 }]);
    const { m } = monitor();
    m.onHelper(tick(explorer, [win()]));
    m.onHelper(tick(explorer, [win({ iconic: true, rect: [-32000, -32000, -31840, -31972] })]));
    expect(m.running?.visible).toBe(false);
    const events: string[] = [];
    m.on("window", () => events.push("window"));
    m.onHelper({ t: "game", hwnd: "0x10", iconic: false, client: [100, 50, 1380, 770] });
    expect(m.running).toMatchObject({ visible: true, client: [100, 50, 1380, 770] });
    expect(events).toEqual(["window"]);
    const fronts: any[] = [];
    m.on("foreground", (fg) => fronts.push(fg?.pid));
    m.onHelper(tick({ ...win(), full: true }, [win()]));
    expect(m.running?.foreground).toBe(true);
    expect(fronts).toEqual([process.pid]);
    m.stop();
  });
  it("only known games count without focus; unknown programs need full screen in front", () => {
    const { m } = monitor();
    m.onHelper(tick(explorer, [win({ path: "C:\\Araçlar\\editor.exe", title: "Editör" })]));
    expect(m.running).toBeUndefined();
    expect(
      detectGame("C:\\Oyunlar\\x\\run.exe", "Bilinmeyen", {
        installed: [],
        games: [],
        mappings: [],
        ignore: [],
        fullscreen: false,
      }),
    ).toBeUndefined();
    m.stop();
  });
  it("the overlay follows the game window: one command with the game and the windows", () => {
    store.add([{ name: "Max Payne", appId: 12140 }]);
    const { m, sent } = monitor();
    m.onHelper(tick(explorer, [win()]));
    m.follow(["0xaa", "0xbb"]);
    expect(sent.at(-1)).toBe("follow 0x10 0xaa 0xbb");
    (m as any).game.pid = 2 ** 22 + 99;
    m.onHelper(tick(explorer, []));
    expect(m.running).toBeUndefined();
    m.follow(["0xaa"]);
    expect(sent.at(-1)).toBe("follow 0");
    m.stop();
  });
  it("our own window in front keeps the game in front only while the panel is open", () => {
    store.add([{ name: "Max Payne", appId: 12140 }]);
    const { m } = monitor();
    m.onHelper(tick({ ...win(), full: true }, [win()]));
    expect(m.running?.foreground).toBe(true);
    m.panelOpen = true;
    m.onHelper(tick({ ...explorer, pid: 4242, self: true }, [win()]));
    expect(m.running?.foreground).toBe(true);
    m.panelOpen = false;
    m.onHelper(tick({ ...explorer, pid: 4243, self: true }, [win()]));
    expect(m.running?.foreground).toBe(false);
    m.stop();
  });
});
describe("2.0.1 'Şimdi oynanıyor' is a notice, not a line", () => {
  it("built-in looks have no permanent title and the notice is on", () => {
    expect(defaultOverlay.presets.every((p) => !p.showTitle)).toBe(true);
    expect(defaultOverlay.nowPlayingToast).toBe(true);
  });
  it("a 2.0 library drops the always-on title of the built-in looks once", () => {
    const state: any = initialState();
    state.migrations = state.migrations.filter((m: string) => m !== OVERLAY_INTRO_MIGRATION);
    state.settings.overlay = {
      ...defaultOverlay,
      presets: defaultOverlay.presets.map((p) => ({ ...p, showTitle: true })).concat({
        ...defaultOverlay.presets[0],
        id: "mine",
        name: "Benim",
        builtin: false,
        showTitle: true,
      }),
    };
    delete state.settings.overlay.nowPlayingToast;
    store.close();
    fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
    store = new Store(root);
    const o = store.state.settings.overlay;
    expect(o.presets.filter((p) => p.builtin).every((p) => !p.showTitle)).toBe(true);
    expect(o.presets.find((p) => p.id === "mine")?.showTitle).toBe(true);
    expect(o.nowPlayingToast).toBe(true);
    expect(store.state.migrations).toContain(OVERLAY_INTRO_MIGRATION);
  });
});
