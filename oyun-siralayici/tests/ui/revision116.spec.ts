import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";

// 1.0.16: Oyun ekle asks for the platform first; the Sistem table shows only
// what the store publishes; platform names are spelled properly.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 15.97,
  directX: 12.1,
};
async function open(request: APIRequestContext, page: any, games: any[] = []) {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
  });
  state.hardware = hardware;
  state.games = games;
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
}
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("Oyun ekle: platform first, 'Platform yok' last; a game without a platform has no requirements", async ({
  request,
  page,
}) => {
  await open(request, page);
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab")).toHaveText([
    "Steam",
    "GOG",
    "Epic Games",
    "Xbox",
    "My Abandonware",
    "Platform yok",
  ]);
  await expect(dialog.getByRole("tab", { name: "Steam", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("tab", { name: "GOG", exact: true }).click();
  await expect(dialog.getByLabel("Oyun adı", { exact: true })).toHaveAttribute(
    "placeholder",
    "GOG’de ara…",
  );
  await page.screenshot({ path: ".cache/ui-artifacts/1.0.16-oyun-ekle.png" });
  // A store tab adds only a game picked from that store's list.
  await dialog.getByLabel("Oyun adı", { exact: true }).fill("Ev yapımı oyunum");
  await expect(dialog.getByRole("button", { name: "Kütüphaneye ekle" })).toBeDisabled();
  await dialog.getByRole("tab", { name: "Platform yok", exact: true }).click();
  await expect(dialog).toContainText("sistem gereksinimleri “belirtilmemiş” görünür");
  await dialog.getByLabel("Oyun adı", { exact: true }).fill("Ev yapımı oyunum");
  await dialog.getByRole("button", { name: "Kütüphaneye ekle" }).click();
  await expect(dialog).toHaveCount(0);
  const b = await call(request, "bootstrap");
  const g = b.state.games.find((x: any) => x.name === "Ev yapımı oyunum");
  expect(g.origin).toEqual({ store: "none" });
  await page.locator(".game-row-text strong", { hasText: "Ev yapımı oyunum" }).click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(page.getByTestId("requirements-none")).toContainText(
    "Oyun platform seçilmeden eklendi",
  );
  await page.screenshot({ path: ".cache/ui-artifacts/1.0.16-platform-yok.png" });
});
test("Sistem: no recommended column, no row the store does not list, MB as written, source shown", async ({
  request,
  page,
}) => {
  const g = newGame("Kane & Lynch 2: Dog Days", 0, 28000);
  Object.assign(g, {
    origin: { store: "Steam", id: "28000" },
    platforms: ["windows"],
    minimum: {
      raw: "OS *: Windows XP/Vista/7",
      os: "Windows XP/Vista/7",
      cpu: "Intel 3.0 GHz or AMD 2.5 GHz or higher",
      gpu: "Nvidia 7800 / ATI X1800 or better (Shader Model 3.0, 512 MB Video Memory)",
      ramGB: 2,
      vramGB: 0.5,
      directX: 9,
    },
    recommended: { raw: "" },
    requirementSource: {
      store: "Steam",
      url: "https://store.steampowered.com/app/28000/",
      checkedAt: "2026-10-16T09:00:00.000Z",
    },
    fetchStatus: "done",
  });
  const h = newGame("Kane and Lynch: Dead Men", 1, 8080);
  Object.assign(h, {
    platforms: ["windows", "mac", "linux"],
    minimum: { raw: "x", cpu: "Intel Pentium 4 2Ghz", ramGB: 1, storageGB: 7 },
    recommended: { raw: "y", cpu: "Intel Pentium 4 2.5Ghz" },
    fetchStatus: "done",
  });
  await open(request, page, [g, h]);
  await page.locator(".game-row-text strong", { hasText: "Dog Days" }).click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  const table = page.getByTestId("requirements-table");
  await expect(table.getByRole("columnheader")).toHaveText([
    "Bileşen",
    "Bilgisayarın",
    "Minimum",
  ]);
  await expect(table.getByRole("rowheader")).toHaveText([
    "CPU",
    "GPU",
    "RAM",
    "VRAM",
    "DirectX özellik düzeyi",
    "İşletim sistemi",
  ]);
  await expect(table).not.toContainText("Belirtilmemiş");
  const vram = table
    .locator("tr")
    .filter({ has: page.getByRole("rowheader", { name: "VRAM", exact: true }) });
  await expect(vram.locator("td").nth(1)).toContainText("512 MB");
  await expect(page.locator(".requirement-source")).toContainText("Gereksinimler: Steam");
  await page.screenshot({ path: ".cache/ui-artifacts/1.0.16-sistem-tablosu.png" });
  // The other game: a recommended level with only a CPU keeps its column; the
  // empty cells are dashes.
  await page.locator(".game-row-text strong", { hasText: "Dead Men" }).click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(
    page.getByTestId("requirements-table").getByRole("columnheader"),
  ).toHaveText(["Bileşen", "Bilgisayarın", "Minimum", "Önerilen"]);
  const disk = page
    .getByTestId("requirements-table")
    .locator("tr")
    .filter({ has: page.getByRole("rowheader", { name: "Disk", exact: true }) });
  await expect(disk.locator("td").nth(2)).toHaveText("—");
  await page.getByRole("tab", { name: "Genel bakış", exact: true }).click();
  await expect(page.locator(".metadata-grid")).toContainText("Windows / macOS / Linux");
  await expect(page.locator(".metadata-grid")).not.toContainText("windows");
});
