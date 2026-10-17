import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";
// 2.1.1: chat area fixes. Narrow window: the chat is a drawer; the dimmed
// content catches the click and closes it, so covered controls are never
// half-clickable. Wide window: no scrim at all.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
async function open(request: APIRequestContext, page: any) {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    chatListWidth: 240,
  });
  state.chats = [
    {
      id: "c1",
      title: "Birinci sohbet",
      createdAt: "2026-10-16T10:00:00Z",
      messages: [],
      apiHistory: [],
      allowedTools: [],
    },
  ] as any;
  state.activeChatId = "c1";
  state.games = [{ ...newGame("Hades", 0), id: "g1" }] as any;
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  await page.locator(".game-row").first().click();
  await page.waitForTimeout(200);
}
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("narrow window: the drawer dims the content and a click on the dim closes it", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await open(request, page);
  await expect(page.locator(".chat-panel")).toBeVisible();
  const scrim = page.locator(".chat-scrim");
  await expect(scrim).toBeVisible();
  // A control under the drawer is out of reach: the click lands on the dim.
  const covered = page.getByRole("tab", { name: "Sistem", exact: true });
  await covered.click({ timeout: 1500 }).catch(() => {});
  await expect(covered).not.toHaveAttribute("aria-selected", "true");
  await scrim.click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".chat-panel")).toHaveCount(0);
  await expect(scrim).toHaveCount(0);
  // The title-bar toggle brings it back.
  await page.getByRole("button", { name: "AI sohbeti", exact: true }).click();
  await expect(page.locator(".chat-panel")).toBeVisible();
});
test("wide window: the chat is a column and there is no scrim", async ({ page, request }) => {
  await page.setViewportSize({ width: 1510, height: 960 });
  await open(request, page);
  await expect(page.locator(".chat-panel")).toBeVisible();
  await expect(page.locator(".chat-scrim")).toBeHidden();
  await page.getByRole("tab", { name: "Sistem", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Sistem", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
