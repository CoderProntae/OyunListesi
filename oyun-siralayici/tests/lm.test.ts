import { describe, it, expect, vi, afterEach } from "vitest";
import { LMClient, nativeBase } from "../electron/lm";
import { defaultSettings } from "../shared/domain";
afterEach(() => vi.unstubAllGlobals());
function stream(chunks: string[]) {
  const e = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        chunks.forEach((s) => c.enqueue(e.encode(s)));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const delta = (d: any, reason: any = null) =>
  "data: " + JSON.stringify({ choices: [{ delta: d, finish_reason: reason }] }) + "\n\n";
describe("LM Studio transport", () => {
  it("normalizes native endpoint separately from OpenAI base", () =>
    expect(nativeBase("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/api/v1"));
  it("reads actual model capability fields without name guessing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("/api/v1/models")
                ? {
                    models: [
                      {
                        type: "llm",
                        key: "model",
                        display_name: "Local",
                        loaded_instances: [
                          {
                            id: "model-loaded",
                            config: { context_length: 12000 },
                          },
                        ],
                        capabilities: {
                          trained_for_tool_use: true,
                          reasoning: {
                            allowed_options: ["off", "low", "high"],
                            default: "low",
                          },
                        },
                      },
                    ],
                  }
                : { data: [{ id: "model" }] },
            ),
          ),
      ),
    );
    const lm = new LMClient(
      () => defaultSettings,
      () => "",
    );
    const m = await lm.models();
    expect(m[0]).toMatchObject({
      id: "model-loaded",
      context: 12000,
      tools: true,
      reasoning: ["off", "low", "high"],
    });
  });
  it("streams partial SSE frames, separated thinking and fragmented tool arguments", async () => {
    const all =
      delta({ reasoning_content: "Plan. " }) +
      delta({ content: "Merhaba " }) +
      delta({
        tool_calls: [
          {
            index: 0,
            id: "call1",
            function: { name: "add_game", arguments: '{"na' },
          },
        ],
      }) +
      delta(
        {
          tool_calls: [{ index: 0, function: { arguments: 'me":"Portal"}' } }],
        },
        "tool_calls",
      ) +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => stream([all.slice(0, 13), all.slice(13, 79), all.slice(79)])),
    );
    const events: any[] = [];
    const lm = new LMClient(
      () => ({ ...defaultSettings, lmModel: "test" }),
      () => "",
    );
    const r = await lm.stream([], [], new AbortController().signal, (t, s) =>
      events.push([t, s]),
    );
    expect(r.text).toBe("Merhaba ");
    expect(r.thinking).toBe("Plan. ");
    expect(r.calls).toEqual([
      { id: "call1", name: "add_game", arguments: '{"name":"Portal"}' },
    ]);
    expect(events[0]).toEqual(["thinking", "Plan. "]);
  });
  it("keeps inline think tags separate even across token chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        stream([
          delta({ content: "<thi" }),
          delta({ content: "nk>gizli düşünme</thi" }),
          delta({ content: "nk>Görünür yanıt" }, "stop"),
        ]),
      ),
    );
    const lm = new LMClient(
      () => ({ ...defaultSettings, lmModel: "test" }),
      () => "",
    );
    const r = await lm.stream([], undefined, new AbortController().signal, () => {});
    expect(r.thinking).toBe("gizli düşünme");
    expect(r.text).toBe("Görünür yanıt");
  });
  it("does not run calls from truncated or malformed streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        stream([
          delta({
            tool_calls: [
              {
                index: 0,
                id: "c",
                function: { name: "remove_game", arguments: '{"ids":["a"]}' },
              },
            ],
          }),
        ]),
      ),
    );
    const lm = new LMClient(
      () => ({ ...defaultSettings, lmModel: "test" }),
      () => "",
    );
    await expect(
      lm.stream([], [], new AbortController().signal, () => {}),
    ).rejects.toThrow("tamamlanmadan");
  });
  it("uses documented native reasoning and never undocumented OpenAI effort", async () => {
    let body: any;
    let target = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts: any) => {
        body = JSON.parse(opts.body);
        target = url;
        return stream([
          'event: reasoning.delta\ndata: {"type":"reasoning.delta","content":"think"}\n\n',
          'event: message.delta\ndata: {"type":"message.delta","content":"hello"}\n\n',
          'event: chat.end\ndata: {"type":"chat.end"}\n\n',
        ]);
      }),
    );
    const lm = new LMClient(
      () => ({
        ...defaultSettings,
        lmModel: "test",
        reasoning: "high",
        temperature: 1.5,
      }),
      () => "",
    );
    const r = await lm.stream(
      [
        { role: "system", content: "guard" },
        { role: "user", content: "hi" },
      ],
      undefined,
      new AbortController().signal,
      () => {},
      true,
    );
    expect(target.endsWith("/api/v1/chat")).toBe(true);
    expect(body).toMatchObject({
      reasoning: "high",
      temperature: 1,
      store: false,
      integrations: [],
    });
    expect(body.reasoning_effort).toBeUndefined();
    expect(r.text).toBe("hello");
  });
});

it("does not confuse theoretical model context with loaded instance context", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/api/")
              ? {
                  models: [
                    {
                      key: "m",
                      type: "llm",
                      max_context_length: 131072,
                      loaded_instances: [{ id: "m", config: {} }],
                    },
                  ],
                }
              : { data: [{ id: "m" }] },
          ),
        ),
    ),
  );
  const lm = new LMClient(
      () => defaultSettings,
      () => "",
    ),
    models = await lm.models();
  expect(models[0].context).toBeNull();
});
it("does not cap cumulative SSE overhead at 2MB or impose a five-minute generation timer", async () => {
  const frame =
    "data: " +
    JSON.stringify({ choices: [{ delta: { content: "x" } }], padding: "z".repeat(180) }) +
    "\n\n";
  const response = frame.repeat(10000) + delta({}, "stop") + "data: [DONE]\n\n";
  expect(response.length).toBeGreaterThan(2_000_000);
  const fake = vi.fn(async () => stream([response]));
  vi.stubGlobal("fetch", fake);
  const controller = new AbortController(),
    lm = new LMClient(
      () => ({ ...defaultSettings, lmModel: "m" }),
      () => "",
    ),
    r = await lm.stream(
      [{ role: "user", content: "test" }],
      undefined,
      controller.signal,
      () => {},
    );
  expect(r.text.length).toBe(10000);
  expect((fake.mock.calls[0] as any)[1].signal).toBe(controller.signal);
});
