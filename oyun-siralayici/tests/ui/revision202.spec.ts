import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState } from "../../shared/domain";

// 2.0.2: two chats one under the other, both in the simple look; the list
// opens a chat in the pane that has the focus; the divider changes heights.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const msg = (id: string, role: string, text: string) => ({
  id,
  role,
  createdAt: "2026-10-16T10:00:00Z",
  blocks: [{ id: id + "b", type: "text", text }],
});
const chat = (id: string, title: string, text: string) => ({
  id,
  title,
  createdAt: "2026-10-16T10:00:00Z",
  apiHistory: [],
  allowedTools: [],
  messages: [
    msg(id + "1", "user", "Soru: " + text),
    msg(id + "2", "assistant", "Cevap: " + text),
  ],
});
const split = async (request: APIRequestContext) =>
  (await call(request, "bootstrap")).state.settings.chatSplit;
test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});
test("two chats one under the other, simple look, focus-aware list, divider", async ({
  page,
  request,
}) => {
  const state = initialState();
  Object.assign(state.settings, {
    animations: false,
    firstRun: false,
    autoResearch: false,
    chatListWidth: 240,
  });
  state.chats = [
    chat("a", "Birinci", "elma"),
    chat("b", "İkinci", "armut"),
    chat("c", "Üçüncü", "kiraz"),
  ] as any;
  state.activeChatId = "c";
  await call(request, "import", { text: JSON.stringify(state) });
  await page.goto("/");
  // One chat: the full look with role labels and the model row.
  await expect(page.locator(".chat-pane")).toHaveCount(1);
  await expect(page.locator(".chat-pane .message-label").first()).toBeVisible();
  await expect(page.locator(".chat-model")).toBeVisible();
  await page.getByRole("button", { name: "İki sohbeti alt alta aç" }).click();
  await expect(page.locator(".chat-pane")).toHaveCount(2);
  await expect.poll(async () => (await split(request)).chatId).toBe("b");
  const top = page.locator(".chat-pane.top"),
    bottom = page.locator(".chat-pane.bottom");
  await expect(top).toContainText("kiraz");
  await expect(bottom).toContainText("armut");
  // Simple look in both panes.
  await expect(page.locator(".chat-pane .message-label").first()).toBeHidden();
  await expect(page.locator(".chat-model")).toHaveCount(0);
  await expect(top.locator(".pane-head")).toContainText("Üçüncü");
  await expect(bottom.locator(".pane-head")).toContainText("İkinci");
  await expect(page.locator(".cs-slot")).toHaveText(["Üst", "Alt"]);
  // The lower pane has the focus: a click in the list opens the chat there.
  await expect(bottom).toHaveClass(/focused/);
  await page.locator(".chat-sidebar").getByText("Birinci").click();
  await expect.poll(async () => (await split(request)).chatId).toBe("a");
  await expect(bottom).toContainText("elma");
  // Picking the chat shown in the other pane swaps the two.
  await page.locator(".chat-sidebar").getByText("Üçüncü").click();
  await expect
    .poll(async () => {
      const b = await call(request, "bootstrap");
      return [b.state.activeChatId, b.state.settings.chatSplit.chatId];
    })
    .toEqual(["a", "c"]);
  // Each pane has its own composer.
  await expect(page.getByLabel("Ajana mesaj")).toBeVisible();
  await page.getByLabel("Alttaki sohbete mesaj").fill("alt taslak");
  await expect(page.getByLabel("Ajana mesaj")).toHaveValue("");
  // Divider: drag to change the heights; the ratio is saved.
  const handle = page.getByRole("separator", { name: /yüksekliği/ });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await split(request)).ratio).toBeLessThan(0.45);
  const [hTop, hBottom] = await Promise.all([top.boundingBox(), bottom.boundingBox()]);
  expect(hTop!.height).toBeLessThan(hBottom!.height);
  // Closing the lower pane goes back to one chat with the full look.
  await bottom.getByRole("button", { name: "Alttaki sohbeti kapat" }).click();
  await expect(page.locator(".chat-pane")).toHaveCount(1);
  await expect.poll(async () => (await split(request)).chatId).toBeNull();
  await expect(page.locator(".chat-pane .message-label").first()).toBeVisible();
  // The list's menu can open a chat below.
  await page.locator(".chat-sidebar").getByText("İkinci").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Altta aç (iki sohbet)" }).click();
  await expect.poll(async () => (await split(request)).chatId).toBe("b");
  await expect(page.locator(".chat-pane")).toHaveCount(2);
});
