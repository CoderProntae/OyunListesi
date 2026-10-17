import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { nativeTools } from "../electron/tools";
let s: Service, root: string;
const longResult = JSON.stringify({
  text: 'Uzun kaynak "alıntısı" \\ yol\n'.repeat(6000),
  end: "SOURCE_END_108",
});
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/108-"));
  s = new Service(root);
  s.store.settings({
    lmModel: "fixture",
    requireApproval: false,
    autoResearch: false,
    maxTokens: 16128,
  });
  s.agent.models = [
    {
      id: "fixture",
      name: "Fixture",
      loaded: true,
      context: 16384,
      tools: true,
      reasoning: ["high"],
    },
  ];
});
afterEach(async () => {
  s.close();
  await new Promise((r) => setTimeout(r, 5));
  s.store.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function chatWithHistory() {
  const chat = s.store.createChat();
  chat.apiHistory = [
    { role: "user", content: "Donanımı araştır." },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "old-search",
          type: "function",
          function: { name: "web_search", arguments: '{"query":"hardware"}' },
        },
      ],
    },
    { role: "tool", tool_call_id: "old-search", content: longResult },
  ];
  return chat;
}
it.each([128, 8192, 16384, 32768])(
  "does not shrink 16128 output tokens based on the manual context value %s",
  (contextTokens) => {
    s.store.settings({ contextTokens });
    const chat = chatWithHistory();
    const packed = (s.agent as any).context(chat, false);
    // Reproduce the retired heuristic, proving this fixture would have hit 128.
    const estimate =
      Math.ceil(
        (JSON.stringify(packed.messages).length + JSON.stringify(nativeTools).length) /
          2.5,
      ) + 128;
    expect(Math.min(16128, Math.max(128, contextTokens - estimate))).toBe(128);
    expect(packed.outputTokens).toBe(16128);
    expect(packed.messages.at(-1).content).toBe(longResult);
  },
);
it("does not use server-reported loaded context to reduce the output ceiling either", () => {
  s.store.settings({ contextTokens: 0 });
  const packed = (s.agent as any).context(chatWithHistory(), false);
  expect(packed.outputTokens).toBe(16128);
  expect(s.agent.models[0].context).toBe(16384);
});
for (const mode of ["native", "json", "reasoning"] as const) {
  it.each([16128, 20000])(
    `${mode}: sends the exact selected %i on the actual HTTP request and retains all tool data`,
    async (maxTokens) => {
      s.store.settings({
        maxTokens,
        contextTokens: 16384,
        toolMode: mode === "json" ? "json" : "native",
        reasoning: mode === "reasoning" ? "high" : "default",
      });
      let body: any,
        url = "";
      const fake = vi.fn(async (target: any, init: any) => {
        url = String(target);
        body = JSON.parse(init.body);
        const answer =
          mode === "native"
            ? "Tamam."
            : JSON.stringify({ message: "Tamam.", tool_calls: [] });
        const payload =
          mode === "reasoning"
            ? "data: " +
              JSON.stringify({ type: "message.delta", content: answer }) +
              "\n\ndata: " +
              JSON.stringify({ type: "chat.end" }) +
              "\n\n"
            : "data: " +
              JSON.stringify({
                choices: [{ delta: { content: answer }, finish_reason: "stop" }],
              }) +
              "\n\ndata: [DONE]\n\n";
        return new Response(payload, {
          headers: { "Content-Type": "text/event-stream" },
        });
      });
      vi.stubGlobal("fetch", fake);
      const chat = chatWithHistory();
      await s.agent.send(chat.id, "Kaydı tamamla.");
      await vi.waitFor(() => expect(s.agent.busy.size).toBe(0));
      expect(fake).toHaveBeenCalledTimes(1);
      expect(chat.messages.at(-1)?.error).not.toBe(true);
      expect(body[mode === "reasoning" ? "max_output_tokens" : "max_tokens"]).toBe(
        maxTokens,
      );
      expect(url).toContain(
        mode === "reasoning" ? "/api/v1/chat" : "/v1/chat/completions",
      );
      let messages = mode === "reasoning" ? JSON.parse(body.input) : body.messages;
      if (mode !== "native") {
        const transcript = messages.at(-1).content;
        messages = JSON.parse(transcript.slice(transcript.indexOf("\n") + 1));
      }
      expect(messages.find((m: any) => m.role === "tool").content).toBe(longResult);
      expect(JSON.stringify(chat.messages)).not.toContain("çıktı üst sınırı yaklaşık");
      expect(s.store.state.settings.maxTokens).toBe(maxTokens);
    },
  );
}
it("accepts non-multiple limits without rounding, persists them, and respects explicitly selected 128", () => {
  for (const value of [16128, 20000, 20001, 128]) {
    s.store.settings({ maxTokens: value });
    expect((s.agent as any).context(chatWithHistory(), false).outputTokens).toBe(value);
  }
  s.store.settings({ maxTokens: 20000 });
  s.store.flush();
  expect(
    JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8")).settings
      .maxTokens,
  ).toBe(20000);
});
it("surfaces real server context rejection without lowering the limit, pruning history or retrying", async () => {
  s.store.settings({ maxTokens: 16128, toolMode: "auto" });
  const bodies: any[] = [];
  const fake = vi.fn(async (_target: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response("maximum context length exceeded", { status: 400 });
  });
  vi.stubGlobal("fetch", fake);
  const chat = chatWithHistory();
  await s.agent.send(chat.id, "Devam");
  await vi.waitFor(() => expect(s.agent.busy.size).toBe(0));
  expect(fake).toHaveBeenCalledTimes(1);
  expect(bodies[0].max_tokens).toBe(16128);
  expect(bodies[0].messages.find((m: any) => m.role === "tool").content).toBe(longResult);
  expect(chat.messages.at(-1)?.error).toBe(true);
  expect(JSON.stringify(chat.messages)).toContain("maximum context length exceeded");
  expect(s.store.state.settings.maxTokens).toBe(16128);
});
