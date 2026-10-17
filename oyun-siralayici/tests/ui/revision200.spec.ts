import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState } from "../../shared/domain";
import { APP_VERSION } from "../../shared/version";

// 2.0: chat list with resize line, rename, Shift+delete, groups and the
// research group; "Yenilikler" after an upgrade; Ayarlar → Oyun katmanı.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const chat = (id: string, title: string, extra: any = {}) => ({
  id,
  title,
  createdAt: "2026-10-16T10:00:00Z",
  messages: [],
  apiHistory: [],
  allowedTools: [],
  ...extra,
});
async function open(request: APIRequestContext, page: any, settings: any = {}) {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    chatListWidth: 240,
    ...settings,
  });
  state.chats = [
    chat("c1", "Birinci sohbet"),
    chat("c2", "İkinci sohbet"),
    chat("r1", "Araştırma · Max Payne", { automatic: true }),
  ] as any;
  state.activeChatId = "c1";
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
}
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("chat list: research group, rename, Shift+delete, groups and the resize line", async ({ page, request }) => {
  await open(request, page);
  const list = page.locator(".chat-sidebar");
  await expect(list.getByRole("listbox", { name: "Araştırmalar" })).toContainText("Araştırma · Max Payne");
  // Rename by double-click.
  await list.getByText("Birinci sohbet").dblclick();
  const input = list.getByLabel("Sohbet adı");
  await input.fill("Yeni adlı sohbet");
  await input.press("Enter");
  await expect.poll(async () => (await call(request, "bootstrap")).state.chats.find((c: any) => c.id === "c1").title).toBe("Yeni adlı sohbet");
  // A group, then move a chat into it from the context menu.
  await list.getByRole("button", { name: "Yeni sohbet grubu" }).click();
  await expect(list.getByText("Yeni grup")).toBeVisible();
  await list.getByText("İkinci sohbet").click({ button: "right" });
  await page.locator(".cs-menu").getByRole("menuitem", { name: /Yeni grup/ }).click();
  await expect(list.getByRole("listbox", { name: "Yeni grup" })).toContainText("İkinci sohbet");
  // Delete asks; Shift+click on the bin deletes at once.
  const row = list.locator(".cs-chat", { hasText: "Yeni adlı sohbet" });
  await row.hover();
  await row.getByRole("button", { name: "Sohbeti sil" }).click();
  await expect(page.getByText("Sohbet silinsin mi?")).toBeVisible();
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await row.hover();
  await row.getByRole("button", { name: "Sohbeti sil" }).click({ modifiers: ["Shift"] });
  await expect(page.getByText("Sohbet silinsin mi?")).toHaveCount(0);
  await expect.poll(async () => (await call(request, "bootstrap")).state.chats.some((c: any) => c.id === "c1")).toBe(false);
  // The long line: a click hides the list, dragging opens it again.
  const line = page.getByRole("separator", { name: /Sohbet listesi/ });
  await line.click();
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.chatListWidth).toBe(0);
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.chatListWidth).toBeGreaterThan(150);
  await expect(list.getByText("Sohbetler").first()).toBeVisible();
});
test("after an upgrade 'Yenilikler' opens once with the before/after comparison", async ({ page, request }) => {
  await open(request, page, { lastSeenVersion: "1.0.17" });
  const dialog = page.getByRole("dialog", { name: /Yenilikler/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Eski / yeni karşılaştırma" })).toBeVisible();
  await dialog.getByRole("button", { name: "Sistem gereksinimleri" }).click();
  await expect(dialog.getByAltText("Sistem gereksinimleri — 2.0")).toBeVisible();
  await dialog.getByRole("button", { name: "Başlayalım" }).click();
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.lastSeenVersion).toBe(APP_VERSION);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog", { name: /Yenilikler/ })).toHaveCount(0);
});
test("Ayarlar → Oyun katmanı saves at once and keeps the other settings", async ({ page, request }) => {
  await open(request, page);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "Oyun katmanı", exact: true }).click();
  await page.getByRole("tab", { name: "Süre ve alarm" }).click();
  await page.getByRole("button", { name: "60 dk" }).click();
  await page.getByRole("button", { name: "+ Alarm ekle" }).click();
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.overlay.sessionLimit).toBe(60);
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.overlay.alarms.length).toBe(1);
  // 2.1.1: the app-wide column labels must not stack these rows; the radio
  // sits left of its text and the color swatch left of its name.
  await page.getByRole("tab", { name: "FPS sınırı" }).click();
  expect(await page.locator(".oe-choice").first().evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");
  await page.getByRole("tab", { name: "Görünüm" }).click();
  expect(await page.locator(".oe-colors label").first().evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");
  await page.getByRole("button", { name: "+ Yeni görünüm" }).click();
  await expect.poll(async () => (await call(request, "bootstrap")).state.settings.overlay.presets.length).toBe(4);
  await expect(page.getByTestId("overlay-hud")).toBeVisible();
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  const s = (await call(request, "bootstrap")).state.settings;
  expect(s.overlay.sessionLimit).toBe(60);
  expect(s.overlay.presets).toHaveLength(4);
});
