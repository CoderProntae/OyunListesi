const { _electron } = require("playwright");
const path = require("path");
const fs = require("fs");
(async () => {
  fs.mkdirSync(".cache", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".cache/electron-smoke-"));
  const app = await _electron.launch({
    args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
    env: { ...process.env, XDG_CONFIG_HOME: root },
    timeout: 20000,
  });
  try {
    const win = await app.firstWindow();
    win.on("pageerror", (e) => console.error("PAGEERROR", e.message));
    await win
      .getByRole("heading", { name: "İstatistikler", exact: true })
      .waitFor({ timeout: 20000 });
    await win.waitForFunction(() => {
      let e = document.querySelector(".chat-panel");
      while (e) {
        if (Number(getComputedStyle(e).opacity) < 1) return false;
        e = e.parentElement;
      }
      return true;
    });
    await win.screenshot({
      path: path.resolve(`docs/arayuz-${require("../package.json").version}.png`),
    });
    const state = await win.evaluate(() => window.desktop.call("bootstrap", {}));
    if (!state.desktop) throw new Error("Desktop bridge missing");
    if (state.state.settings.requireApproval !== false)
      throw new Error("Autonomous default missing");
    if (await win.locator(".composer-note").count())
      throw new Error("Removed slogan is visible");
    if (state.dataPath.includes("preview-data")) throw new Error("Wrong data directory");
    const r = await win.evaluate(() =>
      window.desktop.call("add", { items: [{ name: "Desktop smoke test" }] }),
    );
    await win.evaluate(() => window.desktop.call("cancelQueue", {}));
    await win
      .locator(".game-row-text strong")
      .filter({ hasText: "Desktop smoke test" })
      .waitFor();
    await win.evaluate((ids) => window.desktop.call("remove", { ids }), r.added);
    await win.evaluate(() => window.desktop.call("undo", {}));
    const s = await win.evaluate(() => window.desktop.call("bootstrap", {}));
    if (!s.state.games.some((g) => g.name === "Desktop smoke test"))
      throw new Error("Undo failed");
    await win.screenshot({ path: path.resolve(".cache/electron-smoke.png") });
    // 1.0.14: no hidden default menu, so Ctrl+W / Ctrl+Q / Ctrl+R / zoom / F11
    // cannot close, reload or resize the frameless window by accident.
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu());
    if (menu) throw new Error("Hidden default menu shortcuts are still active");
    console.log(
      JSON.stringify({
        desktop: true,
        autonomousDefault: true,
        bridge: true,
        add: true,
        remove: true,
        undo: true,
        hiddenMenuShortcutsRemoved: true,
        dataPath: state.dataPath,
        platform: "Linux (not a Windows runtime test)",
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
