import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";

// 1.0.12: no Türkçe tab / patch shortcut; a UI-only Not tab whose text never
// reaches the model, even when the agent reads the game record. 1.0.13 brings
// the "Ne kadar sürer?" (HowLongToBeat) section back.
const MARK = "UI-GIZLI-NOT-42";
const id = "note-ui-112";
let server: http.Server, modelUrl: string;
const bodies: string[] = [];
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
async function fixture(request: APIRequestContext) {
  const state = initialState();
  Object.assign(state.settings, {
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    animations: false,
    lmModel: "fixture112",
    lmUrl: modelUrl,
    toolMode: "native",
  });
  const g = newGame("Not sekmesi testi", 0);
  g.id = id;
  g.genres = ["Aksiyon"];
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  bodies.length = 0;
}
test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "fixture112" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bodies.push(raw);
    const messages = JSON.parse(raw).messages || [];
    const toolResults = messages.filter((m: any) => m.role === "tool").length;
    const delta = toolResults
      ? { content: "Oyun kaydını okudum." }
      : {
          tool_calls: [
            {
              index: 0,
              id: "read-112",
              type: "function",
              function: {
                name: "get_game_info",
                arguments: JSON.stringify({ gameId: id }),
              },
            },
          ],
        };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          choices: [{ delta, finish_reason: toolResults ? "stop" : "tool_calls" }],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
});
test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("1.0.12 removes the Türkçe tab, language filter and patch shortcut; 1.0.13 keeps Ne kadar sürer", async ({
  request,
  page,
}) => {
  await fixture(request);
  await page.goto("/");
  await page.locator(".game-row-text strong").click();
  await expect(
    page.getByRole("tablist", { name: "Oyun ayrıntıları" }).getByRole("tab"),
  ).toHaveText(["Genel bakış", "Mağazalar", "Sistem", "Not"]);
  await page.screenshot({ path: ".cache/ui-artifacts/genel-bakis-1.0.12.png" });
  await expect(page.getByRole("tab", { name: "Türkçe" })).toHaveCount(0);
  await expect(page.getByText("TÜRKÇE DESTEĞİ")).toHaveCount(0);
  await expect(page.locator(".playtime-section")).toContainText("Ne kadar sürer?");
  await expect(page.locator(".playtime-section")).toContainText("HowLongToBeat");
  await page.getByTitle("Filtreler").click();
  await expect(page.getByLabel("Durum filtresi")).toBeVisible();
  await expect(page.getByLabel("Türkçe filtresi")).toHaveCount(0);
  await page.screenshot({ path: ".cache/ui-artifacts/filtreler-1.0.12.png" });
  await page.getByRole("button", { name: "Oyun işlemleri" }).click();
  await expect(page.getByRole("dialog")).toContainText("Bilgileri yeniden topla");
  await expect(page.getByText("Türkçe yama araştırmasını ajana ver")).toHaveCount(0);
});

test("the Not tab saves a personal note that survives reload and never reaches the model", async ({
  request,
  page,
}) => {
  await fixture(request);
  await page.goto("/");
  await page.locator(".game-row-text strong").click();
  await page.getByRole("tab", { name: "Not", exact: true }).click();
  const note = page.getByLabel("Oyun notu", { exact: true });
  await expect(note).toHaveValue("");
  await expect(page.locator(".note-status")).toHaveText("Henüz not yok");
  const text = `Bölüm 3'te kaldım. Boss öncesi ekipmanı güçlendir. (${MARK})`;
  await note.fill(text);
  await expect(page.locator(".note-status")).toContainText("Kaydedildi", {
    timeout: 5000,
  });
  await expect(page.locator(".note-section")).toContainText(
    "AI ajanı bu notu göremez ve değiştiremez",
  );
  let b = await call(request, "bootstrap");
  expect(b.state.notes[id].text).toBe(text);
  expect(JSON.stringify(b.state.games)).not.toContain(MARK);
  await page.screenshot({ path: ".cache/ui-artifacts/not-sekmesi.png" });

  // Leaving the tab right after typing still saves (flush on unmount).
  await note.fill(text + " Ek satır.");
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.notes[id]?.text)
    .toBe(text + " Ek satır.");

  await page.reload();
  await page.locator(".game-row-text strong").click();
  await page.getByRole("tab", { name: "Not", exact: true }).click();
  await expect(page.getByLabel("Oyun notu", { exact: true })).toHaveValue(
    text + " Ek satır.",
  );

  // The agent reads the game record with a tool; neither the request nor the
  // tool result sent back to the model contains the note.
  await call(request, "testLM");
  await page.getByLabel("Ajana mesaj").fill("Bu oyunun kaydını oku ve özetle.");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(page.getByText("Oyun kaydını okudum.")).toBeVisible({ timeout: 20000 });
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.some((x) => x.includes('"role":"tool"') && x.includes(id))).toBe(true);
  for (const body of bodies) expect(body).not.toContain(MARK);
  b = await call(request, "bootstrap");
  expect(JSON.stringify(b.state.chats)).not.toContain(MARK);

  // Clearing the text deletes the note.
  await page.getByRole("tab", { name: "Not", exact: true }).click();
  await page.getByLabel("Oyun notu", { exact: true }).fill("");
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.notes[id])
    .toBeUndefined();
});
