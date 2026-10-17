import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import { researchProgress } from "../shared/research-progress";
import { initialState } from "../shared/domain";
import { componentCompatibilityKey } from "../shared/compatibility";

let s: Service, root: string, id: string;
const final = () => ({ text: "Fixture response", thinking: "", calls: [] });
const call = (name: string, args: any) => ({
  text: "",
  thinking: "",
  calls: [{ id: "fixture-call", name, arguments: JSON.stringify(args) }],
});
const h = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Intel Core i5-4460",
  gpu: "NVIDIA GTX 1660 SUPER",
  ramGB: 8,
  diskFreeGB: 100,
  vramGB: 6,
  vramCertain: true,
};
const game = () => s.store.requireGames([id])[0];
const hardwarePatch = () => ({
  minimum: { raw: "Fixture", os: h.os, cpu: h.cpu, gpu: h.gpu, ramGB: 1, storageGB: 1 },
  recommended: { raw: "", availability: "not_published" as const },
});
const progress = () =>
  researchProgress(game(), s.store.state.hardware, s.store.state.settings.autoSummary);
async function idle() {
  await vi.waitFor(() => {
    expect(s.agent.busy.size).toBe(0);
    expect((s as any).researchTask).toBeUndefined();
    expect((s as any).manualResearch.size).toBe(0);
  });
}
function linked(stage: "hardware" | "summary" = "hardware") {
  const chat = s.store.createChat(true);
  chat.apiHistory.push({ role: "user", content: "Interrupted research fixture" });
  s.store.metadata(id, {
    research: { status: "cancelled", freshContext: false, stage, chatId: chat.id },
  });
  return chat;
}
function savedHardware() {
  s.store.metadata(id, hardwarePatch());
  expect(progress().completed.hardware).toBe(true);
}
function allSaved() {
  savedHardware();
  s.store.metadata(id, { aiSummary: "Saved summary" });
  expect(progress().complete).toBe(true);
}
// 2.1.0: a hardware stage exists only for a row the hardware data cannot
// decide; here such a row already has a saved AI answer.
function aiSaved() {
  s.store.metadata(id, {
    minimum: { raw: "Processor: Fixture CPU X1", cpu: "Fixture CPU X1" },
    recommended: { raw: "", availability: "not_published" },
    aiSummary: "Saved summary",
  });
  s.store.metadata(id, {
    aiCompatibility: [
      {
        level: "minimum",
        component: "CPU",
        status: "pass",
        reason: "AI karşılaştırması",
        contextKey: componentCompatibilityKey(
          game(),
          s.store.state.hardware,
          "minimum",
          "CPU",
        ),
        checkedAt: new Date().toISOString(),
      },
    ],
  });
  expect(progress().complete).toBe(true);
}
function captureStages() {
  const seen: string[] = [];
  vi.spyOn(s.lm, "stream").mockImplementation(async (messages: any[]) => {
    const prompts = messages.filter(
      (m) =>
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.includes("AŞAMA:"),
    );
    const stage = prompts.at(-1)?.content.match(/AŞAMA: ([^.]+)/)?.[1];
    if (stage && seen.at(-1) !== stage) seen.push(stage);
    return final();
  });
  return seen;
}
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/111-"));
  s = new Service(root);
  s.store.settings({
    autoResearch: false,
    autoSummary: true,
    lmModel: "fixture",
    requireApproval: false,
  });
  s.store.hardware(h);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  vi.spyOn(s.lm, "models").mockResolvedValue([
    {
      id: "fixture",
      name: "fixture",
      loaded: true,
      context: null,
      tools: true,
      reasoning: [],
    },
  ]);
  id = s.store.add([{ name: "Resume fixture" }]).added[0];
});
afterEach(async () => {
  s.close();
  await new Promise((r) => setTimeout(r, 10));
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it("resume skips manually saved hardware and visits only the remaining stages", async () => {
  savedHardware();
  linked();
  const seen = captureStages();
  await s.call("researchGame", { id });
  await idle();
  expect(seen).toEqual(["ÖZET"]);
  expect(game().research?.status).toBe("incomplete");
  expect(game().research?.message).not.toContain("CPU");
});
it("resume revalidates hardware instead of trusting the previous stage label", async () => {
  savedHardware();
  linked("summary");
  s.store.hardware({ cpu: "Unknown new CPU" });
  expect(progress().completed.hardware).toBe(false);
  const seen = captureStages();
  await s.call("researchGame", { id });
  await idle();
  expect(seen[0]).toBe("DONANIM");
});
it("a saved failure is a finished comparison, not an instruction to repeat the hardware test", async () => {
  savedHardware();
  s.store.hardware({ ramGB: 0.5 });
  expect(progress().completed.hardware).toBe(true);
  linked();
  const seen = captureStages();
  await s.call("researchGame", { id });
  await idle();
  expect(seen).not.toContain("DONANIM");
});
it("a completed continuation marks done without contacting the model", async () => {
  allSaved();
  linked();
  const stream = vi.spyOn(s.lm, "stream");
  expect(await s.call("researchGame", { id })).toEqual({ queued: false, complete: true });
  expect(game().research?.status).toBe("done");
  expect(stream).not.toHaveBeenCalled();
  expect(s.lm.models).not.toHaveBeenCalled();
});
it("explicit restart deliberately includes hardware even when saved results are complete", async () => {
  aiSaved();
  linked();
  const seen = captureStages();
  await s.call("researchGame", { id, restart: true });
  await idle();
  expect(seen).toEqual(["DONANIM", "ÖZET"]);
});
it("2.1.0: rows the hardware data decides need no hardware stage, not even on restart", async () => {
  allSaved();
  expect(progress().stages).toEqual(["summary"]);
  linked();
  const seen = captureStages();
  await s.call("researchGame", { id, restart: true });
  await idle();
  expect(seen).toEqual(["ÖZET"]);
});
it("a whole-library fresh pass still rechecks completed hardware", async () => {
  aiSaved();
  linked();
  const seen = captureStages();
  await s.call("researchAll");
  await idle();
  expect(seen[0]).toBe("DONANIM");
});
it("with the summary setting off, saved hardware alone completes a continuation", async () => {
  savedHardware();
  s.store.settings({ autoSummary: false });
  linked("summary");
  const seen = captureStages();
  expect(await s.call("researchGame", { id })).toEqual({ queued: false, complete: true });
  expect(seen).toEqual([]);
  expect(game().research?.status).toBe("done");
});
it("1.0.12: only hardware and summary exist as research stages", () => {
  allSaved();
  expect(Object.keys(progress().completed)).toEqual(["hardware", "summary"]);
  expect(progress().pending).toEqual([]);
  expect(progress().missing.join(" ")).not.toMatch(/HLTB|Türkçe/);
});
it("stage/checkpoint survives save and reopen; explicit stop does not auto-resume", async () => {
  savedHardware();
  const chat = linked("summary");
  s.store.flush();
  const reopened = new Store(root);
  try {
    const g = reopened.requireGames([id])[0];
    expect(g.research).toMatchObject({
      status: "cancelled",
      stage: "summary",
      chatId: chat.id,
    });
    expect(researchProgress(g, reopened.state.hardware, true).pending[0]).toBe("summary");
  } finally {
    reopened.close();
  }
  expect((s as any).researchQueue.size).toBe(0);
});
it.each(["native", "json"] as const)(
  "manual continue in %s mode saves hardware then advances without redoing it",
  async (mode) => {
    s.store.settings({ toolMode: mode });
    const chat = linked();
    let wrote = false;
    const seen: string[] = [];
    vi.spyOn(s.lm, "stream").mockImplementation(async (messages: any[]) => {
      if (mode === "json") {
        const transcript = messages.find((m) => m.role === "user").content;
        messages = JSON.parse(transcript.slice(transcript.indexOf("\n") + 1));
      }
      const stage = messages
        .filter(
          (m) =>
            m.role === "user" &&
            typeof m.content === "string" &&
            m.content.includes("AŞAMA:"),
        )
        .at(-1)
        ?.content.match(/AŞAMA: ([^.]+)/)?.[1];
      if (stage) {
        if (seen.at(-1) !== stage) seen.push(stage);
        return mode === "json"
          ? { ...final(), text: JSON.stringify({ message: "Done", tool_calls: [] }) }
          : final();
      }
      if (!wrote) {
        wrote = true;
        const args = { gameId: id, patch: hardwarePatch() };
        return mode === "json"
          ? {
              ...final(),
              text: JSON.stringify({
                message: "",
                tool_calls: [{ name: "update_game_info", arguments: args }],
              }),
            }
          : call("update_game_info", args);
      }
      return mode === "json"
        ? { ...final(), text: JSON.stringify({ message: "Done", tool_calls: [] }) }
        : final();
    });
    await s.call("send", { chatId: chat.id, text: "Devam et", mentions: [] });
    await idle();
    expect(progress().completed.hardware).toBe(true);
    expect(seen).toEqual(["ÖZET"]);
    expect(game().research?.status).toBe("incomplete");
    expect(game().research?.chatId).not.toBe(chat.id);
    expect(s.store.getChat(chat.id).messages.length).toBeGreaterThan(1);
  },
);
it("finishing the last stage manually replaces cancelled with done", async () => {
  savedHardware();
  const chat = linked("summary");
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () =>
    n++
      ? final()
      : call("update_game_info", { gameId: id, patch: { aiSummary: "Manual summary" } }),
  );
  await s.call("send", { chatId: chat.id, text: "Devam et" });
  await idle();
  expect(game().research?.status).toBe("done");
  expect(n).toBe(2);
});
it.each(["stopChat", "stopResearch"])(
  "%s stops a manual continuation and never silently restarts it",
  async (method) => {
    const chat = linked();
    let entered = false;
    vi.spyOn(s.lm, "stream").mockImplementation(
      async (_messages: any, _tools: any, signal: AbortSignal) => {
        entered = true;
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("fixture abort")), {
            once: true,
          }),
        );
        return final();
      },
    );
    await s.call("send", { chatId: chat.id, text: "Devam et" });
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(game().research?.status).toBe("running");
    await s.call(method, { chatId: chat.id });
    await idle();
    expect(game().research?.status).toBe("cancelled");
    expect((s as any).researchQueue.size).toBe(0);
    expect(s.lm.stream).toHaveBeenCalledTimes(1);
  },
);
it("manual model error keeps saved results, reports error, and does not start more stages", async () => {
  savedHardware();
  const chat = linked("summary");
  vi.spyOn(s.lm, "stream").mockRejectedValue(new Error("fixture HTTP failure"));
  await s.call("send", { chatId: chat.id, text: "Devam et" });
  await idle();
  expect(game().research?.status).toBe("error");
  expect(progress().completed.hardware).toBe(true);
  expect(s.lm.stream).toHaveBeenCalledTimes(1);
});
it("invalid follow-up does not leave a fake running status", async () => {
  savedHardware();
  const chat = linked();
  await expect(s.call("send", { chatId: chat.id, text: "" })).rejects.toThrow();
  expect(game().research?.status).toBe("cancelled");
  expect((s as any).manualResearch.size).toBe(0);
});
it("a normal unrelated chat does not resume a deliberately stopped research", async () => {
  savedHardware();
  linked();
  const chat = s.store.createChat();
  vi.spyOn(s.lm, "stream").mockResolvedValue(final());
  await s.call("send", { chatId: chat.id, text: "Devam et" });
  await idle();
  expect(game().research?.status).toBe("cancelled");
  expect(s.lm.stream).toHaveBeenCalledTimes(1);
});
it("interrupted automatic hardware work can be manually finished while preserving its old conversation", async () => {
  // 2.0.4: the hardware stage exists only for store-published requirements.
  s.store.metadata(id, {
    minimum: { raw: "Processor: Fixture CPU X1", cpu: "Fixture CPU X1" },
    recommended: { raw: "", availability: "not_published" },
  });
  expect(progress().completed.hardware).toBe(false);
  let hung = false;
  vi.spyOn(s.lm, "stream").mockImplementation(
    async (_m: any, _t: any, signal: AbortSignal) => {
      hung = true;
      await new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new Error("thinking interrupted")),
          { once: true },
        ),
      );
      return final();
    },
  );
  await s.call("researchGame", { id });
  await vi.waitFor(() => expect(hung).toBe(true));
  const chatId = game().research!.chatId!;
  await s.call("stopChat", { chatId });
  await idle();
  expect(game().research?.stage).toBe("hardware");
  let wrote = false;
  const seen: string[] = [];
  vi.mocked(s.lm.stream).mockImplementation(async (messages: any[]) => {
    const lastUser = messages.filter((m) => m.role === "user").at(-1)?.content || "";
    const stage = lastUser.match(/AŞAMA: ([^.]+)/)?.[1];
    if (stage) {
      if (seen.at(-1) !== stage) seen.push(stage);
      return final();
    }
    if (!wrote) {
      wrote = true;
      return call("record_compatibility", {
        gameId: id,
        level: "minimum",
        component: "CPU",
        status: "pass",
        reason: "Fixture comparison",
        contextKey: componentCompatibilityKey(
          game(),
          s.store.state.hardware,
          "minimum",
          "CPU",
        ),
      });
    }
    return final();
  });
  await s.call("send", { chatId, text: "Devam et" });
  await idle();
  expect(progress().completed.hardware).toBe(true);
  expect(seen).not.toContain("DONANIM");
  expect(seen[0]).toBe("ÖZET");
  expect(
    s.store
      .getChat(chatId)
      .messages.some((m) =>
        m.blocks.some((b) => b.type === "notice" && b.text.includes("durduruldu")),
      ),
  ).toBe(true);
});

it("a duplicate send cannot erase the in-flight research tracking", async () => {
  const chat = linked();
  vi.spyOn(s.lm, "stream").mockImplementation(
    async (_m: any, _t: any, signal: AbortSignal) => {
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("stopped")), {
          once: true,
        }),
      );
      return final();
    },
  );
  await s.call("send", { chatId: chat.id, text: "Devam et" });
  await expect(s.call("send", { chatId: chat.id, text: "Devam et" })).rejects.toThrow();
  expect((s as any).manualResearch.has(chat.id)).toBe(true);
  await s.call("stopChat", { chatId: chat.id });
  await idle();
  expect(game().research?.status).toBe("cancelled");
});
it("explicitly asking not to continue does not restart the remaining pipeline", async () => {
  const chat = linked();
  let n = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async () =>
    n++ ? final() : call("update_game_info", { gameId: id, patch: hardwarePatch() }),
  );
  await s.call("send", {
    chatId: chat.id,
    text: "Donanımı kaydet ama sonraki aşamalara devam etme.",
  });
  await idle();
  expect(progress().completed.hardware).toBe(true);
  expect(game().research?.status).toBe("incomplete");
  expect(n).toBe(2);
  expect(game().research?.chatId).toBe(chat.id);
});
