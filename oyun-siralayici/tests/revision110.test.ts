import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import { parseRequirements } from "../electron/requirements";
import { researchStage, researchStages } from "../electron/research-plan";
import { agentPolicy } from "../electron/agent-policy";
import { nativeTools, toolSpecs } from "../electron/tools";
import { csvExport, initialState, newGame } from "../shared/domain";
import { assessGame } from "../shared/analysis";
import { compatibility, componentCompatibilityKey } from "../shared/compatibility";

const suppliedRaw =
  "OS: Microsoft Windows 2000/XP; CPU: 450MHz AMD/Intel işlemci; RAM: 96 MB (128 MB önerilen); Grafik: 16MB Direct3D uyumlu ekran kartı; Depolama: 830 MB HDD (tam kurulum), 530 MB minimum.";
const h = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 16,
};
let s: Service, root: string, id: string, chat: any, message: any;
beforeEach(() => {
  root = fs.mkdtempSync(path.resolve(".cache/110-"));
  s = new Service(root);
  s.store.settings({
    lmModel: "fixture",
    autoResearch: false,
    autoSummary: false,
    requireApproval: false,
  });
  s.store.hardware(h);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  id = s.store.add([{ name: "Max Payne" }]).added[0];
  chat = s.store.createChat();
  message = {
    id: "message",
    role: "assistant",
    createdAt: new Date().toISOString(),
    blocks: [],
  };
  chat.messages.push(message);
});
afterEach(async () => {
  s.close();
  await new Promise((r) => setTimeout(r, 5));
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const game = () => s.store.requireGames([id])[0];
const execute = (name: string, args: any) =>
  (s.agent as any).execute(chat, message, name, args, new AbortController().signal);
const patch = (value: any) => execute("update_game_info", { gameId: id, patch: value });
const call = (name: string, args: any) => ({
  text: "",
  thinking: "",
  calls: [{ id: "call-" + Math.random(), name, arguments: JSON.stringify(args) }],
});
const final = () => ({ text: "Tamamlandı, sorunsuz açılır!", thinking: "", calls: [] });
const idle = () => vi.waitFor(() => expect(s.agent.busy.size).toBe(0));
function completeFixture() {
  s.store.metadata(id, {
    minimum: {
      raw: "Fixture",
      os: "Windows 10",
      cpu: h.cpu,
      gpu: h.gpu,
      ramGB: 1,
      storageGB: 1,
    },
    recommended: { raw: "", availability: "not_published" },
  });
}

it("removes personal notes from new games, actual validator and native tool schemas", () => {
  expect(game()).not.toHaveProperty("note");
  expect(
    toolSpecs.edit_game.schema.safeParse({
      gameId: id,
      patch: { note: "hidden workaround" },
    }).success,
  ).toBe(false);
  expect(toolSpecs.edit_game.properties.patch.properties.note).toBeUndefined();
  expect(toolSpecs.update_game_info.properties.patch.properties.note).toBeUndefined();
  expect(csvExport([game()]).split("\r\n")[0]).not.toContain('"Not"');
});
it("rejects note writes in both agent and direct desktop routes, atomically", async () => {
  expect(
    (
      await execute("edit_game", {
        gameId: id,
        patch: { note: "hidden", status: "playing" },
      })
    ).error,
  ).toBeTruthy();
  expect(game().status).toBe("planned");
  await expect(s.call("edit", { id, patch: { note: "hidden" } })).rejects.toThrow();
  expect(game()).not.toHaveProperty("note");
});
it("legacy import/reopen/export removes active note data, preserves other user fields and repairs missing GPU", () => {
  const state: any = initialState();
  state.settings.autoResearch = false;
  state.games = [
    {
      ...game(),
      note: "Removed old personal note",
      tags: ["Keep"],
      rating: 7,
      minimum: {
        raw: suppliedRaw,
        cpu: "450MHz AMD/Intel işlemci",
        ramGB: 96 / 1024,
        storageGB: 830 / 1024,
      },
    },
  ];
  s.store.importState(state);
  s.store.flush();
  const reopened = new Store(root);
  try {
    const g = reopened.state.games[0];
    expect(g).not.toHaveProperty("note");
    expect(g.tags).toEqual(["Keep"]);
    expect(g.rating).toBe(7);
    expect(g.minimum.gpu).toBe("16MB Direct3D uyumlu ekran kartı");
    expect(g.minimum.vramGB).toBe(16 / 1024);
    expect(reopened.exportState().games[0]).not.toHaveProperty("note");
  } finally {
    reopened.close();
  }
});
it("table labels and values, decimal MB/GB and Turkish CPU/OS are parsed", () => {
  expect(
    parseRequirements(
      "<table><tr><td>İşlemci</td><td>Old CPU</td></tr><tr><td>Grafik</td><td>16 MB GPU</td></tr><tr><td>Bellek</td><td>1,5 GB</td></tr></table>",
    ),
  ).toMatchObject({ cpu: "Old CPU", gpu: "16 MB GPU", ramGB: 1.5, vramGB: 16 / 1024 });
});
it("legacy repair never overwrites explicit CPU values or restores deliberately cleared fields", () => {
  const state = s.store.exportState();
  state.games[0].minimum = {
    raw: suppliedRaw,
    cpu: "Explicit CPU",
    unpublished: ["gpu"],
  };
  const parsed = s.store.validate(state).games[0];
  expect(parsed.minimum.cpu).toBe("Explicit CPU");
  expect(parsed.minimum.gpu).toBeUndefined();
});
it("game, hardware, list and edit results are immutable historical snapshots", async () => {
  const before = await execute("get_game_info", { gameId: id }),
    hardware = await execute("get_hardware", {}),
    list = await execute("get_list_state", {});
  const original = JSON.stringify(before),
    originalH = JSON.stringify(hardware),
    originalList = JSON.stringify(list);
  const edited = await execute("edit_game", { gameId: id, patch: { tags: ["First"] } });
  await patch({ minimum: { raw: suppliedRaw } });
  s.store.hardware({ cpu: "Changed CPU" });
  s.store.group("create", { name: "New", color: "#123456", icon: "folder" });
  await execute("edit_game", { gameId: id, patch: { tags: ["Second"] } });
  expect(JSON.stringify(before)).toBe(original);
  expect(JSON.stringify(hardware)).toBe(originalH);
  expect(JSON.stringify(list)).toBe(originalList);
  expect(edited.tags).toEqual(["First"]);
  expect(message.blocks[0].result.minimum.raw).toBe("");
  s.store.flush();
  const reopened = new Store(root);
  try {
    expect(reopened.state.chats[0].messages[0].blocks[0]).toMatchObject({
      type: "tool",
      result: { minimum: { raw: "" } },
    });
  } finally {
    reopened.close();
  }
});
it("tool input snapshot is not changed by later caller mutation", async () => {
  const args = { gameId: id, patch: { tags: ["Before"] } };
  await execute("edit_game", args);
  args.patch.tags[0] = "After";
  expect(message.blocks[0].args.patch.tags).toEqual(["Before"]);
});
// 1.0.16: requirements are the store's text. A component the store does not
// list has no row; a comparison for it is refused and the repair points to
// check_compatibility instead of asking the model to write a requirement.
it("a comparison for a component the store does not list is refused without inventing one", async () => {
  const r = await execute("record_compatibility", {
    gameId: id,
    level: "minimum",
    component: "GPU",
    status: "pass",
    reason: "Fixture",
    contextKey: componentCompatibilityKey(game(), h, "minimum", "GPU"),
  });
  expect(r.error).toContain("bulunamadı");
  expect(r.repair).toMatchObject({ tool: "check_compatibility" });
  expect(JSON.stringify(r.repair)).not.toContain("update_game_info");
  expect(game().aiCompatibility).toBeUndefined();
});
it("already computed RAM pass is idempotent, conflicting manual RAM result is still rejected", async () => {
  completeFixture();
  const args = {
    gameId: id,
    level: "minimum",
    component: "RAM",
    status: "pass",
    reason: "Fixture",
    contextKey: componentCompatibilityKey(game(), h, "minimum", "RAM"),
  };
  expect(await execute("record_compatibility", args)).toMatchObject({
    ok: true,
    alreadyComputed: true,
    saved: false,
  });
  expect(
    (await execute("record_compatibility", { ...args, status: "fail" })).error,
  ).toBeTruthy();
  expect(game().aiCompatibility).toBeUndefined();
});
it("a level with only some components shows only those; nothing is reported missing", async () => {
  completeFixture();
  s.store.metadata(id, { recommended: { raw: "", ramGB: 0.125 } });
  const a = assessGame(game(), h);
  expect(a).not.toHaveProperty("missingFields");
  expect(compatibility(game(), h).recommended.map((r) => r.name)).toEqual(["RAM"]);
  expect(a.complete).toBe(true);
});
it("without a recommended level the check is complete and still not a launch promise", () => {
  completeFixture();
  const a = assessGame(game(), h);
  expect(a.complete).toBe(true);
  expect(a.status).toBe("complete");
  expect(compatibility(game(), h).recommended).toEqual([]);
  expect(a.summary).toContain("açılışı test edilmedi");
});
it("a game without any store requirements is not specified and needs no research", () => {
  const a = assessGame(game(), h);
  expect(a.complete).toBe(true);
  expect(a.status).toBe("none");
  expect(a.summary).toContain("belirtilmemiş");
  expect(compatibility(game(), h).summary).toContain("belirtilmemiş");
});
it("each automatic stage is short, has no device dump, and shared policy supplies workflow", () => {
  for (const stage of researchStages(true)) {
    const prompt = researchStage(game(), h, stage).prompt;
    expect(prompt.length).toBeLessThan(350);
    expect(prompt).not.toContain(h.cpu);
    expect(prompt).not.toContain(h.gpu);
    expect(prompt).not.toContain("contextKey");
    expect(prompt).not.toContain("kişisel not");
  }
  chat.apiHistory.push({ role: "user", content: "Araştır" });
  const system = (s.agent as any).context(chat, false).messages[0].content;
  expect(system).toContain(agentPolicy);
  expect(system).toContain("get_hardware");
  expect(nativeTools.some((t) => t.function.name === "get_hardware")).toBe(true);
});
it("a premature done response with no progress is not endlessly retried or accepted as complete", async () => {
  s.store.metadata(id, {
    minimum: { raw: "Fixture", cpu: "Fixture CPU X1", gpu: "Fixture GPU Z9", ramGB: 1 },
  });
  const model = vi.spyOn(s.lm, "stream").mockResolvedValue(final());
  await s.agent.send(chat.id, "Çalışır mı kontrol et.", [id]);
  await idle();
  expect(model).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(model.mock.calls[1][0])).toContain("UYGULAMA DENETİMİ");
  expect(assessGame(game(), h).complete).toBe(false);
  expect(chat.messages.at(-1).blocks.at(-1).text).toContain("Karşılaştırma bekleyen");
});
it("identical invalid comparison on unchanged data stops a no-progress loop, not valid tool rounds", async () => {
  const args = {
    gameId: id,
    level: "minimum",
    component: "GPU",
    status: "pass",
    reason: "Fixture",
    contextKey: componentCompatibilityKey(game(), h, "minimum", "GPU"),
  };
  const model = vi
    .spyOn(s.lm, "stream")
    .mockImplementation(async () => call("record_compatibility", args));
  await s.agent.send(chat.id, "Uyumluluğu kontrol et.", [id]);
  await idle();
  expect(model).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(chat.messages)).toContain("İlerlemesiz döngü durduruldu");
  expect(game().aiCompatibility).toBeUndefined();
});
it("automatic research cannot mutate personal/library fields or another game even if model asks", async () => {
  const other = s.store.add([{ name: "Other" }]).added[0];
  (s.agent as any).researchChats.set(chat.id, id);
  expect(
    (await execute("edit_game", { gameId: id, patch: { status: "finished" } })).error,
  ).toContain("yalnız hedef");
  expect(
    (await execute("update_game_info", { gameId: other, patch: { year: 2001 } })).error,
  ).toContain("yalnız hedef");
  expect(game().status).toBe("planned");
  expect(s.store.requireGames([other])[0].year).toBeUndefined();
  expect(
    (s.agent as any)
      .availableTools(chat)
      .some((t: any) => t.function.name === "edit_game"),
  ).toBe(false);
  (s.agent as any).researchChats.delete(chat.id);
});

it("a component the store does not publish has no row and cannot receive an AI tick", async () => {
  completeFixture();
  await patch({
    recommended: { ramGB: 0.125, unpublished: ["cpu", "gpu", "storageGB", "os"] },
  });
  expect(
    compatibility(game(), h).recommended.find((r) => r.name === "CPU"),
  ).toBeUndefined();
  expect(assessGame(game(), h).complete).toBe(true);
  const r = await execute("record_compatibility", {
    gameId: id,
    level: "recommended",
    component: "CPU",
    status: "pass",
    reason: "Wrong fixture",
    contextKey: componentCompatibilityKey(game(), h, "recommended", "CPU"),
  });
  expect(r.error).toBeTruthy();
});
