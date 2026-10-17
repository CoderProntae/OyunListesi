import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { EventEmitter } from "node:events";
import type { Store } from "../store";
import { detectGame, installedGames, type InstalledGame } from "./detect";
import {
  dueAlarms,
  emptyOverlayData,
  limitDue,
  sessionText,
  type OverlayAlert,
  type OverlayData,
  type OverlayGame,
} from "../../shared/overlay";
import { applyKatmanEdit, katmanPayload, KCMD, type KatmanStatus } from "../../shared/katman";
// Watches the foreground program through the bundled helper (Windows), decides
// whether it is a game, measures FPS with PresentMon and reads sensors
// (nvidia-smi, optional LibreHardwareMonitor). Emits one OverlayData per second.
interface Foreground {
  pid: number;
  path: string;
  title: string;
  hwnd: string;
  full: boolean;
  mon?: number[];
  self?: boolean;
  gpu?: number;
}
// A visible top-level window (helper "wins" list, 2.0.1).
export interface WinInfo {
  pid: number;
  hwnd: string;
  path: string;
  title: string;
  iconic: boolean;
  topmost?: boolean;
  rect?: number[];
  client?: number[];
}
interface Running extends OverlayGame {
  hwnd: string;
  mon?: number[];
  played: number;
  firstPlay: boolean;
  warnedAt?: number;
}
const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};
export function fpsFromFrames(frames: number[]) {
  let sum = 0,
    n = 0;
  for (let i = frames.length - 1; i >= 0 && sum < 1000; i--, n++) sum += frames[i];
  if (!n || !sum) return {};
  const recent: number[] = [];
  let total = 0;
  for (let i = frames.length - 1; i >= 0 && total < 10000; i--) {
    total += frames[i];
    recent.push(frames[i]);
  }
  recent.sort((a, b) => b - a);
  const worst = recent.slice(0, Math.max(1, Math.floor(recent.length / 100)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    fps: (n * 1000) / sum,
    frametime: sum / n,
    low1: worstAvg > 0 ? 1000 / worstAvg : undefined,
  };
}
// LibreHardwareMonitor's web server tree → CPU / GPU temperatures.
export function lhmTemps(tree: any) {
  const out: { cpuTemp?: number; gpuTemp?: number } = {};
  const walk = (node: any, hardware = "") => {
    if (!node || typeof node !== "object") return;
    const text = String(node.Text || "");
    const hw =
      /intel|amd|ryzen|core|cpu/i.test(text) && node.ImageURL?.includes("cpu")
        ? "cpu"
        : node.ImageURL?.includes("nvidia") ||
            node.ImageURL?.includes("ati") ||
            /gpu|radeon|geforce/i.test(text)
          ? node.ImageURL?.includes("cpu")
            ? hardware
            : "gpu"
          : hardware;
    const value = Number(
      String(node.Value || "")
        .replace(",", ".")
        .match(/-?\d+(\.\d+)?/)?.[0],
    );
    if (/°C/.test(String(node.Value || "")) && Number.isFinite(value)) {
      if (
        out.cpuTemp === undefined &&
        /^(CPU Package|Core \(Tctl\/Tdie\)|CPU \(Tctl\/Tdie\)|Tctl\/Tdie|Package)$/i.test(
          text,
        )
      )
        out.cpuTemp = value;
      if (out.gpuTemp === undefined && hw === "gpu" && /^GPU Core$/i.test(text))
        out.gpuTemp = value;
    }
    for (const child of node.Children || []) walk(child, hw);
  };
  walk(tree);
  return out;
}
export class GameMonitor extends EventEmitter {
  data: OverlayData = emptyOverlayData();
  private helper?: ChildProcess;
  private pm?: ChildProcess;
  private smi?: ChildProcess;
  private fg?: Foreground;
  private wins: WinInfo[] = [];
  private game?: Running;
  private sys: {
    cpu?: number;
    memUsed?: number;
    memTotal?: number;
    gpu?: number;
    vram?: number;
  } = {};
  private nv?: Record<
    "util" | "temp" | "memUsed" | "memTotal" | "clock" | "power" | "fan",
    number | null
  >;
  private lhm: { cpuTemp?: number; gpuTemp?: number } = {};
  private frames: number[] = [];
  private installed: InstalledGame[] = [];
  private installedAt = 0;
  private timer?: NodeJS.Timeout;
  private alerts: OverlayAlert[] = [];
  private mutedOthers = false;
  private nvApplied = new Map<string, number>();
  private lastAlarm = "";
  private helperBroken = "";
  // 2.2.0 oyun içi katman durumu
  katmanStatus: KatmanStatus | null = null;
  katmanPanel = false;
  katmanTab = 0;
  katmanBlocked = "";
  katmanDpi = 1;
  private katmanPid = 0;
  private katmanLastOsd = 0;
  // While the Ctrl+Tab panel has focus the game still counts as "in front".
  panelOpen = false;
  constructor(
    private store: Store,
    private dir: string,
    private o: {
      platform?: NodeJS.Platform;
      simulate?: boolean;
      selfPid?: number;
      notify?: (title: string, body: string) => void;
    } = {},
  ) {
    super();
  }
  get settings() {
    return this.store.state.settings.overlay;
  }
  get running() {
    return this.game;
  }
  start() {
    const windows = (this.o.platform || process.platform) === "win32";
    if (windows) {
      this.startHelper();
      this.startSmi();
      void this.refreshInstalled();
    }
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }
  stop() {
    clearInterval(this.timer);
    this.endGame();
    for (const p of [this.helper, this.pm, this.smi])
      try {
        p?.kill();
      } catch {
        /* already gone */
      }
    this.helper = this.pm = this.smi = undefined;
  }
  private send(line: string) {
    try {
      this.helper?.stdin?.write(line + "\n");
    } catch {
      /* helper gone */
    }
  }
  private startHelper() {
    const exe = path.join(this.dir, "oyun-yardimci.exe");
    if (!fs.existsSync(exe)) {
      this.helperBroken = "Yardımcı program bulunamadı.";
      return;
    }
    const child = spawn(exe, ["--self", String(this.o.selfPid || process.pid)], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    this.helper = child;
    readline.createInterface({ input: child.stdout! }).on("line", (line) => {
      try {
        this.onHelper(JSON.parse(line));
      } catch {
        /* partial line */
      }
    });
    child.on("exit", () => {
      if (this.helper !== child) return;
      this.helper = undefined;
      this.helperBroken = "Yardımcı program kapandı; yeniden başlatılıyor.";
      setTimeout(
        () => this.helper === undefined && this.timer && this.startHelper(),
        5000,
      ).unref?.();
    });
    child.on("error", (e) => (this.helperBroken = e.message));
  }
  private startSmi() {
    const candidates = [
      "C:\\Windows\\System32\\nvidia-smi.exe",
      "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
    ];
    const exe = candidates.find((c) => fs.existsSync(c));
    if (!exe) return;
    const child = spawn(
      exe,
      [
        "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.gr,power.draw,fan.speed",
        "--format=csv,noheader,nounits",
        "-lms",
        "1000",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    this.smi = child;
    readline.createInterface({ input: child.stdout! }).on("line", (line) => {
      const [util, temp, memUsed, memTotal, clock, power, fan] = line
        .split(",")
        .map((x) => num(x));
      if (util === null && temp === null) return;
      this.nv = { util, temp, memUsed, memTotal, clock, power, fan };
    });
    child.on("exit", () => {
      if (this.smi === child) this.smi = undefined;
    });
    child.on("error", () => (this.smi = undefined));
  }
  private async refreshInstalled() {
    if (Date.now() - this.installedAt < 10 * 60000) return;
    this.installedAt = Date.now();
    try {
      this.installed = await installedGames();
    } catch {
      /* keep the previous list */
    }
  }
  onHelper(msg: any) {
    // The game window moved, was resized, minimized or restored (event-driven).
    if (msg?.t === "game") {
      if (this.game && msg.hwnd === this.game.hwnd) {
        this.game.visible = !msg.iconic;
        if (Array.isArray(msg.client)) this.game.client = msg.client;
        this.emit("window", this.game);
      }
      return;
    }
    if (msg?.t === "katman") {
      this.katmanStatus = {
        state: Number(msg.state) || 0,
        api: Number(msg.api) || 0,
        bits: Number(msg.bits) || 0,
        pid: Number(msg.pid) || 0,
        frames: Number(msg.frames) || 0,
        drawn: Number(msg.drawn) || 0,
        verts: Number(msg.verts) || 0,
        fps: Number(msg.fps) || 0,
        ms: Number(msg.ms) || 0,
        message: String(msg.message || ""),
      };
      this.emit("katman", this.katmanStatus);
      this.pushOsd();
      return;
    }
    if (msg?.t === "katmancmd") {
      const kind = Number(msg.kind) || 0;
      if (kind === KCMD.PANEL) {
        this.katmanPanel = Number(msg.num) === 1;
        this.emit("katmanPanel", this.katmanPanel);
        this.pushOsd();
      } else if (kind === KCMD.SET || kind === KCMD.ACTION) {
        const next = applyKatmanEdit(this.settings, {
          kind,
          id: String(msg.id || ""),
          num: Number(msg.num) || 0,
          val: Number(msg.val) || 0,
          text: String(msg.text || ""),
        });
        if (next) {
          try {
            this.store.settings({ overlay: next });
          } catch {
            /* ayar aynı anda değişti: yoksay */
          }
          this.pushOsd();
        }
      } else if (kind === KCMD.ERROR || kind === KCMD.LOST) {
        this.katmanBlocked = String(msg.text || "katman hatasi");
        this.emit("katman", this.katmanStatus);
      }
      return;
    }
    if (msg?.t === "ack" && msg.cmd === "inject") {
      this.katmanBlocked = msg.ok ? "" : String(msg.message || "enjeksiyon basarisiz");
      this.emit("katman", this.katmanStatus);
      return;
    }
    if (msg?.t !== "tick") return;
    this.wins = Array.isArray(msg.wins)
      ? msg.wins.filter((w: any) => Number.isFinite(w?.pid) && typeof w.path === "string")
      : [];
    const before = this.fg?.pid;
    this.helperBroken = "";
    this.sys = {
      cpu: Number.isFinite(msg.cpu) ? msg.cpu : undefined,
      memUsed: Number.isFinite(msg.memUsedMB) ? msg.memUsedMB / 1024 : undefined,
      memTotal: Number.isFinite(msg.memTotalMB) ? msg.memTotalMB / 1024 : undefined,
      gpu: Number.isFinite(msg.gpu) ? msg.gpu : undefined,
      vram: Number.isFinite(msg.vramMB) ? msg.vramMB / 1024 : undefined,
    };
    this.fg = msg.fg && Number.isFinite(msg.fg.pid) ? msg.fg : undefined;
    this.evaluate();
    if (this.fg?.pid !== before) this.emit("foreground", this.fg);
  }
  // Foreground → game start / focus change / end.
  evaluate() {
    const s = this.settings;
    if (!s.enabled) {
      if (this.game) this.endGame();
      return;
    }
    const fg = this.fg;
    if (this.game && !this.alive(this.game.pid)) this.endGame();
    const detect = (path: string, title: string, fullscreen: boolean, gpu?: number) =>
      detectGame(path, title, {
        installed: this.installed,
        games: this.store.state.games,
        mappings: s.mappings,
        ignore: s.ignore,
        fullscreen,
        gpu,
      });
    // 1. The program in front: an unknown full-screen program counts only here.
    if (fg && !fg.self) {
      const det = detect(fg.path, fg.title, fg.full, fg.gpu);
      if (det && this.game?.pid !== fg.pid) this.startGame(fg, det);
    }
    // 2. 2.0.1: a known game whose window is open counts without focus, so FPS
    //    measuring starts as soon as the game window appears.
    if (!this.game)
      for (const w of this.wins) {
        const det = detect(w.path, w.title, false);
        if (det?.known) {
          this.startGame(w, det);
          break;
        }
      }
    const g = this.game;
    if (!g) return;
    // Window state: shown while open and not minimized, wherever the focus is.
    const win =
      this.wins.find((w) => w.hwnd === g.hwnd) ||
      this.wins.find((w) => w.pid === g.pid && !w.iconic) ||
      this.wins.find((w) => w.pid === g.pid);
    if (win) {
      g.hwnd = win.hwnd;
      g.visible = !win.iconic;
      if (win.client) g.client = win.client;
    } else if (this.helper) g.visible = false;
    const front = !!fg && (fg.pid === g.pid || (!!fg.self && this.panelOpen));
    if (fg?.pid === g.pid) {
      g.hwnd = fg.hwnd;
      g.mon = fg.mon;
      g.visible = true;
    }
    if (front !== g.foreground) this.focusChanged(front);
  }
  // Keeps the overlay windows directly above the game window (helper).
  follow(windows: string[]) {
    this.send(
      this.game && windows.length
        ? `follow ${this.game.hwnd} ${windows.join(" ")}`
        : "follow 0",
    );
  }
  private alive(pid: number) {
    if (this.o.simulate) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e: any) {
      return e?.code === "EPERM";
    }
  }
  private startGame(
    fg: Pick<Foreground, "pid" | "path" | "title" | "hwnd" | "mon"> & {
      client?: number[];
    },
    det: ReturnType<typeof detectGame> & {},
  ) {
    this.endGame();
    const g = det.gameId
      ? this.store.state.games.find((x) => x.id === det.gameId)
      : undefined;
    this.game = {
      name: det.name,
      exe: path.win32.basename(fg.path).toLowerCase(),
      pid: fg.pid,
      gameId: det.gameId,
      cover: g?.cover,
      known: det.known,
      startedAt: new Date().toISOString(),
      foreground: this.fg?.pid === fg.pid,
      visible: true,
      client: fg.client,
      hwnd: fg.hwnd,
      mon: fg.mon,
      played: 0,
      firstPlay: true,
    };
    this.frames = [];
    this.startFps();
    this.applyFps(true);
    this.applyMute(true);
    if (g && this.settings.autoPlaying && g.status === "planned")
      try {
        this.store.edit(g.id, { status: "playing" }, false);
      } catch {
        /* game removed meanwhile */
      }
    this.emit("game", this.game);
    this.katmanStart();
  }
  /* 2.2.0: oyun içi katman etkin mi? (enjeksiyon tuttuysa pencere katmanı gizlenir) */
  katmanInjected(): boolean {
    return this.katmanPid !== 0;
  }
  katmanActive(): boolean {
    if (process.platform !== "win32") return false;
    const s = this.settings;
    if (s.drawMode === "window" || !s.enabled) return false;
    if (!this.game || this.katmanBlocked) return false;
    const st = this.katmanStatus;
    return !!st && st.state >= 2 && st.pid === this.game.pid;
  }
  private katmanStart() {
    this.katmanBlocked = "";
    this.katmanStatus = null;
    this.katmanPanel = false;
    if (!this.game || process.platform !== "win32") return;
    if (this.settings.drawMode === "window") return;
    this.katmanPid = this.game.pid;
    this.send(`inject ${this.game.pid}`);
    this.pushOsd(true);
  }
  /* Ayarlardan yöntem değişince: katmanı sök ya da yeniden kur. */
  endGameKatman() {
    if (this.katmanPid) {
      this.send("eject");
      this.katmanPid = 0;
    }
    this.katmanStatus = null;
    this.katmanPanel = false;
  }
  restartKatman() {
    this.endGameKatman();
    this.katmanStart();
  }
  /* Oyun içi paneli aç/kapat (tepsi menüsü ve uygulama düğmeleri için). */
  setKatmanPanel(open: boolean) {
    this.katmanPanel = open;
    this.emit("katmanPanel", open);
    this.pushOsd(true);
  }
  /* Görünüm verisini paylaşımlı belleğe yazar (yardımcı süreç üzerinden). */
  pushOsd(force = false) {
    const now = Date.now();
    if (!force && now - this.katmanLastOsd < 250) return;
    this.katmanLastOsd = now;
    if (process.platform !== "win32" || !this.helper) return;
    const g = this.game;
    const area: [number, number, number, number] =
      g?.client && g.client.length === 4 ? [g.client[0], g.client[1], g.client[2] - g.client[0], g.client[3] - g.client[1]] : [0, 0, 0, 0];
    const payload = katmanPayload({
      data: this.data,
      settings: this.settings,
      status: this.katmanStatus,
      panelOpen: this.katmanPanel,
      panelTab: this.katmanTab,
      pid: g?.pid ?? 0,
      hwnd: g?.hwnd ?? "",
      area,
      scale: this.katmanDpi,
    });
    this.send(`osd ${JSON.stringify(payload)}`);
  }
  endGame() {
    const g = this.game;
    if (!g) return;
    this.game = undefined;
    if (this.katmanPid) {
      this.send("eject");
      this.katmanPid = 0;
    }
    this.katmanStatus = null;
    this.katmanPanel = false;
    try {
      this.pm?.kill();
    } catch {
      /* gone */
    }
    this.pm = undefined;
    this.frames = [];
    if (this.mutedOthers) {
      this.send(`muteothers ${g.pid} 0`);
      this.mutedOthers = false;
    }
    if (g.gameId && g.played >= 30 && this.settings.trackPlaytime)
      this.store.recordPlay(g.gameId, (g.played % 60) / 60, g.firstPlay);
    this.emit("game", undefined);
  }
  private focusChanged(front: boolean) {
    if (!this.game) return;
    this.game.foreground = front;
    this.applyFps(front);
    this.applyMute(front);
    this.emit("game", this.game);
  }
  private applyMute(front: boolean) {
    const g = this.game,
      s = this.settings;
    if (!g) return;
    if (s.muteGameInBackground) this.send(`mute ${g.pid} ${front ? 0 : 1}`);
    const wantOthers = front && s.muteOthers;
    if (wantOthers !== this.mutedOthers) {
      this.send(`muteothers ${g.pid} ${wantOthers ? 1 : 0} ${s.muteExclude.join(";")}`);
      this.mutedOthers = wantOthers;
    }
  }
  fpsFor(exe: string) {
    const s = this.settings;
    return s.gameFps[exe] ?? s.fpsLimit;
  }
  applyFps(front: boolean) {
    const g = this.game,
      s = this.settings;
    if (!g) return;
    if (s.fpsMethod === "rtss") {
      const limit = !front && s.backgroundFps > 0 ? s.backgroundFps : this.fpsFor(g.exe);
      this.send(`rtss ${g.exe} ${limit}`);
      this.data.limits = { method: "rtss", applied: limit || undefined };
    } else if (s.fpsMethod === "nvidia") {
      const limit = this.fpsFor(g.exe);
      if (this.nvApplied.get(g.exe) !== limit) {
        this.nvApplied.set(g.exe, limit);
        this.send(`nvfps ${g.exe} ${limit}`);
      }
      this.data.limits = {
        method: "nvidia",
        applied: limit || undefined,
        message: "NVIDIA sınırı oyun yeniden açılınca geçerli olur.",
      };
    } else this.data.limits = { method: "off" };
  }
  // A changed limit for the current game (settings screen / Ctrl+Tab panel).
  reapply() {
    if (!this.game) return;
    this.nvApplied.delete(this.game.exe);
    this.applyFps(this.game.foreground);
    this.applyMute(this.game.foreground);
  }
  private startFps() {
    const g = this.game;
    if (!g || this.o.simulate) return;
    const exe = path.join(this.dir, "PresentMon.exe");
    if (!fs.existsSync(exe)) {
      this.data.fps = "unavailable";
      this.data.fpsMessage = "PresentMon bulunamadı.";
      return;
    }
    this.data.fps = "starting";
    this.data.fpsMessage = undefined;
    let errors = "",
      header: string[] | undefined;
    const child = spawn(
      exe,
      [
        "--process_id",
        String(g.pid),
        "--output_stdout",
        "--no_console_stats",
        "--stop_existing_session",
        "--session_name",
        "OyunSiralayici",
        "--terminate_on_proc_exit",
        "--no_track_display",
        "--no_track_gpu",
        "--no_track_input",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.pm = child;
    child.stderr!.on("data", (d) => (errors = (errors + String(d)).slice(-2000)));
    readline.createInterface({ input: child.stdout! }).on("line", (line) => {
      const cells = line.split(",");
      if (!header) {
        if (/Application|ProcessID/i.test(line)) header = cells.map((c) => c.trim());
        return;
      }
      const index = [
        "MsBetweenPresents",
        "msBetweenPresents",
        "FrameTime",
        "MsBetweenAppStart",
      ]
        .map((k) => header!.indexOf(k))
        .find((i) => i >= 0);
      const ms = index === undefined ? NaN : Number(cells[index]);
      if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) return;
      this.frames.push(ms);
      if (this.frames.length > 4000) this.frames.splice(0, this.frames.length - 3000);
      this.data.fps = "ok";
    });
    child.on("exit", (code) => {
      if (this.pm !== child) return;
      this.pm = undefined;
      if (/access|denied|admin|elevat|privilege|performance log/i.test(errors)) {
        this.data.fps = "permission";
        this.data.fpsMessage =
          "FPS ölçümü için Windows izni gerekiyor (bir kerelik, Ctrl+Tab panelinden verilebilir).";
      } else if (this.game?.pid === g.pid) {
        this.data.fps = "unavailable";
        this.data.fpsMessage = (
          errors.trim().split(/\r?\n/).at(-1) || `PresentMon kapandı (${code}).`
        ).slice(0, 300);
      }
    });
    child.on("error", (e) => {
      this.data.fps = "unavailable";
      this.data.fpsMessage = e.message;
    });
  }
  private async readLhm() {
    if (!this.settings.lhm) {
      this.lhm = {};
      return;
    }
    try {
      const r = await fetch(this.settings.lhmUrl, { signal: AbortSignal.timeout(1500) });
      this.lhm = lhmTemps(await r.json());
    } catch {
      this.lhm = {};
    }
  }
  private simulate() {
    const t = Date.now() / 1000;
    if (!this.game)
      this.startGame(
        { pid: 4242, path: "C:\\Games\\Demo\\Demo.exe", title: "Demo", hwnd: "0x1" },
        {
          name: this.store.state.games[0]?.name || "Demo oyun",
          gameId: this.store.state.games[0]?.id,
          known: true,
          source: "simulation",
        },
      );
    // OYUN_OVERLAY_SIM_BG=1: the game runs but another program is in front
    // (the overlay smoke checks the Z-order decision on both sides).
    if (this.game) this.game.foreground = process.env.OYUN_OVERLAY_SIM_BG !== "1";
    this.sys = {
      cpu: 34 + 8 * Math.sin(t / 3),
      memUsed: 9.4,
      memTotal: 16,
      gpu: 92,
      vram: 4.1,
    };
    this.nv = {
      util: 93,
      temp: 66 + 4 * Math.sin(t / 7),
      memUsed: 4200,
      memTotal: 6144,
      clock: 1860,
      power: 104,
      fan: 48,
    };
    for (let i = 0; i < 70; i++) this.frames.push(1000 / (118 + 10 * Math.sin(t + i)));
    if (this.frames.length > 4000) this.frames.splice(0, 1000);
    this.data.fps = "ok";
  }
  private tick() {
    const s = this.settings,
      now = Date.now();
    if (this.o.simulate && s.enabled) this.simulate();
    if (this.helper || this.o.simulate) void this.readLhm();
    if (
      !this.helper &&
      (this.o.platform || process.platform) === "win32" &&
      !this.o.simulate
    )
      this.evaluate();
    const g = this.game;
    // Play time: counted while the game runs (in front or not), saved each minute.
    if (g?.gameId && s.trackPlaytime) {
      g.played++;
      if (g.played % 60 === 0) {
        this.store.recordPlay(g.gameId, 1, g.firstPlay);
        g.firstPlay = false;
      }
    }
    // Session limit.
    if (g) {
      const minutes = (now - Date.parse(g.startedAt)) / 60000;
      if (limitDue(minutes, s.sessionLimit, s.remindEvery, g.warnedAt)) {
        g.warnedAt = Math.floor(minutes);
        this.alert(
          "limit",
          `${sessionText(minutes)} oynadın — belirlediğin süre doldu.`,
          "Oyun süresi",
        );
      }
    }
    // Alarms fire once per day at their minute, with or without a game.
    const date = new Date(now);
    const minuteKey = date.toISOString().slice(0, 16);
    if (minuteKey !== this.lastAlarm) {
      this.lastAlarm = minuteKey;
      const due = dueAlarms(s.alarms, date);
      if (due.length) {
        const day = date.toISOString().slice(0, 10);
        this.store.settings({
          overlay: {
            ...s,
            alarms: s.alarms.map((a) =>
              due.some((d) => d.id === a.id) ? { ...a, lastFired: day } : a,
            ),
          },
        });
        for (const a of due)
          this.alert("alarm", `${a.time} ${a.label || "Alarm"}`, "Alarm");
      }
    }
    this.alerts = this.alerts.filter((a) => a.until > now);
    const f = fpsFromFrames(this.frames);
    const nv = this.nv;
    this.data = {
      ...this.data,
      katman: this.katmanStatus ?? undefined,
      game: g
        ? {
            name: g.name,
            exe: g.exe,
            pid: g.pid,
            gameId: g.gameId,
            cover: g.cover,
            known: g.known,
            startedAt: g.startedAt,
            foreground: g.foreground,
            visible: this.o.simulate ? true : g.visible !== false,
            client: g.client,
          }
        : undefined,
      metrics: {
        fps: this.data.fps === "ok" ? (f.fps ?? null) : null,
        low1: this.data.fps === "ok" ? (f.low1 ?? null) : null,
        frametime: this.data.fps === "ok" ? (f.frametime ?? null) : null,
        cpu: this.sys.cpu ?? null,
        cpuTemp: this.lhm.cpuTemp ?? null,
        gpu: nv?.util ?? this.sys.gpu ?? null,
        gpuTemp: nv?.temp ?? this.lhm.gpuTemp ?? null,
        vram: nv?.memUsed != null ? nv.memUsed / 1024 : (this.sys.vram ?? null),
        ram: this.sys.memUsed ?? null,
        gpuPower: nv?.power ?? null,
        gpuClock: nv?.clock ?? null,
        fan: nv?.fan ?? null,
      },
      totals: {
        ramGB: this.sys.memTotal,
        vramGB: nv?.memTotal != null ? nv.memTotal / 1024 : undefined,
      },
      sensors: {
        gpu: nv ? "nvidia" : this.sys.gpu !== undefined ? "windows" : "none",
        cpuTemp: this.lhm.cpuTemp !== undefined ? "lhm" : "none",
      },
      fps: g ? this.data.fps : "off",
      fpsMessage: g ? this.data.fpsMessage : this.helperBroken || undefined,
      alerts: this.alerts,
      now,
    };
    this.emit("data", this.data);
  }
  alert(kind: OverlayAlert["kind"], text: string, title: string) {
    this.alerts.push({
      id: `${kind}-${Date.now()}`,
      kind,
      text,
      until: Date.now() + 15000,
    });
    this.o.notify?.(title, text);
  }
  focusGame() {
    if (this.game?.hwnd) this.send(`focus ${this.game.hwnd}`);
  }
  // Exe names that became "not a game" / mapped from the panel.
  forget() {
    this.endGame();
  }
}
