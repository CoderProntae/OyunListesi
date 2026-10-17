import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { decodeToolInput, transportToolHistory } from "../electron/tool-input";
import { researchStages } from "../electron/research-plan";
import { readableAgentError } from "../electron/context";
import { compatibilityKey } from "../shared/compatibility";
import { initialState, defaultSettings } from "../shared/domain";
import { LMClient } from "../electron/lm";
let s: Service, root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.resolve(".cache/107-"));
  s = new Service(root);
  s.store.settings({ lmModel: "test", requireApproval: false, toolMode: "native" });
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  vi.spyOn(s.lm, "models").mockResolvedValue([
    { id: "test", name: "test", tools: true, loaded: true, context: null, reasoning: [] },
  ]);
});
afterEach(async () => {
  await s.call("stopResearch");
  s.close();
  await new Promise((r) => setTimeout(r, 10));
  s.store.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const idle = () =>
  vi.waitFor(() => {
    expect(s.agent.busy.size).toBe(0);
    expect((s as any).researchTask).toBeUndefined();
  });
const final = () => ({ text: "Bitti.", thinking: "", calls: [] });
const call = (name: string, args: any) => ({
  text: "",
  thinking: "",
  calls: [{ id: "c-" + Math.random(), name, arguments: JSON.stringify(args) }],
});
it.each(["null", "[]", "42", '"hello"', "", '{"gameId":'])(
  "rejects non-object/incomplete input without guessing: %s",
  (raw) => {
    expect(decodeToolInput(raw).args).toBeUndefined();
    expect(decodeToolInput(raw).error).toContain("Hiçbir değişiklik");
  },
);
it("unwraps only unambiguous JSON wrappers, preserving real values", () => {
  const args = { gameId: "real", patch: { aiSummary: "Gerçek değer" } };
  expect(decodeToolInput("```json\n" + JSON.stringify(args) + "\n```").args).toEqual(
    args,
  );
  expect(decodeToolInput(JSON.stringify(JSON.stringify(args))).args).toEqual(args);
  expect(decodeToolInput('{gameId:"guess"}').args).toBeUndefined();
});
it("retains raw malformed arguments, repairs the protocol envelope, then accepts the model's corrected write", async () => {
  const id = s.store.add([{ name: "Fix" }]).added[0],
    chat = s.store.createChat();
  const raw = '{"gameId":"' + id + '","patch":';
  let turn = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async (messages) => {
    if (turn++ === 0)
      return {
        text: "",
        thinking: "",
        calls: [{ id: "broken", name: "update_game_info", arguments: raw }],
      };
    if (turn === 2) {
      const envelope = messages.find((m: any) => m.tool_calls)?.tool_calls[0];
      expect(envelope.function.arguments).toBe("{}");
      const feedback = JSON.parse(messages.find((m: any) => m.role === "tool").content);
      expect(feedback.rawArguments).toBe(raw);
      expect(feedback.code).toBe("invalid_arguments");
      expect(s.store.requireGames([id])[0].aiSummary).toBeUndefined();
      return call("update_game_info", {
        gameId: id,
        patch: { aiSummary: "Düzeltilmiş özet" },
      });
    }
    return final();
  });
  await s.agent.send(chat.id, "Kaydet");
  await idle();
  expect(s.store.requireGames([id])[0].aiSummary).toBe("Düzeltilmiş özet");
  const blocks = chat.messages.flatMap((m) => m.blocks).filter((b) => b.type === "tool");
  expect(blocks[0]).toMatchObject({ status: "error", args: raw });
  expect(blocks[1]).toMatchObject({ status: "done" });
});
it("identifies a literal null argument rather than conflating it with truncated JSON", async () => {
  const chat = s.store.createChat();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () =>
    n++ ? final() : call("update_game_info", null),
  );
  await s.agent.send(chat.id, "Kaydet");
  await idle();
  const block = chat.messages.flatMap((m) => m.blocks).find((b) => b.type === "tool")!;
  expect(block).toMatchObject({ status: "error", args: "null" });
  expect((block as any).error).toContain("null, dizi");
  expect(s.store.state.games).toHaveLength(0);
});
it("invalid nested fields give named repair feedback rather than raw Zod JSON", async () => {
  const id = s.store.add([{ name: "Fields" }]).added[0],
    chat = s.store.createChat();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () =>
    n++ ? final() : call("update_game_info", { gameId: id, patch: null }),
  );
  await s.agent.send(chat.id, "Kaydet");
  await idle();
  const block = chat.messages.flatMap((m) => m.blocks).find((b) => b.type === "tool")!;
  expect((block as any).error).toContain("patch:");
  expect((block as any).result.code).toBe("invalid_arguments");
});
it("retrying invalid arguments asks the model for a new call instead of replaying null", async () => {
  const id = s.store.add([{ name: "Retry" }]).added[0],
    chat = s.store.createChat();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async (messages) => {
    expect(JSON.stringify(messages)).toContain("aynı bozuk girdiyi tekrarlama");
    return n++
      ? final()
      : call("update_game_info", {
          gameId: id,
          patch: { aiSummary: "Düzeltilmiş özet" },
        });
  });
  await s.agent.retry(chat.id, "update_game_info", null);
  await idle();
  expect(s.store.requireGames([id])[0].aiSummary).toBe("Düzeltilmiş özet");
});
it("JSON mode feeds back invalid call arguments but still processes valid calls in the same reply", async () => {
  s.store.settings({ toolMode: "json" });
  const id = s.store.add([{ name: "JSON" }]).added[0],
    chat = s.store.createChat();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () => ({
    thinking: "",
    calls: [],
    text: JSON.stringify(
      n++
        ? { message: "Bitti", tool_calls: [] }
        : {
            message: "Kayıt",
            tool_calls: [
              { name: "update_game_info", arguments: null },
              {
                name: "update_game_info",
                arguments: { gameId: id, patch: { aiSummary: "Geçerli kayıt" } },
              },
            ],
          },
    ),
  }));
  await s.agent.send(chat.id, "Kaydet");
  await idle();
  expect(s.store.requireGames([id])[0].aiSummary).toBe("Geçerli kayıt");
  expect(
    chat.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === "tool")
      .map((b) => (b as any).status),
  ).toEqual(["error", "done"]);
});
it("saves hardware and summary; a later summary-stage stall is stoppable without losing them", async () => {
  s.store.settings({ autoSummary: true });
  const id = s.store.add([{ name: "Phases" }]).added[0],
    g = s.store.requireGames([id])[0];
  s.store.hardware({
    ...initialState().hardware,
    cpu: "Core i5-4460",
    gpu: "GTX 1660 SUPER",
    ramGB: 8,
    diskFreeGB: 16,
  });
  s.store.metadata(id, {
    minimum: {
      raw: "fixture",
      cpu: "Fixture CPU X1",
      gpu: "Fixture GPU Z9",
      ramGB: 1,
      storageGB: 7,
    },
  });
  const steps = new Map<string, number>(),
    seen: string[] = [];
  let stallStarted = false;
  vi.spyOn(s.lm, "stream").mockImplementation(async (messages, _tools, signal) => {
    const prompt = messages.filter((m: any) => m.role === "user").at(-1)
      .content as string;
    const stage = prompt.match(/AŞAMA: ([^.]+)\./)![1];
    const n = steps.get(stage) || 0;
    steps.set(stage, n + 1);
    if (!n) seen.push(stage);
    if (stage === "DONANIM" && !n)
      return call("record_compatibility", {
        gameId: id,
        contextKey: compatibilityKey(g, s.store.state.hardware),
        level: "minimum",
        component: "CPU",
        status: "pass",
        reason: "Fixture comparison",
      });
    if (stage === "ÖZET" && !n)
      return call("update_game_info", {
        gameId: id,
        patch: { aiSummary: "Fixture oyun özeti." },
      });
    if (stage === "ÖZET" && n === 1) {
      stallStarted = true;
      expect(g.aiSummary).toBe("Fixture oyun özeti.");
      expect(g.aiCompatibility?.[0].status).toBe("pass");
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      );
    }
    return final();
  });
  await s.call("researchGame", { id });
  await vi.waitFor(() => expect(stallStarted).toBe(true));
  expect(seen).toEqual(["DONANIM", "ÖZET"]);
  expect(g.research?.message).toContain("Oyun özeti");
  await s.call("stopResearch");
  await idle();
  expect(g.research?.status).toBe("cancelled");
  expect(g.aiSummary).toBe("Fixture oyun özeti.");
  expect(g.aiCompatibility?.[0].status).toBe("pass");
});
it("tracks an unwritten summary as incomplete and honors autoSummary off", async () => {
  expect(researchStages(false)).toEqual(["hardware"]);
  expect(researchStages(true)).toEqual(["hardware", "summary"]);
  const id = s.store.add([{ name: "No write" }]).added[0];
  s.store.settings({ autoSummary: true });
  vi.spyOn(s.lm, "stream").mockResolvedValue(final());
  await s.call("researchGame", { id });
  await idle();
  expect(s.store.requireGames([id])[0].research?.message).toContain("oyun özeti");
  s.store.settings({ autoSummary: false });
  await s.call("researchGame", { id });
  await idle();
  expect(s.store.requireGames([id])[0].research?.message).not.toContain("oyun özeti");
});
it("reports length termination and does not apply truncated tool arguments", async () => {
  const chat = s.store.createChat();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () =>
    n++
      ? final()
      : {
          text: "",
          thinking: "...",
          finishReason: "length",
          calls: [{ id: "truncated", name: "add_game", arguments: '{"name":' }],
        },
  );
  await s.agent.send(chat.id, "Ekle");
  await idle();
  expect(s.store.state.games).toHaveLength(0);
  expect(JSON.stringify(chat.messages)).toContain("çıktı token sınırına ulaştı");
});
it("surfaces HTTP 500 as a server error, preserves its body, and does not auto-retry", async () => {
  const html = "<!DOCTYPE html><h1>Internal Server Error</h1>";
  const fetch = vi.fn(async () => new Response(html, { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  const lm = new LMClient(
    () => ({ ...defaultSettings, lmModel: "test" }),
    () => "",
  );
  await expect(lm.stream([], [], new AbortController().signal, () => {})).rejects.toThrow(
    html,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(readableAgentError("LM Studio HTTP 500: " + html)).toContain(
    "Model sunucusu HTTP 5xx",
  );
});
it("repairs pre-upgrade malformed tool history without altering stored history or dropping raw input", () => {
  const old = [
    { role: "user", content: "Asıl isteğim" },
    {
      role: "assistant",
      tool_calls: [
        {
          id: "old",
          type: "function",
          function: { name: "update_game_info", arguments: '{"patch":' },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "old",
      content: '{"error":"Expected object, received null"}',
    },
  ];
  const copy = structuredClone(old),
    fixed = transportToolHistory(old);
  expect(old).toEqual(copy);
  expect(fixed[1].tool_calls[0].function.arguments).toBe("{}");
  expect(JSON.parse(fixed[2].content).rawArguments).toBe('{"patch":');
  expect(JSON.parse(fixed[2].content).previousResult).toBe(old[2].content);
});
it("retains the actual OpenAI finish reason from the SSE transport", async () => {
  const payload =
    "data: " +
    JSON.stringify({
      choices: [{ delta: { content: "kısa" }, finish_reason: "length" }],
    }) +
    "\n\ndata: [DONE]\n\n";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(payload, { headers: { "Content-Type": "text/event-stream" } }),
    ),
  );
  const lm = new LMClient(
    () => ({ ...defaultSettings, lmModel: "test" }),
    () => "",
  );
  expect(
    (await lm.stream([], undefined, new AbortController().signal, () => {})).finishReason,
  ).toBe("length");
});
