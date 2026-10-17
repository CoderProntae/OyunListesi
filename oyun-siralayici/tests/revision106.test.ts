import { afterEach, beforeEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service, methods } from "../electron/service";
import { initialState, newGame } from "../shared/domain";
import type { AppState } from "../shared/types";
it("desktop preload permits exactly the service methods, including research controls", () => {
  const source = fs.readFileSync(path.resolve("electron/preload.ts"), "utf8");
  const list = source.split("const allowed = new Set([")[1]?.split("]);")[0];
  expect(list).toBeTruthy();
  const allowed = [...list.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
  expect(allowed.sort()).toEqual([...methods].sort());
});
let root: string;
const services: Service[] = [];
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/106-"));
});
afterEach(async () => {
  for (const s of services) {
    await s.call("stopResearch");
    s.close();
  }
  await new Promise((r) => setTimeout(r, 10));
  for (const s of services) s.store.close();
  services.length = 0;
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function service(state?: AppState) {
  if (state) fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
  const s = new Service(root);
  services.push(s);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  return s;
}
const idle = (s: Service) =>
  vi.waitFor(() => {
    expect(s.agent.busy.size).toBe(0);
    expect((s as any).researchTask).toBeUndefined();
  });
function model(s: Service) {
  s.store.settings({ lmModel: "test", requireApproval: false });
  vi.spyOn(s.lm, "models").mockResolvedValue([
    { id: "test", name: "test", loaded: true, context: null, tools: true, reasoning: [] },
  ]);
}
function library() {
  const state = initialState();
  state.settings.autoResearch = false;
  state.settings.autoSummary = false;
  state.games = ["Max Payne", "Portal 2", "Finished game"].map((n, i) => ({
    ...newGame(n, i),
    research: { status: "done" as const },
    tags: ["Etiket korunmalı"],
  }));
  state.games[2].status = "finished";
  return state;
}
it("a stopped full research stays stopped after reopening", async () => {
  // 2.0.8: only a research with results still missing stays "stopped" (here
  // the summary); one with everything saved counts as done.
  const lib = library();
  lib.settings.autoSummary = true;
  const s = service(lib);
  await s.call("researchAll");
  await vi.waitFor(() =>
    expect(s.store.state.games[0].research?.status).toBe("waiting_model"),
  );
  await s.call("stopResearch");
  s.close();
  const next = service();
  await new Promise((r) => setTimeout(r, 20));
  expect(next.store.state.games.every((g) => g.research?.status === "cancelled")).toBe(
    true,
  );
  expect((next as any).researchQueue.size).toBe(0);
});
it("pending full-research tasks survive reopening with automation off, without another backup", async () => {
  // 2.1.0: a research that needs no model call finishes at once; the summary
  // stage keeps these waiting for a model.
  const lib = library();
  lib.settings.autoSummary = true;
  const s = service(lib);
  await s.call("researchAll");
  await vi.waitFor(() =>
    expect(s.store.state.games[0].research?.status).toBe("waiting_model"),
  );
  s.close();
  const next = service();
  // Store construction has its normal startup backup; resuming queued tasks
  // must not create another one or replace them.
  const migrationBackup = vi.spyOn(next.store, "backup");
  await vi.waitFor(() => expect((next as any).researchQueue.size).toBe(3));
  expect(migrationBackup).not.toHaveBeenCalled();
  expect(
    next.store.state.games.every((g) => g.research?.status === "waiting_model"),
  ).toBe(true);
});
it("an interrupted job resumes while an explicitly stopped job stays stopped", async () => {
  const state = initialState();
  state.settings.autoResearch = false;
  const running = newGame("Interrupted", 0),
    stopped = newGame("Stopped", 1);
  running.research = { status: "running", freshContext: false };
  stopped.research = { status: "cancelled" };
  state.games = [running, stopped];
  const s = service(state);
  await vi.waitFor(() =>
    expect(s.store.state.games[0].research?.status).toBe("waiting_model"),
  );
  expect(s.store.state.games[1].research?.status).toBe("cancelled");
  expect((s as any).researchQueue.size).toBe(1);
});
it("new games are not prematurely researched at startup before metadata completion", async () => {
  const s = service();
  s.store.add([{ name: "New" }]);
  await new Promise((r) => setTimeout(r, 10));
  expect(s.store.state.games[0].research).toBeUndefined();
  expect(s.store.state.games[0]).not.toHaveProperty("patchSearchRevision");
});
it("researchAll explicitly includes finished and done games with fresh context", async () => {
  const state = initialState();
  state.games = ["A", "B"].map((n, i) => ({
    ...newGame(n, i),
    status: "finished" as const,
    research: { status: "done" as const },
  }));
  const s = service(state);
  expect(await s.call("researchAll")).toEqual({ queued: 2 });
  expect(
    s.store.state.games.every(
      (g) => g.research?.freshContext && g.research?.status === "waiting_model",
    ),
  ).toBe(true);
  expect(s.store.backups().length).toBeGreaterThan(0);
});
it("new research uses fresh context while retaining old research and active user chats", async () => {
  const s = service();
  const id = s.store.add([{ name: "History" }]).added[0];
  // 2.0.4: the hardware stage runs only for store-published requirements;
  // 2.1.0: and only for a row the hardware data cannot decide.
  s.store.hardware({ cpu: "Intel Core i5-4460" });
  s.store.metadata(id, {
    minimum: { raw: "Processor: Fixture CPU X1", cpu: "Fixture CPU X1", ramGB: 4 },
  });
  const old = s.store.createChat(true);
  old.messages.push({
    id: "old-message",
    role: "assistant",
    createdAt: new Date().toISOString(),
    blocks: [{ id: "old-block", type: "text", text: "Eski sonuç" }],
  });
  old.apiHistory.push({ role: "user", content: "Eski dar arama" });
  const user = s.store.createChat();
  s.store.metadata(id, { research: { status: "done", chatId: old.id } });
  model(s);
  const stream = vi
    .spyOn(s.lm, "stream")
    .mockResolvedValue({ text: "Sonuç kaydedilmedi.", thinking: "", calls: [] });
  await s.call("researchAll");
  await idle(s);
  const g = s.store.requireGames([id])[0];
  expect(g.research?.chatId).not.toBe(old.id);
  expect(
    s.store.state.chats.find((c) => c.id === old.id)?.messages[0].blocks[0],
  ).toMatchObject({ text: "Eski sonuç" });
  expect(s.store.state.activeChatId).toBe(user.id);
  expect(JSON.stringify(stream.mock.calls[0][0])).not.toContain("Eski dar arama");
  expect(JSON.stringify(stream.mock.calls[0][0])).toContain("AŞAMA: DONANIM");
  expect(JSON.stringify(stream.mock.calls.at(-1)![0])).toContain("AŞAMA: ÖZET");
  expect(JSON.stringify(stream.mock.calls.map((c) => c[0]))).not.toMatch(
    /TÜRKÇE YAMA|DİL VE SÜRE|HLTB/,
  );
  expect(g.research?.status).toBe("incomplete");
});
it("bulk enqueue and stop do not publish per-game IPC storms", async () => {
  const state = initialState();
  state.games = Array.from({ length: 1500 }, (_, i) => newGame("Game " + i, i));
  const s = service(state);
  const emit = vi.spyOn(s.store, "emit");
  await s.call("researchAll");
  expect((s as any).researchQueue.size).toBe(1500);
  expect(emit.mock.calls.filter(([event]) => event === "game")).toHaveLength(0);
  await s.call("stopResearch");
  expect(s.store.state.games.every((g) => g.research?.status === "cancelled")).toBe(true);
  expect(emit.mock.calls.filter(([event]) => event === "game")).toHaveLength(0);
});
it("researchAll accepts an empty library without making a fake job", async () => {
  const s = service();
  expect(await s.call("researchAll")).toEqual({ queued: 0 });
  expect(s.store.state.chats).toHaveLength(0);
});
