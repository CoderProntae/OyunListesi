import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { pageSection, pageArgs } from "../electron/pages";
import { readableHTML } from "../electron/network";
import { chatSchema, settingsSchema } from "../electron/validation";
import { parseJSONToolReply } from "../electron/tools";
const text = "0123456789".repeat(2600) + "END OF REAL DOCUMENT";
const page = {
  url: "https://example.org/game",
  title: "Source",
  text,
  retrievedAt: "2026-10-15T00:00:00Z",
};
let service: Service, root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/pages-"));
  service = new Service(root);
  service.store.settings({ lmModel: "test" });
});
afterEach(() => {
  service.close();
  service.store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const idle = () => vi.waitFor(() => expect(service.agent.busy.size).toBe(0));
describe("1.0.2: complete pages, unconstrained orchestration and isolated chats", () => {
  it("reads all page sections past 16,000 characters without gaps or nested previews", () => {
    let offset = 0,
      out = "";
    for (;;) {
      const part = pageSection(page, { url: page.url, offset, length: 8000 });
      expect(part).not.toHaveProperty("preview");
      expect(part).not.toHaveProperty("truncated");
      out += part.text;
      if (!part.hasMore) break;
      expect(part.nextOffset).toBeGreaterThan(offset);
      offset = part.nextOffset!;
    }
    expect(out).toBe(text);
    expect(out).toContain("END OF REAL DOCUMENT");
  });
  it("supports exact end offsets, empty tails and keyword lookup", () => {
    expect(pageSection(page, { url: page.url, offset: text.length }).hasMore).toBe(false);
    const found = pageSection(page, { url: page.url, find: "end of real" });
    expect(found.found).toBe(true);
    expect(found.text).toBe("END OF REAL DOCUMENT");
    expect(pageSection(page, { url: page.url, find: "MISSING" }).found).toBe(false);
  });
  it("readable parser can retain full safe text without its old 16k clip", () => {
    const parsed = readableHTML(
      "<html><body>" + text + "<script>unsafeScript()</script></body></html>",
      Infinity,
    );
    expect(parsed.text).toBe(text);
  });
  it("page options retain resource and protocol validation", () => {
    for (const arg of [{ offset: -1 }, { length: 0 }, { length: 100001 }, { find: "" }])
      expect(() => pageArgs.parse({ url: page.url, ...arg })).toThrow();
  });
  it("continuation reads a cached page, refresh refetches, and another chat has no cache authority", async () => {
    const fetch = vi
      .spyOn(service.providers, "page")
      .mockResolvedValue({ ...page, notice: "source data" });
    const a = service.store.createChat(),
      b = service.store.createChat();
    const invoke = (chat: any, args: any) =>
      (service.agent as any).invoke(
        chat,
        "fetch_page",
        { url: page.url, ...args },
        new AbortController().signal,
      );
    const first = await invoke(a, {}),
      second = await invoke(a, { offset: first.nextOffset });
    expect(second.text).toBe(text.slice(8000, 16000));
    expect(fetch).toHaveBeenCalledTimes(1);
    await invoke(a, { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    await invoke(b, {});
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("executes 30 successive tool rounds and receives the final answer instead of stopping at ten", async () => {
    const chat = service.store.createChat();
    let n = 0;
    const mock = vi.spyOn(service.lm, "stream").mockImplementation(async () => {
      n++;
      return n <= 30
        ? {
            text: "",
            thinking: "",
            calls: [{ id: "r" + n, name: "list_games", arguments: "{}" }],
          }
        : { text: "Finished after 30.", thinking: "", calls: [] };
    });
    await service.agent.send(chat.id, "Read 30 times");
    await idle();
    expect(mock).toHaveBeenCalledTimes(31);
    expect(chat.apiHistory.filter((m) => m.role === "tool")).toHaveLength(30);
    expect(chat.messages.at(-1)?.error).not.toBe(true);
    expect(() => chatSchema.parse(chat)).not.toThrow();
  });
  it("accepts and persists more than eight native tool calls in one response", async () => {
    const chat = service.store.createChat();
    let n = 0;
    const calls = Array.from({ length: 16 }, (_, i) => ({
      id: "batch" + i,
      name: "list_games",
      arguments: "{}",
    }));
    vi.spyOn(service.lm, "stream").mockImplementation(async () =>
      n++ ? { text: "done", thinking: "", calls: [] } : { text: "", thinking: "", calls },
    );
    await service.agent.send(chat.id, "Batch");
    await idle();
    expect(chat.apiHistory.filter((m) => m.role === "tool")).toHaveLength(16);
    expect(() => chatSchema.parse(chat)).not.toThrow();
  });
  it("structured JSON mode also accepts more than eight calls without bypassing schemas", () => {
    const reply = {
      message: "",
      tool_calls: Array.from({ length: 16 }, () => ({
        name: "list_games",
        arguments: {},
      })),
    };
    expect(parseJSONToolReply(JSON.stringify(reply)).tool_calls).toHaveLength(16);
  });
  it("remains cancellable even if a model endlessly requests read tools", async () => {
    const chat = service.store.createChat();
    let n = 0;
    vi.spyOn(service.lm, "stream").mockImplementation(async () => {
      if (++n === 23) setImmediate(() => service.agent.cancel(chat.id));
      return {
        text: "",
        thinking: "",
        calls: [{ id: "loop" + n, name: "list_games", arguments: "{}" }],
      };
    });
    await service.agent.send(chat.id, "Loop");
    await idle();
    expect(n).toBeGreaterThanOrEqual(23);
    expect(n).toBeLessThan(30);
    expect(chat.messages.at(-1)?.error).not.toBe(true);
  });
  it("20,000 output tokens do not reserve 20,000 input tokens or squeeze tool text into a preview", () => {
    service.store.settings({ maxTokens: 20000, contextTokens: 32768 });
    const chat = service.store.createChat();
    chat.apiHistory = [
      { role: "user", content: "Read this" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "full",
            type: "function",
            function: { name: "fetch_page", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "full", content: JSON.stringify(page) },
    ];
    const packed = (service.agent as any).context(chat, false);
    expect(packed.messages.at(-1).content).toBe(JSON.stringify(page));
    expect(packed.outputTokens).toBe(20000);
    expect(service.store.state.settings.maxTokens).toBe(20000);
  });
  it("does not guess 16k context or apply a 65k character history cap when loaded size is unknown", () => {
    service.store.settings({ maxTokens: 20000 });
    const chat = service.store.createChat();
    chat.apiHistory = [
      { role: "user", content: "Read" },
      { role: "assistant", content: "data ".repeat(20000) },
    ];
    const packed = (service.agent as any).context(chat, false);
    expect(packed.messages.at(-1).content.length).toBe(100000);
    expect(packed.outputTokens).toBe(20000);
  });
  it("new chats cannot inherit old messages or per-chat permission but share the game library", () => {
    const a = service.store.createChat();
    a.apiHistory.push({ role: "user", content: "SECRET_OTHER_CHAT" });
    a.allowedTools.push("remove_game");
    service.store.add([{ name: "Shared game" }]);
    const b = service.store.createChat();
    b.apiHistory.push({ role: "user", content: "NEW_CHAT_ONLY" });
    const packed = (service.agent as any).context(b, false);
    expect(JSON.stringify(packed.messages)).not.toContain("SECRET_OTHER_CHAT");
    expect(b.allowedTools).toEqual([]);
    expect(service.store.state.games[0].name).toBe("Shared game");
  });
  it("loads old settings with automatic context and resets a manual value on model change", () => {
    const old: any = { ...service.store.state.settings };
    delete old.contextTokens;
    expect(settingsSchema.parse(old).contextTokens).toBe(0);
    service.store.settings({ contextTokens: 20000 });
    service.store.settings({ lmModel: "different" });
    expect(service.store.state.settings.contextTokens).toBe(0);
  });
  it("persists long tool transcripts beyond former 500-block and 10k-history limits", () => {
    const c = service.store.createChat();
    c.messages = [
      {
        id: "m",
        role: "assistant",
        createdAt: new Date().toISOString(),
        blocks: Array.from({ length: 550 }, (_, i) => ({
          id: "t" + i,
          type: "tool" as const,
          name: "list_games",
          args: {},
          status: "done" as const,
          startedAt: 1,
          result: {},
        })),
      },
    ];
    c.apiHistory = Array.from({ length: 10002 }, () => ({ role: "user", content: "x" }));
    expect(() => chatSchema.parse(c)).not.toThrow();
  });
});
