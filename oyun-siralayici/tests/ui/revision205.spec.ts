import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";

// 2.0.5: requirements from PCGamingWiki when the store publishes none; the
// "belirtilmemiş" box says what PCGamingWiki answered.
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
test("Sistem: PCGamingWiki as the source; what it said when it had nothing", async ({
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
  const base = (name: string, i: number) => ({
    ...newGame(name, i),
    autoSeries: false,
    fetchStatus: "done" as const,
    catalogCheckedAt: at,
    hltb: { status: "not_found" as const, checkedAt: at },
  });
  s.games = [
    {
      ...base("Unreal: Gold", 0),
      origin: {
        store: "My Abandonware" as const,
        id: "unreal-gold-cq8",
        url: "https://www.myabandonware.com/game/unreal-gold-cq8",
      },
      year: 2000,
      minimum: {
        raw: "OS: Windows NT, 95, 98\nProcessor: Intel Pentium 166 MHz\nMemory: 16 MB\nGraphics: 2 MB VRAM\nStorage: 100 MB",
        os: "Windows NT, 95, 98",
        cpu: "Intel Pentium 166 MHz",
        ramGB: 16 / 1024,
        storageGB: 100 / 1024,
        gpu: "2 MB VRAM",
      },
      recommended: {
        raw: "Processor: Intel Pentium II 266 MHz\nMemory: 128 MB\nGraphics: 3dfx Voodoo 2\nStorage: 450 MB",
        cpu: "Intel Pentium II 266 MHz",
        ramGB: 128 / 1024,
        storageGB: 450 / 1024,
        gpu: "3dfx Voodoo 2",
      },
      requirementSource: {
        store: "PCGamingWiki",
        url: "https://www.pcgamingwiki.com/wiki/Unreal",
        checkedAt: at,
      },
      pcgw: {
        status: "found" as const,
        checkedAt: at,
        title: "Unreal",
        url: "https://www.pcgamingwiki.com/wiki/Unreal",
      },
    },
    {
      ...base("Prince of Persia", 1),
      origin: { store: "none" as const },
      year: 1990,
      pcgw: {
        status: "not_found" as const,
        checkedAt: at,
        message: "PCGamingWiki'de yalnızca DOS / Mac OS gereksinimi var; Windows için yok.",
      },
    },
  ] as any;
  await call(request, "import", { text: JSON.stringify(s) });
  await page.goto("/");
  const open = async (name: string) => {
    await page.locator(".game-row-text strong", { hasText: name }).click();
    await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  };
  await open("Unreal: Gold");
  const source = page.getByTestId("requirement-source");
  await expect(source).toContainText(
    "Gereksinimler: PCGamingWiki (Unreal) · mağaza yayımlamadığı için buradan alındı",
  );
  await expect(source.getByRole("button", { name: "PCGamingWiki sayfası" })).toBeVisible();
  await expect(page.getByTestId("requirements-table")).toContainText("Intel Pentium 166 MHz");
  await expect(page.getByTestId("requirements-table")).toContainText("3dfx Voodoo 2");
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.5-pcgamingwiki.png" });
  await open("Prince of Persia");
  const none = page.getByTestId("requirements-none");
  await expect(none).toContainText("Oyun platform seçilmeden eklendi; mağaza bilgisi yok.");
  await expect(none).toContainText(
    "PCGamingWiki'de yalnızca DOS / Mac OS gereksinimi var; Windows için yok.",
  );
  await page.screenshot({ path: ".cache/ui-artifacts/2.0.5-belirtilmemis.png" });
});
