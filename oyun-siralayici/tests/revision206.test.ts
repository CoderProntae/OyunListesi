import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/store";

// 2.0.6: a series never changes the order of the list. A game the user put
// between two members ("ara oyun") stays there; gathering is a separate choice.
let root: string, store: Store;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "oyun-206-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const names = () =>
  [...store.state.games].sort((a, b) => a.order - b.order).map((g) => g.name);
describe("series keep the order", () => {
  it("create / add / edit never move a game; gather does, and undo brings it back", () => {
    const [a1, a2, x, a4, y] = store.add([
      { name: "Seri 1" },
      { name: "Seri 2" },
      { name: "ARA OYUN" },
      { name: "Seri 4" },
      { name: "Başka oyun" },
    ]).added;
    const order = ["Seri 1", "Seri 2", "ARA OYUN", "Seri 4", "Başka oyun"];
    const s = store.series("create", { ids: [a1, a2], name: "Seri" })!;
    expect(names()).toEqual(order);
    // Adding the last game to the same series: it stays after the ara oyun.
    store.series("add", { id: s.id, ids: [a4] });
    expect(names()).toEqual(order);
    expect(store.state.games.filter((g) => g.seriesId === s.id)).toHaveLength(3);
    store.series("update", { id: s.id, ids: [a1, a2, a4], name: "Seri adı" });
    expect(names()).toEqual(order);
    expect(store.requireGames([x])[0].seriesId).toBeUndefined();
    // "Oyunları yan yana topla": members at the first one's place.
    store.series("gather", { id: s.id });
    expect(names()).toEqual(["Seri 1", "Seri 2", "Seri 4", "ARA OYUN", "Başka oyun"]);
    expect(store.state.games.map((g) => g.order)).toEqual([0, 1, 2, 3, 4]);
    store.undo();
    expect(names()).toEqual(order);
    expect(store.requireGames([y])[0].seriesId).toBeUndefined();
  });
  it("a game taken from another series does not move either", () => {
    const [h1, p, h2, q] = store.add([
      { name: "Half-Life" },
      { name: "Portal" },
      { name: "Half-Life 2" },
      { name: "Quake" },
    ]).added;
    const auto = store.state.series.find((x) => x.automatic)!;
    expect(store.requireGames([h1, h2]).every((g) => g.seriesId === auto.id)).toBe(true);
    store.series("create", { ids: [h2, q], name: "Seçtiklerim" });
    expect(names()).toEqual(["Half-Life", "Portal", "Half-Life 2", "Quake"]);
    expect(store.requireGames([p])[0].seriesId).toBeUndefined();
  });
});
