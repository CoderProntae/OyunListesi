// Real Linux Electron + local deterministic HTTP/SSE model fixture. Not real LM inference.
const { _electron } = require("playwright");
const { expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".cache/research108-"));
  let app,
    count = 0;
  const stages = [],
    steps = new Map();
  const sentLimits = [];
  let initialPromptChars = 0;
  let retiredEstimateWouldClamp = false;
  let repaired = false;
  let noteLeaked = false;
  const NOTE = "ELECTRON-GIZLI-NOT-112";
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            req.url.startsWith("/api/") ? { models: [] } : { data: [{ id: "fixture" }] },
          ),
        );
        return;
      }
      let raw = "";
      for await (const c of req) raw += c;
      if (raw.includes(NOTE)) noteLeaked = true;
      const body = JSON.parse(raw),
        m = body.messages;
      assert.equal(body.max_tokens, 16128);
      sentLimits.push(body.max_tokens);
      const retiredEstimate =
        Math.ceil((JSON.stringify(m).length + JSON.stringify(body.tools).length) / 2.5) +
        128;
      if (Math.min(16128, Math.max(128, 16384 - retiredEstimate)) === 128)
        retiredEstimateWouldClamp = true;
      const prompt = m.filter((x) => x.role === "user").at(-1).content;
      const stage = prompt.match(/AŞAMA: ([^.]+)\./)[1],
        n = steps.get(stage) || 0;
      steps.set(stage, n + 1);
      if (!n) stages.push(stage);
      let tool;
      if (!initialPromptChars) {
        initialPromptChars = prompt.length;
        assert(!prompt.includes("GTX 1660 SUPER"));
        assert(!prompt.includes("Fixture CPU X1"));
        assert(prompt.length < 350);
      }
      assert(!body.tools.some((t) => t.function.name === "edit_game"));
      if (stage === "DONANIM" && n === 0)
        tool = {
          name: "get_game_info",
          arguments: JSON.stringify({ gameId: "fixture-game" }),
        };
      if (stage === "DONANIM" && n === 1)
        tool = {
          name: "check_compatibility",
          arguments: JSON.stringify({ gameId: "fixture-game" }),
        };
      if (stage === "DONANIM" && n === 2) {
        const c = JSON.parse(m.filter((x) => x.role === "tool").at(-1).content);
        tool = {
          name: "record_compatibility",
          arguments: JSON.stringify({
            gameId: "fixture-game",
            contextKey: c.contextKey,
            level: "minimum",
            component: "CPU",
            status: "pass",
            reason: "Deterministic fixture; not a benchmark",
          }),
        };
      }
      // The summary stage first sends a truncated call; the app must reject it,
      // keep the raw input and accept the model's corrected write.
      if (stage === "ÖZET" && n === 0)
        tool = { name: "update_game_info", arguments: '{"gameId":' };
      if (stage === "ÖZET" && n === 1) {
        const previous = m.filter((x) => x.tool_calls).at(-1).tool_calls[0];
        assert.equal(previous.function.arguments, "{}");
        const result = JSON.parse(m.filter((x) => x.role === "tool").at(-1).content);
        assert.equal(result.rawArguments, '{"gameId":');
        repaired = true;
        tool = {
          name: "update_game_info",
          arguments: JSON.stringify({
            gameId: "fixture-game",
            patch: { aiSummary: "Test amaçlı oyun özeti; gerçek oyun bilgisi değildir." },
          }),
        };
      }
      assert(!body.tools.some((t) => /turkish/i.test(t.function.name)));
      const delta = tool
        ? {
            tool_calls: [
              { index: 0, id: "fixture-" + ++count, type: "function", function: tool },
            ],
          }
        : { content: "Bu test aşaması tamamlandı." };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        "data: " +
          JSON.stringify({
            choices: [{ delta, finish_reason: tool ? "tool_calls" : "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const launch = () =>
    _electron.launch({
      args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
      env: { ...process.env, XDG_CONFIG_HOME: root },
      timeout: 25000,
    });
  const quit = async () => {
    const child = app.process(),
      exited = new Promise((r) => child.once("exit", r)),
      closed = app.waitForEvent("close");
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit());
    });
    await closed;
    await exited;
    app = undefined;
  };
  try {
    app = await launch();
    let win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const b = await win.evaluate(() => window.desktop.call("bootstrap", {}));
    await quit();
    const state = b.state;
    Object.assign(state.settings, {
      firstRun: false,
      autoResearch: false,
      autoSummary: true,
      animations: false,
      requireApproval: false,
      toolMode: "native",
      maxTokens: 16128,
      contextTokens: 16384,
      lmModel: "fixture",
      lmUrl: "http://127.0.0.1:" + server.address().port + "/v1",
    });
    Object.assign(state.hardware, {
      cpu: "Core i5-4460",
      gpu: "GTX 1660 SUPER",
      ramGB: 8,
      diskFreeGB: 16,
    });
    state.notes = {
      "fixture-game": {
        text: "Kişisel not: " + NOTE,
        updatedAt: new Date().toISOString(),
      },
    };
    state.games = [
      {
        id: "fixture-game",
        name: "Research fixture",
        order: 0,
        recommended: { raw: "fixture ".repeat(3500) },
        minimum: {
          raw: "fixture ".repeat(3500),
          cpu: "Fixture CPU X1",
          gpu: "Fixture GPU Z9",
          ramGB: 1,
          storageGB: 7,
        },
      },
    ];
    fs.writeFileSync(path.join(b.dataPath, "library.json"), JSON.stringify(state));
    app = await launch();
    win = await app.firstWindow();
    await win.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    await win
      .getByRole("button", { name: "Tüm oyunları yeniden araştır", exact: true })
      .click();
    // 2.0.8: a manual run with a hardware stage asks first.
    await win.getByRole("button", { name: /^AI'ya bırak/ }).click();
    await expect
      .poll(
        async () => {
          const b = await win.evaluate(() => window.desktop.call("bootstrap", {}));
          return b.state.games[0].research?.status;
        },
        { timeout: 20000 },
      )
      .toBe("incomplete");
    const result = await win.evaluate(() => window.desktop.call("bootstrap", {})),
      g = result.state.games[0];
    assert.deepEqual(stages, ["DONANIM", "ÖZET"]);
    assert(repaired);
    assert.equal(noteLeaked, false);
    assert.equal(result.state.notes["fixture-game"].text, "Kişisel not: " + NOTE);
    assert(retiredEstimateWouldClamp);
    assert(sentLimits.length > 4);
    assert.equal(g.aiCompatibility[0].status, "pass");
    assert(g.aiSummary.includes("Test amaçlı"));
    assert.equal(g.turkish, undefined);
    const chat = result.state.chats.find((c) => c.id === g.research.chatId),
      blocks = chat.messages.flatMap((m) => m.blocks);
    assert(
      blocks.some(
        (b) => b.type === "tool" && b.status === "error" && b.args === '{"gameId":',
      ),
    );
    await win.evaluate((id) => window.desktop.call("activeChat", { id }), chat.id);
    await win.screenshot({
      path: path.resolve(
        `docs/asamali-arastirma-${require("../package.json").version}.png`,
      ),
    });
    await quit();
    console.log(
      JSON.stringify(
        {
          platform: "Linux Electron; Windows runtime not tested",
          model: "Local deterministic HTTP/SSE fixture; not real LM Studio inference",
          stages,
          initialPromptChars,
          noDeviceDumpInStagePrompt: true,
          automaticResearchCannotEditPersonalFields: true,
          selectedOutputLimit: 16128,
          allRequestsKeptSelectedLimit: sentLimits.every((n) => n === 16128),
          requestCount: sentLimits.length,
          retiredEstimateWouldClamp,
          hardwareSaved: true,
          summarySaved: true,
          malformedCallRejected: true,
          rawInputPreserved: true,
          protocolEnvelopeRepaired: repaired,
          correctedPatchSaved: true,
          missingRequirementsNotFaked: g.research.status === "incomplete",
          removedStagesAbsent: true,
          personalNoteNeverSentToModel: !noteLeaked,
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) await app.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
