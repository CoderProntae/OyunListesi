// 2.0.5: the update handoff between two real Electron instances (same data
// folder). The new instance (B, started with OYUN_GUNCELLEME) must not open a
// window while the old one (A) runs, must keep telling A its token, and must
// take over by itself as soon as A has closed.
const { _electron } = require("playwright");
const path = require("path");
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(".cache", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".cache/handoff-smoke-"));
  const args = [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"];
  const env = { ...process.env, XDG_CONFIG_HOME: root };
  delete env.OYUN_GUNCELLEME;
  const a = await _electron.launch({ args, env, timeout: 20000 });
  let b;
  try {
    const aw = await a.firstWindow();
    await aw.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor({ timeout: 20000 });
    await a.evaluate(({ app, BrowserWindow }) => {
      globalThis.__seen = [];
      app.on("second-instance", (_e, _argv, _cwd, data) => {
        const w = BrowserWindow.getAllWindows()[0];
        globalThis.__seen.push({ data, focused: !!w?.isFocused(), visible: !!w?.isVisible() });
      });
    });
    const token = "ab".repeat(24);
    b = await _electron.launch({
      args,
      env: { ...env, OYUN_GUNCELLEME: JSON.stringify({ token, eski: "" }) },
      timeout: 20000,
    });
    let seen = [];
    for (const until = Date.now() + 15000; Date.now() < until; await sleep(200)) {
      seen = await a.evaluate(() => globalThis.__seen);
      if (seen.length >= 3) break;
    }
    if (seen.length < 2 || seen.some((s) => s.data?.oyunGuncelleme !== token))
      throw new Error("A did not keep receiving the token: " + JSON.stringify(seen));
    if (b.windows().length) throw new Error("B opened a window while A still runs");
    const closedAt = Date.now();
    await a.close();
    const bw = await b.firstWindow({ timeout: 30000 });
    const takeoverMs = Date.now() - closedAt;
    await bw.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor({ timeout: 20000 });
    const leaked = await b.evaluate(() => process.env.OYUN_GUNCELLEME ?? null);
    if (leaked !== null) throw new Error("OYUN_GUNCELLEME is still in B's environment");
    const s = await bw.evaluate(() => window.desktop.call("bootstrap", {}));
    if (!s.desktop) throw new Error("B: desktop bridge missing");
    // A normal second start now just brings B forward (no token, no takeover).
    console.log(JSON.stringify({ tokenMessages: seen.length, takeoverMs, bridge: true }));
  } finally {
    await a.close().catch(() => {});
    await b?.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
