import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";

// 2.0.8: manual research with a hardware stage asks first. "Kontrolleri sen
// seç, AI ayarlasın": the user marks every row Geçti / Geçmedi; the agent gets
// only the comparison tools and records the marks with its explanations. A
// finished research leaves the game page; Statistics researches chosen games
// again.
let server: http.Server, modelUrl: string;
const id = "checks-208";
const userStageTools: string[][] = [];
const stages: string[] = [];
const hardware = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Intel Core i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 100,
};
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
async function fixture(request: APIRequestContext, extra: any = {}, model = true) {
  const state = initialState();
  Object.assign(state.settings, {
    autoResearch: false,
    autoSummary: true,
    firstRun: false,
    animations: false,
    lmModel: model ? "fixture208" : "",
    lmUrl: modelUrl,
    toolMode: "native",
  });
  state.hardware = hardware;
  const at = "2026-10-16T10:00:00Z";
  state.games = [
    {
      ...newGame("Kontrol testi", 0),
      id,
      fetchStatus: "done" as const,
      catalogCheckedAt: at,
      hltb: { status: "not_found" as const, checkedAt: at },
      // GPU: a name in no hardware data (uncertain); RAM: computed Geçmedi (16 > 8).
      minimum: { raw: "fixture", gpu: "Fixture GPU Z9", ramGB: 16, storageGB: 1 },
      recommended: { raw: "", availability: "not_published" as const },
      ...extra,
    },
  ];
  await call(request, "import", { text: JSON.stringify(state) });
  stages.length = 0;
  userStageTools.length = 0;
}
test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture208" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw),
      messages = body.messages;
    const last = messages.findLastIndex((m: any) => m.role === "user");
    const user = String(messages[last].content || "");
    const stage = user.match(/AŞAMA: ([^.]+)/)?.[1];
    if (stage && stages.at(-1) !== stage) stages.push(stage);
    const answered = messages.slice(last + 1).some((m: any) => m.role === "tool");
    let calls: { name: string; arguments: any }[] = [];
    if (stage?.includes("KULLANICI KARARI") && !answered) {
      userStageTools.push((body.tools || []).map((t: any) => t.function.name).sort());
      calls = [...user.matchAll(/(Minimum|Önerilen) ([^:;]+): (Geçti|Geçmedi)/g)].map(
        (m) => ({
          name: "record_compatibility",
          arguments: {
            gameId: id,
            contextKey: "kullanici",
            level: m[1] === "Minimum" ? "minimum" : "recommended",
            component: m[2].trim(),
            status: m[3] === "Geçti" ? "pass" : "fail",
            reason: "Test açıklaması: " + m[2].trim(),
          },
        }),
      );
    } else if (stage === "ÖZET" && !answered)
      calls = [
        {
          name: "update_game_info",
          arguments: { gameId: id, patch: { aiSummary: "Sentetik Türkçe özet." } },
        },
      ];
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (delta: any, finish?: string) =>
      res.write(
        "data: " +
          JSON.stringify({ choices: [{ delta, finish_reason: finish ?? null }] }) +
          "\n\n",
      );
    if (calls.length) {
      calls.forEach((c, index) =>
        send({
          tool_calls: [
            {
              index,
              id: `call-${index}-${Date.now()}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.arguments) },
            },
          ],
        }),
      );
      send({}, "tool_calls");
    } else send({ content: "Kaydedildi." }, "stop");
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
});
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
test("your own checks: mark every row, the agent explains them, the bar goes away", async ({
  request,
  page,
}) => {
  await fixture(request);
  await page.goto("/");
  await page.locator(".game-row-text strong").click();
  const bar = page.getByTestId("research-bar");
  await expect(bar).toContainText("AI araştırması");
  await expect(bar).toContainText("Eksik: Minimum GPU karşılaştırması, oyun özeti");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.8-cubuk.png" });
  await bar.getByRole("button", { name: "Araştır", exact: true }).click();
  const choice = page.getByTestId("research-checks-choice");
  await expect(choice).toBeVisible();
  await expect(page.locator(".modal")).toContainText("donanım aşaması var");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.8-secenek.png" });
  await page.getByRole("button", { name: /^Kontrolleri sen seç, AI ayarlasın/ }).click();
  const table = page.getByTestId("checks-table");
  await expect(table).toBeVisible();
  const mark = (row: string, label: "Geçti" | "Geçmedi") =>
    page
      .getByRole("radiogroup", { name: "Minimum " + row })
      .getByRole("radio", { name: label });
  // Computed rows come preselected; the uncertain GPU row waits for a choice.
  await expect(mark("RAM", "Geçmedi")).toHaveAttribute("aria-checked", "true");
  await expect(mark("Disk", "Geçti")).toHaveAttribute("aria-checked", "true");
  await expect(mark("GPU", "Geçti")).toHaveAttribute("aria-checked", "false");
  await expect(mark("GPU", "Geçmedi")).toHaveAttribute("aria-checked", "false");
  const startButton = page.getByRole("button", {
    name: "Araştırmayı başlat",
    exact: true,
  });
  await expect(startButton).toBeDisabled();
  await mark("GPU", "Geçti").click();
  await mark("RAM", "Geçti").click(); // the user's call over the computed one
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.8-kontroller.png" });
  await startButton.click();
  await expect
    .poll(
      async () => (await call(request, "bootstrap")).state.games[0].research?.status,
      {
        timeout: 20000,
      },
    )
    .toBe("done");
  const g = (await call(request, "bootstrap")).state.games[0];
  const saved = Object.fromEntries(
    g.aiCompatibility.map((r: any) => [r.component, [r.status, r.decidedBy, r.reason]]),
  );
  expect(saved).toEqual({
    GPU: ["pass", "user", "Test açıklaması: GPU"],
    RAM: ["pass", "user", "Test açıklaması: RAM"],
    Disk: ["pass", "user", "Test açıklaması: Disk"],
  });
  expect(g.aiSummary).toBe("Sentetik Türkçe özet.");
  expect(stages).toEqual(["DONANIM (KULLANICI KARARI)", "ÖZET"]);
  // No web search, no pages while the marks are applied.
  expect(userStageTools[0]).toEqual([
    "check_compatibility",
    "get_game_info",
    "get_hardware",
    "record_compatibility",
  ]);
  await expect(bar).toHaveCount(0);
  await page.getByRole("tab", { name: "Sistem" }).click();
  await expect(page.getByTestId("requirements-table")).toContainText("Senin kararın");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.8-sonuc.png" });
});
test("Statistics: choose games to research again; 'AI'ya bırak' drops your marks", async ({
  request,
  page,
}) => {
  await fixture(
    request,
    {
      aiSummary: "Kayıtlı özet.",
      research: { status: "cancelled", message: "Araştırma durduruldu." },
    },
    false,
  );
  // Stopped earlier, but the GPU row is still open: the game page shows it.
  await page.goto("/");
  await page
    .getByRole("button", { name: "Seçtiğim oyunları yeniden araştır", exact: true })
    .click();
  const pick = page.locator(".modal", { has: page.locator(".research-pick") });
  await expect(pick).toContainText("Kontrol testi");
  await expect(pick.locator(".research-pick-row small")).toHaveText("Durduruldu");
  const go = pick.getByRole("button", { name: /^Yeniden araştır/ });
  await expect(go).toBeDisabled();
  await pick.getByRole("checkbox").check();
  await expect(go).toHaveText("Yeniden araştır (1)");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.8-secim.png" });
  await go.click();
  await expect(page.getByTestId("research-checks-choice")).toBeVisible();
  await page.getByRole("button", { name: /^AI'ya bırak/ }).click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].research)
    .toMatchObject({ status: "waiting_model", freshContext: true });
  await call(request, "stopResearch");
});
