import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";

// 2.0.6: a series split by a game in between ("ara oyun") keeps the order:
// each part has a header (the later one "devam"), collapsing folds both,
// and "Oyunları yan yana topla" gathers only on request.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("split series: parts in place, one collapse, gather on request", async ({
  page,
  request,
}) => {
  const s = initialState();
  Object.assign(s.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
  });
  const at = "2026-10-16T10:00:00Z";
  s.series = [{ id: "seri", name: "Seri", automatic: false }];
  s.games = ["Seri 1", "Seri 2", "ARA OYUN", "Seri 3"].map((n, i) => ({
    ...newGame(n, i),
    autoSeries: false,
    seriesId: n === "ARA OYUN" ? undefined : "seri",
    fetchStatus: "done" as const,
    catalogCheckedAt: at,
    hltb: { status: "not_found" as const, checkedAt: at },
  }));
  await call(request, "import", { text: JSON.stringify(s) });
  await page.goto("/");
  const rows = page.locator(".series-row, .game-row");
  const heads = page.locator(".series-row");
  await expect(heads).toHaveCount(2);
  await expect(heads.nth(0)).toContainText("Seri");
  await expect(heads.nth(0).locator("small")).toHaveText("2/3");
  await expect(heads.nth(1)).toContainText("Seri (devam)");
  await expect(heads.nth(1).locator("small")).toHaveText("1/3");
  const order = ["Seri", "Seri 1", "Seri 2", "ARA OYUN", "Seri (devam)", "Seri 3"];
  await expect(rows).toHaveCount(order.length);
  for (const [i, text] of order.entries()) await expect(rows.nth(i)).toContainText(text);
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.6-seri-bolumleri.png" });
  // One header folds every part; the game in between stays visible.
  await heads.nth(0).locator(".series-toggle").click();
  await expect(page.locator(".game-row")).toHaveCount(1);
  await expect(page.locator(".game-row")).toContainText("ARA OYUN");
  await heads.nth(1).locator(".series-toggle").click();
  await expect(page.locator(".game-row")).toHaveCount(4);
  // Gathering is a choice in the series window (⋯).
  await heads.nth(1).getByRole("button", { name: "Seriyi düzenle" }).click();
  const dialog = page.locator(".modal", { has: page.locator(".series-picker") });
  await dialog.getByRole("button", { name: "Oyunları yan yana topla" }).click();
  await expect(heads).toHaveCount(1);
  await expect(heads.nth(0).locator("small")).toHaveText("3");
  const after = ["Seri", "Seri 1", "Seri 2", "Seri 3", "ARA OYUN"];
  for (const [i, text] of after.entries()) await expect(rows.nth(i)).toContainText(text);
  // Not split any more: the window does not offer it.
  await heads.nth(0).getByRole("button", { name: "Seriyi düzenle" }).click();
  await expect(dialog.getByRole("button", { name: "Oyunları yan yana topla" })).toHaveCount(0);
});
