// Live network smoke (real stores + HowLongToBeat). Phase 2 simulates a game
// refreshed by 1.0.12 (stores present, times missing) and checks that the
// background times-only refill brings "Ne kadar sürer?" back without touching
// anything else.
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const path = require("path"),
  fs = require("fs");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".cache/catalog-ui-"));
  const launch = () =>
    _electron.launch({
      args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
      env: { ...process.env, XDG_CONFIG_HOME: root },
      timeout: 25000,
    });
  let app = await launch();
  const quit = async () => {
    const closed = app.waitForEvent("close");
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit());
    });
    await closed;
    app = undefined;
  };
  const stardew = (win) =>
    win.evaluate(async () =>
      (await window.desktop.call("bootstrap", {})).state.games.find(
        (g) => g.name === "Stardew Valley",
      ),
    );
  // Polled from Node: a page-side async predicate would return a (truthy) Promise.
  const waitGame = async (win, check, timeout) => {
    const end = Date.now() + timeout;
    for (;;) {
      const g = await stardew(win);
      if (g && check(g)) return g;
      if (Date.now() > end) throw new Error("Timed out waiting for Stardew Valley data");
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  try {
    let win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    await win.evaluate(() =>
      window.desktop.call("settings", {
        patch: { autoSummary: false, autoResearch: false, animations: false },
      }),
    );
    await win.evaluate(() =>
      window.desktop.call("add", { items: [{ name: "Stardew Valley", appId: 413150 }] }),
    );
    await waitGame(win, (g) => !!g.catalogCheckedAt && !!g.hltb, 110000);
    await win
      .locator(".game-row-text strong")
      .filter({ hasText: "Stardew Valley" })
      .click();
    await win.getByRole("tab", { name: "Mağazalar", exact: true }).click();
    await win
      .getByTestId("catalog-GOG")
      .getByRole("button", { name: "Ürün sayfası" })
      .waitFor();
    // Historical 1.0.5 screenshots in docs/ stay untouched.
    await win.screenshot({ path: path.resolve(".cache/magazalar-canli.png") });
    await win.getByRole("tab", { name: "Genel bakış", exact: true }).click();
    await win.locator(".playtime-section").scrollIntoViewIfNeeded();
    await win.screenshot({ path: path.resolve(".cache/sureler-canli.png") });
    const g = await stardew(win);
    if (!g.stores.some((s) => s.name === "GOG"))
      throw new Error("Live metadata not received");
    if (g.turkish !== undefined) throw new Error("Removed Turkish data was fetched");
    if (!g.hltb) throw new Error("HowLongToBeat lookup did not run");
    const { dataPath } = await win.evaluate(() => window.desktop.call("bootstrap", {}));
    await quit();

    // Phase 2: what a 1.0.12 refresh left behind (stores yes, times no).
    const file = path.join(dataPath, "library.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    const before = saved.games.find((x) => x.name === "Stardew Valley");
    delete before.hltb;
    before.sources = before.sources.filter((s) => !s.fields?.includes("hltb"));
    fs.writeFileSync(file, JSON.stringify(saved));
    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const atStart = await stardew(win);
    if (atStart.hltb) throw new Error("Times were not removed for phase 2");
    const refilled = await waitGame(win, (g) => !!g.hltb, 90000);
    if (refilled.fetchStatus !== before.fetchStatus)
      throw new Error(
        `fetchStatus changed: ${before.fetchStatus} -> ${refilled.fetchStatus}`,
      );
    if (JSON.stringify(refilled.stores) !== JSON.stringify(before.stores))
      throw new Error("Times-only refill changed store links");
    if (refilled.research) throw new Error("Times-only refill started research");
    await win.getByRole("button", { name: "Kütüphane", exact: true }).click();
    await win
      .locator(".game-row-text strong")
      .filter({ hasText: "Stardew Valley" })
      .click();
    await win.getByRole("tab", { name: "Genel bakış", exact: true }).click();
    await expect(win.locator(".playtime-grid strong").first()).toContainText("saat", {
      timeout: 10000,
    });
    await win.locator(".playtime-section").scrollIntoViewIfNeeded();
    await win.screenshot({ path: path.resolve(".cache/sureler-tamamlama-canli.png") });
    console.log(
      JSON.stringify(
        {
          platform: "Linux Electron",
          game: g.name,
          checks: g.storeChecks,
          completionTimes: g.hltb,
          coverCached: !!g.cover,
          renderedStoreAndTimeCards: true,
          noRemovedTurkishData: true,
          backgroundRefillAfter1012: {
            completionTimes: refilled.hltb,
            fetchStatusUnchanged: refilled.fetchStatus,
            storesUnchanged: true,
            researchStarted: false,
            shownInUi: true,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
