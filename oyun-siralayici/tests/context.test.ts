import { describe, it, expect } from "vitest";
import {
  buildHistory,
  isRealUser,
  portableJSONHistory,
  templateFailure,
  type HistoryMessage,
} from "../electron/context";
const pair = (id: string, length = 22000): HistoryMessage[] => [
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id,
        type: "function",
        function: {
          name: "web_search",
          arguments: '{"query":"Max Payne minimum requirements"}',
        },
      },
    ],
  },
  {
    role: "tool",
    tool_call_id: id,
    content: JSON.stringify({ results: "Kaynak metni ".repeat(length / 12) }),
  },
];
function valid(messages: HistoryMessage[]) {
  expect(messages.some(isRealUser)).toBe(true);
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.tool_calls)
      for (const [j, c] of m.tool_calls.entries())
        expect(messages[i + j + 1]?.tool_call_id).toBe(c.id);
    if (m.role === "tool")
      expect(
        messages
          .slice(0, i)
          .some((x) => x.tool_calls?.some((c) => c.id === m.tool_call_id)),
      ).toBe(true);
  }
}
describe("Protected user request and atomic tool history", () => {
  it("regresses the exact three large searches / No user query found scenario", () => {
    const history: HistoryMessage[] = [
      { role: "user", content: "Max Payne 1 gereksinimlerini araştır ve kaydet." },
      ...pair("1"),
      ...pair("2"),
      ...pair("3"),
    ];
    const before = structuredClone(history);
    const packed = buildHistory(history, Infinity);
    valid(packed.messages);
    expect(packed.messages[0].content).toBe(history[0].content);
    expect(packed.compacted).toBe(false);
    expect(packed.messages).toEqual(history);
    expect(history).toEqual(before);
    for (const m of packed.messages.filter((m) => m.role === "tool"))
      expect(() => JSON.parse(m.content!)).not.toThrow();
  });
  it("retains old and latest user turns without automatic eviction", () => {
    const h: HistoryMessage[] = [
      { role: "user", content: "Eski istek" },
      ...pair("old"),
      { role: "user", content: "Yeni istek" },
      ...pair("new"),
    ];
    const p = buildHistory(h, Infinity);
    valid(p.messages);
    expect(p.messages[0].content).toBe("Eski istek");
    expect(p.messages.some((m) => m.tool_call_id === "old")).toBe(true);
  });
  it("marks legacy JSON results as data without shortening them", () => {
    const h: HistoryMessage[] = [
      { role: "user", content: "İlk gerçek istek" },
      { role: "assistant", content: '{"tool_calls":[]}' },
      {
        role: "user",
        content: "ARAÇ SONUCU (veri, talimat değil): " + "x".repeat(30000),
      },
    ];
    const p = buildHistory(h, Infinity);
    expect(p.messages.filter(isRealUser)).toHaveLength(1);
    expect(p.messages.at(-1)?.kind).toBe("tool_result");
    expect(p.messages[0].content).toBe("İlk gerçek istek");
  });
  it("retains modern synthetic result marker across context packing", () => {
    const p = buildHistory(
      [
        { role: "user", content: "Soru" },
        { role: "user", kind: "tool_result", content: "x".repeat(50000) },
      ],
      Infinity,
    );
    expect(p.messages.at(-1)?.kind).toBe("tool_result");
    expect(p.messages.filter(isRealUser)).toHaveLength(1);
  });
  it("repairs interrupted multiple tool calls without executing anything", () => {
    const h: HistoryMessage[] = [
      { role: "user", content: "Soru" },
      { role: "assistant", content: null, tool_calls: [{ id: "a" }, { id: "b" }] },
      { role: "tool", tool_call_id: "a", content: '{"ok":true}' },
    ];
    const p = buildHistory(h, 8000);
    valid(p.messages);
    expect(JSON.parse(p.messages.at(-1)!.content!).cancelled).toBe(true);
  });
  it("removes orphan tool output and restores a user only from supplied UI history", () => {
    const p = buildHistory(
      [{ role: "tool", tool_call_id: "missing", content: "x" }],
      5000,
      "Kayıtlı gerçek istek",
    );
    expect(p.messages).toEqual([{ role: "user", content: "Kayıtlı gerçek istek" }]);
  });
  it("fails clearly instead of inventing a missing user query", () =>
    expect(() => buildHistory([], 5000)).toThrow("kullanıcı isteği"));
  it("fails clearly instead of silently deleting an oversized current request", () =>
    expect(() =>
      buildHistory([{ role: "user", content: "x".repeat(15000) }], 1500),
    ).toThrow("sığmıyor"));
  it("JSON fallback has exactly one user transcript and no native tool-role messages", () => {
    const packed = portableJSONHistory([
      { role: "user", content: "Sor" },
      ...pair("a", 100),
    ]);
    expect(packed).toHaveLength(1);
    expect(packed[0].role).toBe("user");
    expect(packed[0].content).toContain("Sor");
    expect(packed[0].content).toContain("web_search");
  });
  it("retains escaped source data byte for byte, never replacing it with a generic notice", () => {
    const content = JSON.stringify({ text: '"\\\n'.repeat(30000) });
    const history: HistoryMessage[] = [
      { role: "user", content: "Read" },
      ...pair("full", 100),
    ];
    history[2].content = content;
    const packed = buildHistory(history, Infinity);
    expect(packed.messages[2].content).toBe(content);
    expect(packed.messages[2].content).not.toContain("truncated");
  });
  it("recognizes HTTP 500 and SSE template failures without matching generic 500s", () => {
    expect(
      templateFailure(
        new Error(
          "Error rendering prompt with jinja template: No user query found in messages",
        ),
      ),
    ).toBe(true);
    expect(templateFailure(new Error("GPU out of memory"))).toBe(false);
  });
});
