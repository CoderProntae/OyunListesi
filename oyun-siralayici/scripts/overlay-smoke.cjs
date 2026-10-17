// 2.0: real Electron windows with a simulated game (OYUN_OVERLAY_SIM=1):
// the corner HUD appears, the Ctrl+Tab panel opens and saves, the main window
// shows "Şimdi oynanıyor", closing the window keeps the app in the tray.
const { _electron } = require("playwright");
const path = require("path");
const fs = require("fs");
(async () => {
  fs.mkdirSync(".cache", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".cache/overlay-smoke-"));
  const app = await _electron.launch({
    args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
    env: { ...process.env, XDG_CONFIG_HOME: root, OYUN_OVERLAY_SIM: "1", OYUN_UPDATE_CHANNEL: "off" },
    timeout: 20000,
  });
  const result = {};
  try {
    const win = await app.firstWindow();
    win.on("pageerror", (e) => console.error("PAGEERROR main", e.message));
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor({ timeout: 20000 });
    await win.locator(".now-playing").waitFor({ timeout: 15000 });
    result.nowPlaying = await win.locator(".now-playing b").innerText();
    // HUD window
    let hud;
    for (let i = 0; i < 40 && !hud; i++) {
      hud = app.windows().find((w) => w.url().includes("overlay.html#hud"));
      if (!hud) await new Promise((r) => setTimeout(r, 250));
    }
    if (!hud) throw new Error("HUD window did not open");
    hud.on("pageerror", (e) => console.error("PAGEERROR hud", e.message));
    // 2.0.1: first the sliding "Şimdi oynanıyor" notice, then the values.
    await hud.locator("[data-testid=overlay-toast]").waitFor({ timeout: 8000 });
    result.toast = (await hud.locator("[data-testid=overlay-toast]").innerText()).replace(/\s+/g, " ");
    await hud.screenshot({ path: path.resolve(".cache/overlay-smoke-toast.png") });
    await hud.locator("[data-testid=overlay-hud]").waitFor({ timeout: 10000 });
    result.titleAlwaysShown = await hud.locator(".hud-title").count();
    await hud.waitForFunction(() => /\d/.test(document.querySelector(".hud-metric b")?.textContent || ""), null, { timeout: 10000 });
    result.hudText = (await hud.locator("[data-testid=overlay-hud]").innerText()).replace(/\s+/g, " ").slice(0, 120);
    await hud.screenshot({ path: path.resolve(".cache/overlay-smoke-hud.png") });
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().includes("#hud"))
        .map((w) => ({ ...w.getBounds(), top: w.isAlwaysOnTop(), focusable: w.isFocusable(), visible: w.isVisible() })),
    );
    result.hudBounds = bounds[0];
    if (!bounds[0]?.visible || !bounds[0].top || bounds[0].focusable) throw new Error("HUD window flags wrong");
    // Panel (what Ctrl+Tab does) through the overlay action
    await win.evaluate(() => window.desktop.call("overlayAction", { name: "openPanel" }));
    let panel;
    for (let i = 0; i < 40 && !panel; i++) {
      panel = app.windows().find((w) => w.url().includes("overlay.html#panel"));
      if (!panel) await new Promise((r) => setTimeout(r, 250));
    }
    if (!panel) throw new Error("Panel window did not open");
    panel.on("pageerror", (e) => console.error("PAGEERROR panel", e.message));
    await panel.locator("[data-testid=overlay-panel]").waitFor({ timeout: 10000 });
    // 2.1.6: the panel must never open behind the game.
    const panelFlags = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().includes("#panel"))
        .map((w) => ({ top: w.isAlwaysOnTop(), visible: w.isVisible() })),
    );
    result.panelTop = panelFlags[0];
    if (!panelFlags[0]?.visible || !panelFlags[0].top) throw new Error("Panel is not above the game");
    await panel.getByRole("tab", { name: "Süre ve alarm" }).click();
    await panel.getByRole("button", { name: "90 dk" }).click();
    await panel.waitForTimeout(400);
    const s = await win.evaluate(() => window.desktop.call("bootstrap", {}));
    result.savedLimit = s.state.settings.overlay.sessionLimit;
    if (result.savedLimit !== 90) throw new Error("Panel did not save");
    await panel.screenshot({ path: path.resolve(".cache/overlay-smoke-panel.png") });
    await panel.keyboard.press("Escape");
    await panel.waitForTimeout(400);
    result.panelClosed = !(await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes("#panel") && w.isVisible()),
    ));
    // Close button hides to the tray instead of quitting
    await win.evaluate(() => window.desktop.call("window", { action: "close" }));
    await new Promise((r) => setTimeout(r, 600));
    result.hiddenToTray = await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"));
      return !!main && !main.isDestroyed() && !main.isVisible();
    });
    const playtime = s.state.playtime;
    result.playtimeTracked = typeof playtime === "object";
    if (!result.hiddenToTray) console.error("note: tray unavailable on this desktop; window closed normally");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
  // 2.1.6: the other half of the fix — the game runs but another program is in
  // front. The overlay must drop out of the topmost band, so it never covers
  // other programs (2.0.1), while the helper keeps it above the game window.
  const bgRoot = fs.mkdtempSync(path.resolve(".cache/overlay-smoke-bg-"));
  const bg = await _electron.launch({
    args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
    env: { ...process.env, XDG_CONFIG_HOME: bgRoot, OYUN_OVERLAY_SIM: "1", OYUN_OVERLAY_SIM_BG: "1", OYUN_UPDATE_CHANNEL: "off" },
    timeout: 20000,
  });
  try {
    await bg.firstWindow();
    let hud;
    for (let i = 0; i < 40 && !hud; i++) {
      hud = bg.windows().find((w) => w.url().includes("overlay.html#hud"));
      if (!hud) await new Promise((r) => setTimeout(r, 250));
    }
    if (!hud) throw new Error("BG: HUD window did not open");
    hud.on("pageerror", (e) => console.error("PAGEERROR hud(bg)", e.message));
    await hud.locator("[data-testid=overlay-hud]").waitFor({ timeout: 15000 });
    const flags = await bg.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().includes("#hud"))
        .map((w) => ({ top: w.isAlwaysOnTop(), visible: w.isVisible() })),
    );
    result.bgHud = flags[0];
    if (!flags[0]?.visible) throw new Error("BG: the HUD is not visible");
    if (flags[0].top) throw new Error("BG: the overlay stayed above other programs");
  } finally {
    await bg.close().catch(() => {});
    fs.rmSync(bgRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
