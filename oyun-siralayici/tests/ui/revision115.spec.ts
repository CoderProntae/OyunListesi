import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";

// 1.0.15: the user's request "Önerilen Disk kısmına 0.81 GB yaz" for Max Payne.
// The model fixture repeats the calls from the user's report: first the third
// level ("optimum"), then optimum + a recommended text, and finally only the
// recommended disk. Nothing may be erased and no third column may appear.
let server: http.Server, modelUrl: string;
const gameId = "max-payne-fixture-115";
const hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 16,
};
const steps = [
  {
    hltb: { status: "found", main: 8.5 },
    optimum: {
      availability: "published",
      raw: "Önerilen disk: 0.81 GB",
      storageGB: 0.81,
    },
  },
  {
    optimum: { raw: "", storageGB: null },
    recommended: { availability: "published", raw: "Storage: 0.81 GB", storageGB: 0.81 },
  },
  {
    recommended: { availability: "published", raw: "Storage: 0.81 GB", storageGB: 0.81 },
  },
];
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
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
      res.end(JSON.stringify({ data: [{ id: "fixture115" }] }));
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    const messages = JSON.parse(text).messages,
      n = messages.filter((m: any) => m.role === "tool").length;
    const delta =
      n < steps.length
        ? {
            tool_calls: [
              {
                index: 0,
                id: "step-" + n,
                type: "function",
                function: {
                  name: "update_game_info",
                  arguments: JSON.stringify({ gameId, patch: steps[n] }),
                },
              },
            ],
          }
        : { content: "Önerilen disk 0,81 GB olarak kaydedildi." };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          choices: [{ delta, finish_reason: n < steps.length ? "tool_calls" : "stop" }],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
});
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
  await new Promise<void>((r) => server.close(() => r()));
});
test("Önerilen disk 0,81 GB: other recommended values stay and only two columns exist", async ({
  request,
  page,
}) => {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    lmUrl: modelUrl,
    lmModel: "fixture115",
    toolMode: "native",
  });
  state.hardware = hardware;
  const game = newGame("Max Payne", 0);
  game.id = gameId;
  game.minimum = {
    raw: "x",
    availability: "published",
    os: "Windows 95, 98, ME, 2000",
    cpu: "450 MHz AMD / Intel işlemci",
    gpu: "16 MB Direct3D uyumlu grafik kartı",
    ramGB: 96 / 1024,
    vramGB: 16 / 1024,
    storageGB: 0.81,
  };
  game.recommended = {
    raw: "y",
    availability: "published",
    os: "Windows 98, ME, 2000, XP",
    cpu: "700 MHz AMD / Intel işlemci",
    gpu: "32 MB Direct3D uyumlu grafik kartı",
    ramGB: 128 / 1024,
    vramGB: 32 / 1024,
  };
  game.hltb = {
    status: "found",
    main: 8.09,
    mainExtra: 9.2,
    completionist: 11.49,
    checkedAt: "2026-10-16T09:00:00.000Z",
  };
  state.games = [game];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await call(request, "testLM");
  await page
    .getByLabel("Ajana mesaj")
    .fill("Max Payne: Sistem gereksinimlerinde Önerilen Disk kısmına 0.81 GB yaz");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  // The app's own check after a requirement task adds a closing note.
  await expect(page.getByText(/Uygulama kontrolü — Max Payne/)).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByText("Önerilen disk 0,81 GB olarak kaydedildi.").first(),
  ).toBeVisible();
  const b = await call(request, "bootstrap"),
    g = b.state.games[0];
  const results = b.state.chats[0].messages
    .flatMap((m: any) => m.blocks)
    .filter((x: any) => x.type === "tool")
    .map((x: any) => x.result);
  expect(results[0].error).toContain("optimum");
  expect(results[1].error).toContain("optimum");
  // 1.0.17: a chat cannot write requirements; the store's values stay as they are.
  expect(results[2].error).toContain("mağaza sayfasından");
  expect(g).not.toHaveProperty("optimum");
  expect(g.hltb.main).toBe(8.09);
  expect(g.recommended).toMatchObject({
    cpu: "700 MHz AMD / Intel işlemci",
    gpu: "32 MB Direct3D uyumlu grafik kartı",
    os: "Windows 98, ME, 2000, XP",
  });
  expect(g.recommended.storageGB).toBeUndefined();

  await page.locator(".game-row-text strong").click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(page.getByRole("columnheader")).toHaveText([
    "Bileşen",
    "Bilgisayarın",
    "Minimum",
    "Önerilen",
  ]);
  const row = (name: string) =>
    page
      .locator(".comparison-table tbody tr")
      .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
      .locator("td");
  await expect(row("CPU").nth(2)).toContainText("700 MHz AMD / Intel işlemci");
  await expect(row("GPU").nth(2)).toContainText("32 MB Direct3D");
  await expect(row("RAM")).toHaveText(["8 GB", "✓ 96 MB", "✓ 128 MB"]);
  await expect(row("Disk")).toHaveText(["16 GB", "✓ 0,81 GB", "—"]);
  await expect(row("VRAM")).toHaveText(["6 GB", "✓ 16 MB", "✓ 32 MB"]);
  await expect(row("İşletim sistemi").nth(2)).toContainText("Windows 98, ME, 2000, XP");
  await expect(page.locator(".comparison-table")).not.toContainText("Belirtilmemiş");
  await expect(page.locator(".comparison-table")).not.toContainText("Optimum");
  await page.screenshot({ path: ".cache/ui-artifacts/sistem-1.0.15.png" });
});
