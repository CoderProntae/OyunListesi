import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState } from "../../shared/domain";
// Aşama 6 (2.1.4): Ayarlar writes back only the fields touched in that window,
// the hardware profile is saved from any tab, and an out-of-range number
// answers in Turkish instead of Zod's JSON dump.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const state = (request: APIRequestContext) =>
  call(request, "bootstrap").then((b) => b.state);
async function open(
  request: APIRequestContext,
  page: any,
  settings: any = {},
  hardware: any = {},
) {
  const next = initialState();
  Object.assign(next.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    ...settings,
  });
  Object.assign(next.hardware, hardware);
  await call(request, "import", { text: JSON.stringify(next) });
  await page.goto("/");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
}
const tab = (page: any, name: string) =>
  page.getByRole("button", { name, exact: true }).click();
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("a setting that saved itself is not written back by 'Ayarları kaydet'", async ({
  page,
  request,
}) => {
  await open(request, page, { updateCheck: true });
  await tab(page, "Güncellemeler");
  await page.getByRole("checkbox", { name: /kendiliğinden denetle/ }).uncheck();
  await expect.poll(async () => (await state(request)).settings.updateCheck).toBe(false);
  // Another tab, then save: the window's opening copy must not undo the toggle.
  await tab(page, "Görünüm");
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  await expect.poll(async () => (await state(request)).settings.updateCheck).toBe(false);
});
test("hardware edited on its own tab is saved from another tab", async ({
  page,
  request,
}) => {
  await open(request, page, {}, { gpu: "NVIDIA GeForce GTX 1660 SUPER" });
  await tab(page, "Donanım");
  await page.getByLabel("Ekran kartı modeli").fill("NVIDIA GeForce RTX 3060");
  await tab(page, "LM Studio");
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  await expect
    .poll(async () => (await state(request)).hardware.gpu)
    .toBe("NVIDIA GeForce RTX 3060");
  expect((await state(request)).hardware.manual).toBe(true);
});
test("an out-of-range number answers in Turkish and saves nothing", async ({
  page,
  request,
}) => {
  await open(request, page, { maxTokens: 20000 });
  await tab(page, "LM Studio");
  await page.getByLabel(/Maksimum çıktı tokenı/).fill("50");
  await page.getByRole("button", { name: "Ayarları kaydet" }).click();
  const toast = page.locator(".toast.error").last();
  await expect(toast).toContainText("Geçersiz değer");
  await expect(toast).toContainText("Maksimum çıktı tokenı en az 128 olmalı");
  await expect(toast).not.toContainText("too_small");
  // The window stays open, so the value can be corrected.
  await expect(page.getByRole("button", { name: "Ayarları kaydet" })).toBeVisible();
  expect((await state(request)).settings.maxTokens).toBe(20000);
});
test("the overlay keeps its own live changes when the connection is tested", async ({
  page,
  request,
}) => {
  await open(request, page);
  // The overlay tab saves at once; here it changes while the window is open.
  await call(request, "overlaySettings", { patch: { hotkey: "Control+Shift+O" } });
  await tab(page, "LM Studio");
  await page.getByRole("button", { name: /Bağlantıyı test et/ }).click();
  await expect(page.locator(".connection-result")).toBeVisible({ timeout: 25000 });
  expect((await state(request)).settings.overlay.hotkey).toBe("Control+Shift+O");
});
