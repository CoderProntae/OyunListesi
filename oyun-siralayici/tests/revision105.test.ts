import { it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseRequirementSections } from "../electron/requirements";
import { compatibility, compatibilityKey } from "../shared/compatibility";
import { newGame, initialState } from "../shared/domain";
import { Service } from "../electron/service";
const original = `<strong>Minimum configuration</strong><br>OS: Windows XP Service Pack 2, Windows Vista<br>Processor: Intel Pentium 4 2Ghz or AMD Athlon XP 1800+<br>Memory: 1 GB<br>Video card: 128 MB NVIDIA 6600 or better / ATI X1300<br>HARD DRIVE SPACE: 7 GB<br><strong>Recommended configuration</strong><br>Processor: Intel Pentium 4 2.5GHz or AMD Athlon XP 2400+<br><strong>Optimum configuration</strong><br>Processor: Intel Pentium 4 3GHz or AMD Athlon XP 3000+<br>Memory: 2 GB<br>Video card: 128 MB NVIDIA 8300 / ATI X1800`;
it("parses the supplied legacy GPU and disk; a third block in the text is ignored", () => {
  const r = parseRequirementSections(original);
  expect(r.minimum).toMatchObject({
    gpu: "128 MB NVIDIA 6600 or better / ATI X1300",
    storageGB: 7,
    ramGB: 1,
    vramGB: 0.125,
  });
  expect(r.minimum.cpu).toContain("1800+");
  expect(r.minimum.raw).not.toContain("2400+");
  expect(r.recommended.cpu).toContain("2400+");
  // 1.0.15: only minimum and recommended exist. The "Optimum configuration"
  // block ends the recommended block and none of its values leak into it.
  expect(r.recommended.ramGB).toBeUndefined();
  expect(r.recommended.gpu).toBeUndefined();
  expect(r.recommended.raw).not.toContain("3000+");
  expect(Object.keys(r)).toEqual(["minimum", "recommended"]);
});
it("preserves explicit Steam recommended block without fabricating missing components", () => {
  const r = parseRequirementSections(original, "<li>Processor: Separate CPU</li>");
  expect(r.recommended.cpu).toBe("Separate CPU");
  expect(r.recommended.storageGB).toBeUndefined();
});
it("uses saved AI only for unknown comparisons and invalidates on hardware or requirement change", () => {
  const parsed = parseRequirementSections(original);
  // 2.1.0: "Pentium 4 2Ghz" is computed from the hardware data; an AI answer
  // only counts for a row the data cannot decide.
  const g = {
      ...newGame("Test", 0),
      ...parsed,
      minimum: { ...parsed.minimum, cpu: "Fixture CPU X1" },
    },
    h = {
      ...initialState().hardware,
      cpu: "Core i5-4460",
      gpu: "NVIDIA GeForce GTX 1660 SUPER",
      ramGB: 8,
      diskFreeGB: 16,
      os: "Windows 10",
      osVersion: "10.0.19045",
    };
  const key = compatibilityKey(g, h);
  g.aiCompatibility = [
    {
      level: "minimum",
      component: "CPU",
      status: "pass",
      reason: "Karşılaştırma sonucu",
      contextKey: key,
      checkedAt: new Date().toISOString(),
    },
    {
      level: "minimum",
      component: "Disk",
      status: "fail",
      reason: "Bu sayısal hesabı geçersiz kılamaz",
      contextKey: key,
      checkedAt: new Date().toISOString(),
    },
  ];
  expect(compatibility(g, h).minimum.find((r) => r.name === "CPU")).toMatchObject({
    status: "pass",
    ai: true,
  });
  expect(compatibility(g, h).minimum.find((r) => r.name === "Disk")?.status).toBe("pass");
  expect(compatibility(g, { ...h, cpu: "Başka model" }).minimum[0].status).toBe(
    "unknown",
  );
  expect(
    compatibility({ ...g, minimum: { ...g.minimum, cpu: "Başka gereksinim" } }, h)
      .minimum[0].status,
  ).toBe("unknown");
  expect(compatibilityKey({ ...g, minimum: { storageGB: 7, ...g.minimum } }, h)).toBe(
    key,
  );
  const computed = { ...g, ...parsed, aiCompatibility: g.aiCompatibility };
  const row = compatibility(computed, h).minimum.find((r) => r.name === "CPU")!;
  expect(row).toMatchObject({ status: "pass", db: true });
  expect(row.ai).toBeUndefined();
  expect(row.aiEditable).toBe(false);
});
// 1.0.6 replaces the removed keyword filter's assertions with general-web search
// regression coverage in revision106.test.ts. Page relevance is the agent's job.
let s: Service, root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/105-"));
  s = new Service(root);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
});
afterEach(async () => {
  await s.call("stopResearch");
  s.close();
  await new Promise((r) => setTimeout(r, 10));
  s.store.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const idle = () =>
  vi.waitFor(() => {
    expect(s.agent.busy.size).toBe(0);
    expect((s as any).researchTask).toBeUndefined();
  });
const models = () =>
  vi.spyOn(s.lm, "models").mockResolvedValue([
    {
      id: "test",
      name: "test",
      loaded: true,
      context: null,
      tools: true,
      reasoning: [],
    },
  ]);
it("automatically queues metadata-complete games and honestly waits without a selected model", async () => {
  const id = s.store.add([{ name: "No model" }]).added[0];
  await s.queue.onItemDone!(id, new AbortController().signal);
  expect(s.store.requireGames([id])[0].research?.status).toBe("waiting_model");
  expect(s.store.state.chats).toHaveLength(0);
});
it("does not retry a disconnected model for every queued game", async () => {
  s.store.settings({ lmModel: "test" });
  const m = vi.spyOn(s.lm, "models").mockRejectedValue(new Error("offline"));
  const ids = s.store.add([{ name: "One" }, { name: "Two" }, { name: "Three" }]).added;
  for (const id of ids) await s.queue.onItemDone!(id, new AbortController().signal);
  await idle();
  expect(m).toHaveBeenCalledTimes(1);
  expect(s.store.state.games.every((g) => g.research?.status === "waiting_model")).toBe(
    true,
  );
});
it("automatically performs real agent tool mutations with separate history, no source gate, and undo", async () => {
  s.store.settings({ lmModel: "test", requireApproval: false });
  models();
  const user = s.store.createChat();
  const id = s.store.add([{ name: "Auto" }]).added[0],
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
      raw: "legacy",
      cpu: "Fixture CPU X1",
      gpu: "Fixture GPU Z9",
      ramGB: 1,
      storageGB: 7,
    },
  });
  vi.spyOn(s.providers, "search").mockResolvedValue({
    query: "fixture",
    provider: "test",
    results: [],
  });
  let step = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async (_m, _t, _sig, on) => {
    const calls = [
      ["get_game_info", { gameId: id }],
      ["web_search", { query: "Pentium 4 vs Core i5-4460" }],
      ["check_compatibility", { gameId: id }],
      [
        "record_compatibility",
        {
          gameId: id,
          contextKey: compatibilityKey(g, s.store.state.hardware),
          level: "minimum",
          component: "CPU",
          status: "pass",
          reason: "Test model comparison, not a real benchmark",
        },
      ],
      // Store data comes from the store (1.0.16): research may not change it…
      [
        "update_game_info",
        {
          gameId: id,
          patch: { year: 2003 },
        },
      ],
      // …but may save the short summary.
      [
        "update_game_info",
        {
          gameId: id,
          patch: { aiSummary: "Kısa Türkçe özet." },
        },
      ],
    ];
    const c = calls[step++];
    if (c)
      return {
        text: "",
        thinking: "",
        calls: [
          { id: "call" + step, name: c[0] as string, arguments: JSON.stringify(c[1]) },
        ],
      };
    on("text", "Araştırma tamamlandı.");
    return { text: "Araştırma tamamlandı.", thinking: "", calls: [] };
  });
  await s.queue.onItemDone!(id, new AbortController().signal);
  await idle();
  expect(g.aiCompatibility?.[0].status).toBe("pass");
  expect(g.year).toBeUndefined();
  expect(g.aiSummary).toBe("Kısa Türkçe özet.");
  const refused = s.store.state.chats
    .find((c) => c.id === g.research?.chatId)
    ?.messages.flatMap((m) => m.blocks)
    .find(
      (b: any) =>
        b.type === "tool" && b.name === "update_game_info" && b.args?.patch?.year,
    );
  expect((refused as any)?.status).toBe("error");
  expect((refused as any)?.error).toContain("mağazadan gelir");
  expect(g.research?.status).toBe("incomplete");
  expect(s.store.state.activeChatId).toBe(user.id);
  expect(s.store.state.chats.find((c) => c.id === g.research?.chatId)?.automatic).toBe(
    true,
  );
  expect(s.providers.search).toHaveBeenCalled();
  await s.call("undo");
  expect(s.store.requireGames([id])[0].aiSummary).toBeUndefined();
  expect(s.store.requireGames([id])[0].research?.status).not.toBe("running");
});
it("does not mark a prose-only model response as filled metadata", async () => {
  s.store.settings({ lmModel: "test" });
  models();
  vi.spyOn(s.lm, "stream").mockResolvedValue({
    text: "Her şeyi doldurdum.",
    thinking: "",
    calls: [],
  });
  const id = s.store.add([{ name: "Claims only" }]).added[0];
  await s.queue.onItemDone!(id, new AbortController().signal);
  await idle();
  expect(s.store.requireGames([id])[0].research?.status).toBe("incomplete");
  expect(s.store.requireGames([id])[0].minimum.cpu).toBeUndefined();
});
it("stop aborts an active automatic model stream and clears pending research", async () => {
  s.store.settings({ lmModel: "test" });
  models();
  vi.spyOn(s.lm, "stream").mockImplementation(
    async (_m, _t, signal) =>
      new Promise((_r, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      ),
  );
  const ids = s.store.add([{ name: "Active" }, { name: "Pending" }]).added;
  for (const id of ids) await s.queue.onItemDone!(id, new AbortController().signal);
  await vi.waitFor(() => expect(s.lm.stream).toHaveBeenCalledTimes(1));
  await s.call("stopResearch");
  await idle();
  expect(s.store.state.games.every((g) => g.research?.status === "cancelled")).toBe(true);
});
it("foreground chat interrupts research without hijacking user history and resumes afterwards", async () => {
  s.store.settings({ lmModel: "test", parallelRequests: false });
  models();
  const chat = s.store.createChat();
  let first = true;
  vi.spyOn(s.lm, "stream").mockImplementation(async (_m, _t, signal) => {
    if (first) {
      first = false;
      return new Promise((_r, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      );
    }
    return { text: "Tamam.", thinking: "", calls: [] };
  });
  const id = s.store.add([{ name: "Background" }]).added[0];
  await s.queue.onItemDone!(id, new AbortController().signal);
  await vi.waitFor(() => expect(s.lm.stream).toHaveBeenCalledTimes(1));
  await s.call("send", { chatId: chat.id, text: "Öncelikli sohbet" });
  await idle();
  expect(
    chat.apiHistory.some((m) => m.role === "user" && m.content?.includes("Öncelikli")),
  ).toBe(true);
  expect(s.store.state.activeChatId).toBe(chat.id);
  expect(s.store.requireGames([id])[0].research?.status).toBe("incomplete");
});
