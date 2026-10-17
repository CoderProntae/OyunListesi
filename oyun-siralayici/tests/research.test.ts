import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import {
  personalPatch,
  researchArgs,
  preserveResearchFields,
} from "../electron/research";
import { gameSchema } from "../electron/validation";
import { legacySystemPrompt } from "../shared/domain";
let service: Service, root: string, id: string, chat: any, message: any;
const url = "https://example.org/game",
  quote = "Minimum requirements: CPU Pentium III, 256 MB RAM.";
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/research-"));
  service = new Service(root);
  id = service.store.add([{ name: "Test game" }]).added[0];
  chat = service.store.createChat();
  message = {
    id: "reply",
    role: "assistant",
    createdAt: new Date().toISOString(),
    blocks: [],
  };
  chat.messages.push(message);
  vi.spyOn(service.queue, "add").mockImplementation(() => {});
  vi.spyOn(service.providers, "page").mockResolvedValue({
    url,
    title: "Requirements",
    text: quote,
    retrievedAt: "2026-10-15T00:00:00Z",
    notice: "Page data",
  });
});
afterEach(() => {
  service.close();
  service.store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const args = () => ({
  gameId: id,
  patch: { developers: ["Remedy"], genres: ["Aksiyon"] },
  evidence: [{ url, quote, fields: ["developers", "genres"] }],
});
const execute = (name: string, a: any) =>
  (service.agent as any).execute(chat, message, name, a, new AbortController().signal);
const approve = async (decision = "allow") => {
  await vi.waitFor(() => expect(service.agent.permissions.size).toBe(1));
  const req = [...service.agent.permissions.values()][0].request;
  service.agent.answerPermission(req.id, decision);
  return req;
};
describe("1.0.3 autonomous library operations and optional references", () => {
  it("is autonomous by default and edits without approval, fetch, citation or reference", async () => {
    expect(service.store.state.settings.requireApproval).toBe(false);
    const r = await execute("update_game_info", {
      gameId: id,
      patch: { year: 2001, developers: ["Remedy"] },
    });
    expect(r.ok).toBe(true);
    expect(service.agent.permissions.size).toBe(0);
    expect(service.providers.page).not.toHaveBeenCalled();
    expect(service.store.state.games[0].year).toBe(2001);
    expect(service.store.state.games[0].aiEditedFields).toContain("developers");
    expect(service.store.state.games[0].sources).toEqual([]);
  });
  it("accepts a source URL alone without fetching it or demanding a quote", async () => {
    const r = await execute("update_game_info", {
      gameId: id,
      patch: { year: 2001 },
      sources: [{ url }],
    });
    expect(r.ok).toBe(true);
    expect(service.store.state.games[0].sources[0].url).toBe(url);
    expect(service.store.state.games[0].sources[0].quote).toBeUndefined();
  });
  it("accepts optional old evidence without enforcing quote matching or per-field proof", async () => {
    await execute("fetch_page", { url });
    const a = args();
    a.evidence[0].quote = "A note, not a verbatim quotation.";
    a.evidence[0].fields = ["developers"];
    expect((await execute("update_game_info", a)).ok).toBe(true);
    expect(service.store.state.games[0].genres).toEqual(["Aksiyon"]);
  });
  it("ignores unrelated reference-field hints instead of rejecting a valid edit", async () => {
    const a = args();
    a.evidence[0].fields = ["unrelated"];
    expect((await execute("update_game_info", a)).ok).toBe(true);
    expect(service.store.state.games[0].sources[0].fields).toContain("developers");
  });
  it("records provided source notes and actual fetched timestamp when available", async () => {
    await execute("fetch_page", { url });
    await execute("update_game_info", args());
    const g = service.store.state.games[0];
    expect(g.sources[0].checkedAt).toBe("2026-10-15T00:00:00Z");
    expect(gameSchema.parse(g).sources[0].quote).toBe(quote);
    expect(g.developers).toEqual(["Remedy"]);
  });
  it("autonomous metadata changes can be undone, including fields with no source", async () => {
    await execute("update_game_info", {
      gameId: id,
      patch: { developers: ["New Dev"], year: 2001 },
    });
    service.store.undo();
    expect(service.store.state.games[0].developers).not.toEqual(["New Dev"]);
    expect(service.store.state.games[0].aiEditedFields).toBeUndefined();
  });
  it("optional confirmation mode still previews, waits and supports denial", async () => {
    service.store.settings({ requireApproval: true });
    const before = structuredClone(service.store.state.games[0]);
    const pending = execute("update_game_info", { gameId: id, patch: { year: 2001 } });
    const req = await approve("deny");
    expect(req.description).toContain("year: bilinmiyor → 2001");
    expect((await pending).denied).toBe(true);
    expect(service.store.state.games[0]).toEqual(before);
  });
  it("optional confirmation can accept a URL-only reference without a quote", async () => {
    service.store.settings({ requireApproval: true });
    const p = execute("update_game_info", {
      gameId: id,
      patch: { year: 2001 },
      sources: [{ url }],
    });
    await approve();
    expect((await p).ok).toBe(true);
  });
  it("tags/status edit immediately and can be undone", async () => {
    await execute("edit_game", {
      gameId: id,
      patch: { tags: ["My tag"], status: "playing" },
    });
    expect(service.agent.permissions.size).toBe(0);
    expect(service.store.state.games[0].tags).toEqual(["My tag"]);
    service.store.undo();
    expect(service.store.state.games[0].tags).toEqual([]);
  });
  it("add, reorder, group, play list and delete all run without modal permissions", async () => {
    const add = await execute("add_game", { name: "Other game" }),
      other = add.added[0];
    await execute("reorder", { ids: [other], targetId: id, after: false });
    expect(service.store.state.games[0].id).toBe(other);
    const group = service.store.state.groups[0];
    await execute("move_to_group", { ids: [id], groupId: group.id });
    await execute("add_to_play_list", { ids: [id] });
    expect(service.store.requireGames([id])[0].inPlayList).toBe(true);
    const r = await execute("remove_game", { ids: [other] });
    expect(r.removed).toBe(1);
    expect(service.agent.permissions.size).toBe(0);
    service.store.undo();
    expect(service.store.requireGames([other])).toHaveLength(1);
  });
  it("autonomy overrides an old askReadTools setting; user questions remain available", async () => {
    service.store.settings({ askReadTools: true });
    const r = await execute("list_games", {});
    expect(r.total).toBe(1);
    expect(service.agent.permissions.size).toBe(0);
  });
  it("can write summaries, store links, artwork URLs and app ID without proof gate", async () => {
    const r = await execute("update_game_info", {
      gameId: id,
      patch: {
        appId: 123,
        aiSummary: "Modelin özeti",
        stores: [{ name: "Store", url, verified: true }],
        screenshots: [url + "/image.jpg"],
        trailer: url + "/video.mp4",
      },
    });
    expect(r.ok).toBe(true);
    const g = service.store.state.games[0];
    expect(g.aiSummary).toBe("Modelin özeti");
    expect(g.appId).toBe(123);
    expect(g.stores[0].url).toBe(url);
  });
  it("Steam refresh is callable by the agent without approval and has undo checkpoint", async () => {
    const enrich = vi.spyOn(service.providers, "enrich").mockImplementation(async () => {
      service.store.metadata(id, { year: 2001 });
      return { cached: false, game: service.store.requireGames([id])[0] };
    });
    const r = await execute("refresh_game_info", { gameId: id });
    expect(r.error).toBeUndefined();
    expect(enrich).toHaveBeenCalled();
    expect(service.agent.permissions.size).toBe(0);
    service.store.undo();
    expect(service.store.state.games[0].year).toBeUndefined();
  });
  it("Steam background data does not overwrite source-free AI edits", async () => {
    await execute("update_game_info", {
      gameId: id,
      patch: { developers: ["Model Dev"], year: 2001 },
    });
    const g = service.store.state.games[0];
    const p = preserveResearchFields(g, { year: 2002, developers: ["Steam Dev"] });
    expect(p.year).toBe(2001);
    expect(p.developers).toEqual(["Model Dev"]);
  });
  it("autonomous edits and mode survive save/reload", async () => {
    await execute("update_game_info", { gameId: id, patch: { year: 2001 } });
    service.store.flush();
    const loaded = new Store(root);
    expect(loaded.state.settings.requireApproval).toBe(false);
    expect(loaded.state.games[0].aiEditedFields).toContain("year");
    loaded.close();
  });
  it("migrates only the exact old built-in prompt, preserving user custom instructions", () => {
    const old = { ...service.store.state.settings, systemPrompt: legacySystemPrompt };
    delete (old as any).requireApproval;
    const parsed = service.store.cleanSettings(old);
    expect(parsed.requireApproval).toBe(false);
    expect(parsed.systemPrompt).not.toContain("izin sonucunu bekle");
    expect(
      service.store.cleanSettings({ ...old, systemPrompt: "MY CUSTOM PROMPT" })
        .systemPrompt,
    ).toBe("MY CUSTOM PROMPT");
  });
  it("still enforces database field types and rejects executable URL schemes", () => {
    for (const patch of [
      { id: "replace" },
      { settings: { lmUrl: "x" } },
      { minimum: { ramGB: -1 } },
      { turkish: { patchUrl: "javascript:alert(1)" } },
      { turkish: { patch: "verified" } },
      { hltb: { main: -1 } },
      {},
    ])
      expect(() => researchArgs.parse({ gameId: id, patch })).toThrow();
    expect(() => personalPatch.parse({ minimum: { cpu: "x" } })).toThrow();
  });
  it("imported field hints cannot introduce prototype keys", () => {
    const g = service.store.state.games[0];
    g.aiEditedFields = [
      "__proto__",
      "constructor.prototype",
      "settings",
      "minimum.command",
    ];
    expect(preserveResearchFields(g, { year: 2001 })).toEqual({ year: 2001 });
  });
  it("page caches remain separate per chat; edits no longer depend on cache authority", async () => {
    await execute("fetch_page", { url });
    const other = service.store.createChat();
    expect((service.agent as any).evidence.has(other.id)).toBe(false);
    const r = await (service.agent as any).execute(
      other,
      message,
      "update_game_info",
      { gameId: id, patch: { year: 2001 } },
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);
  });
});
