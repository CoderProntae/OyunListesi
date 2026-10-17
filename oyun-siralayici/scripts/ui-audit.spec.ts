import { test, type APIRequestContext } from "@playwright/test";
import { inspect, type Issue } from "./audit-inspect";
import fs from "node:fs";
import path from "node:path";
import { initialState, newGame } from "../shared/domain";

// Dev-only interface audit (not part of the test suite): every main screen at
// several window sizes, dark and light, checked automatically for
// - page errors / console errors,
// - the page growing sideways,
// - visible controls cut off at the right edge,
// - text running out of its box (no ellipsis),
// - buttons / fields overlapping each other.
//   npx playwright test -c scripts/ui-audit.config.ts
const out = path.resolve(__dirname, "../.cache/audit");
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const names = [
  "Max Payne",
  "Life is Strange - Episode 2",
  "Kane & Lynch: Dead Men",
  "The Elder Scrolls V: Skyrim Special Edition – Anniversary Upgrade Pack",
  "Hades",
  "Portal 2",
  "The Witcher 3: Wild Hunt – Game of the Year Edition",
  "Hollow Knight",
  "Disco Elysium - The Final Cut",
  "Celeste",
  "Fallout 2",
  "Sid Meier's Civilization VI",
  "Grand Theft Auto: San Andreas – The Definitive Edition",
  "Stardew Valley",
  "Outer Wilds",
  "Return of the Obra Dinn",
];
function seed(theme: string, split: boolean) {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    theme,
    lmModel: "qwen3-8b-instruct-q4_k_m",
    chatListWidth: 220,
    chatSplit: { chatId: split ? "c2" : null, ratio: 0.5 },
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
  state.games = names.map((name, i) => ({
    ...newGame(name, i),
    year: 2000 + i,
    releaseDate: `20${String(i).padStart(2, "0")}-03-24`,
    status: (["planned", "playing", "finished", "dropped", "watch"] as const)[i % 5],
    genres: ["Aksiyon", "Macera", "Rol yapma"].slice(0, (i % 3) + 1),
    developers: ["Çok Uzun Adlı Bir Geliştirici Stüdyosu Ltd. Şti."],
    publishers: ["Yayıncı"],
    metacritic: 60 + i,
    description: name + " için açıklama. ".repeat(20),
    hltb: {
      status: "found",
      main: 5 + i,
      mainExtra: 8 + i,
      completionist: 12 + i,
      checkedAt: "2026-10-16T10:00:00Z",
    },
    minimum: {
      raw: "",
      os: "Windows XP",
      cpu: "Intel Pentium 4 2.0 GHz veya AMD Athlon XP 2400+",
      ramGB: 1,
      storageGB: 8,
      gpu: "NVIDIA GeForce 6600 / ATI Radeon X1600 256 MB",
    },
    recommended:
      i % 2
        ? { raw: "", cpu: "Intel Core 2 Duo E6600", ramGB: 2, storageGB: 8 }
        : { raw: "" },
    tags: i % 3 ? ["favori"] : [],
  })) as any;
  const message = (id: string, role: string, text: string, extra: any[] = []) => ({
    id,
    role,
    createdAt: "2026-10-16T10:00:00Z",
    blocks: [{ id: id + "t", type: "text", text }, ...extra],
  });
  state.chats = [
    {
      id: "c1",
      title: "Bu hafta ne oynasam? Uzun bir sohbet başlığı burada kesilmeli",
      createdAt: "2026-10-16T10:00:00Z",
      apiHistory: [],
      allowedTools: [],
      messages: [
        message("m1", "user", "Bu hafta kısa bir oyun öner."),
        message(
          "m2",
          "assistant",
          "**Life is Strange – Episode 2** yaklaşık 2,4 saat sürüyor.\n\n- Madde bir\n- Madde iki\n\n| Oyun | Süre |\n|---|---|\n| Hades | 23 sa |",
          [
            {
              id: "tool1",
              type: "tool",
              name: "get_game_info",
              args: { gameId: "x" },
              status: "done",
              startedAt: 1,
              duration: 120,
              result: { ok: true },
            },
            {
              id: "n1",
              type: "notice",
              text: "Aynı anda 2 istek çalıştığı için bu istek bağlamın yarısına (13.500 token) sığacak şekilde sıkıştırıldı.",
            },
          ],
        ),
      ],
    },
    {
      id: "c2",
      title: "İkinci sohbet",
      createdAt: "2026-10-16T09:00:00Z",
      apiHistory: [],
      allowedTools: [],
      messages: [
        message("m3", "user", "Merhaba"),
        message("m4", "assistant", "Merhaba! Nasıl yardımcı olabilirim? ".repeat(6)),
      ],
    },
    {
      id: "r1",
      automatic: true,
      title: "Araştırma · Max Payne",
      createdAt: "2026-10-16T08:00:00Z",
      apiHistory: [],
      allowedTools: [],
      messages: [],
    },
  ] as any;
  (state as any).chatGroups = [
    { id: "research", name: "Araştırmalar", color: "#7cc4f8", system: "research" },
    { id: "g1", name: "Çok uzun bir sohbet grubu adı denemesi", color: "#f5c35b" },
  ];
  (state.chats[1] as any).groupId = "g1";
  state.activeChatId = "c1";
  return state;
}
const sizes = [
  [1920, 1080],
  [1510, 960],
  [1366, 768],
  [1280, 720],
  [1024, 700],
  [960, 650],
];
test("interface audit", async ({ page, request }) => {
  test.setTimeout(900000);
  fs.mkdirSync(out, { recursive: true });
  const issues: Issue[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  for (const theme of ["dark", "light"])
    for (const [w, h] of sizes) {
      const tag = `${w}x${h}-${theme}`;
      await page.setViewportSize({ width: w, height: h });
      await call(request, "import", { text: JSON.stringify(seed(theme, false)) });
      await page.goto("/");
      await page.waitForTimeout(500);
      await page.locator(".game-row-text strong").nth(3).click();
      await page.waitForTimeout(300);
      await inspect(page, `${tag} main`, issues);
      await page.screenshot({ path: path.join(out, `${tag}-main.png`) });
      // Narrow windows: the chat is a drawer over the content; a click on the
      // dimmed area closes it, which is also what makes the covered controls
      // reachable again (2.1.1).
      if (await page.locator(".chat-scrim").isVisible()) {
        await page.locator(".chat-scrim").click({ position: { x: 12, y: 12 } });
        await page.waitForTimeout(400);
      }
      await page.getByRole("tab", { name: "Sistem", exact: true }).click();
      await page.waitForTimeout(200);
      await inspect(page, `${tag} system`, issues);
      await page.screenshot({ path: path.join(out, `${tag}-system.png`) });
      await page.getByRole("tab", { name: "Mağazalar", exact: true }).click();
      await page.waitForTimeout(200);
      await inspect(page, `${tag} stores`, issues);
      // 2.0.4: the series window, opened from the list header.
      await page.getByRole("button", { name: "Yeni seri", exact: true }).click();
      await page.waitForTimeout(300);
      await inspect(page, `${tag} series`, issues);
      if (w === 1510 || w === 960)
        await page.screenshot({ path: path.join(out, `${tag}-series.png`) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      // Two chats.
      await call(request, "chatSplit", { action: "open", chatId: "c2" });
      await page.waitForTimeout(400);
      await inspect(page, `${tag} split`, issues);
      await page.screenshot({ path: path.join(out, `${tag}-split.png`) });
      await call(request, "chatSplit", { action: "close" });
      await page.getByRole("button", { name: "İstatistikler", exact: true }).click();
      await page.waitForTimeout(300);
      await inspect(page, `${tag} stats`, issues);
      await page.screenshot({ path: path.join(out, `${tag}-stats.png`) });
      // Settings, every tab.
      await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
      await page.waitForTimeout(300);
      for (const label of [
        "Görünüm",
        "LM Studio",
        "Ajan & güvenlik",
        "Donanım",
        "Web araştırması",
        "Veriler & yedekler",
        "Oyun katmanı",
        "Güncellemeler",
        "Kısayollar",
      ]) {
        await page
          .locator(".settings-nav")
          .getByRole("button", { name: label, exact: true })
          .click();
        await page.waitForTimeout(250);
        await inspect(page, `${tag} settings/${label}`, issues);
        if (["Oyun katmanı", "Görünüm", "Güncellemeler"].includes(label))
          await page.screenshot({
            path: path.join(out, `${tag}-settings-${label.replace(/\W+/g, "")}.png`),
          });
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      // Add game dialog, command palette, "Yenilikler".
      await page.keyboard.press("Control+n");
      await page.waitForTimeout(300);
      await inspect(page, `${tag} add`, issues);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
      await inspect(page, `${tag} command`, issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  // "Yenilikler" once, at two sizes.
  for (const [w, h] of [
    [1510, 960],
    [960, 650],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    const s = seed("dark", false);
    s.settings.lastSeenVersion = "2.0.0";
    await call(request, "import", { text: JSON.stringify(s) });
    await page.goto("/");
    await page.waitForTimeout(800);
    await inspect(page, `${w}x${h} whatsnew`, issues);
    await page.screenshot({ path: path.join(out, `${w}x${h}-whatsnew.png`) });
  }
  await call(request, "import", { text: JSON.stringify(initialState()) });
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify({ errors, issues }, null, 2),
  );
  console.log(`AUDIT errors=${errors.length} issues=${issues.length}`);
});
