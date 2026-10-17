import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";

// 2.1.0: CPU/GPU rows are compared with the hardware data (PassMark +
// TechPowerUp): ✓ / ✕ / ≈ in the table, the explanations under it, and no AI
// hardware stage (and so no "Donanım kontrolü" question) when nothing is left.
const id = "hardware-210";
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("the requirements table compares with the hardware data and explains it", async ({
  request,
  page,
}) => {
  const state = initialState();
  Object.assign(state.settings, {
    autoResearch: false,
    autoSummary: true,
    firstRun: false,
    animations: false,
    lmModel: "",
  });
  Object.assign(state.hardware, {
    os: "Microsoft Windows 10 Pro",
    osVersion: "10.0.19045",
    architecture: "x64",
    cpu: "Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz",
    cores: 4,
    threads: 4,
    clockGHz: 3.2,
    gpu: "NVIDIA GeForce GTX 1660 SUPER",
    ramGB: 8,
    vramGB: 6,
    vramCertain: true,
    directX: 12.1,
    diskFreeGB: 100,
  });
  const at = "2026-10-16T10:00:00Z";
  state.games = [
    {
      ...newGame("Donanım testi", 0),
      id,
      year: 2014,
      fetchStatus: "done" as const,
      catalogCheckedAt: at,
      hltb: { status: "not_found" as const, checkedAt: at },
      minimum: {
        raw: "fixture",
        cpu: "Intel Core i5-3570K",
        gpu: "64MB DirectX 9 compatible AGP graphics card with hardware T&amp;L support",
        ramGB: 1,
      },
      recommended: {
        raw: "fixture",
        cpu: "Intel Core i7-8700K",
        gpu: "NVIDIA GeForce GTX 760",
      },
    },
  ];
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await page
    .locator(".game-row-text strong")
    .filter({ hasText: "Donanım testi" })
    .click();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  const row = (name: string) =>
    page
      .locator(".comparison-table tbody tr")
      .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
      .locator(".requirement-value");
  await expect(row("CPU").nth(0)).toHaveClass(/near/);
  await expect(row("CPU").nth(0)).toContainText("≈");
  await expect(row("CPU").nth(1)).toHaveClass(/fail/);
  await expect(row("GPU").nth(0)).toHaveClass(/pass/);
  await expect(row("GPU").nth(1)).toHaveClass(/pass/);
  const notes = page.getByTestId("requirement-notes");
  await expect(notes).toContainText("Minimum · CPU · yaklaşık eşit");
  await expect(notes).toContainText("64 MB bellek ve DirectX 9 istiyor");
  await expect(notes).toContainText("AGP yuvası ve donanımsal T&L");
  await expect(notes).toContainText(
    /GeForce GTX 760 kartından yaklaşık [\d,]+ kat güçlü/,
  );
  await expect(notes).toContainText(/Intel Core i7-8700K işlemcisinden zayıf/);
  await expect(page.getByTestId("requirement-data")).toContainText("PassMark");
  // Nothing is left for the AI's hardware stage: only the summary is missing
  // and starting the research asks nothing.
  const bar = page.getByTestId("research-bar");
  await expect(bar).toContainText("Eksik: oyun özeti");
  await expect(bar).not.toContainText("karşılaştırması");
  // The store's "T&amp;L" is shown as text.
  await expect(row("GPU").nth(0)).toContainText("hardware T&L support");
  await page.getByTestId("requirement-data").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".cache/ui-artifacts/donanim-2.1.0.png" });
  await bar.getByRole("button", { name: "Araştır", exact: true }).click();
  await expect
    .poll(async () => (await call(request, "bootstrap")).state.games[0].research?.status)
    .toBe("waiting_model");
  await expect(page.getByRole("button", { name: /^AI'ya bırak/ })).toHaveCount(0);
});
