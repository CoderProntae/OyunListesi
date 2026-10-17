import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  shell,
  safeStorage,
  net,
  dialog,
  Menu,
  Notification,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { AppBrowser } from "./browser";
import { Service } from "./service";
import { GameMonitor } from "./overlay/monitor";
import { OverlayManager } from "./overlay/manager";
import {
  readHandoff,
  removeOldExe,
  resumeOldExeCleanup,
  stopLegacyUpdaters,
} from "./update-cleanup";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app-media",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setName("Oyun Siralayici");
let window: BrowserWindow | null = null,
  service: Service,
  browser: AppBrowser,
  overlay: OverlayManager | undefined,
  quitting = false;
const showMain = () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};
// force (update takeover): if something keeps the app from closing, it exits
// anyway after a few seconds — the new version is waiting for it.
let forceTimer: NodeJS.Timeout | undefined;
const quitApp = (force = false) => {
  quitting = true;
  if (force && !forceTimer)
    forceTimer = setTimeout(() => {
      for (const step of [() => overlay?.close(), () => service?.close()])
        try {
          step();
        } catch {
          /* exiting anyway */
        }
      app.exit(0);
    }, 4000);
  app.quit();
};
if (process.platform === "win32") app.setAppUserModelId("local.oyunsiralayici.desktop");
// 2.0.5: started by the previous version's updater. That version stays open
// until this one reports in (second-instance with the token), then closes;
// the lock is free a moment later. Waits at most a minute.
const handoff = readHandoff();
async function singleInstance() {
  if (!handoff) return app.requestSingleInstanceLock();
  const until = Date.now() + 60000;
  while (!app.requestSingleInstanceLock({ oyunGuncelleme: handoff.token })) {
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  return true;
}
void singleInstance().then((locked) => {
  if (locked) return start();
  if (handoff)
    dialog.showErrorBox(
      "Oyun Sıralayıcı",
      "Önceki sürüm kapanmadı. Görev Yöneticisi'nde (Ctrl+Shift+Esc) “Oyun Siralayici” işlemini sonlandırıp bu dosyayı yeniden aç.",
    );
  app.quit();
});
function start() {
  app.on("second-instance", (_event, _argv, _cwd, data: any) => {
    // The new version after an update: never brings this window forward.
    if (data && typeof data === "object" && "oyunGuncelleme" in data) {
      service?.updater.handoff(data.oyunGuncelleme);
      return;
    }
    showMain();
  });
  app
    .whenReady()
    .then(async () => {
      const root = app.getPath("userData"),
        keyFile = path.join(root, "secrets.bin");
      let secrets: Record<string, string> = {};
      if (safeStorage.isEncryptionAvailable() && fs.existsSync(keyFile)) {
        try {
          secrets = JSON.parse(safeStorage.decryptString(fs.readFileSync(keyFile)));
        } catch {}
      }
      service = new Service(root, true, secrets);
      service.saveSecrets = (values) => {
        if (!safeStorage.isEncryptionAvailable())
          throw new Error(
            "İşletim sistemi şifrelemesi yok. Anahtar yalnızca bu oturumda tutuldu.",
          );
        fs.writeFileSync(keyFile, safeStorage.encryptString(JSON.stringify(values)));
      };
      browser = new AppBrowser();
      service.openExternal = (url) => browser.open(url);
      service.openBrowser = () => browser.open();
      service.openFolder = () => {
        void shell.openPath(root);
      };
      service.windowAction = (action) => {
        if (action === "minimize") window?.minimize();
        if (action === "maximize")
          window?.isMaximized() ? window.unmaximize() : window?.maximize();
        if (action === "close") window?.close();
      };
      protocol.handle("app-media", (request) => {
        const u = new URL(request.url),
          name = u.pathname.slice(1);
        if (u.hostname !== "cache" || !/^[a-f0-9]{64}\.img$/.test(name))
          return new Response("Engellendi", { status: 403 });
        const file = path.join(root, "media", name);
        if (!fs.existsSync(file)) return new Response("Bulunamadı", { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      });
      // The frameless window has no visible menu, but Electron's default menu kept
      // hidden shortcuts alive: Ctrl+W / Ctrl+Q closed the whole app, Ctrl+R
      // reloaded the interface, Ctrl+Plus zoomed (which can hide the window
      // buttons), F11 went full screen. Typing, copy/paste and undo in text boxes
      // do not need this menu on Windows.
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        width: 1510,
        height: 960,
        minWidth: 960,
        minHeight: 650,
        frame: false,
        backgroundColor: "#101118",
        show: false,
        title: "Oyun Sıralayıcı",
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          spellcheck: false,
        },
      });
      ipcMain.handle("app:call", async (event, method, args) => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error("İstek kaynağı engellendi.");
        return service.call(method, args);
      });
      // 2.0: closing the window keeps the app in the tray (the game overlay
      // needs it); "Çıkış" in the tray menu really quits.
      window.on("close", (e) => {
        if (!quitting && overlay?.tray && service.store.state.settings.overlay.closeToTray) {
          e.preventDefault();
          window?.hide();
          overlay.notifyBackground();
        }
      });
      window.on("closed", () => {
        browser.close();
        window = null;
        quitApp();
      });
      const html = path.join(__dirname, "../dist/index.html");
      await window.loadFile(html);
      const hidden = process.argv.includes("--hidden");
      if (!hidden) {
        window.once("ready-to-show", () => window?.show());
        window.show();
      }
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (e) => e.preventDefault());
      window.webContents.session.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      service.on("event", (event) => {
        if (window && !window.isDestroyed()) window.webContents.send("app:event", event);
      });
      service.updater.configure({
        desktop: () => app.getPath("desktop"),
        workDir: () => path.join(app.getPath("temp"), "oyun-siralayici-guncelleme"),
        portableExe: () => process.env.PORTABLE_EXECUTABLE_FILE,
        quit: () => quitApp(true),
      });
      // 2.0.5: delete the previous version's EXE (after an update) and stop
      // what the 2.0.0–2.0.4 updater left behind. In the background.
      if (process.platform === "win32") {
        const record = path.join(root, "guncelleme-temizlik.json"),
          own = process.env.PORTABLE_EXECUTABLE_FILE;
        void (
          handoff?.eski ? removeOldExe(handoff.eski, { own, record }) : resumeOldExeCleanup(record, own)
        ).catch(() => {});
        void stopLegacyUpdaters(app.getPath("temp")).catch(() => {});
      }
      // Game detector + overlay (Windows; OYUN_OVERLAY_SIM=1 simulates a game).
      const overlayDir = app.isPackaged
        ? path.join(process.resourcesPath, "overlay")
        : path.join(__dirname, "../resources/overlay");
      const monitor = new GameMonitor(service.store, overlayDir, {
        simulate: process.env.OYUN_OVERLAY_SIM === "1",
        selfPid: process.pid,
        notify: (title, body) => {
          if (Notification.isSupported()) new Notification({ title, body }).show();
        },
      });
      overlay = new OverlayManager(service, monitor, {
        preload: path.join(__dirname, "overlay-preload.cjs"),
        html: path.join(__dirname, "../dist/overlay.html"),
        icon: path.join(overlayDir, "icon.ico"),
        show: showMain,
        quit: () => quitApp(),
      });
      service.overlay = overlay;
      overlay.init();
      let loginItem = "";
      service.onSettings = () => {
        if (!window) return;
        const s = service.store.state.settings;
        if (process.platform === "win32") {
          const want = JSON.stringify([s.overlay.startWithWindows, s.overlay.startHidden]);
          if (want !== loginItem) {
            loginItem = want;
            try {
              app.setLoginItemSettings({
                openAtLogin: s.overlay.startWithWindows,
                path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
                args: s.overlay.startHidden ? ["--hidden"] : [],
              });
            } catch {
              /* login items unavailable */
            }
          }
        }
        window.setOpacity(s.opacity);
        window.setBackgroundColor(s.material === "none" ? "#111219" : "#00000000");
        if (process.platform === "win32") {
          try {
            window.setBackgroundMaterial(s.material === "none" ? "none" : s.material);
          } catch {
            /* Unsupported Windows builds use opaque background. */
          }
        }
      };
      service.onSettings();
      if (service.store.warning)
        dialog.showMessageBox(window, {
          type: "warning",
          message: service.store.warning,
        });
      if (
        service.store.state.settings.firstRun &&
        !service.store.state.hardware.detectedAt
      )
        void service.call("detectHardware").catch(() => {});
    })
    .catch((error) => {
      dialog.showErrorBox("Oyun Sıralayıcı açılamadı", error.message);
      app.quit();
    });
  app.on("before-quit", () => {
    quitting = true;
    overlay?.close();
    service?.close();
  });
  app.on("window-all-closed", () => {
    if (quitting || !overlay?.tray) app.quit();
  });
}
