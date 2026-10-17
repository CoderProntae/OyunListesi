import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";
// 2.1.2: games without any published requirement offer three verdicts on the
// System tab; the choice is saved on the game.
// 2.1.3: the saved mark drives the same status dot as a computed comparison —
// in the summary block, the overview chip and the library row.
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
test("no requirements: three verdicts, saved on the game", async ({ page, request }) => {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
  });
  const g = newGame("Bendy and the Ink Machine", 1) as any;
  delete g.minimum;
  delete g.recommended;
  g.origin = { store: "none" };
  state.games = [g];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await page.locator(".game-row").first().click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(page.getByTestId("requirements-none")).toBeVisible();
  const verdict = page.getByTestId("req-verdict");
  await expect(verdict).toBeVisible();
  const rowDot = page.locator(".game-row.current .compat-dot");
  // No mark yet: a question, and no summary block claiming a result.
  await expect(rowDot).toHaveClass(/unknown/);
  await expect(page.getByTestId("compat-summary")).toHaveCount(0);
  await page.getByTestId("verdict-meets").click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].reqVerdict)
    .toBe("meets");
  // The green tick appears in the summary block and in the library row.
  await expect(page.getByTestId("compat-summary")).toContainText(
    "Karşılıyor (senin kararın)",
  );
  await expect(page.locator(".compat-summary .compat-dot")).toHaveClass(/recommended/);
  await expect(rowDot).toHaveClass(/recommended/);
  // The page header (overview tab) shows the verdict too.
  await page.getByRole("tab", { name: "Genel bakış" }).click();
  await expect(page.locator(".info-grid strong")).toContainText(
    "Karşılıyor (senin kararın)",
  );
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await page.getByTestId("verdict-fails").click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].reqVerdict)
    .toBe("fails");
  await expect(rowDot).toHaveClass(/unsupported/);
  await page.getByTestId("verdict-unknown").click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].reqVerdict)
    .toBe("unknown");
  await expect(rowDot).toHaveClass(/unknown/);
  await expect(page.getByTestId("compat-summary")).toContainText(
    "Bilinmiyor (senin kararın)",
  );
});
