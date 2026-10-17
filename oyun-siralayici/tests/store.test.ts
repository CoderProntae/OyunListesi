import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
let store: Store, root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/test-store-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
describe("Persistence and library mutations", () => {
  it("starts empty without invented seed games", () =>
    expect(store.state.games).toHaveLength(0));
  it("merges normalized duplicates and preserves user tags", () => {
    const a = store.add([{ name: "Portal 2" }]);
    store.edit(a.added[0], { tags: ["My tag"] });
    const b = store.add([{ name: "PORTAL 2" }]);
    expect(b.added).toHaveLength(0);
    expect(b.merged).toEqual(a.added);
    expect(store.state.games[0].tags).toEqual(["My tag"]);
  });
  it("undo restores removed game, order, and tags", () => {
    const a = store.add([{ name: "A" }, { name: "B" }, { name: "C" }]);
    store.edit(a.added[1], { tags: ["Keep me"] });
    store.remove([a.added[1]]);
    store.undo();
    expect(store.state.games.map((g) => g.name)).toEqual(["A", "B", "C"]);
    expect(store.state.games[1].tags).toEqual(["Keep me"]);
  });
  it("keeps the play list separate from custom group membership", () => {
    const a = store.add([{ name: "A" }]).added;
    const group = store.state.groups[0];
    store.moveGroup(a, group.id);
    expect(store.state.games[0].inPlayList).toBe(true);
    store.play(a, group.id);
    expect(store.state.games[0].inPlayList).toBe(true);
    expect(store.state.games[0].groupIds).toEqual([]);
  });
  it("a manual series keeps the order (2.0.6) and dissolution does not delete games", () => {
    const a = store.add([{ name: "A" }, { name: "B" }, { name: "C" }]).added;
    const s = store.series("create", { ids: [a[0], a[2]], name: "My Series" })!;
    expect(store.state.games.map((g) => g.name)).toEqual(["A", "B", "C"]);
    store.series("dissolve", { id: s.id });
    expect(store.state.games).toHaveLength(3);
    expect(store.state.games[0].autoSeries).toBe(false);
  });
  it("persists order and metadata but clears chat grants on restart", () => {
    const ids = store.add([{ name: "A" }, { name: "B" }]).added;
    store.move(ids.slice(0, 1), ids[1], true);
    const chat = store.createChat();
    chat.allowedTools = ["remove_game"];
    store.flush();
    const reopened = new Store(root);
    expect(reopened.state.games.map((g) => g.name)).toEqual(["B", "A"]);
    expect(reopened.state.chats[0].allowedTools).toEqual([]);
    reopened.close();
  });
  it("backs up before replacement and excludes API secrets", () => {
    store.add([{ name: "Before" }]);
    const backup = store.exportState();
    backup.games = [];
    store.importState(backup);
    expect(store.backups().length).toBeGreaterThan(0);
    expect(JSON.stringify(store.exportState())).not.toContain("apiKey");
  });
  it("rejects duplicate IDs, unsafe covers and malicious metadata shapes", () => {
    store.add([{ name: "A" }]);
    const snapshot = store.exportState();
    snapshot.games.push({ ...snapshot.games[0] });
    expect(() => store.validate(snapshot)).toThrow();
    snapshot.games.pop();
    (snapshot.games[0] as any).cover = "../../secret";
    expect(() => store.validate(snapshot)).toThrow();
    snapshot.games[0].cover = undefined;
    (snapshot.games[0] as any).sources = "not-an-array";
    expect(() => store.validate(snapshot)).toThrow();
    (snapshot.games[0] as any).sources = [];
    (snapshot.games[0] as any).turkish = { sources: "not-an-array" };
    (snapshot.games[0] as any).sources = "not-an-array";
    // Legacy records are still validated; removed data is not a bypass.
    expect(() => store.validate(snapshot)).toThrow();
  });
  it("rejects removed fields, non-image backgrounds and invalid setting types", () => {
    const id = store.add([{ name: "A" }]).added[0];
    expect(() =>
      store.edit(id, {
        turkish: { patch: "verified", patchUrl: "javascript:alert(1)" },
      }),
    ).toThrow("düzenlenemez");
    expect(() =>
      store.settings({ background: "https://evil.example/image.png" }),
    ).toThrow();
    expect(() => store.settings({ animations: "yes" } as any)).toThrow();
  });
  it("never resurrects a deleted game from an in-flight metadata response", () => {
    const id = store.add([{ name: "A" }]).added[0];
    store.remove([id]);
    store.metadata(id, { description: "late response" });
    expect(store.state.games).toHaveLength(0);
  });
  it("preserves a corrupted original and restores a valid backup", () => {
    store.add([{ name: "Preserved" }]);
    store.backup();
    store.flush();
    fs.writeFileSync(path.join(root, "library.json"), "broken");
    const reopened = new Store(root);
    expect(reopened.state.games[0].name).toBe("Preserved");
    expect(reopened.warning).toContain("yedek");
    expect(fs.readdirSync(root).some((n) => n.startsWith("library-corrupt-"))).toBe(true);
    reopened.close();
  });
});
