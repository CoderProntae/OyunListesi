import { test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { initialState, newGame } from "../shared/domain";

// Captures the same three screens of the interface with the same demo library.
// Used for the in-app "Yenilikler" before/after comparison:
//   SHOT_PREFIX=old npx playwright test -c scripts/compare-shots.config.ts
const prefix = process.env.SHOT_PREFIX || "new";
const out = path.resolve(__dirname, "../src/assets/compare");
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const demo = [
  ["Max Payne", 2001, "playing", ["Aksiyon"], 8.1, 89],
  ["Life is Strange - Episode 2", 2015, "planned", ["Macera"], 2.4, 78],
  ["Kane & Lynch: Dead Men", 2007, "planned", ["Aksiyon"], 6.5, 67],
  ["Fallout 2", 1998, "finished", ["RYO"], 37, 86],
  ["Hades", 2020, "playing", ["Roguelike"], 23, 93],
  ["Portal 2", 2011, "finished", ["Bulmaca"], 8.5, 95],
  ["The Witcher 3: Wild Hunt", 2015, "planned", ["RYO"], 51, 93],
  ["Hollow Knight", 2017, "dropped", ["Metroidvania"], 27, 87],
  ["Disco Elysium", 2019, "planned", ["RYO"], 22, 91],
  ["Celeste", 2018, "finished", ["Platform"], 8, 94],
] as const;
test("capture", async ({ page, request }) => {
  fs.mkdirSync(out, { recursive: true });
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    lmModel: "qwen3-8b",
    chatListWidth: 230,
  });
  state.hardware = {
    ...state.hardware,
    os: "Microsoft Windows 10 Pro",
    osVersion: "10.0.19045",
    cpu: "Intel Core i5-4460",
    gpu: "NVIDIA GeForce GTX 1660 SUPER",
    ramGB: 8,
    vramGB: 6,
    vramCertain: true,
    diskFreeGB: 120,
    directX: 12.1,
    detectedAt: "2026-10-16T10:00:00Z",
  };
  state.games = demo.map(([name, year, status, genres, main, mc], i) => ({
    ...newGame(name, i),
    year,
    status,
    genres: [...genres],
    developers: ["Stüdyo"],
    metacritic: mc,
    description: name + " için kısa açıklama.",
    hltb: {
      status: "found",
      main,
      mainExtra: Math.round(main * 13) / 10,
      completionist: Math.round(main * 18) / 10,
      checkedAt: "2026-10-16T10:00:00Z",
    },
    minimum: { raw: "", os: "Windows XP", cpu: "Intel Pentium 4", ramGB: 1, storageGB: 8 },
    recommended: { raw: "", cpu: "Intel Core 2 Duo", ramGB: 2, storageGB: 8 },
  })) as any;
  state.chats = [
    {
      id: "demo-chat",
      title: "Bu hafta ne oynasam?",
      createdAt: "2026-10-16T10:00:00Z",
      apiHistory: [],
      allowedTools: [],
      messages: [
        {
          id: "m1",
          role: "user",
          createdAt: "2026-10-16T10:00:00Z",
          blocks: [{ id: "b1", type: "text", text: "Bu hafta kısa bir oyun öner." }],
        },
        {
          id: "m2",
          role: "assistant",
          createdAt: "2026-10-16T10:00:05Z",
          blocks: [
            {
              id: "b2",
              type: "text",
              text: "**Life is Strange – Episode 2** yaklaşık 2,4 saat sürüyor ve listende sırada. Bilgisayarın gereksinimleri karşılıyor.",
            },
          ],
        },
      ],
    },
    {
      id: "demo-research",
      automatic: true,
      title: "Araştırma · Max Payne",
      createdAt: "2026-10-16T09:00:00Z",
      apiHistory: [],
      allowedTools: [],
      messages: [],
    },
  ] as any;
  state.activeChatId = "demo-chat";
  (state as any).chatGroups = [
    { id: "research", name: "Araştırmalar", color: "#7cc4f8", system: "research" },
    { id: "g1", name: "Öneriler", color: "#f5c35b" },
  ];
  (state.chats[0] as any).groupId = "g1";
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.getByText("Life is Strange - Episode 2").first().click();
  await page.waitForTimeout(500);
  const chatToggle = page.getByRole("button", { name: /Sohbet|AI/ }).first();
  if (!(await page.locator(".chat-panel").count())) await chatToggle.click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `${prefix}-main.jpg`), quality: 72, type: "jpeg" });
  const system = page.getByRole("tab", { name: "Sistem", exact: true });
  if (await system.count()) {
    await system.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(out, `${prefix}-system.jpg`),
      quality: 72,
      type: "jpeg",
    });
  }
  await page.keyboard.press("Control+,").catch(() => {});
  const settings = page.getByRole("button", { name: "Ayarlar", exact: true });
  if (await settings.count()) await settings.first().click();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(out, `${prefix}-settings.jpg`),
    quality: 72,
    type: "jpeg",
  });
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("overlay windows (demo)", async ({ page }) => {
  test.skip(!process.env.SHOT_OVERLAY, "only on request");
  await page.setViewportSize({ width: 900, height: 660 });
  await page.goto("/overlay.html#panel");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(__dirname, "../.cache/overlay-panel.png") });
  await page.getByRole("tab", { name: "Görünüm" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, "../.cache/overlay-panel-look.png") });
  await page.setViewportSize({ width: 420, height: 320 });
  await page.goto("/overlay.html#hud");
  await page.addStyleTag({ content: "body{background:#2b3b55 !important}" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(__dirname, "../.cache/overlay-hud.png") });
});
