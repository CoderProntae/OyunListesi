import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";
// 2.1.3: "Durdur" on the game page stops only that game; the button in
// Statistics still stops the whole queue.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const statuses = async (request: APIRequestContext) =>
  Object.fromEntries(
    ((await call(request, "bootstrap")).state.games as any[]).map((g) => [
      g.id,
      g.research?.status,
    ]),
  );
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("stopping one game leaves the rest of the queue running", async ({
  page,
  request,
}) => {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: true,
    firstRun: false,
    lmModel: "",
  });
  state.games = ["stop-a", "stop-b"].map((id, i) => ({
    ...newGame(id === "stop-a" ? "Duracak oyun" : "Sıradaki oyun", i),
    id,
    // Only the summary stage applies (no requirements), so the bar is visible.
    research: { status: "queued" as const, message: "Sırada." },
  })) as any;
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await page.locator(".game-row").first().click();
  const bar = page.getByTestId("research-bar");
  // No model is selected: both games wait in the queue. Waiting is still
  // "in the queue", so the page offers Durdur and not another Araştır (2.1.3).
  await expect(bar).toContainText("AI araştırması bekliyor");
  await expect(bar.getByRole("button", { name: "Araştır", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Durdur", exact: true }).click();
  await expect.poll(() => statuses(request)).toMatchObject({ "stop-a": "cancelled" });
  await expect(bar).toContainText("AI araştırması durduruldu");
  await expect(bar.getByRole("button", { name: "Araştırmaya devam et" })).toBeVisible();
  // The other game was not touched.
  expect(await statuses(request)).toMatchObject({ "stop-b": "waiting_model" });
  // Statistics stops everything that is still waiting.
  await page.getByRole("button", { name: "İstatistikler" }).click();
  await page.getByRole("button", { name: "Araştırmayı durdur" }).click();
  await expect.poll(() => statuses(request)).toMatchObject({ "stop-b": "cancelled" });
});
