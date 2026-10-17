import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";
import pkg from "../../package.json";

// 1.0.14: interface bugs found in a full UI review. Each test describes what
// an end user does and what they must see.
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
const LONG_GROUP = "Çok uzun bir koleksiyon adı ki taşma olup olmadığını görelim lütfen";
const LONG_GAME =
  "Warhammer 40,000: Dawn of War – Definitive Edition Ultimate Collector's Bundle with All DLC and Soundtrack (2026 Remaster)";
function seed() {
  const state: any = initialState();
  state.settings.animations = false;
  state.settings.autoResearch = false;
  state.settings.autoSummary = false;
  state.groups.push(
    { id: "g-weekend", name: "Hafta sonu", color: "#7dd3a8", icon: "heart" },
    { id: "g-long", name: LONG_GROUP, color: "#f4b860", icon: "folder" },
  );
  const names = [
    "Stardew Valley",
    "Hollow Knight",
    "Portal 2",
    "Hades",
    "Celeste",
    LONG_GAME,
  ];
  state.games = names.map((name, i) => {
    const g: any = newGame(name, i);
    g.id = "g114-" + i;
    g.status = i === 2 ? "finished" : i === 3 ? "playing" : "planned";
    g.playHours = i === 0 ? 2887.5 : undefined;
    g.groupIds = i === 1 ? ["g-weekend"] : i === 4 ? ["g-long"] : [];
    g.fetchStatus = "done";
    return g;
  });
  state.games[0].aiSummary =
    "## Neden oyna?\n\n- **Atmosfer:** çok güçlü\n- Rahat bir çiftlik oyunu\n\nİkinci paragraf.";
  state.games[0].aiSummaryAt = "2026-10-14T10:00:00.000Z";
  state.games[0].aiSummaryModel = "test-model";
  state.chats = [
    {
      id: "c114",
      title: "Tablo",
      createdAt: "2026-10-14T10:00:00.000Z",
      apiHistory: [],
      allowedTools: [],
      messages: [
        {
          id: "m1",
          role: "assistant",
          createdAt: "2026-10-14T10:00:00.000Z",
          blocks: [
            {
              id: "b1",
              type: "text",
              text:
                "| Oyun | Süre | Not |\n|---|---|---|\n| Celeste | 8 saat | " +
                "çok uzun bir açıklama hücresi ".repeat(12) +
                " |",
            },
          ],
        },
      ],
    },
  ];
  state.activeChatId = "c114";
  return state;
}
async function open(page: Page, request: APIRequestContext, state = seed()) {
  await call(request, "cancelQueue");
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "İstatistikler", exact: true }),
  ).toBeVisible();
}
const row = (page: Page, name: string) =>
  page.locator(".game-row", { hasText: name }).first();
const modalTitle = (page: Page) => page.locator('[role="dialog"] .modal-head h2');

test("dialogs keep the cursor in their text box, so typing after a short pause is not lost", async ({
  page,
  request,
}) => {
  await open(page, request);
  await page.keyboard.press("Control+n");
  await page.waitForTimeout(400);
  await page.keyboard.type("Hades");
  await expect(page.getByLabel("Oyun adı", { exact: true })).toHaveValue("Hades");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.keyboard.type("port");
  await expect(page.getByPlaceholder("Bir komut veya oyun ara…")).toHaveValue("port");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+i");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
  // Turkish Q keyboard: the "I" key produces "ı"; Ctrl+I must still open the import window.
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ı",
        code: "KeyI",
        ctrlKey: true,
        bubbles: true,
      }),
    ),
  );
  await expect(page.locator('[role="dialog"] textarea').first()).toBeVisible();
  // A shortcut pressed while a window is open must not throw away what was typed.
  await page.keyboard.type("1. Portal 2");
  await page.keyboard.press("Control+n");
  await page.keyboard.press("Control+k");
  await expect(page.locator('[role="dialog"] textarea').first()).toHaveValue(/Portal 2/);
});

test("Esc closes a window even after a click on its text, and focus returns to where it was", async ({
  page,
  request,
}) => {
  await open(page, request);
  await row(page, "Stardew Valley").click();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("port");
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
  ).toBe("Oyun listesi");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await modalTitle(page).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  // Focus outside the open window: Tab brings it back into the window, Esc closes it.
  await page.keyboard.press("Control+n");
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await page.locator('[aria-label="Ajana mesaj"]').focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
  ).toBe(true);
  await page.locator('[aria-label="Ajana mesaj"]').focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test("the hover preview never covers the open game and disappears when its row is filtered away", async ({
  page,
  request,
}) => {
  await open(page, request);
  await row(page, "Stardew Valley").click();
  await page.waitForTimeout(1200);
  await expect(page.locator(".game-hover")).toHaveCount(0);
  // Pointer rests on a row while the user filters the list with the keyboard.
  await row(page, "Hollow Knight").hover();
  await expect(page.locator(".game-hover")).toContainText("Hollow Knight");
  await page.keyboard.press("/");
  await page.keyboard.type("Portal");
  await page.waitForTimeout(1200);
  await expect(page.locator(".game-hover")).toHaveCount(0);
});

test("long collection names are shortened instead of being drawn over the neighbouring chip", async ({
  page,
  request,
}) => {
  await open(page, request);
  await page.locator("button.collection-toggle").click();
  const boxes = await page.locator(".group-chip").evaluateAll((chips) =>
    chips.map((c) => {
      const r = c.getBoundingClientRect();
      return {
        name: c.textContent,
        left: r.left,
        right: r.right,
        fits: c.scrollWidth <= c.clientWidth + 1,
      };
    }),
  );
  for (const b of boxes) expect(b.fits, b.name || "").toBe(true);
  const weekend = page.locator(".group-chip", { hasText: "Hafta sonu" });
  await expect(weekend).toContainText("1");
  await expect(page.locator(".group-chip", { hasText: "Çok uzun" })).toHaveAttribute(
    "title",
    new RegExp(LONG_GROUP),
  );
});

test("every game is always in the Oynama Listesi: no misleading list toggle and statuses are kept", async ({
  page,
  request,
}) => {
  await open(page, request);
  await row(page, "Portal 2").click();
  await expect(page.locator(".detail-actions")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Listemde|Oynama Listeme ekle/ }),
  ).toHaveCount(0);
  // Multi-selection in the Oynama Listesi: the no-op "add to list" button is gone.
  await row(page, "Hades").click({ modifiers: ["Control"] });
  await expect(page.locator(".selection-bar")).toBeVisible();
  await expect(
    page.locator(".selection-bar").getByRole("button", { name: "Oynama Listesine ekle" }),
  ).toHaveCount(0);
  // Inside a collection the button removes the games from that collection only
  // and never changes their status.
  await page.locator("button.collection-toggle").click();
  await page.locator(".group-chip", { hasText: "Hafta sonu" }).click();
  await call(request, "moveGroup", { ids: ["g114-2"], groupId: "g-weekend" });
  await row(page, "Hollow Knight").click();
  await row(page, "Portal 2").click({ modifiers: ["Control"] });
  await page
    .locator(".selection-bar")
    .getByRole("button", { name: "Koleksiyondan çıkar" })
    .click();
  await expect(page.locator(".game-row")).toHaveCount(0);
  const state = (await call(request, "bootstrap")).state;
  const portal = state.games.find((g: any) => g.name === "Portal 2");
  expect(portal.status).toBe("finished");
  expect(portal.groupIds).toEqual([]);
  expect(state.games.every((g: any) => g.inPlayList)).toBe(true);
  await expect(
    call(request, "edit", { id: "g114-2", patch: { inPlayList: false } }),
  ).rejects.toThrow(/Oynama Listesinde tutulur/);
});

test("Ayarlar shows the real version, keeps one size between sections and lists backups readably", async ({
  page,
  request,
}) => {
  await open(page, request);
  await call(request, "backup");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(modalTitle(page)).toHaveText("Ayarlar");
  await expect(page.locator('[role="dialog"]')).toContainText("Sürüm " + pkg.version);
  const dialog = page.locator('[role="dialog"]');
  const sizes: number[] = [];
  for (const section of [
    "Görünüm",
    "Web araştırması",
    "Kısayollar",
    "Veriler & yedekler",
  ]) {
    await page.locator(".settings-nav button", { hasText: section }).click();
    const box = await dialog.boundingBox();
    sizes.push(Math.round((box?.height || 0) + (box?.y || 0) * 1000));
  }
  expect(new Set(sizes).size).toBe(1);
  await expect(page.locator('input[type="file"]:visible')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "JSON yedek dosyası seç" }),
  ).toBeVisible();
  const backups = page.locator(".backup-row");
  await expect(backups.first()).toBeVisible();
  await expect(backups.first()).not.toContainText("library-");
  await expect(backups.first()).toContainText(/\d{4} \d{2}:\d{2}/);
});

test("AI summary Markdown, chat tables, long titles and Turkish numbers are shown properly", async ({
  page,
  request,
}) => {
  await open(page, request);
  await expect(
    page.getByText("Kayıtlı oynama", { exact: true }).locator(".."),
  ).toContainText("2.887,5");
  await row(page, "Stardew Valley").click();
  const summary = page.locator(".ai-summary");
  await expect(summary.locator("h2")).toHaveText("Neden oyna?");
  await expect(summary.locator("strong")).toHaveText("Atmosfer:");
  await expect(summary).not.toContainText("##");
  await expect(summary).not.toContainText("**");
  // Chat table: the short cell "Celeste" stays on one line next to a long cell.
  const cell = page.locator(".markdown td", { hasText: "Celeste" });
  const lines = await cell.evaluate((td) => {
    const lh = parseFloat(getComputedStyle(td).lineHeight) || 16;
    const range = document.createRange();
    range.selectNodeContents(td);
    return Math.round(range.getBoundingClientRect().height / lh);
  });
  expect(lines).toBe(1);
  // A very long game title must not run under the refresh / more buttons.
  await page.locator('[aria-label="Oyun ara"]').fill("Warhammer");
  await row(page, "Warhammer").click();
  const title = await page.locator(".detail h1, .center-pane h1").first().boundingBox();
  for (const label of ["Verileri yenile", "Oyun işlemleri"]) {
    const b = await page.getByRole("button", { name: label, exact: true }).boundingBox();
    if (!title || !b) throw new Error("missing " + label);
    const overlap =
      title.x < b.x + b.width &&
      b.x < title.x + title.width &&
      title.y < b.y + b.height &&
      b.y < title.y + title.height;
    expect(overlap, label).toBe(false);
  }
});

test("narrow window: the game counter stays on one line; light system theme keeps accent text readable", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  const many = seed();
  for (let i = many.games.length; i < 42; i++)
    many.games.push({ ...newGame("Oyun " + i, i), id: "g114-x" + i });
  await open(page, request, many);
  const badge = page
    .locator(
      ".library-heading h2 + span, .library-heading .count, .library-heading span.badge",
    )
    .first();
  const counter = await page.locator(".library-heading").evaluate((h) => {
    const el = [...h.querySelectorAll("*")].find(
      (e) => e.textContent?.trim() === "42" && e.children.length === 0,
    ) as HTMLElement;
    return el ? el.getBoundingClientRect().height : -1;
  });
  expect(counter).toBeGreaterThan(0);
  expect(counter).toBeLessThan(30);
  void badge;
  await page.emulateMedia({ colorScheme: "light" });
  await call(request, "settings", { patch: { theme: "system", accent: "#9da3af" } });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "İstatistikler", exact: true }),
  ).toBeVisible();
  const ratio = await page.locator(".group-chip.active").evaluate((chip) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m)
        return m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .slice(0, 3)
          .map(Number);
      const s = c.match(/color\(srgb ([^)]+)\)/);
      if (s)
        return s[1]
          .split(/\s+/)
          .slice(0, 3)
          .map((v) => Number(v) * 255);
      throw new Error("color " + c);
    };
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fg = lum(parse(getComputedStyle(chip).color));
    const bg = lum([255, 255, 255]);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
