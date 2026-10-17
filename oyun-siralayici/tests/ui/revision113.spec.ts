import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { initialState, newGame } from "../../shared/domain";

// 1.0.13: "Ne kadar sürer?" is back; times that 1.0.12 dropped come back from the
// pre-upgrade backup when a 1.0.12 library is loaded or restored.
const id = "times-ui-113";
const backup = path.resolve(
  process.env.PREVIEW_DATA || ".cache/preview-data",
  "backups",
  "library-2026-10-15T20-00-00-000Z-yukseltme-oncesi.json",
);
async function call(request: APIRequestContext, method: string, args: any = {}) {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}
test.afterEach(() => fs.rmSync(backup, { force: true }));

test("times dropped by 1.0.12 are restored from the backup and shown in Ne kadar sürer", async ({
  request,
  page,
}) => {
  const game = {
    ...newGame("Süre geri gelsin", 0),
    id,
    catalogCheckedAt: "2026-10-01T10:00:00.000Z",
  };
  const old: any = initialState();
  delete old.notes;
  delete old.migrations;
  old.settings.animations = false;
  old.games = [
    {
      ...game,
      turkish: { official: false, patch: "none", sources: [] },
      hltb: {
        status: "found",
        main: 23.5,
        mainExtra: 47,
        completionist: 95,
        url: "https://howlongtobeat.com/game/62941",
        via: "HowLongToBeat",
        checkedAt: "2026-10-01T10:00:00.000Z",
      },
    },
  ];
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, JSON.stringify(old));
  // What 1.0.12 saved: notes key, no times, no 1.0.13 marker.
  const stripped: any = initialState();
  delete stripped.migrations;
  stripped.settings.animations = false;
  stripped.settings.firstRun = false;
  stripped.notes = {};
  stripped.games = [game];
  await call(request, "import", { text: JSON.stringify(stripped) });
  const b = await call(request, "bootstrap");
  expect(b.state.games[0].hltb.main).toBe(23.5);
  await page.goto("/");
  await page.locator(".game-row-text strong").filter({ hasText: game.name }).click();
  const section = page.locator(".playtime-section");
  await expect(section).toContainText("Ne kadar sürer?");
  await expect(section.locator(".playtime-grid strong")).toHaveText([
    "23,5saat",
    "47saat",
    "95saat",
  ]);
  await expect(section.getByRole("button", { name: "HLTB oyun sayfası" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Süreleri yenile" })).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Oyun ayrıntıları" }).getByRole("tab"),
  ).toHaveText(["Genel bakış", "Mağazalar", "Sistem", "Not"]);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".cache/ui-artifacts/ne-kadar-surer.png" });
});
