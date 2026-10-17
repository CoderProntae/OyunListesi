import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
} from "electron";
import os from "node:os";
import { spawn } from "node:child_process";
import type { Service } from "../service";
import type { GameMonitor } from "./monitor";
import { activePreset, overlayTopmost, type OverlayData } from "../../shared/overlay";
// The in-game overlay windows (a click-through HUD in a corner and the
// Ctrl+Tab panel), the tray icon and the hotkey. The hotkey is registered only
// while a game is in front, so Ctrl+Tab keeps working in browsers and editors.
export class OverlayManager {
  hud?: BrowserWindow;
  panel?: BrowserWindow;
  tray?: Tray;
  private hotkey = "";
  private size = { width: 240, height: 120 };
  private notified = false;
  private followKey = "";
  private topmostOn = false;
  // 2.0.1 (Windows): the helper keeps the overlay directly above the game
  // window, so it stays inside the game: covered with it, minimized with it,
  // visible without the game having focus. 2.1.6: on top of that the windows are
  // topmost while the game is in front (see topmost()); the simulated game runs
  // the same path, so the overlay smoke tests what Windows really does.
  private readonly inGame =
    process.platform === "win32" || process.env.OYUN_OVERLAY_SIM === "1";
  constructor(
    private service: Service,
    public monitor: GameMonitor,
    private o: {
      preload: string;
      html: string;
      icon: string;
      show: () => void;
      quit: () => void;
    },
  ) {}
  private get settings() {
    return this.service.store.state.settings.overlay;
  }
  init() {
    this.createTray();
    this.monitor.on("data", (d: OverlayData) => this.push(d));
    // Moved / resized / minimized game window: follow at once, not next second.
    this.monitor.on("window", () => this.push(this.monitor.data, true));
    // Another program came to the front: the Ctrl+Tab panel goes away by itself.
    this.monitor.on("foreground", (fg: any) => {
      if (
        this.panel?.isVisible() &&
        fg &&
        !fg.self &&
        fg.pid !== this.monitor.running?.pid
      )
        this.closePanel(false);
    });
    this.monitor.on("game", (g) =>
      this.service.event({
        type: "nowPlaying",
        data: g
          ? {
              name: g.name,
              gameId: g.gameId,
              exe: g.exe,
              startedAt: g.startedAt,
              foreground: g.foreground,
              known: g.known,
            }
          : null,
      }),
    );
    ipcMain.handle("overlay:call", async (event, method: string, args: any) => {
      const senders = [this.hud?.webContents, this.panel?.webContents].filter(Boolean);
      if (!senders.includes(event.sender)) throw new Error("İstek kaynağı engellendi.");
      return this.call(method, args || {});
    });
    this.monitor.start();
  }
  async call(method: string, a: any) {
    switch (method) {
      case "state":
        return this.state();
      case "settings":
        return this.service.call("overlaySettings", a);
      case "action":
        return this.action(a.name, a.args || {});
      case "resize":
        this.size = {
          width: Math.max(80, Math.min(900, Math.round(Number(a.width) || 240))),
          height: Math.max(30, Math.min(900, Math.round(Number(a.height) || 120))),
        };
        this.place();
        return true;
      case "close":
        this.closePanel();
        return true;
    }
    throw new Error("Bilinmeyen katman işlemi.");
  }
  state() {
    return {
      settings: this.settings,
      data: this.monitor.data,
      games: this.service.store.state.games.map((g) => ({ id: g.id, name: g.name })),
      platform: process.platform,
    };
  }
  // Actions shared by the Ctrl+Tab panel and the settings screen.
  async action(name: string, a: any) {
    const s = this.settings,
      g = this.monitor.running;
    switch (name) {
      case "state":
        return this.state();
      case "reapply":
        this.monitor.reapply();
        return { ok: true };
      case "ignoreCurrent":
        if (!g) throw new Error("Şu an tanınmış bir oyun yok.");
        await this.service.call("overlaySettings", {
          patch: { ignore: [...new Set([...s.ignore, g.exe])] },
        });
        this.monitor.forget();
        return { ok: true };
      case "mapCurrent": {
        if (!g) throw new Error("Şu an tanınmış bir oyun yok.");
        const game = this.service.store.state.games.find((x) => x.id === a.gameId);
        const mappings = [
          ...s.mappings.filter((m) => m.exe !== g.exe),
          {
            exe: g.exe,
            gameId: game?.id,
            name: game?.name || String(a.name || g.name).slice(0, 300),
          },
        ];
        await this.service.call("overlaySettings", { patch: { mappings } });
        this.monitor.forget();
        return { ok: true };
      }
      case "testAlert":
        this.monitor.alert("info", "Uyarı ve renk denemesi.", "Oyun katmanı");
        return { ok: true };
      case "openPanel":
        this.openPanel();
        return { ok: true };
      case "closePanel":
        this.closePanel();
        return { ok: true };
      case "fpsPermission":
        return this.fpsPermission();
    }
    throw new Error("Bilinmeyen katman işlemi.");
  }
  // One-time: adds this Windows user to "Performance Log Users" (well-known
  // SID S-1-5-32-559, so the group name's language does not matter). PresentMon
  // can then read frame events without running as administrator.
  private fpsPermission() {
    if (process.platform !== "win32") throw new Error("Yalnız Windows'ta gerekir.");
    const user =
      `${process.env.USERDOMAIN || os.hostname()}\\${os.userInfo().username}`.replace(
        /'/g,
        "''",
      );
    const script = `try { Add-LocalGroupMember -SID 'S-1-5-32-559' -Member '${user}' -ErrorAction Stop } catch { if ($_.Exception.Message -notmatch 'already|zaten|member') { $g = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-559')).Translate([System.Security.Principal.NTAccount]).Value.Split('\\')[1]; net localgroup "$g" '${user}' /add } }`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return new Promise((resolve) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `try { Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'; exit 0 } catch { exit 1 }`,
        ],
        { windowsHide: true },
      );
      child.on("exit", (code) =>
        resolve(
          code === 0
            ? {
                ok: true,
                message:
                  "İzin verildi. Windows'tan bir kez çıkış yapıp yeniden girince FPS görünür.",
              }
            : {
                ok: false,
                message: "İzin verilmedi (Windows onay penceresi kapatıldı).",
              },
        ),
      );
      child.on("error", (e) => resolve({ ok: false, message: e.message }));
    });
  }
  private createTray() {
    try {
      const image = nativeImage.createFromPath(this.o.icon);
      this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
      this.tray.setToolTip("Oyun Sıralayıcı");
      this.tray.on("click", () => this.o.show());
      this.updateTray();
    } catch {
      this.tray = undefined;
    }
  }
  updateTray() {
    if (!this.tray) return;
    const s = this.settings;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Oyun Sıralayıcı'yı aç", click: () => this.o.show() },
        { type: "separator" },
        {
          label: "Oyun katmanı",
          type: "checkbox",
          checked: s.enabled,
          click: (item) =>
            void this.service.call("overlaySettings", {
              patch: { enabled: item.checked },
            }),
        },
        { label: "Katman ayarları", click: () => this.openPanel() },
        { type: "separator" },
        { label: "Çıkış", click: () => this.o.quit() },
      ]),
    );
  }
  notifyBackground() {
    if (this.notified || !Notification.isSupported()) return;
    this.notified = true;
    new Notification({
      title: "Oyun Sıralayıcı arka planda",
      body: "Oyun katmanı için çalışmaya devam ediyor. Tamamen kapatmak için görev çubuğundaki simgeden Çıkış'ı seç.",
    }).show();
  }
  private window(kind: "hud" | "panel") {
    const panel = kind === "panel";
    const w = new BrowserWindow({
      width: panel ? 860 : this.size.width,
      height: panel ? 620 : this.size.height,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: panel,
      minimizable: false,
      maximizable: false,
      focusable: panel,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      alwaysOnTop: !this.inGame,
      webPreferences: {
        preload: this.o.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    w.setAlwaysOnTop(this.topmostOn || !this.inGame, "screen-saver");
    if (!panel) w.setIgnoreMouseEvents(true);
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    void w.loadFile(this.o.html, { hash: kind });
    return w;
  }
  private display() {
    const mon = this.monitor.running?.mon;
    if (mon && process.platform === "win32")
      try {
        return screen.getDisplayNearestPoint(
          screen.screenToDipPoint({
            x: Math.round((mon[0] + mon[2]) / 2),
            y: Math.round((mon[1] + mon[3]) / 2),
          }),
        );
      } catch {
        /* fall through */
      }
    return screen.getPrimaryDisplay();
  }
  // Area the overlay sits in: the game's client area (DIP) on Windows, else the screen.
  private area() {
    const c = this.monitor.running?.client;
    if (this.inGame && c && c[2] - c[0] > 100 && c[3] - c[1] > 100)
      try {
        return screen.screenToDipRect(null, {
          x: c[0],
          y: c[1],
          width: c[2] - c[0],
          height: c[3] - c[1],
        });
      } catch {
        /* fall back to the display */
      }
    return this.display().bounds;
  }
  private handle(w?: BrowserWindow) {
    if (!w || w.isDestroyed()) return "";
    const b = w.getNativeWindowHandle();
    return b.length >= 8
      ? "0x" + b.readBigUInt64LE(0).toString(16)
      : "0x" + b.readUInt32LE(0).toString(16);
  }
  private follow() {
    if (!this.inGame) return;
    const g = this.monitor.running;
    const windows = [
      this.handle(this.hud),
      this.panel?.isVisible() ? this.handle(this.panel) : "",
    ].filter(Boolean);
    const key = g ? `${g.hwnd}|${windows.join(",")}` : "";
    if (key === this.followKey) return;
    this.followKey = key;
    this.monitor.follow(g ? windows : []);
  }
  private place() {
    if (!this.hud || this.hud.isDestroyed()) return;
    const p = activePreset(this.settings),
      b = this.area(),
      m = 14;
    const x = p.position.endsWith("left") ? b.x + m : b.x + b.width - this.size.width - m,
      y = p.position.startsWith("top") ? b.y + m : b.y + b.height - this.size.height - m;
    const next = { x: Math.round(x), y: Math.round(y), ...this.size };
    const now = this.hud.getBounds();
    if (
      now.x !== next.x ||
      now.y !== next.y ||
      now.width !== next.width ||
      now.height !== next.height
    )
      this.hud.setBounds(next);
  }
  /* 2.1.6: above everything while the game (or its panel) is in front. Some
     games re-raise their own window every frame, inside the topmost band too, so
     the Z order is re-asserted on every push (1 s) and not only on the change. */
  private topmost(on: boolean) {
    const changed = this.topmostOn !== on;
    this.topmostOn = on;
    for (const w of [this.hud, this.panel]) {
      if (!w || w.isDestroyed()) continue;
      if (changed) w.setAlwaysOnTop(on, "screen-saver");
      if (on) w.moveTop();
    }
  }
  push(d: OverlayData, moved = false) {
    const s = this.settings;
    // 2.2.0: the injected in-game layer draws the HUD and the panel itself;
    // the click-through window stays hidden so nothing is doubled.
    if (this.monitor.katmanActive()) {
      if (this.hud?.isVisible()) this.hud.hide();
      if (this.panel?.isVisible()) this.panel.hide();
      this.shortcut(false);
      this.monitor.pushOsd();
      return;
    }
    const panelOpen = !!this.panel?.isVisible();
    // 2.0.1: shown while the game window is open (focus not needed); on
    // Windows the Z order keeps it inside the game, never above other programs.
    const show = s.enabled && !!d.game && d.game.visible !== false && !panelOpen;
    this.topmost(overlayTopmost(d.game, panelOpen));
    if (show) {
      if (!this.hud || this.hud.isDestroyed()) this.hud = this.window("hud");
      this.place();
      if (!this.hud.isVisible()) this.hud.showInactive();
      this.follow();
      if (!moved) this.hud.webContents.send("overlay:data", d);
    } else if (this.hud?.isVisible()) this.hud.hide();
    if (!d.game) this.follow();
    if (panelOpen && !moved) this.panel!.webContents.send("overlay:data", d);
    this.shortcut(s.enabled && (!!d.game?.foreground || panelOpen));
  }
  private shortcut(on: boolean) {
    const key = this.settings.hotkey || "Control+Tab";
    if (on && this.hotkey !== key) {
      if (this.hotkey) globalShortcut.unregister(this.hotkey);
      this.hotkey = "";
      try {
        if (globalShortcut.register(key, () => this.togglePanel())) this.hotkey = key;
      } catch {
        /* invalid or taken accelerator */
      }
    } else if (!on && this.hotkey) {
      globalShortcut.unregister(this.hotkey);
      this.hotkey = "";
    }
  }
  togglePanel() {
    if (this.panel?.isVisible()) this.closePanel();
    else this.openPanel();
  }
  /* 2.2.0: oyun içi paneli kapat (Esc / kısayol oyunun içinden gelir). */
  closeKatmanPanel() {
    if (this.monitor.katmanActive()) this.monitor.setKatmanPanel(false);
    else this.closePanel();
  }
  openPanel() {
    // 2.2.0: oyun içi katman çiziyorsa panel de oyunun içinde açılır.
    if (this.monitor.katmanActive()) {
      this.monitor.setKatmanPanel(true);
      return;
    }
    if (!this.panel || this.panel.isDestroyed()) {
      this.panel = this.window("panel");
      this.panel.on("blur", () => {
        /* stays until closed with the hotkey / Esc / Kapat */
      });
    }
    const b = this.display().workArea,
      [w, h] = this.panel.getSize();
    this.panel.setBounds({
      x: Math.round(b.x + (b.width - w) / 2),
      y: Math.round(b.y + (b.height - h) / 2),
      width: w,
      height: h,
    });
    this.hud?.hide();
    this.monitor.panelOpen = true;
    this.topmost(true); // 2.1.6: the panel is never behind the game
    this.panel.show();
    this.panel.focus();
    this.follow();
    this.panel.webContents.send("overlay:data", this.monitor.data);
    this.shortcut(true);
  }
  // refocus=false: the user went to another program; leave the focus there.
  closePanel(refocus = true) {
    if (!this.panel?.isVisible()) return;
    this.monitor.panelOpen = false;
    this.panel.hide();
    if (refocus) this.monitor.focusGame();
    this.push(this.monitor.data);
  }
  settingsChanged() {
    this.updateTray();
    this.monitor.reapply();
    this.place();
    // 2.2.0: DPI ölçeği + görünüm verisi yenilenir; yöntem değiştiyse katman
    // yeniden kurulur ya da sökülür.
    try {
      this.monitor.katmanDpi = screen.getPrimaryDisplay().scaleFactor || 1;
    } catch {
      this.monitor.katmanDpi = 1;
    }
    // Ayar değişince katmanı SÖKME: söküp takmak paneli öldürür (2.2.0 hatası).
    // Yalnız hiç kurulmadıysa kurulur, yöntem "pencere" yapıldıysa sökülür.
    if (this.monitor.settings.drawMode === "window") this.monitor.endGameKatman();
    else if (this.monitor.running && !this.monitor.katmanInjected()) this.monitor.restartKatman();
    this.monitor.pushOsd(true);
    this.push(this.monitor.data);
  }
  close() {
    globalShortcut.unregisterAll();
    this.topmost(false);
    this.monitor.stop();
    this.tray?.destroy();
    for (const w of [this.hud, this.panel]) if (w && !w.isDestroyed()) w.destroy();
  }
}
