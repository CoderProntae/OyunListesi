import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { backupLabel, formatNumber, plainText } from "../shared/format";
import { compatibility } from "../shared/compatibility";
import { emptyHardware, newGame } from "../shared/domain";

// 1.0.14: data-side fixes behind interface bugs found in the UI review.
let store: Store, root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/test-114-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Oynama Listesi is the single main list", () => {
  it("removing games from a collection keeps their status (finished stays finished)", () => {
    const [a, b] = store.add([{ name: "A" }, { name: "B" }]).added;
    const group = store.state.groups[0];
    store.edit(a, { status: "finished" });
    store.edit(b, { status: "dropped" });
    store.moveGroup([a, b], group.id);
    store.play([a, b], group.id);
    const [ga, gb] = store.requireGames([a, b]);
    expect(ga.status).toBe("finished");
    expect(gb.status).toBe("dropped");
    expect(ga.groupIds).toEqual([]);
    expect(ga.inPlayList && gb.inPlayList).toBe(true);
    store.undo();
    expect(store.requireGames([a])[0].groupIds).toEqual([group.id]);
  });
  it("'remove from the list' is refused with a clear reason instead of a fake success", () => {
    const [a] = store.add([{ name: "A" }]).added;
    expect(() => store.edit(a, { inPlayList: false })).toThrow(
      /Oynama Listesinde tutulur/,
    );
    expect(store.requireGames([a])[0].inPlayList).toBe(true);
    expect(() => store.edit(a, { inPlayList: true })).not.toThrow();
  });
});

describe("Turkish number format", () => {
  it("uses comma decimals and dot thousands", () => {
    expect(formatNumber(2887.5, 1, false)).toBe("2.887,5");
    expect(formatNumber(120, 1, false)).toBe("120");
    expect(formatNumber(8, 1)).toBe("8,0");
    expect(formatNumber(1.234, 1)).toBe("1,2");
  });
  it("hardware comparison values are written the Turkish way", () => {
    const g = newGame("RAM test", 0);
    g.minimum = { raw: "8 GB", ramGB: 12, availability: "published" };
    const h = { ...emptyHardware, ramGB: 7.5 };
    const ram = compatibility(g, h).minimum.find((c) => c.name === "RAM");
    // 1.0.15: no forced ",0" (8 GB); decimals still use a comma.
    expect(ram?.actual).toBe("7,5 GB");
    expect(ram?.reason).toContain("4,5 GB eksik");
  });
});

describe("Readable texts", () => {
  it("the hover preview shows an AI summary as plain text, not raw Markdown", () => {
    expect(
      plainText(
        "## Neden oyna?\n\n- **Atmosfer:** çok güçlü\n\n| A | B |\n|---|---|\n| x | y |\n\n[Mağaza](https://example.com) `kod`",
      ),
    ).toBe("Neden oyna? Atmosfer: çok güçlü A B x y Mağaza kod");
  });
  it("backups are listed by local date; the pre-update backup is named as such", () => {
    const plain = backupLabel("library-2026-10-16T03-27-53-291Z.json");
    expect(plain.title).toMatch(/2026/);
    expect(plain.title).not.toContain("library-");
    expect(plain.note).toBe("");
    expect(
      backupLabel("library-2026-10-15T20-00-00-000Z-yukseltme-oncesi.json").note,
    ).toBe("Güncelleme öncesi yedeği");
    expect(backupLabel("başka-dosya.json").title).toBe("başka-dosya.json");
  });
});
