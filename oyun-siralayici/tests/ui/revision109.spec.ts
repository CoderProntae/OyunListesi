import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";
let server: http.Server, modelURL: string;
const call = async (r: APIRequestContext, method: string, args: any = {}) => {
  const response = await r.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture109" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw),
      messages = body.messages,
      last = messages.at(-1);
    const input = JSON.parse(
      messages
        .filter((m: any) => m.role === "user" && m.content.trim().startsWith("{"))
        .at(-1).content,
    );
    let name: string | undefined, args: any;
    if (last.role === "user") {
      name = input.tool;
      args = input.args;
      if (name === "override") {
        name = "check_compatibility";
        args = { gameId: input.args.gameId };
      }
    } else if (last.role === "tool" && input.tool === "override") {
      const result = JSON.parse(last.content);
      if (result.minimum) {
        name = "record_compatibility";
        args = {
          gameId: input.args.gameId,
          level: "minimum",
          component: input.args.component,
          contextKey: result.minimum.find((r: any) => r.name === input.args.component)
            .contextKey,
          status: "fail",
          reason: "Synthetic UI fixture, not a hardware assessment",
        };
      }
    }
    const delta = name
      ? {
          tool_calls: [
            {
              index: 0,
              id: "call-" + messages.length,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        }
      : { content: "Fixture tamamlandı." };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  modelURL = `http://127.0.0.1:${(server.address() as any).port}/v1`;
});
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function setup(request: APIRequestContext, page: Page, blankCPU = false) {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    lmUrl: modelURL,
    lmModel: "fixture109",
    toolMode: "native",
  });
  Object.assign(state.hardware, {
    cpu: blankCPU ? "" : "Core i5-4460",
    gpu: "GTX 1660 SUPER",
    ramGB: 8,
    diskFreeGB: 16,
  });
  const g = newGame("Ajan destek testi", 0);
  g.minimum = {
    raw: "Fixture",
    // 2.1.0: real names are computed from the hardware data and the AI cannot
    // override them; these fixture names stay for the AI.
    cpu: "Fixture CPU X1",
    gpu: "Fixture GPU Z9",
    ramGB: 1,
    storageGB: 7,
  };
  g.hltb = {
    status: "found",
    main: 5,
    mainExtra: 10,
    completionist: 20,
    checkedAt: "2026-10-15",
  };
  g.storeChecks = [
    {
      store: "Steam",
      status: "not_found",
      source: "Old fixture",
      checkedAt: "2026-10-14",
    },
  ];
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await call(request, "testLM");
  await page.locator(".game-row-text strong").click();
  return g;
}
async function send(request: APIRequestContext, page: Page, tool: string, args: any) {
  await page.getByLabel("Ajana mesaj").fill(JSON.stringify({ tool, args }));
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).busyChats.length)
    .toBe(0);
  await expect(page.locator(".chat-message.assistant .markdown").last()).toContainText(
    "Fixture tamamlandı.",
  );
}
test("1.0.9 agent comparison changes actual table ticks and survives unrelated edits", async ({
  request,
  page,
}) => {
  const g = await setup(request, page);
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  const gpu = page
    .locator(".comparison-table tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "GPU", exact: true }) });
  await expect(gpu.locator(".requirement-value").first()).toHaveClass(/unknown/);
  await send(request, page, "override", { gameId: g.id, component: "GPU" });
  await expect(gpu.locator(".requirement-value").first()).toHaveClass(/fail/);
  // 1.0.17: requirement values come only from the store (unit tests cover how a
  // store change expires the comparison); the agent cannot rewrite them.
});
test("1.0.9 saved store link becomes clickable and partial HLTB hours survive refresh/undo", async ({
  request,
  page,
}) => {
  const g = await setup(request, page);
  await page.getByRole("tab", { name: "Mağazalar", exact: true }).click();
  const steam = page.getByTestId("catalog-Steam");
  await expect(steam.locator(".badge")).toHaveText("Bulunamadı");
  await send(request, page, "update_game_info", {
    gameId: g.id,
    patch: {
      stores: [
        { name: "Steam", url: "https://store.steampowered.com/app/400/", verified: true },
      ],
      hltb: { main: 6 },
    },
  });
  await expect(steam.locator(".badge")).toHaveText("Var");
  await expect(steam.getByRole("button", { name: "Ürün sayfası" })).toBeVisible();
  await page.getByRole("tab", { name: "Genel bakış", exact: true }).click();
  await expect(page.locator(".playtime-grid strong")).toHaveText([
    "6saat",
    "10saat",
    "20saat",
  ]);
  await page.reload();
  await page.locator(".game-row-text strong").click();
  await expect(page.locator(".playtime-grid strong")).toHaveText([
    "6saat",
    "10saat",
    "20saat",
  ]);
  // Reload does not restart the service, so the in-memory undo stack still exists.
  await page.keyboard.press("Control+z");
  await expect(page.locator(".playtime-grid strong")).toHaveText([
    "5saat",
    "10saat",
    "20saat",
  ]);
});
test("1.0.9 missing actual CPU cannot gain a false tick from an agent call", async ({
  request,
  page,
}) => {
  const g = await setup(request, page, true);
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await send(request, page, "override", { gameId: g.id, component: "CPU" });
  const cpu = page
    .locator(".comparison-table tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "CPU", exact: true }) });
  await expect(cpu.locator(".requirement-value").first()).toHaveClass(/unknown/);
  const b = await call(request, "bootstrap");
  expect(b.state.games[0].aiCompatibility).toBeUndefined();
  expect(JSON.stringify(b.state.chats[0].apiHistory)).toContain("Gerçek donanım");
});
