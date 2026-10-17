import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service, methods } from "../electron/service";
import { Store } from "../electron/store";
import { nativeTools, toolSpecs } from "../electron/tools";
import { agentPolicy } from "../electron/agent-policy";
import { researchStage, researchStages } from "../electron/research-plan";
import { researchProgress } from "../shared/research-progress";
import { csvExport, initialState, newGame, NOTE_MAX_LENGTH } from "../shared/domain";

// 1.0.12: the Türkçe tab, the official language/HLTB research stage and Turkish
// patch features are removed (HowLongToBeat times themselves stay, see 1.0.13);
// a UI-only personal note is added that the agent can never read or write.
const MARK = "GIZLI-NOT-7f3a9c";
let s: Service, root: string, id: string, chat: any, message: any;
const hardware = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Intel Core i5-4460",
  gpu: "NVIDIA GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 100,
};
const savedRequirements = {
  minimum: {
    raw: "Fixture",
    os: hardware.os,
    cpu: hardware.cpu,
    gpu: hardware.gpu,
    ramGB: 1,
    storageGB: 1,
  },
  recommended: { raw: "", availability: "not_published" as const },
};
const game = () => s.store.requireGames([id])[0];
const final = () => ({ text: "Tamam.", thinking: "", calls: [] });
const call = (name: string, args: any) => ({
  text: "",
  thinking: "",
  calls: [{ id: "c-" + Math.random(), name, arguments: JSON.stringify(args) }],
});
const execute = (name: string, args: any) =>
  (s.agent as any).execute(chat, message, name, args, new AbortController().signal);
const models = () =>
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
async function idle(service = s) {
  await vi.waitFor(() => {
    expect(service.agent.busy.size).toBe(0);
    expect((service as any).researchTask).toBeUndefined();
    expect((service as any).manualResearch.size).toBe(0);
  });
}
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/112-"));
  s = new Service(root);
  s.store.settings({
    lmModel: "fixture",
    autoResearch: false,
    autoSummary: true,
    requireApproval: false,
    toolMode: "native",
  });
  s.store.hardware(hardware);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  id = s.store.add([{ name: "Not fixture" }]).added[0];
  chat = s.store.createChat();
  message = {
    id: "m",
    role: "assistant",
    createdAt: new Date().toISOString(),
    blocks: [],
  };
  chat.messages.push(message);
});
afterEach(async () => {
  await s.call("stopResearch");
  s.close();
  await new Promise((r) => setTimeout(r, 10));
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- removal
it("no agent tool, schema, description or shared policy offers Turkish features", () => {
  expect(Object.keys(toolSpecs)).not.toContain("check_turkish_patch");
  expect(Object.keys(toolSpecs)).toHaveLength(26);
  expect(JSON.stringify(nativeTools) + agentPolicy).not.toMatch(
    /turkish|türkçe yama|yama/i,
  );
  // HowLongToBeat stays a normal data field, but the shared policy never asks for it.
  expect(agentPolicy).not.toMatch(/hltb|howlongtobeat/i);
  expect(methods).not.toContain("patchSearch" as any);
});
it("automatic research has only DONANIM and optional ÖZET stages", () => {
  expect(researchStages(true)).toEqual(["hardware", "summary"]);
  expect(researchStages(false)).toEqual(["hardware"]);
  const prompts = researchStages(true)
    .map((stage) => researchStage(game(), hardware, stage).prompt)
    .join("\n");
  expect(prompts).toContain("AŞAMA: DONANIM");
  expect(prompts).toContain("AŞAMA: ÖZET");
  expect(prompts).not.toMatch(/DİL VE SÜRE|TÜRKÇE YAMA|HLTB|yama/i);
});
it("the removed desktop call is rejected and agent writes of removed fields fail atomically", async () => {
  await expect(s.call("patchSearch", { id })).rejects.toThrow("Bilinmeyen");
  for (const patch of [
    { turkish: { patch: "verified" } },
    { year: 2001, turkish: { official: true } },
  ]) {
    const r = await execute("update_game_info", { gameId: id, patch });
    expect(r.error).toBeTruthy();
  }
  expect(game().year).toBeUndefined();
  expect(game()).not.toHaveProperty("turkish");
  // HowLongToBeat durations remain an ordinary field.
  expect(
    (await execute("update_game_info", { gameId: id, patch: { hltb: { main: 9 } } })).ok,
  ).toBe(true);
  expect(game().hltb).toMatchObject({ status: "found", main: 9 });
});
it("a finished hardware stage plus summary is complete without any language or HLTB data", () => {
  s.store.metadata(id, { ...savedRequirements, aiSummary: "Özet" });
  const p = researchProgress(game(), s.store.state.hardware, true);
  expect(p.complete).toBe(true);
  expect(p.missing).toEqual([]);
});
it("a continuation with nothing left creates no empty research chat and makes no model call", async () => {
  s.store.metadata(id, {
    ...savedRequirements,
    aiSummary: "Özet",
    research: { status: "queued", freshContext: false },
  });
  const stream = vi.spyOn(s.lm, "stream").mockResolvedValue(final());
  const before = s.store.state.chats.length;
  await s.agent.research(id, new AbortController().signal);
  expect(s.store.state.chats).toHaveLength(before);
  expect(stream).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------- upgrade
function legacyLibrary() {
  const state: any = initialState();
  state.settings.autoResearch = false;
  state.settings.autoSummary = true;
  state.settings.lmModel = "";
  state.hardware = hardware;
  delete state.notes;
  const turkishGroup = {
    id: "tr-group",
    name: "Türkçe Yama Yok",
    color: "#d3b478",
    icon: "language",
  };
  state.groups.push(turkishGroup);
  const legacy = (name: string, i: number, extra: any) => ({
    ...newGame(name, i),
    patchSearchRevision: 106,
    tags: ["Etiket korunmalı"],
    rating: 8,
    turkish: {
      official: false,
      interface: false,
      audio: false,
      subtitles: false,
      patch: "none",
      patchNote: "Eski yama notu",
      sources: [
        { title: "Yama", url: "https://patch.example/", checkedAt: "2026-10-01" },
      ],
    },
    hltb: { status: "found", main: 12, checkedAt: "2026-10-01" },
    ...extra,
  });
  state.games = [
    legacy("Bitti sayılmalı", 0, {
      ...savedRequirements,
      aiSummary: "Özet",
      aiEditedFields: ["aiSummary", "turkish.patch", "hltb.main"],
      sources: [
        {
          title: "Steam Store",
          url: "https://store.steampowered.com/app/1/",
          checkedAt: "x",
          kind: "official",
        },
        {
          title: "HowLongToBeat",
          url: "https://hltbapi.codepotatoes.de/hltb/1",
          checkedAt: "x",
          kind: "community",
          fields: ["hltb"],
        },
        {
          title: "Karma",
          url: "https://mixed.example/",
          checkedAt: "x",
          kind: "agent",
          fields: ["minimum.cpu", "turkish.patch"],
        },
      ],
      research: {
        status: "incomplete",
        stage: "patch",
        message: "Kalan: HLTB, Türkçe yama",
      },
    }),
    legacy("Dil aşamasında durdu", 1, {
      research: {
        status: "cancelled",
        stage: "details",
        message: "Araştırma durduruldu.",
      },
    }),
    legacy("Donanımda durdu", 2, {
      research: {
        status: "cancelled",
        stage: "hardware",
        message: "Araştırma durduruldu.",
      },
    }),
    legacy("Grupta", 3, { groupIds: [] }),
  ];
  return state;
}
it("upgrading a 1.0.11 library drops Turkish data once, keeps times and user data, re-queues nothing", async () => {
  const raw = legacyLibrary();
  fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(raw));
  fs.writeFileSync(
    path.join(root, "backups", "library-2026-01-01T00-00-00-000Z.json"),
    JSON.stringify(raw),
  );
  const old = new Service(root);
  try {
    const games = old.store.state.games;
    expect(games).toHaveLength(4);
    for (const g of games) {
      expect(g).not.toHaveProperty("turkish");
      expect(g.hltb).toMatchObject({ status: "found", main: 12 });
      expect(g).not.toHaveProperty("patchSearchRevision");
      expect(g.tags).toEqual(["Etiket korunmalı"]);
      expect(g.rating).toBe(8);
    }
    const [done, details, hardwareStop] = games;
    expect(done.research).toMatchObject({
      status: "done",
      message: "Araştırma sonuçları kaydedildi.",
    });
    expect(done.research?.stage).toBeUndefined();
    expect(done.aiEditedFields).toEqual(["aiSummary", "hltb.main"]);
    expect(done.sources.map((x) => x.title)).toEqual([
      "Steam Store",
      "HowLongToBeat",
      "Karma",
    ]);
    expect(done.sources[1].fields).toEqual(["hltb"]);
    expect(done.sources[2].fields).toEqual(["minimum.cpu"]);
    expect(details.research?.status).toBe("incomplete");
    expect(details.research?.message).not.toMatch(/HLTB|Türkçe/);
    expect(hardwareStop.research).toMatchObject({
      status: "cancelled",
      stage: "hardware",
    });
    expect(old.store.state.groups.some((x) => x.name === "Türkçe Yama Yok")).toBe(false);
    expect(old.store.state.notes).toEqual({});
    await new Promise((r) => setTimeout(r, 20));
    expect((old as any).researchQueue.size).toBe(0);
    const disk = fs.readFileSync(path.join(root, "library.json"), "utf8");
    expect(disk).not.toMatch(/"turkish"|patchSearchRevision/);
    expect(disk).toContain('"hltb"');
    // The untouched original is kept as a restorable backup; older backups stay as they were.
    const before = old.store
      .backups()
      .find((b) => b.name.endsWith("-yukseltme-oncesi.json"));
    expect(before).toBeTruthy();
    expect(
      JSON.parse(fs.readFileSync(path.join(root, "backups", before!.name), "utf8")),
    ).toEqual(raw);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "backups", "library-2026-01-01T00-00-00-000Z.json"),
          "utf8",
        ),
      ),
    ).toEqual(raw);
  } finally {
    await old.call("stopResearch");
    old.close();
  }
  // One-time: reopening a migrated file does not create another pre-upgrade copy.
  const count = fs
    .readdirSync(path.join(root, "backups"))
    .filter((n) => n.endsWith("-yukseltme-oncesi.json")).length;
  const again = new Store(root);
  again.close();
  expect(
    fs
      .readdirSync(path.join(root, "backups"))
      .filter((n) => n.endsWith("-yukseltme-oncesi.json")),
  ).toHaveLength(count);
});
it("a legacy record without optional lists still loads with defaults", () => {
  const raw = legacyLibrary();
  delete raw.games[0].sources;
  delete raw.games[0].aiEditedFields;
  delete raw.games[1].tags;
  const state = s.store.validate(raw);
  expect(state.games[0].sources).toEqual([]);
  expect(state.games[0].aiEditedFields).toBeUndefined();
  expect(state.games[1].tags).toEqual([]);
  expect(state.games[0]).not.toHaveProperty("turkish");
});
it("a non-empty legacy Türkçe Yama Yok group is the user's and stays", () => {
  const raw = legacyLibrary();
  raw.games[3].groupIds = ["tr-group"];
  const state = s.store.validate(raw);
  expect(state.groups.some((x) => x.id === "tr-group")).toBe(true);
  expect(state.games[3].groupIds).toEqual(["tr-group"]);
});
it("an interrupted legacy job whose remaining work was only removed stages finishes without a model call or empty chat", async () => {
  const raw = legacyLibrary();
  raw.settings.lmModel = "fixture";
  raw.games = [
    {
      ...raw.games[0],
      research: { status: "running", stage: "patch", freshContext: false },
    },
  ];
  fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(raw));
  const old = new Service(root);
  vi.spyOn(old.queue, "add").mockImplementation(() => {});
  vi.spyOn(old.lm, "models").mockResolvedValue([
    {
      id: "fixture",
      name: "fixture",
      loaded: true,
      context: null,
      tools: true,
      reasoning: [],
    },
  ]);
  const stream = vi.spyOn(old.lm, "stream").mockResolvedValue(final());
  try {
    await vi.waitFor(() =>
      expect(old.store.state.games[0].research?.status).toBe("done"),
    );
    await idle(old);
    expect(stream).not.toHaveBeenCalled();
    expect(old.store.state.chats).toHaveLength(0);
  } finally {
    old.close();
  }
});

// ---------------------------------------------------------------- notes
it("a note is stored outside the game record, survives reopen and is part of the JSON backup", () => {
  const r = s.store.setNote(id, "Bölüm 3'te kaldım. " + MARK);
  expect(r.note?.text).toContain(MARK);
  expect(s.store.state.notes[id].text).toContain(MARK);
  expect(JSON.stringify(game())).not.toContain(MARK);
  s.store.flush();
  const reopened = new Store(root);
  try {
    expect(reopened.state.notes[id].text).toContain(MARK);
    expect(reopened.exportState().notes[id].text).toContain(MARK);
    expect(JSON.stringify(reopened.state.games)).not.toContain(MARK);
  } finally {
    reopened.close();
  }
  expect(csvExport(s.store.state.games)).not.toContain(MARK);
});
it("the desktop note call validates input and clears whitespace-only notes", async () => {
  const emitted: any[] = [];
  s.on("event", (e) => emitted.push(e));
  await s.call("note", { id, text: "İlk not " + MARK });
  expect(
    emitted.some(
      (e) => e.type === "note" && e.data.id === id && e.data.note.text.includes(MARK),
    ),
  ).toBe(true);
  await expect(
    s.call("note", { id, text: "x".repeat(NOTE_MAX_LENGTH + 1) }),
  ).rejects.toThrow("karakter");
  await expect(s.call("note", { id: "missing", text: "x" })).rejects.toThrow();
  await expect(s.call("note", { id, text: 42 })).rejects.toThrow();
  expect(s.store.state.notes[id].text).toContain(MARK);
  await s.call("note", { id, text: "   \n " });
  expect(s.store.state.notes).not.toHaveProperty(id);
});
it("undo never reverts a note, and removing then undoing a game keeps its note", async () => {
  const other = s.store.add([{ name: "Diğer" }]).added[0];
  s.store.move([other], id);
  s.store.setNote(id, "Undo öncesi değil, sonrası " + MARK);
  s.store.undo();
  expect(s.store.state.notes[id].text).toContain(MARK);
  s.store.remove([id]);
  expect(s.store.state.notes[id].text).toContain(MARK);
  s.store.undo();
  expect(game().name).toBe("Not fixture");
  expect(s.store.state.notes[id].text).toContain(MARK);
});
it("notes of games removed in an earlier session are not carried forward or exported", () => {
  s.store.setNote(id, MARK);
  s.store.remove([id]);
  expect(s.store.exportState().notes).toEqual({});
  s.store.flush();
  const reopened = new Store(root);
  try {
    expect(reopened.state.notes).toEqual({});
  } finally {
    reopened.close();
  }
});
it("restoring an older backup without notes keeps current notes; a newer backup's notes win", () => {
  s.store.setNote(id, "Güncel not");
  const legacy: any = s.store.exportState();
  delete legacy.notes;
  s.store.importState(legacy);
  expect(s.store.state.notes[id].text).toBe("Güncel not");
  const newer = s.store.exportState();
  newer.notes[id] = { text: "Yedekteki not", updatedAt: "2026-10-15T10:00:00.000Z" };
  s.store.importState(newer);
  expect(s.store.state.notes[id].text).toBe("Yedekteki not");
});
it("a damaged note entry is dropped without making the library unreadable", () => {
  const raw: any = s.store.exportState();
  raw.notes = {
    [id]: { text: 12, updatedAt: "x" },
    unknown: { text: "Bilinmeyen oyun", updatedAt: "x" },
  };
  const state = s.store.validate(raw);
  expect(state.notes).toEqual({});
  expect(state.games).toHaveLength(1);
});
it("no agent tool output contains the note and the agent cannot write it", async () => {
  s.store.setNote(id, MARK);
  s.store.metadata(id, { ...savedRequirements, genres: ["Aksiyon"] });
  const other = s.store.add([{ name: "Benzer" }]).added[0];
  s.store.metadata(other, { genres: ["Aksiyon"] });
  const outputs = [
    await execute("get_game_info", { gameId: id }),
    await execute("list_games", {}),
    await execute("get_list_state", {}),
    await execute("get_hardware", {}),
    await execute("check_compatibility", { gameId: id }),
    await execute("recommend_similar", { gameId: other }),
    await execute("update_game_info", { gameId: id, patch: { year: 2004 } }),
    await execute("edit_game", { gameId: id, patch: { tags: ["Etiket"] } }),
  ];
  for (const output of outputs) {
    expect(output.error).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain(MARK);
  }
  for (const patch of [
    { note: "AI notu" },
    { notes: "AI notu" },
    { userNote: "AI notu" },
  ]) {
    expect((await execute("edit_game", { gameId: id, patch })).error).toBeTruthy();
    expect((await execute("update_game_info", { gameId: id, patch })).error).toBeTruthy();
  }
  expect(s.store.state.notes[id].text).toBe(MARK);
  expect(JSON.stringify(nativeTools)).not.toMatch(/"note"|"notes"|userNote/);
});
it("chat and automatic research requests sent to the model never include the note", async () => {
  s.store.setNote(id, "Model bunu görmemeli: " + MARK);
  models();
  const bodies: string[] = [];
  let step = 0;
  vi.spyOn(s.lm, "stream").mockImplementation(async (messages: any[], tools: any) => {
    bodies.push(JSON.stringify({ messages, tools }));
    const n = step++;
    if (n === 0) return call("get_game_info", { gameId: id });
    if (n === 1) return call("list_games", {});
    return final();
  });
  const user = s.store.createChat();
  await s.call("send", {
    chatId: user.id,
    text: "Bu oyun hakkında ne biliyorsun?",
    mentions: [id],
  });
  await idle();
  step = 0;
  // 2.0.4: the hardware stage runs only for store-published requirements;
  // 2.1.0: and only for a row the hardware data cannot decide.
  s.store.metadata(id, {
    minimum: { raw: "Processor: Fixture CPU X1", cpu: "Fixture CPU X1", ramGB: 4 },
  });
  await s.call("researchGame", { id, restart: true });
  await idle();
  expect(bodies.length).toBeGreaterThan(3);
  expect(bodies.some((b) => b.includes("AŞAMA: DONANIM"))).toBe(true);
  for (const body of bodies) expect(body).not.toContain(MARK);
  // Tool cards shown in chats are frozen snapshots; they do not contain the note either.
  expect(JSON.stringify(s.store.state.chats)).not.toContain(MARK);
});
