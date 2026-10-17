import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";

// 2.0.4: own series from one game (right click), from the list header and
// from the series header; Metacritic "puan yok".
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const state = async (request: APIRequestContext) =>
  (await call(request, "bootstrap")).state;
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("own series: right click, list header, series header; Metacritic 'puan yok'", async ({
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
  s.games = ["Unreal: Gold", "Unreal II: The Awakening", "Doom", "Portal"].map(
    (n, i) => ({
      ...newGame(n, i),
      autoSeries: false,
      fetchStatus: "done" as const,
      catalogCheckedAt: at,
      // Times already looked up: no background lookup during the test.
      hltb: { status: "not_found" as const, checkedAt: at },
    }),
  );
  s.games[0].metacriticNoScore = {
    url: "https://www.metacritic.com/game/unreal-gold/",
    title: "Unreal Gold",
    checkedAt: at,
  };
  await call(request, "import", { text: JSON.stringify(s) });
  await page.goto("/");
  const row = (name: string) => page.locator(".game-row", { hasText: name });
  // One game, right click → the series window with that game ticked.
  await row("Unreal: Gold").click({ button: "right" });
  await page.getByRole("button", { name: "Seri oluştur / seriye ekle" }).click();
  // The window that is closing may still be animating out: pick the series one.
  const dialog = page.locator(".modal", { has: page.locator(".series-picker") });
  await expect(dialog).toContainText("Seri oluştur");
  await expect(dialog.getByLabel("Seri adı")).toHaveValue("Unreal");
  await expect(dialog.locator(".series-picker-head b")).toHaveText("1");
  const create = dialog.getByRole("button", { name: "Seriyi oluştur" });
  await expect(create).toBeDisabled();
  // The list can be searched; tick the second game.
  await dialog.getByLabel("Seriye eklenecek oyunu ara").fill("awak");
  await expect(dialog.locator("label.series-pick")).toHaveCount(1);
  await dialog.locator("label.series-pick", { hasText: "Unreal II" }).click();
  await dialog.getByLabel("Seriye eklenecek oyunu ara").fill("");
  await expect(dialog.locator(".series-picker-head b")).toHaveText("2");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.4-seri-olustur.png" });
  await create.click();
  await expect(dialog).toHaveCount(0);
  let st = await state(request);
  const unreal = st.series.find((x: any) => x.name === "Unreal");
  expect(unreal?.automatic).toBe(false);
  expect(
    st.games.filter((g: any) => g.seriesId === unreal.id).map((g: any) => g.name),
  ).toEqual(["Unreal: Gold", "Unreal II: The Awakening"]);
  await expect(page.locator(".series-row")).toHaveCount(1);
  await expect(page.locator(".series-row")).toContainText("Unreal");
  // List header "Yeni seri" → add Doom to the existing series.
  await page.getByRole("button", { name: "Yeni seri" }).click();
  await expect(dialog.getByLabel("Nereye?")).toBeVisible();
  await dialog.getByLabel("Nereye?").selectOption({ label: "Unreal serisine ekle" });
  await expect(dialog.locator(".series-picker-head b")).toHaveText("2");
  await dialog.locator("label.series-pick", { hasText: "Doom" }).click();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toHaveCount(0);
  st = await state(request);
  expect(st.games.filter((g: any) => g.seriesId === unreal.id)).toHaveLength(3);
  // Series header ⋯ → take Doom out, rename.
  await page.getByRole("button", { name: "Seriyi düzenle" }).click();
  await expect(dialog).toContainText("Seriyi düzenle");
  await dialog.locator("label.series-pick", { hasText: "Doom" }).click();
  await dialog.getByLabel("Seri adı").fill("Unreal serisi");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toHaveCount(0);
  st = await state(request);
  expect(st.series.find((x: any) => x.id === unreal.id)?.name).toBe("Unreal serisi");
  expect(st.games.filter((g: any) => g.seriesId === unreal.id)).toHaveLength(2);
  expect(st.games.find((g: any) => g.name === "Doom").seriesId).toBeUndefined();
  // Metacritic lists Unreal Gold without a critic score.
  await row("Unreal: Gold").click();
  const score = page.locator("button.no-score");
  await expect(score).toHaveText("puan yok");
  await expect(score).toHaveAttribute("title", /eleştirmen puanı yok/);
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.4-puan-yok.png" });
});
