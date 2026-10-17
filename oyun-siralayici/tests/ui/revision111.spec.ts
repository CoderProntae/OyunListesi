import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";
import { componentCompatibilityKey } from "../../shared/compatibility";
let server: http.Server, modelUrl: string;
let hang = false,
  stages: string[] = [];
const openResponses = new Set<http.ServerResponse>();
const id = "resume-ui-111";
const hardware = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Intel Core i5-4460",
  gpu: "NVIDIA GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 100,
};
// 2.1.0: the hardware stage exists only for a row the hardware data cannot
// decide — the fixture CPU name; the model answers it with record_compatibility.
const minimum = {
  raw: "Processor: Fixture CPU X1 · Memory: 1 GB RAM · Storage: 1 GB",
  cpu: "Fixture CPU X1",
  ramGB: 1,
  storageGB: 1,
};
const recommended = { raw: "", availability: "not_published" };
const cpuAnswer = () => ({
  gameId: id,
  level: "minimum",
  component: "CPU",
  status: "pass",
  reason: "Sentetik test karşılaştırması.",
  contextKey: componentCompatibilityKey(
    { ...newGame("Devam testi", 0), minimum, recommended } as any,
    hardware as any,
    "minimum",
    "CPU",
  ),
});
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
async function fixture(request: APIRequestContext, saved: boolean) {
  const state = initialState();
  Object.assign(state.settings, {
    autoResearch: false,
    autoSummary: true,
    firstRun: false,
    animations: false,
    lmModel: "fixture111",
    lmUrl: modelUrl,
    toolMode: "native",
  });
  state.hardware = hardware;
  const g = newGame("Devam testi", 0);
  g.id = id;
  // 2.0.4: the hardware stage exists only for store-published requirements.
  Object.assign(g, { minimum, recommended });
  if (saved) {
    const answer = cpuAnswer();
    g.aiCompatibility = [
      {
        level: "minimum",
        component: "CPU",
        status: "pass",
        reason: answer.reason,
        contextKey: answer.contextKey,
        checkedAt: "2026-10-16T10:00:00Z",
      },
    ];
    g.research = { status: "cancelled", stage: "hardware", freshContext: false };
  }
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  stages = [];
  hang = !saved;
}
test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture111" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw),
      messages = body.messages;
    const lastIndex = messages.findLastIndex((m: any) => m.role === "user");
    const user = messages[lastIndex].content;
    const stage = user.match(/AŞAMA: ([^.]+)/)?.[1];
    if (stage && stages.at(-1) !== stage) stages.push(stage);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (stage === "DONANIM" && hang) {
      hang = false;
      openResponses.add(res);
      res.on("close", () => openResponses.delete(res));
      res.write(
        "data: " +
          JSON.stringify({
            choices: [
              {
                delta: {
                  reasoning_content: "Düşünme beklemesi: sentetik durdurma testi.",
                },
              },
            ],
          }) +
          "\n\n",
      );
      return;
    }
    const after = messages.slice(lastIndex + 1).filter((m: any) => m.role === "tool");
    let tool: { name: string; args: any } | undefined;
    if (after.length === 0) {
      if (!stage || stage === "DONANIM")
        tool = { name: "record_compatibility", args: cpuAnswer() };
      if (stage === "ÖZET")
        tool = {
          name: "update_game_info",
          args: { gameId: id, patch: { aiSummary: "Sentetik test özeti." } },
        };
    }
    const delta = tool
      ? {
          tool_calls: [
            {
              index: 0,
              id: "call-" + Date.now(),
              type: "function",
              function: { name: tool.name, arguments: JSON.stringify(tool.args) },
            },
          ],
        }
      : { content: "Test verileri kaydedildi." };
    res.end(
      "data: " +
        JSON.stringify({
          choices: [{ delta, finish_reason: tool ? "tool_calls" : "stop" }],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
});
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
  for (const res of openResponses) res.end();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
test("stop thinking, continue in chat, save hardware once and finish remaining stages", async ({
  request,
  page,
}) => {
  await fixture(request, false);
  await page.goto("/");
  await page.locator(".game-row-text strong").click();
  await page.getByRole("button", { name: "Araştır", exact: true }).click();
  // 2.0.8: a manual run with a hardware stage asks first.
  await page.getByRole("button", { name: /^AI'ya bırak/ }).click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].research?.stage)
    .toBe("hardware");
  await page.getByRole("button", { name: "Araştırma geçmişi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ajanı durdur", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajanı durdur", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Araştırmaya devam et", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baştan araştır", exact: true }),
  ).toBeVisible();
  const stopped = await call(request, "bootstrap"),
    oldChatId = stopped.state.games[0].research.chatId;
  await page.getByLabel("Ajana mesaj").fill("Devam et");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(page.getByTestId("research-bar")).toHaveCount(0, { timeout: 20000 });
  const b = await call(request, "bootstrap");
  // 1.0.17: requirements come only from the store; the model cannot write them.
  expect(b.state.games[0].minimum.cpu).toBe("Fixture CPU X1");
  expect(b.state.games[0].aiCompatibility?.[0]).toMatchObject({
    component: "CPU",
    status: "pass",
  });
  expect(stages).toEqual(["DONANIM", "ÖZET"]);
  expect(b.state.chats.some((c: any) => c.id === oldChatId)).toBe(true);
  expect(b.state.games[0].research.chatId).not.toBe(oldChatId);
  await page.screenshot({ path: ".cache/ui-artifacts/arastirmaya-devam.png" });
  await page.reload();
  expect((await call(request, "bootstrap")).state.games[0].research.status).toBe("done");
});
test("resume button skips already saved hardware after reload", async ({
  request,
  page,
}) => {
  await fixture(request, true);
  await page.goto("/");
  await page.reload();
  await page.locator(".game-row-text strong").click();
  await page.getByRole("button", { name: "Araştırmaya devam et", exact: true }).click();
  await expect(page.getByTestId("research-bar")).toHaveCount(0, { timeout: 20000 });
  expect(stages).toEqual(["ÖZET"]);
});
test("restart button deliberately starts hardware again, distinct from resume", async ({
  request,
  page,
}) => {
  await fixture(request, true);
  await page.goto("/");
  await page.locator(".game-row-text strong").click();
  await page.getByRole("button", { name: "Baştan araştır", exact: true }).click();
  await page.getByRole("button", { name: /^AI'ya bırak/ }).click();
  await expect(page.getByTestId("research-bar")).toHaveCount(0, { timeout: 20000 });
  expect(stages).toEqual(["DONANIM", "ÖZET"]);
});
