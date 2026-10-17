import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";
import { componentCompatibilityKey } from "../../shared/compatibility";
let server: http.Server, modelUrl: string;
const gameId = "max-payne-fixture-110";
const raw =
  "OS: Microsoft Windows 2000/XP; CPU: 450MHz AMD/Intel işlemci; RAM: 96 MB (128 MB önerilen); Grafik: 16MB Direct3D uyumlu ekran kartı; Depolama: 830 MB HDD (tam kurulum), 530 MB minimum.";
const hardware = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 16,
};
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
      res.end(JSON.stringify({ data: [{ id: "fixture110" }] }));
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text),
      messages = body.messages,
      tools = messages.filter((m: any) => m.role === "tool"),
      n = tools.length;
    const first = messages.find((m: any) => m.role === "user").content;
    let name: string | undefined, args: any;
    if (first.includes("döngü")) {
      name = "record_compatibility";
      args = {
        gameId,
        level: "minimum",
        component: "GPU",
        status: "pass",
        reason: "Intentionally invalid fixture",
        contextKey: componentCompatibilityKey(
          newGame("Max Payne", 0),
          hardware,
          "minimum",
          "GPU",
        ),
      };
    } else if (
      messages.at(-1).role === "user" &&
      messages.at(-1).content.includes("UYGULAMA DENETİMİ")
    ) {
      name = "update_game_info";
      args = {
        gameId,
        patch: { recommended: { unpublished: ["os", "cpu", "gpu", "storageGB"] } },
      };
    } else if (n === 0) {
      name = "get_game_info";
      args = { gameId };
    } else if (n === 1) {
      name = "get_hardware";
      args = {};
    } else if (n === 2) {
      name = "update_game_info";
      args = { gameId, patch: { minimum: { raw }, recommended: { ramGB: 0.125 } } };
    } else if (n === 3) {
      name = "check_compatibility";
      args = { gameId };
    } else if (n >= 4 && n <= 6) {
      const last = JSON.parse(tools.at(-1).content),
        comparison = last.comparison || last;
      const component = ["CPU", "GPU", "İşletim sistemi"][n - 4];
      name = "record_compatibility";
      args = {
        gameId,
        level: "minimum",
        component,
        status: "pass",
        contextKey: comparison.minimum.find((r: any) => r.name === component).contextKey,
        reason: "Synthetic test comparison; no real launch or benchmark claim",
      };
    }
    const delta = name
      ? {
          tool_calls: [
            {
              index: 0,
              id: "step-" + n,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        }
      : { content: "Model fixture: tamamlandı." };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }],
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
test.beforeEach(async ({ request, page }) => {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    lmUrl: modelUrl,
    lmModel: "fixture110",
    toolMode: "native",
  });
  state.hardware = hardware;
  const game: any = newGame("Max Payne", 0);
  game.id = gameId;
  game.note = "Old removed personal note";
  state.games = [game];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await call(request, "testLM");
});
test("same failing comparison does not spin forever or become a false success", async ({
  request,
  page,
}) => {
  await page.getByLabel("Ajana mesaj").fill("Bu testte döngü davranışını kontrol et.");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(page.getByText(/İlerlemesiz döngü durduruldu/)).toBeVisible();
  await expect(
    page.getByText(/Uygulama kontrolü — Max Payne: Sistem gereksinimleri belirtilmemiş/),
  ).toBeVisible();
  const b = await call(request, "bootstrap");
  expect(b.busyChats).toEqual([]);
  expect(b.state.games[0].aiCompatibility).toBeUndefined();
  expect(b.state.chats[0].apiHistory.filter((m: any) => m.role === "tool")).toHaveLength(
    2,
  );
});
