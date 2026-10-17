// Linux Electron IPC + deterministic SSE model, not a real LM or Windows run.
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".cache/resume-smoke-"));
  let app;
  const stages = [];
  let phase = "resume";
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture" }] }));
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const m = JSON.parse(raw).messages,
      last = m.findLastIndex((x) => x.role === "user"),
      prompt = m[last].content;
    const stage = prompt.match(/AŞAMA: ([^.]+)/)[1];
    const gameId = prompt.match(/gameId: ([^.;\s]+)/)?.[1] || "resume-fixture";
    const marker = phase + ":" + stage;
    if (stages.at(-1) !== marker) stages.push(marker);
    // 2.1.3: this game answers slowly, so it is still running when it is
    // stopped from its own page while another game waits in the queue.
    if (gameId === "stop-a") await new Promise((r) => setTimeout(r, 5000));
    if (res.destroyed || res.writableEnded) return;
    const tools = m.slice(last + 1).filter((x) => x.role === "tool");
    const delta =
      stage === "ÖZET" && !tools.length
        ? {
            tool_calls: [
              {
                index: 0,
                id: "summary",
                type: "function",
                function: {
                  name: "update_game_info",
                  arguments: JSON.stringify({
                    gameId,
                    patch: { aiSummary: "Sentetik devam testi özeti." },
                  }),
                },
              },
            ],
          }
        : { content: "Fixture finished" };
    try {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        "data: " +
          JSON.stringify({
            choices: [{ delta, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
    } catch {
      /* the caller hung up (stopped research) */
    }
  });
  server.on("clientError", (_e, socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    app = await _electron.launch({
      args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
      env: { ...process.env, XDG_CONFIG_HOME: root },
      timeout: 25000,
    });
    const win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const call = (method, args = {}) =>
      win.evaluate(({ method, args }) => window.desktop.call(method, args), {
        method,
        args,
      });
    const state = (await call("bootstrap")).state;
    Object.assign(state.settings, {
      autoResearch: false,
      autoSummary: true,
      firstRun: false,
      lmModel: "fixture",
      lmUrl: `http://127.0.0.1:${server.address().port}/v1`,
      toolMode: "native",
    });
    Object.assign(state.hardware, {
      os: "Windows 10",
      osVersion: "10.0.19045",
      cpu: "Intel Core i5-4460",
      gpu: "NVIDIA GTX 1660 SUPER",
      ramGB: 8,
      diskFreeGB: 100,
      vramGB: 6,
      vramCertain: true,
    });
    state.games = [
      {
        id: "resume-fixture",
        name: "Resume fixture",
        order: 0,
        status: "planned",
        research: { status: "cancelled", freshContext: false, stage: "hardware" },
        // 2.1.0: a hardware stage exists only for a row the hardware data
        // cannot decide; this one already has a saved AI answer.
        minimum: {
          raw: "fixture",
          os: "Windows 10",
          cpu: "Fixture CPU X1",
          gpu: state.hardware.gpu,
          ramGB: 1,
          storageGB: 1,
        },
        recommended: { raw: "", availability: "not_published" },
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
            checkedAt: "2026-10-16T10:00:00.000Z",
          },
        ],
      },
      // 2.1.3: two games without requirements — only the summary stage runs, so
      // the queue order is what the targeted stop has to respect.
      ...["stop-a", "stop-b"].map((id, i) => ({
        id,
        name: id === "stop-a" ? "Stop A" : "Stop B",
        order: i + 1,
        status: "planned",
        fetchStatus: "done",
        catalogCheckedAt: "2026-10-16T10:00:00Z",
        hltb: { status: "not_found", checkedAt: "2026-10-16T10:00:00Z" },
        minimum: { raw: "" },
        recommended: { raw: "" },
      })),
    ];
    await call("import", { text: JSON.stringify(state) });
    await call("researchGame", { id: "resume-fixture" });
    await expect
      .poll(async () => (await call("bootstrap")).state.games[0].research?.status, {
        timeout: 15000,
      })
      .toBe("done");
    assert.deepEqual(stages, ["resume:ÖZET"]);
    const previousChat = (await call("bootstrap")).state.games[0].research.chatId;
    phase = "restart";
    await call("researchGame", { id: "resume-fixture", restart: true });
    await expect
      .poll(async () => (await call("bootstrap")).state.games[0].research?.status, {
        timeout: 15000,
      })
      .toBe("done");
    assert.deepEqual(stages, ["resume:ÖZET", "restart:DONANIM", "restart:ÖZET"]);
    assert((await call("bootstrap")).state.chats.some((c) => c.id === previousChat));
    // 2.1.3: the game page's "Durdur" stops only that game. One slot at a time
    // here, so the stopped game's slot has to go to the next queued game.
    phase = "stop";
    const started = stages.length;
    await call("settings", { patch: { parallelRequests: false } });
    await call("researchGame", { id: "stop-a", restart: true });
    await call("researchGame", { id: "stop-b", restart: true });
    const status = async () =>
      Object.fromEntries(
        (await call("bootstrap")).state.games.map((g) => [g.id, g.research?.status]),
      );
    await expect
      .poll(async () => (await status())["stop-a"], { timeout: 20000 })
      .toBe("running");
    assert.equal((await status())["stop-b"], "queued");
    await call("stopResearch", { id: "stop-a" });
    assert.equal((await status())["stop-a"], "cancelled");
    await expect
      .poll(async () => (await status())["stop-b"], { timeout: 20000 })
      .toBe("done");
    const after = await status();
    assert.equal(after["stop-a"], "cancelled");
    assert.equal(after["resume-fixture"], "done");
    const games = (await call("bootstrap")).state.games;
    assert.equal(
      games.find((g) => g.id === "stop-a").aiSummary,
      undefined,
      "a stopped game keeps no half-written summary",
    );
    assert(games.find((g) => g.id === "stop-b").aiSummary);
    assert(stages.slice(started).includes("stop:ÖZET"));
    console.log(
      JSON.stringify(
        {
          platform: "Linux Electron, not Windows",
          model: "deterministic HTTP/SSE fixture",
          resumeSkippedSavedHardware: true,
          onlyHardwareAndSummaryStages: true,
          explicitRestartIncludedHardware: true,
          previousChatPreserved: true,
          singleGameStopKeptQueueRunning: true,
          stages,
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
