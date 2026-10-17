import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
let service: Service, root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/test-agent-"));
  service = new Service(root);
  service.store.settings({ lmModel: "test", requireApproval: true });
  vi.spyOn(service.queue, "add").mockImplementation(() => {});
});
afterEach(async () => {
  service.close();
  await new Promise((r) => setTimeout(r, 5));
  service.store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
function plan(name: string, args: any) {
  let n = 0;
  const stream = vi
    .spyOn(service.lm, "stream")
    .mockImplementation(async (_m, _t, _s, on) => {
      if (n++ === 0)
        return {
          text: "",
          thinking: "",
          calls: [{ id: "call1", name, arguments: JSON.stringify(args) }],
        };
      on("text", "Tamamlandı.");
      return { text: "Tamamlandı.", thinking: "", calls: [] };
    });
  return stream;
}
const idle = () => vi.waitFor(() => expect(service.agent.busy.size).toBe(0));
describe("Permission-gated agent orchestration", () => {
  it("cannot add before permission; denial is fed back to the model", async () => {
    const chat = service.store.createChat();
    const mock = plan("add_game", { name: "Portal" });
    await service.agent.send(chat.id, "Add");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    expect(service.store.state.games).toHaveLength(0);
    const p = [...service.agent.permissions.values()][0].request;
    expect(p.description).toContain("Portal");
    service.agent.answerPermission(p.id, "deny");
    await idle();
    expect(service.store.state.games).toHaveLength(0);
    expect(
      chat.apiHistory.some((m) => m.role === "tool" && m.content.includes("denied")),
    ).toBe(true);
    expect(
      chat.messages
        .at(-1)!
        .blocks.some((b) => b.type === "tool" && b.status === "denied"),
    ).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("executes a permitted deletion and undo restores the game", async () => {
    const ids = service.store.add([{ name: "Preserve" }]).added;
    const chat = service.store.createChat();
    plan("remove_game", { ids });
    await service.agent.send(chat.id, "Delete");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    expect(service.store.state.games).toHaveLength(1);
    service.agent.answerPermission([...service.agent.permissions.keys()][0], "allow");
    await idle();
    expect(service.store.state.games).toHaveLength(0);
    service.store.undo();
    expect(service.store.state.games[0].name).toBe("Preserve");
  });
  it("limits persistent permission to the same chat and same tool", async () => {
    const chat = service.store.createChat();
    plan("add_game", { name: "A" });
    await service.agent.send(chat.id, "Add");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    service.agent.answerPermission([...service.agent.permissions.keys()][0], "always");
    await idle();
    expect(chat.allowedTools).toEqual(["add_game"]);
    const another = service.store.createChat();
    expect(another.allowedTools).toEqual([]);
    expect(service.store.state.games[0].name).toBe("A");
  });
  it("also gates reads when configured", async () => {
    service.store.settings({ askReadTools: true });
    const chat = service.store.createChat();
    plan("list_games", {});
    await service.agent.send(chat.id, "List");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    const p = [...service.agent.permissions.values()][0].request;
    expect(p.mutation).toBe(false);
    service.agent.answerPermission(p.id, "allow");
    await idle();
    expect(
      chat.apiHistory.some((m) => m.role === "tool" && m.content.includes("total")),
    ).toBe(true);
  });
  it("wizard answers are returned as a tool result and generation resumes", async () => {
    const chat = service.store.createChat();
    const mock = plan("ask_user_questions", {
      questions: [
        {
          id: "mood",
          question: "Nasıl?",
          multiple: true,
          options: [
            { id: "a", label: "Rahat" },
            { id: "b", label: "Hızlı" },
          ],
        },
      ],
    });
    await service.agent.send(chat.id, "Help");
    await vi.waitFor(() => expect(service.agent.wizard).not.toBeNull());
    service.agent.answerWizard(service.agent.wizard!.id, {
      cancelled: false,
      answers: [{ id: "mood", selected: ["a"], custom: "Kısa olsun" }],
    });
    await idle();
    expect(service.agent.wizard).toBeNull();
    expect(
      chat.apiHistory.some((m) => m.role === "tool" && m.content.includes("Kısa olsun")),
    ).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("cancel clears permission wait and repairs incomplete tool history", async () => {
    const chat = service.store.createChat();
    plan("add_game", { name: "Nope" });
    await service.agent.send(chat.id, "Add");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    service.agent.cancel(chat.id);
    await idle();
    expect(service.agent.permissions.size).toBe(0);
    expect(service.store.state.games).toHaveLength(0);
    expect(chat.apiHistory.some((m) => m.role === "tool")).toBe(true);
  });
  it("supports validated structured JSON fallback with the same permission gate", async () => {
    service.store.settings({ toolMode: "json" });
    let n = 0;
    vi.spyOn(service.lm, "stream").mockImplementation(async () => ({
      text: JSON.stringify(
        n++ === 0
          ? {
              message: "Ekleyebilirim.",
              tool_calls: [{ name: "add_game", arguments: { name: "Fallback Game" } }],
            }
          : { message: "Bitti.", tool_calls: [] },
      ),
      thinking: "",
      calls: [],
    }));
    const chat = service.store.createChat();
    await service.agent.send(chat.id, "Add");
    await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
    service.agent.answerPermission([...service.agent.permissions.keys()][0], "allow");
    await idle();
    expect(service.store.state.games[0].name).toBe("Fallback Game");
    expect(
      chat.messages
        .at(-1)!
        .blocks.some((b) => b.type === "notice" && b.text.includes("JSON")),
    ).toBe(true);
  });
  it("never executes plain prose containing a tool object in fallback mode", async () => {
    service.store.settings({ toolMode: "json" });
    vi.spyOn(service.lm, "stream").mockResolvedValue({
      text: 'Run {"tool_calls":[{"name":"add_game","arguments":{"name":"Bad"}}]}',
      thinking: "",
      calls: [],
    });
    const chat = service.store.createChat();
    await service.agent.send(chat.id, "Add");
    await idle();
    expect(service.store.state.games).toHaveLength(0);
    expect(service.agent.permissions.size).toBe(0);
  });
  it("invalid tool IDs fail without mutating state or opening approval", async () => {
    plan("remove_game", { ids: ["invented"] });
    const chat = service.store.createChat();
    await service.agent.send(chat.id, "Delete");
    await idle();
    expect(service.agent.permissions.size).toBe(0);
    expect(
      chat.messages.at(-1)!.blocks.some((b) => b.type === "tool" && b.status === "error"),
    ).toBe(true);
  });
});

it("auto mode discloses structured fallback after native tool rejection", async () => {
  let n = 0;
  vi.spyOn(service.lm, "stream").mockImplementation(async () => {
    if (n++ === 0)
      throw Object.assign(new Error("HTTP 400 tools not supported"), {
        status: 400,
      });
    return {
      text: JSON.stringify({ message: "Yedek yanıt.", tool_calls: [] }),
      thinking: "",
      calls: [],
    };
  });
  const chat = service.store.createChat();
  await service.agent.send(chat.id, "Hi");
  await idle();
  expect(
    chat.messages
      .at(-1)!
      .blocks.some((b) => b.type === "notice" && b.text.includes("yedek moduna")),
  ).toBe(true);
});

describe("1.0.1 regressions", () => {
  it("three large search responses keep the actual user in every request", async () => {
    const chat = service.store.createChat();
    let n = 0;
    service.agent.models = [
      {
        id: "test",
        name: "test",
        context: 8192,
        loaded: true,
        tools: true,
        reasoning: [],
      },
    ];
    vi.spyOn(service.providers, "search").mockResolvedValue({
      results: [{ text: "research ".repeat(9000) }],
    } as any);
    const stream = vi.spyOn(service.lm, "stream").mockImplementation(async (messages) => {
      expect(
        messages.some((m: any) => m.role === "user" && m.content.includes("Max Payne")),
      ).toBe(true);
      if (n++ < 3)
        return {
          text: "",
          thinking: "",
          calls: [
            { id: "search" + n, name: "web_search", arguments: '{"query":"Max Payne"}' },
          ],
        };
      return { text: "Araştırma tamam.", thinking: "", calls: [] };
    });
    await service.agent.send(chat.id, "Max Payne gereksinimlerini araştır.");
    await idle();
    expect(stream).toHaveBeenCalledTimes(4);
    expect(chat.messages.at(-1)?.error).not.toBe(true);
    expect((service.agent as any).context(chat, false).outputTokens).toBe(4096);
    expect(
      stream.mock.calls[3][0].some(
        (m: any) => m.role === "tool" && m.content.includes("research ".repeat(1000)),
      ),
    ).toBe(true);
    expect(service.store.state.settings.maxTokens).toBe(4096);
  });
  it("a 500 template error switches format without replaying a completed mutation", async () => {
    const chat = service.store.createChat();
    chat.allowedTools.push("add_game");
    let n = 0;
    const add = vi.spyOn(service.store, "add");
    vi.spyOn(service.lm, "stream").mockImplementation(async (messages, tools) => {
      if (n++ === 0)
        return {
          text: "",
          thinking: "",
          calls: [{ id: "add-once", name: "add_game", arguments: '{"name":"One game"}' }],
        };
      if (n === 2) {
        const e: any = new Error(
          "Error rendering prompt with jinja template: No user query found in messages",
        );
        e.status = 500;
        throw e;
      }
      expect(tools).toBeUndefined();
      expect(messages.filter((m: any) => m.role === "user")).toHaveLength(1);
      expect(JSON.stringify(messages)).toContain("One game");
      return { text: '{"message":"Tamam","tool_calls":[]}', thinking: "", calls: [] };
    });
    await service.agent.send(chat.id, "One game ekle");
    await idle();
    expect(add).toHaveBeenCalledTimes(1);
    expect(service.store.state.games).toHaveLength(1);
    expect(chat.messages.at(-1)?.error).not.toBe(true);
  });
  it("SSE-shaped template errors without an HTTP status also fall back", async () => {
    const chat = service.store.createChat();
    let n = 0;
    const stream = vi.spyOn(service.lm, "stream").mockImplementation(async () => {
      if (!n++) throw new Error("No user query found in messages");
      return { text: '{"message":"Tamam","tool_calls":[]}', thinking: "", calls: [] };
    });
    await service.agent.send(chat.id, "Merhaba");
    await idle();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(chat.messages.at(-1)?.error).not.toBe(true);
  });
  it("does not retry generic server errors or silently override explicit native mode", async () => {
    const chat = service.store.createChat();
    service.store.settings({ toolMode: "native" });
    const stream = vi
      .spyOn(service.lm, "stream")
      .mockRejectedValue(new Error("No user query found in messages"));
    await service.agent.send(chat.id, "Merhaba");
    await idle();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(chat.messages.at(-1)?.error).toBe(true);
  });
});

it("autonomous JSON fallback updates records without asking for permission or evidence", async () => {
  service.store.settings({ requireApproval: false, toolMode: "json" });
  const id = service.store.add([{ name: "JSON autonomy" }]).added[0],
    chat = service.store.createChat();
  let n = 0;
  vi.spyOn(service.lm, "stream").mockImplementation(async (messages) => {
    expect(JSON.stringify(messages)).toContain("Otonom mod açık");
    return {
      text: JSON.stringify(
        n++
          ? { message: "Kaydedildi", tool_calls: [] }
          : {
              message: "",
              tool_calls: [
                {
                  name: "update_game_info",
                  arguments: { gameId: id, patch: { year: 2001 } },
                },
              ],
            },
      ),
      thinking: "",
      calls: [],
    };
  });
  await service.agent.send(chat.id, "Bilgileri düzenle");
  await idle();
  expect(service.store.state.games[0].year).toBe(2001);
  expect(service.agent.permissions.size).toBe(0);
  expect(chat.messages.at(-1)?.error).not.toBe(true);
});
