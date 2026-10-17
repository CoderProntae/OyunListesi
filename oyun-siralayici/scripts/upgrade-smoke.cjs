// Native Linux migration test: fixture library, not the user's real library.
// 1.0.11 -> current: removed Turkish data is dropped once (HowLongToBeat times
// stay), nothing is re-queued, explicit stops stay stopped, the UI-only note
// persists; a library saved by 1.0.12 gets its dropped times back from backup.
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".cache/upgrade-smoke-"));
  const launch = () =>
    _electron.launch({
      args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
      env: { ...process.env, XDG_CONFIG_HOME: root },
      timeout: 25000,
    });
  let app;
  const quit = async () => {
    const child = app.process();
    const exited =
      child.exitCode === null
        ? new Promise((resolve) => child.once("exit", resolve))
        : Promise.resolve();
    const closed = app.waitForEvent("close");
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit());
    });
    await closed;
    await exited;
    app = undefined;
  };
  const boot = (win) => win.evaluate(() => window.desktop.call("bootstrap", {}));
  const statuses = async (win) =>
    (await boot(win)).state.games.map((g) => g.research?.status);
  const waitStatus = (win, expected) =>
    expect.poll(() => statuses(win), { timeout: 10000 }).toEqual(expected);
  const note = "Yükseltme sonrası kişisel not: Bölüm 4.";
  try {
    app = await launch();
    let win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const b = await boot(win);
    await quit();
    const state = b.state;
    delete state.notes; // 1.0.11 files had no notes key
    delete state.migrations; // nor the 1.0.13 restore marker
    Object.assign(state.settings, {
      autoResearch: false,
      autoSummary: false,
      animations: false,
      lmModel: "",
      firstRun: false,
    });
    Object.assign(state.hardware, {
      os: "Windows 10",
      osVersion: "10.0.19045",
      cpu: "Intel Core i5-4460",
      gpu: "NVIDIA GTX 1660 SUPER",
      ramGB: 8,
      vramGB: 6,
      vramCertain: true,
      diskFreeGB: 100,
    });
    state.groups.push({
      id: "legacy-tr-group",
      name: "Türkçe Yama Yok",
      color: "#d3b478",
      icon: "language",
    });
    // 2.1.0: the first game has a CPU name no hardware data knows, already
    // answered by the AI (so a hardware stage exists for it); the second one
    // is computed from the hardware data alone.
    const legacy = (name, i, research) => ({
      id: "legacy-" + i,
      name,
      order: i,
      status: i ? "finished" : "planned",
      note: "Removed legacy personal note",
      tags: ["Keep my tag"],
      patchSearchRevision: 106,
      research,
      minimum: {
        raw: "fixture",
        os: "Windows 10",
        cpu: i ? state.hardware.cpu : "Fixture CPU X1",
        gpu: state.hardware.gpu,
        ramGB: 1,
        storageGB: 1,
      },
      ...(i
        ? {}
        : {
            aiCompatibility: [
              {
                level: "minimum",
                component: "CPU",
                status: "pass",
                reason: "Sentetik AI karşılaştırması.",
                contextKey: JSON.stringify([
                  "component-v2",
                  "minimum",
                  "CPU",
                  "Fixture CPU X1",
                  state.hardware.cpu,
                ]),
                checkedAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          }),
      recommended: { raw: "", availability: "not_published" },
      turkish: {
        official: false,
        interface: false,
        audio: false,
        subtitles: false,
        patch: "none",
        patchNote: "Old limited search result",
        sources: [],
      },
      hltb: { status: "found", main: 7, checkedAt: "2026-10-01T00:00:00.000Z" },
    });
    state.games = [
      // Only the removed stages were missing: becomes done, no model call.
      legacy("Legacy One", 0, {
        status: "incomplete",
        stage: "patch",
        message: "Kalan: resmi Türkçe, HLTB, Türkçe yama",
      }),
      // 2.0.8: a stopped research whose results are all saved is done.
      legacy("Legacy Finished", 1, { status: "cancelled", stage: "hardware" }),
    ];
    fs.writeFileSync(path.join(b.dataPath, "library.json"), JSON.stringify(state));
    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    await new Promise((r) => setTimeout(r, 500));
    const upgraded = await boot(win);
    // 2.0.8: the stopped one has every result saved → done.
    assert.deepEqual(await statuses(win), ["done", "done"]);
    for (const g of upgraded.state.games) {
      assert.equal(g.turkish, undefined);
      assert.equal(g.hltb.main, 7);
      assert.equal(g.patchSearchRevision, undefined);
      assert.equal(g.note, undefined);
      assert(g.tags.includes("Keep my tag"));
    }
    assert.equal(upgraded.state.games[1].status, "finished");
    assert(!upgraded.state.groups.some((x) => x.name === "Türkçe Yama Yok"));
    assert.equal(upgraded.busyChats.length, 0);
    const disk = fs.readFileSync(path.join(b.dataPath, "library.json"), "utf8");
    assert(!/"turkish"|patchSearchRevision/.test(disk));
    assert(disk.includes('"hltb"'));
    const preUpgrade = fs
      .readdirSync(path.join(b.dataPath, "backups"))
      .filter((n) => n.endsWith("-yukseltme-oncesi.json"));
    assert.equal(preUpgrade.length, 1);

    // The new Not tab writes through the real IPC allowlist.
    await win.getByRole("button", { name: "Kütüphane", exact: true }).click();
    await win.locator(".game-row-text strong").filter({ hasText: "Legacy One" }).click();
    const tabs = win.getByRole("tablist", { name: "Oyun ayrıntıları" }).getByRole("tab");
    await expect(tabs).toHaveText(["Genel bakış", "Mağazalar", "Sistem", "Not"]);
    await win.getByRole("tab", { name: "Not", exact: true }).click();
    await win.getByLabel("Oyun notu", { exact: true }).fill(note);
    await expect(win.locator(".note-status")).toContainText("Kaydedildi", {
      timeout: 5000,
    });
    await win.screenshot({
      path: path.resolve(`docs/yukseltme-${require("../package.json").version}.png`),
    });
    await quit();
    const saved = JSON.parse(
      fs.readFileSync(path.join(b.dataPath, "library.json"), "utf8"),
    );
    assert.equal(saved.notes["legacy-0"].text, note);
    assert(!JSON.stringify(saved.games).includes(note));

    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    await waitStatus(win, ["done", "done"]);
    assert.equal((await boot(win)).state.notes["legacy-0"].text, note);
    assert.equal(
      fs
        .readdirSync(path.join(b.dataPath, "backups"))
        .filter((n) => n.endsWith("-yukseltme-oncesi.json")).length,
      1,
    );
    // Whole-library and single-game research still work through IPC and stop.
    await win
      .getByRole("button", { name: "Tüm oyunları yeniden araştır", exact: true })
      .click();
    await win.getByRole("button", { name: /^AI'ya bırak/ }).click();
    // The computed game needs no AI stage and is done at once.
    await waitStatus(win, ["waiting_model", "done"]);
    await win.evaluate(() => window.desktop.call("stopResearch", {}));
    // Stopped, but every result is already saved: done (2.0.8).
    await waitStatus(win, ["done", "done"]);
    await win.evaluate(() => window.desktop.call("researchGame", { id: "legacy-0" }));
    assert.equal((await boot(win)).state.games[0].research.status, "waiting_model");
    await win.evaluate(() => window.desktop.call("stopResearch", {}));
    await quit();
    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    await waitStatus(win, ["done", "done"]);
    assert.equal((await boot(win)).busyChats.length, 0);
    await quit();

    // 1.0.12 saved files without HowLongToBeat times and without the restore
    // marker. Opening such a file must bring the times back from the backup.
    const v112 = JSON.parse(
      fs.readFileSync(path.join(b.dataPath, "library.json"), "utf8"),
    );
    delete v112.migrations;
    for (const g of v112.games) delete g.hltb;
    fs.writeFileSync(path.join(b.dataPath, "library.json"), JSON.stringify(v112));
    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const restored = await boot(win);
    assert.deepEqual(
      restored.state.games.map((g) => g.hltb?.main),
      [7, 7],
    );
    assert.equal(restored.state.notes["legacy-0"].text, note);
    await win.getByRole("button", { name: "Kütüphane", exact: true }).click();
    await win.locator(".game-row-text strong").filter({ hasText: "Legacy One" }).click();
    await win.getByRole("tab", { name: "Genel bakış", exact: true }).click();
    await expect(win.locator(".playtime-section")).toContainText("Ne kadar sürer?");
    await expect(win.locator(".playtime-grid strong").first()).toHaveText("7saat");
    await win.locator(".playtime-section").scrollIntoViewIfNeeded();
    await win.screenshot({
      path: path.resolve(
        `docs/yukseltme-sureler-${require("../package.json").version}.png`,
      ),
    });
    await quit();
    const marked = JSON.parse(
      fs.readFileSync(path.join(b.dataPath, "library.json"), "utf8"),
    );
    assert(marked.migrations.includes("1.0.13-hltb"));
    assert.equal(marked.games[0].hltb.main, 7);
    console.log(
      JSON.stringify(
        {
          platform: "Linux Electron, not Windows",
          fixture: "1.0.11-format library",
          removedTurkishDataDropped: true,
          howLongToBeatTimesKept: true,
          nothingRequeuedOnUpgrade: true,
          onlyRemovedStagesMissingBecameDone: true,
          explicitStopKept: true,
          emptyLegacyGroupRemoved: true,
          preUpgradeBackupKept: true,
          oneTimeMigration: true,
          legacyPersonalNoteFieldStillRemoved: true,
          tagsPreserved: true,
          newNoteSavedThroughUiAndReopened: true,
          noteStoredOutsideGameRecords: true,
          allGamesButtonIPC: true,
          singleGameResearchIPC: true,
          explicitStopSurvivesReopen: true,
          timesDroppedBy1012RestoredFromBackup: true,
          neKadarSurerShownAfterRestore: true,
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
