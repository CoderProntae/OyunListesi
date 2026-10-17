import { test, expect, type APIRequestContext } from "@playwright/test";
import http from "node:http";
import { initialState, newGame } from "../../shared/domain";
let mock: http.Server;
let modelUrl: string;
const receivedOutputLimits: number[] = [];
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const r = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.result;
};
const delta = (v: any, finish: any = null) =>
  "data: " + JSON.stringify({ choices: [{ delta: v, finish_reason: finish }] }) + "\n\n";
test.beforeAll(async () => {
  mock = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url?.startsWith("/api/")
            ? {
                models: [
                  {
                    type: "llm",
                    key: "test-model",
                    display_name: "Deterministic Test Model",
                    loaded_instances: [
                      { id: "test-model", config: { context_length: 8192 } },
                    ],
                    capabilities: { trained_for_tool_use: true },
                  },
                ],
              }
            : { data: [{ id: "test-model" }] },
        ),
      );
      return;
    }
    let text = "";
    for await (const c of req) text += c;
    const body = JSON.parse(text),
      messages = body.messages || [],
      last = messages.at(-1);
    receivedOutputLimits.push(body.max_tokens);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (
      messages.some(
        (m: any) => m.role === "user" && m.content?.includes("TEST_LONG_TOOLS"),
      )
    ) {
      const count = messages.filter((m: any) => m.role === "tool").length;
      res.end(
        (count < 15
          ? delta(
              {
                tool_calls: [
                  {
                    index: 0,
                    id: "long-" + count,
                    type: "function",
                    function: { name: "list_games", arguments: "{}" },
                  },
                ],
              },
              "tool_calls",
            )
          : delta({ content: "**15 araç turu tamamlandı.**" }, "stop")) +
          "data: [DONE]\n\n",
      );
      return;
    }
    if (last?.role === "tool") {
      res.end(
        delta({ content: "**Test yanıtı:** Araç sonucu alındı." }, "stop") +
          "data: [DONE]\n\n",
      );
      return;
    }
    const input = messages.filter((m: any) => m.role === "user").at(-1)?.content || "";
    if (input.startsWith("TEST_AUTO_INFO ")) {
      const gameId = input.split(" ")[1];
      res.end(
        delta(
          {
            tool_calls: [
              {
                index: 0,
                id: "auto-info",
                type: "function",
                function: {
                  name: "update_game_info",
                  arguments: JSON.stringify({
                    gameId,
                    patch: { year: 2001, developers: ["Model Dev"] },
                  }),
                },
              },
            ],
          },
          "tool_calls",
        ) + "data: [DONE]\n\n",
      );
      return;
    }
    if (input.includes("TEST_ADD")) {
      res.end(
        delta({ content: "Test oyunu için izin isteyeceğim." }) +
          delta(
            {
              tool_calls: [
                {
                  index: 0,
                  id: "ui-call-add",
                  type: "function",
                  function: {
                    name: "add_game",
                    arguments: JSON.stringify({ name: "UI Test Oyunu" }),
                  },
                },
              ],
            },
            "tool_calls",
          ) +
          "data: [DONE]\n\n",
      );
      return;
    }
    if (input.includes("TEST_WIZARD")) {
      res.end(
        delta(
          {
            tool_calls: [
              {
                index: 0,
                id: "ui-call-wizard",
                type: "function",
                function: {
                  name: "ask_user_questions",
                  arguments: JSON.stringify({
                    questions: [
                      {
                        id: "mood",
                        question: "Bugün nasıl bir oyun?",
                        multiple: false,
                        options: [
                          { id: "calm", label: "Sakin" },
                          { id: "action", label: "Hareketli" },
                        ],
                      },
                      {
                        id: "features",
                        question: "Hangi özellikler?",
                        multiple: true,
                        options: [
                          { id: "story", label: "Hikâye" },
                          { id: "short", label: "Kısa oturum" },
                        ],
                      },
                    ],
                  }),
                },
              },
            ],
          },
          "tool_calls",
        ) + "data: [DONE]\n\n",
      );
      return;
    }
    res.end(delta({ content: "**Test yanıtı** hazır." }, "stop") + "data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
  modelUrl = "http://127.0.0.1:" + (mock.address() as any).port + "/v1";
});
test.afterAll(async ({ request }) => {
  const bootstrap = await call(request, "bootstrap");
  for (const id of bootstrap.busyChats) await call(request, "stopChat", { chatId: id });
  await call(request, "cancelQueue");
  await call(request, "import", { text: JSON.stringify(initialState()) });
  await new Promise<void>((resolve) => mock.close(() => resolve()));
});
test.beforeEach(async ({ request, page }) => {
  const state = initialState();
  state.settings.animations = false;
  state.settings.autoSummary = false;
  state.settings.autoResearch = false;
  await call(request, "cancelQueue");
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "İstatistikler", exact: true }),
  ).toBeVisible();
});
test("bulk numbered import, range selection, duplicate merge and automatic series", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Liste aktar", exact: true }).first().click();
  await page
    .getByLabel("İçe aktarılacak oyun listesi")
    .fill("Başlık\n1. Portal\n2) Portal 2\n3 - PORTAL\n\n4 - Stardew Valley");
  await page.getByLabel("İlk satır", { exact: true }).fill("2");
  await page.getByLabel("Son satır", { exact: true }).fill("4");
  await expect(page.getByLabel("Satır 2 oyun adı")).toHaveValue("Portal");
  await expect(page.locator(".import-summary")).toContainText("3");
  await expect(page.locator(".import-summary")).toContainText("1 yinelenen");
  await page.getByRole("button", { name: "Onayla ve içe aktar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await call(request, "cancelQueue");
  await expect(page.locator(".game-row-text strong")).toHaveCount(2);
  const b = await call(request, "bootstrap");
  expect(b.state.games.map((g: any) => g.name)).toEqual(["Portal", "Portal 2"]);
  expect(b.state.series).toHaveLength(1);
  await expect(page.locator(".series-row")).toHaveCount(1);
  await page.locator(".series-toggle").click();
  await expect(page.locator(".game-row")).toHaveCount(0);
  await page.locator(".series-toggle").click();
  await expect(page.locator(".game-row")).toHaveCount(2);
});
test("manual group, play list membership, delete confirmation and undo", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.games = ["A Game", "B Game", "C Game"].map((n, i) => newGame(n, i));
  await call(request, "import", { text: JSON.stringify(state) });
  await expect(page.locator(".game-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Yeni özel grup", exact: true }).click();
  await page.getByLabel("Grup adı").fill("Hafta sonu");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".game-row-text strong").filter({ hasText: "A Game" }).click();
  await page.getByRole("button", { name: "Gruba taşı", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hafta sonu", exact: true })
    .click();
  await expect
    .poll(async () => {
      const b = await call(request, "bootstrap");
      return b.state.games[0].groupIds.length;
    })
    .toBe(1);
  expect(
    (await call(request, "bootstrap")).state.games.every((g: any) => g.inPlayList),
  ).toBe(true);
  // Moving to a group keeps the game in the single main list (1.0.14 removed the
  // misleading "Listemde" toggle; the list counter is the visible proof).
  await expect(page.locator(".group-chip", { hasText: "Oynama Listesi" })).toContainText(
    "3",
  );
  await page.getByRole("button", { name: "Oyun işlemleri", exact: true }).click();
  await page.getByRole("button", { name: "Kütüphaneden sil", exact: true }).click();
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.locator(".game-row")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".game-row")).toHaveCount(3);
});
test("virtualizes 2000 games and persists keyboard reorder", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.games = Array.from({ length: 2000 }, (_, i) =>
    newGame("Game " + String(i).padStart(4, "0"), i),
  );
  await call(request, "import", { text: JSON.stringify(state) });
  await expect(page.locator(".library-heading h2")).toContainText("2000");
  expect(await page.locator(".game-row").count()).toBeLessThan(30);
  await page.locator(".game-row-text strong").filter({ hasText: "Game 0000" }).click();
  await page.getByLabel("Oyun listesi", { exact: true }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(async () => {
      const b = await call(request, "bootstrap");
      return b.state.games[0].name;
    })
    .toBe("Game 0001");
  await page.locator(".virtual-list").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(
    page.locator(".game-row-text strong").filter({ hasText: "Game 1999" }),
  ).toBeVisible();
  expect(await page.locator(".game-row").count()).toBeLessThan(30);
  await page.reload();
  await expect(page.locator(".game-row-text strong").first()).toHaveText("Game 0001");
});
test("drag game into a group and chat attachment without changing library twice", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.games = ["Drag Game", "Other Game"].map((n, i) => newGame(n, i));
  await call(request, "import", { text: JSON.stringify(state) });
  await expect(page.locator(".game-row")).toHaveCount(2);
  const source = page.getByRole("button", {
      name: "Drag Game taşı",
      exact: true,
    }),
    target = page.locator(".group-chip").filter({ hasText: "GPU Yetmiyor" });
  const a = await source.boundingBox();
  expect(a).toBeTruthy();
  await expect(target).toHaveCount(0);
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(a!.x + 20, a!.y + 10, { steps: 5 });
  await expect(target).toBeVisible();
  const b = await target.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const s = await call(request, "bootstrap");
      return s.state.games[0].groupIds.length;
    })
    .toBe(1);
  const c = await source.boundingBox(),
    d = await page.locator(".chat-feed").boundingBox();
  await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height / 2);
  await page.mouse.down();
  await page.mouse.move(c!.x + 20, c!.y + 10, { steps: 5 });
  await page.mouse.move(d!.x + d!.width / 2, d!.y + d!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.locator(".mention-chips")).toContainText("Drag Game");
});
test("theme and hardware editing survive reload; unsupported reasoning stays disabled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "Okyanus", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Ajan & güvenlik", exact: true }).click();
  await expect(page.getByLabel("Düşünme düzeyi")).toBeDisabled();
  await page.getByRole("button", { name: "Donanım", exact: true }).click();
  await page.getByLabel("İşlemci modeli", { exact: true }).fill("Intel Core i5-12400");
  await page.getByLabel("RAM (GB)", { exact: true }).fill("32");
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "Donanım", exact: true }).click();
  await expect(page.getByLabel("İşlemci modeli", { exact: true })).toHaveValue(
    "Intel Core i5-12400",
  );
  await page.getByRole("button", { name: "Kapat", exact: true }).last().click();
});
test("agent mutation requires visible approval and denial reaches model; allow then mutates", async ({
  page,
  request,
}) => {
  await call(request, "settings", {
    patch: { lmUrl: modelUrl, lmModel: "test-model", requireApproval: true },
  });
  await call(request, "testLM");
  await page.getByLabel("Ajana mesaj").fill("TEST_ADD");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Bu değişikliğe izin veriyor musun?" }),
  ).toBeVisible();
  expect((await call(request, "bootstrap")).state.games).toHaveLength(0);
  await expect(page.locator(".permission-description")).toContainText("UI Test Oyunu");
  await page.getByRole("button", { name: "İzin verme", exact: true }).click();
  await expect(page.locator(".tool-card.denied")).toBeVisible();
  await expect(
    page.locator(".chat-message.assistant .markdown strong").last(),
  ).toHaveText("Test yanıtı:");
  expect((await call(request, "bootstrap")).state.games).toHaveLength(0);
  await page.getByLabel("Ajana mesaj").fill("TEST_ADD");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await page.getByRole("button", { name: "Bir kez izin ver", exact: true }).click();
  await expect(
    page.locator(".game-row-text strong").filter({ hasText: "UI Test Oyunu" }),
  ).toBeVisible();
  await call(request, "cancelQueue");
  await expect(page.locator(".tool-card.done")).toBeVisible();
});
test("wizard supports next/back, multiselect, custom answer and resumes agent", async ({
  page,
  request,
}) => {
  await call(request, "settings", {
    patch: { lmUrl: modelUrl, lmModel: "test-model", requireApproval: true },
  });
  await page.getByLabel("Ajana mesaj").fill("TEST_WIZARD");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Biraz seni tanıyalım." });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".wizard-progress")).toContainText("1 / 2");
  await dialog.getByRole("button", { name: "Sakin", exact: true }).click();
  await dialog.getByRole("button", { name: "Devam", exact: true }).click();
  await dialog.getByRole("button", { name: "Geri", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Sakin", exact: true })).toHaveClass(
    /selected/,
  );
  await dialog.getByRole("button", { name: "Devam", exact: true }).click();
  await dialog.getByRole("button", { name: "Hikâye", exact: true }).click();
  await dialog.getByRole("button", { name: "Kısa oturum", exact: true }).click();
  await dialog.getByLabel("Farklı bir cevabım var").fill("Yarım saatim var.");
  await dialog.getByRole("button", { name: "Yanıtları gönder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".chat-message.assistant .markdown strong").last(),
  ).toHaveText("Test yanıtı:");
  const b = await call(request, "bootstrap");
  const chat = b.state.chats.find((c: any) => c.id === b.state.activeChatId);
  expect(JSON.stringify(chat.apiHistory)).toContain("Yarım saatim var.");
  expect(JSON.stringify(chat.apiHistory)).toContain("selectedLabels");
});
test("small viewport remains operable and modal focus is contained", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.getByRole("button", { name: "Sohbeti gizle", exact: true }).click();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Ne yapmak istersin?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("wizard skip and cancel are sent back without mutating library", async ({
  page,
  request,
}) => {
  await call(request, "settings", {
    patch: { lmUrl: modelUrl, lmModel: "test-model", requireApproval: true },
  });
  await page.getByLabel("Ajana mesaj").fill("TEST_WIZARD");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Biraz seni tanıyalım." });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Atla", exact: true }).click();
  await expect(dialog.locator(".wizard-progress")).toContainText("2 / 2");
  await dialog.getByRole("button", { name: "İptal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".chat-message.assistant .markdown strong").last(),
  ).toHaveText("Test yanıtı:");
  const b = await call(request, "bootstrap");
  expect(b.state.games).toHaveLength(0);
  expect(JSON.stringify(b.state.chats[0].apiHistory)).toContain("cancelled");
});

test("clean detail view keeps Steam selection but removes raw system explanations", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  const g = newGame("Ayrıntı Testi", 0);
  g.fetchStatus = "review";
  g.fetchError = "Eşleşme onayı gerekiyor.";
  g.candidates = [];
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.locator(".game-row-text strong").click();
  await expect(page.locator(".match-review")).toHaveCount(0);
  await page.getByRole("tab", { name: "Mağazalar", exact: true }).click();
  await page.getByRole("button", { name: "Eşleşmeyi düzenle", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Steam oyununu seç" })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kapat", exact: true })
    .click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  // No store data yet: one plain sentence instead of an empty table (1.0.16).
  await expect(page.getByTestId("requirements-none")).toContainText(
    "Sistem gereksinimleri belirtilmemiş.",
  );
  await expect(page.locator(".comparison-table")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Minimum gereksinimler", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Bileşen açıklamaları ve kaynak metni", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Donanımı düzenle / yeniden algıla" }),
  ).toHaveCount(0);
});

test("consecutive tool cards collapse without losing results, retry or error details", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  const chat = {
    id: "visual-chat",
    title: "Görsel test",
    createdAt: new Date().toISOString(),
    allowedTools: [],
    apiHistory: [],
    messages: [
      {
        id: "visual-message",
        role: "assistant",
        createdAt: new Date().toISOString(),
        error: true,
        blocks: [
          ...Array.from({ length: 3 }, (_, i) => ({
            id: "card" + i,
            type: "tool",
            name: "web_search",
            args: { query: "Test " + i },
            result: { results: [{ url: "https://example.org", title: "Test kaynağı" }] },
            status: "done",
            startedAt: 1,
            duration: 200,
          })),
          {
            id: "error",
            type: "notice",
            text:
              "No user query found in messages: _lit_step_tool " +
              "engine stack ".repeat(100),
          },
        ],
      },
    ],
  };
  state.chats = [chat as any];
  state.activeChatId = chat.id;
  await call(request, "import", { text: JSON.stringify(state) });
  await expect(page.locator(".tool-group>summary")).toContainText("3 araç adımı");
  await expect(page.locator(".tool-card").first()).not.toBeVisible();
  await page.locator(".tool-group>summary").click();
  await expect(page.locator(".tool-card")).toHaveCount(3);
  await page.locator(".tool-head").first().click();
  await expect(
    page.getByRole("button", { name: "Yeniden dene", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test kaynağı", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".error-details pre")).not.toBeVisible();
  await page.getByText("Teknik ayrıntı", { exact: true }).click();
  await expect(page.locator(".error-details pre")).toContainText("_lit_step_tool");
});

test("source provenance retains AI label, quote and changed fields after reload", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  const g = newGame("Kaynak Testi", 0);
  g.sources = [
    {
      title: "AI kaynak önerisi · Test",
      url: "https://example.org",
      checkedAt: "2026-10-15T00:00:00Z",
      kind: "agent",
      quote: "Minimum requirements: Pentium III.",
      fields: ["minimum.cpu"],
    },
  ];
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.reload();
  await page.locator(".game-row-text strong").click();
  await expect(page.getByRole("tab", { name: "Kaynaklar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Notlarım", exact: true })).toHaveCount(0);
  const persisted = await call(request, "bootstrap");
  expect(persisted.state.games[0].sources).toEqual(g.sources);
});

test("20,000 output and loaded-context inputs are distinct and persist", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page
    .getByLabel("Maksimum çıktı tokenı (yanıt üst sınırı)", { exact: true })
    .fill("20000");
  await page
    .getByLabel("Yüklü bağlam (token; 0 = LM Studio’dan otomatik)", { exact: true })
    .fill("32768");
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  const b = await call(request, "bootstrap");
  expect(b.state.settings.maxTokens).toBe(20000);
  expect(b.state.settings.contextTokens).toBe(32768);
  await page.reload();
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await expect(
    page.getByLabel("Maksimum çıktı tokenı (yanıt üst sınırı)", { exact: true }),
  ).toHaveValue("20000");
  await expect(
    page.getByLabel("Yüklü bağlam (token; 0 = LM Studio’dan otomatik)", {
      exact: true,
    }),
  ).toHaveValue("32768");
});
test("real SSE orchestration reaches fifteen tool rounds then a Markdown final answer", async ({
  page,
  request,
}) => {
  await call(request, "settings", {
    patch: {
      lmUrl: modelUrl,
      lmModel: "test-model",
      maxTokens: 20000,
      contextTokens: 32768,
    },
  });
  await call(request, "testLM");
  await page.getByLabel("Ajana mesaj").fill("TEST_LONG_TOOLS");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(
    page.locator(".chat-message.assistant .markdown strong").last(),
  ).toHaveText("15 araç turu tamamlandı.");
  await expect(page.locator(".tool-group>summary")).toContainText("15 araç adımı");
  const b = await call(request, "bootstrap");
  expect(b.busyChats).toEqual([]);
  expect(b.state.chats[0].apiHistory.filter((m: any) => m.role === "tool")).toHaveLength(
    15,
  );
});

test("autonomous default applies metadata with no permission, fetch or evidence and supports undo", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.settings.lmUrl = modelUrl;
  state.settings.lmModel = "test-model";
  const g = newGame("Autonomous Test", 0);
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await call(request, "testLM");
  expect((await call(request, "bootstrap")).state.settings.requireApproval).toBe(false);
  await expect(page.locator(".chat-model")).not.toContainText("Otonom ajan");
  await page.getByLabel("Ajana mesaj").fill("TEST_AUTO_INFO " + g.id);
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect
    .poll(async () => {
      const b = await call(request, "bootstrap");
      return b.state.games[0].year;
    })
    .toBe(2001);
  await expect(
    page.getByRole("dialog", { name: "Bu değişikliğe izin veriyor musun?" }),
  ).toHaveCount(0);
  const b = await call(request, "bootstrap");
  expect(b.state.games[0].sources).toEqual([]);
  expect(b.state.games[0].developers).toEqual(["Model Dev"]);
  expect(b.state.games[0].aiEditedFields).toContain("developers");
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].year)
    .toBeUndefined();
});
test("confirmation is opt-in and can be saved without changing autonomous default", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "Ajan & güvenlik", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: /İşlem öncesi onay iste/ }),
  ).not.toBeChecked();
  await page.getByRole("switch", { name: /İşlem öncesi onay iste/ }).check();
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  await expect(page.locator(".chat-model")).not.toContainText("Onaylı mod");
  expect((await call(request, "bootstrap")).state.settings.requireApproval).toBe(true);
  expect((await call(request, "bootstrap")).state.settings.requireApproval).toBe(true);
  await page.reload();
  await expect(page.locator(".chat-model")).not.toContainText("Onaylı mod");
  expect((await call(request, "bootstrap")).state.settings.requireApproval).toBe(true);
});

test("store cards separate missing from unavailable and open real products / SteamDB", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.settings.autoSummary = false;
  state.settings.autoResearch = false;
  const g = newGame("Catalog UI fixture", 0),
    at = new Date().toISOString();
  g.appId = 620;
  g.fetchStatus = "done";
  g.storeChecks = [
    { store: "Steam", status: "not_found", checkedAt: at, source: "Steam Store" },
    {
      store: "GOG",
      status: "unavailable",
      checkedAt: at,
      source: "GOG kataloğu",
      message: "HTTP 503",
    },
    {
      store: "Epic Games",
      status: "found",
      checkedAt: at,
      source: "EGData · topluluk kataloğu",
      url: "https://store.epicgames.com/tr/p/hades",
    },
  ];
  g.stores = [
    {
      name: "Epic Games",
      url: "https://store.epicgames.com/tr/p/hades",
      verified: true,
      price: "235.00 TRY",
    },
  ];
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.reload();
  await page.locator(".game-row-text strong").filter({ hasText: g.name }).click();
  await page.getByRole("tab", { name: "Mağazalar", exact: true }).click();
  await expect(page.getByTestId("catalog-Steam")).toContainText("Bulunamadı");
  await expect(page.getByTestId("catalog-GOG")).toContainText("Kontrol edilemedi");
  await expect(page.getByTestId("catalog-Epic Games")).toContainText("Var");
  await expect(page.locator(".game-detail .notice-box.error")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__opened = [];
    window.open = ((url: any) => {
      (window as any).__opened.push(url);
      return null;
    }) as any;
  });
  await page
    .getByTestId("catalog-Epic Games")
    .getByRole("button", { name: "Ürün sayfası" })
    .click();
  await page.getByRole("button", { name: "SteamDB", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([
    "https://store.epicgames.com/tr/p/hades",
    "https://steamdb.info/app/620/",
  ]);
  await expect(page.getByRole("button", { name: "GOG’da araştır" })).toHaveCount(0);
});

test("HLTB displays fetched hours rather than a search shortcut", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  const g = newGame("Duration fixture", 0);
  g.hltb = {
    status: "found",
    main: 8.5,
    mainExtra: 14,
    completionist: 23,
    checkedAt: new Date().toISOString(),
    via: "HowLongToBeat",
    url: "https://howlongtobeat.com/game/7231",
  };
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.reload();
  await page.locator(".game-row-text strong").filter({ hasText: g.name }).click();
  const times = page.locator(".playtime-section");
  await expect(times).toContainText("8,5");
  await expect(times).toContainText("14");
  await expect(times).toContainText("23");
  await expect(times.getByRole("button", { name: "HLTB oyun sayfası" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Oynama süresini araştır" })).toHaveCount(
    0,
  );
});

test("top-menu browser control explains the web preview limitation", async ({ page }) => {
  await page.getByRole("button", { name: "Tarayıcı", exact: true }).click();
  await expect(
    page.getByText("Sekmeli uygulama tarayıcısı Windows EXE içinde çalışır.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("starts in Statistics with one playlist, next unfinished in order and no redundant chrome", async ({
  page,
  request,
}) => {
  await expect(
    page.getByRole("heading", { name: "İstatistikler", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tüm oyunlar", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Oyun ekle", exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.locator(".local-badge,.composer-note,.library-footer,.statusbar"),
  ).toHaveCount(0);
  await expect(
    page.getByText("LM Studio · bağlantı bekliyor", { exact: true }),
  ).toHaveCount(0);
  const state = initialState();
  state.settings.animations = false;
  state.settings.autoResearch = false;
  state.games = ["Bitti", "İlk oynanmayan", "Daha sonra"].map((n, i) => newGame(n, i));
  state.games[0].status = "finished";
  await call(request, "import", { text: JSON.stringify(state) });
  await expect(page.locator(".library-heading h2")).toContainText(
    "Sonraki Oyun: İlk oynanmayan",
  );
  await call(request, "exactOrder", {
    ids: [state.games[2].id, state.games[0].id, state.games[1].id],
  });
  await expect(page.locator(".library-heading h2")).toContainText(
    "Sonraki Oyun: Daha sonra",
  );
});
test("bulk import lets each row search another Steam title and persists the chosen app ID", async ({
  page,
  request,
}) => {
  await page.route("**/api/call", async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === "searchGames")
      return route.fulfill({
        json: { ok: true, result: [{ name: "Portal 2", appId: 620 }] },
      });
    return route.continue();
  });
  await page.getByRole("button", { name: "Liste aktar", exact: true }).first().click();
  await page.getByLabel("İçe aktarılacak oyun listesi").fill("Yanlış kısa ad");
  await page.getByLabel("Satır 1 Steam seç").click();
  await page.getByLabel("Steam oyun ara").fill("Portal");
  await page.getByRole("button", { name: /Portal 2 Steam #620/ }).click();
  await expect(page.getByLabel("Satır 1 oyun adı")).toHaveValue("Portal 2");
  await expect(page.getByLabel("Satır 1 Steam seç")).toContainText("✓ Steam");
  await page.getByRole("button", { name: "Onayla ve içe aktar" }).click();
  await call(request, "cancelQueue");
  const b = await call(request, "bootstrap");
  expect(b.state.games[0]).toMatchObject({
    name: "Portal 2",
    appId: 620,
    inPlayList: true,
    steamMatchMode: "manual",
  });
});
test("system table aligns rows by component with only minimum and recommended columns", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.settings.autoResearch = false;
  const g = newGame("Eski oyun", 0);
  g.minimum = {
    raw: "test",
    cpu: "Pentium 4 2GHz",
    gpu: "128 MB NVIDIA 6600 / ATI X1300",
    ramGB: 1,
    storageGB: 7,
    vramGB: 0.125,
    os: "Windows XP SP2 / Vista",
  };
  g.recommended = { raw: "CPU only", cpu: "Pentium 4 2.5GHz" };
  // A library saved before 1.0.15 may still carry a third level; it is dropped.
  Object.assign(g, {
    optimum: {
      raw: "Optimum",
      cpu: "Pentium 4 3GHz",
      ramGB: 2,
      gpu: "128 MB NVIDIA 8300 / ATI X1800",
    },
  });
  state.games = [g];
  state.hardware = {
    ...state.hardware,
    cpu: "Core i5-4460",
    gpu: "GTX 1660 SUPER",
    ramGB: 8,
    diskFreeGB: 16,
    os: "Windows 10",
    osVersion: "10.0.19045",
  };
  await call(request, "import", { text: JSON.stringify(state) });
  await page.locator(".game-row-text strong").click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(page.getByRole("columnheader")).toHaveText([
    "Bileşen",
    "Bilgisayarın",
    "Minimum",
    "Önerilen",
  ]);
  await expect(page.locator(".comparison-table")).not.toContainText("Optimum");
  const vram = page
    .locator(".comparison-table tr")
    .filter({ has: page.getByRole("rowheader", { name: "VRAM", exact: true }) });
  await expect(vram.locator("td").nth(1)).toContainText("128 MB");
  const disk = page
    .locator(".comparison-table tr")
    .filter({ has: page.getByRole("rowheader", { name: "Disk", exact: true }) });
  await expect(disk).toContainText("✓ 7 GB");
  // The store lists no recommended disk: an empty cell, not a "missing" label.
  await expect(disk.locator("td").nth(2)).toHaveText("—");
  const os = page.locator(".comparison-table tr").filter({
    has: page.getByRole("rowheader", { name: "İşletim sistemi", exact: true }),
  });
  await expect(os.locator("td").nth(1)).toContainText("XP SP2");
  await expect(os.locator("td").nth(2)).toHaveText("—");
  await expect(page.getByRole("tab", { name: "Notlarım" })).toHaveCount(0);
});

test("all-games research button requeues completed games without changing their order or tags", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.animations = false;
  state.settings.autoResearch = false;
  state.games = ["Second pass A", "Second pass B"].map((name, i) => ({
    ...newGame(name, i),
    tags: ["Keep this tag"],
    research: { status: "done" as const },
  }));
  await call(request, "import", { text: JSON.stringify(state) });
  await page
    .getByRole("button", { name: "Tüm oyunları yeniden araştır", exact: true })
    .click();
  await expect(page.getByLabel("Toplu AI araştırması")).toContainText(
    "2 sırada / model bekliyor",
  );
  const b = await call(request, "bootstrap");
  expect(b.state.games.map((g: any) => g.name)).toEqual([
    "Second pass A",
    "Second pass B",
  ]);
  expect(
    b.state.games.every(
      (g: any) => g.tags.includes("Keep this tag") && g.research?.freshContext,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Tüm oyunları yeniden araştır", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Araştırmayı durdur", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tüm oyunları yeniden araştır", exact: true }),
  ).toBeEnabled();
});

test("HTTP 500 explains a model-server failure while preserving the original response in technical details", async ({
  page,
  request,
}) => {
  const state = initialState();
  state.settings.firstRun = false;
  state.settings.animations = false;
  state.settings.autoResearch = false;
  state.chats = [
    {
      id: "server-error",
      title: "Sunucu hatası",
      createdAt: new Date().toISOString(),
      allowedTools: [],
      apiHistory: [],
      messages: [
        {
          id: "error-message",
          role: "assistant",
          createdAt: new Date().toISOString(),
          error: true,
          blocks: [
            {
              id: "error-notice",
              type: "notice",
              text: "LM Studio HTTP 500: <!DOCTYPE html><h1>Internal Server Error</h1>",
            },
          ],
        },
      ],
    },
  ];
  state.activeChatId = "server-error";
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await expect(page.getByText(/Model sunucusu HTTP 5xx hatası döndürdü/)).toBeVisible();
  await page.getByText("Teknik ayrıntı", { exact: true }).click();
  await expect(page.locator(".error-details pre")).toHaveText(
    "LM Studio HTTP 500: <!DOCTYPE html><h1>Internal Server Error</h1>",
  );
});

test("output values 20001, 20000 and 16128 survive UI save and reach HTTP unchanged with long history", async ({
  page,
  request,
}) => {
  const state = initialState();
  Object.assign(state.settings, {
    firstRun: false,
    animations: false,
    autoSummary: false,
    autoResearch: false,
    lmUrl: modelUrl,
    lmModel: "test-model",
    toolMode: "native",
    contextTokens: 16384,
  });
  state.chats = [
    {
      id: "output-budget",
      title: "Bütçe testi",
      createdAt: new Date().toISOString(),
      allowedTools: [],
      messages: [],
      apiHistory: [
        { role: "user", content: "Donanım araştırması" },
        { role: "assistant", content: "Kaynak bilgisi ".repeat(8000) },
      ],
    },
  ];
  state.activeChatId = "output-budget";
  await call(request, "import", { text: JSON.stringify(state) });
  await page.reload();
  const before = receivedOutputLimits.length;
  for (const value of [20001, 20000, 16128]) {
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await page.getByRole("button", { name: "LM Studio", exact: true }).click();
    const field = page.getByLabel("Maksimum çıktı tokenı (yanıt üst sınırı)", {
      exact: true,
    });
    await expect(field).toHaveAttribute("step", "1");
    await field.fill(String(value));
    expect(await field.evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(true);
    await expect(
      page.getByText(`Ajan isteğine gönderilen çıktı üst sınırı: ${value} token.`, {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ayarları kaydet" }).click();
    await page.getByLabel("Ajana mesaj").fill("Bütçe kontrolü " + value);
    await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
    await expect.poll(() => receivedOutputLimits.at(-1)).toBe(value);
    await expect
      .poll(async () => (await call(request, "bootstrap")).busyChats.length)
      .toBe(0);
  }
  expect(receivedOutputLimits.slice(before)).toEqual([20001, 20000, 16128]);
  await page.reload();
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await expect(
    page.getByLabel("Maksimum çıktı tokenı (yanıt üst sınırı)", { exact: true }),
  ).toHaveValue("16128");
  // Historical evidence files in docs/ are not overwritten by later runs.
  await page.screenshot({ path: ".cache/ui-artifacts/cikti-siniri.png" });
});
