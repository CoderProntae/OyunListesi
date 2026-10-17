import type { Game } from "../shared/types";
import { describe, it, expect } from "vitest";
import {
  parseImport,
  cleanTitle,
  normalizeName,
  newGame,
  inferSeries,
  reorderBlock,
  csvExport,
  parseCSV,
  emptyHardware,
} from "../shared/domain";
import { compatibility } from "../shared/compatibility";
import { parseRequirements } from "../electron/providers";
describe("Turkish list import", () => {
  it("cleans all advertised numbering and preserves original line numbers", () => {
    const r = parseImport(
      "1. Portal\n2) Portal 2\n\n3 - Half-Life\n  • Stardew Valley\n---\n???",
    );
    expect(r.map((x) => x.name)).toEqual([
      "Portal",
      "Portal 2",
      "",
      "Half-Life",
      "Stardew Valley",
      "",
      "",
    ]);
    expect(r[3].line).toBe(4);
    expect(r[2].selected).toBe(false);
  });
  it("selects inclusive source ranges", () =>
    expect(parseImport("one\ntwo\nthree\nfour", 2, 3).map((r) => r.original)).toEqual([
      "two",
      "three",
    ]));
  it("marks normalized existing and intra-import duplicates", () => {
    const r = parseImport("Portal\nPORTAL\nİstanbul", 1, Infinity, [
      newGame("istanbul", 0),
    ]);
    expect(r.map((x) => x.duplicate)).toEqual([false, true, true]);
  });
  it("does not discard leading number in a non-numbered title", () => {
    expect(cleanTitle("1942")).toBe("1942");
    expect(newGame("007: Nightfire", 0).name).toBe("007: Nightfire");
  });
  it("round-trips quoted comma and multiline CSV game names", () => {
    const names = ["A, B", 'The "Game"', "Portal 2"];
    expect(parseCSV(csvExport(names.map((n, i) => newGame(n, i))))).toEqual(names);
  });
  it("normalizes Turkish upper I and accents deterministically", () =>
    expect(normalizeName("İSTANBUL: ÇAĞRI")).toBe("istanbul cagri"));
});
describe("Series and stable order", () => {
  it("detects Arabic and Roman sequels with base game", () => {
    const games = [
      "Portal",
      "Portal 2",
      "Civilization V",
      "Civilization VI",
      "Deus Ex",
    ].map((n, i) => newGame(n, i));
    const s = inferSeries(games, []);
    expect(s.map((x) => x.name)).toEqual(["Portal", "Civilization"]);
    expect(games[0].seriesId).toBe(games[1].seriesId);
    expect(games[4].seriesId).toBeUndefined();
  });
  it("adds future sequels to an existing automatic series", () => {
    const games = ["Portal", "Portal 2"].map((n, i) => newGame(n, i));
    const s = inferSeries(games, []);
    games.push(newGame("Portal 3", 2));
    expect(inferSeries(games, s)).toHaveLength(1);
    expect(games[2].seriesId).toBe(s[0].id);
  });
  it("respects explicitly dissolved membership", () => {
    const games = ["Portal", "Portal 2"].map((n, i) => ({
      ...newGame(n, i),
      autoSeries: false,
    }));
    expect(inferSeries(games, [])).toHaveLength(0);
  });
  it("moves a multi-game block without disturbing relative order", () => {
    const games = ["A", "B", "C", "D", "E"].map((n, i) => newGame(n, i));
    const r = reorderBlock(games, [games[1].id, games[3].id], games[4].id, true);
    expect(r.map((g) => g.name)).toEqual(["A", "C", "E", "B", "D"]);
    expect(r.map((g) => g.order)).toEqual([0, 1, 2, 3, 4]);
  });
  it("rejects unknown target; dropping on own block is no-op", () => {
    const g = [newGame("A", 0), newGame("B", 1)];
    expect(() => reorderBlock(g, [g[0].id], "bad")).toThrow();
    expect(reorderBlock(g, [g[0].id], g[0].id)).toBe(g);
  });
});
describe("Source requirements and cautious compatibility", () => {
  it("parses dotted Turkish casing and Steam starred OS label", () => {
    const r = parseRequirements(
      "<ul><li><strong>İşletim Sistemi *:</strong> Windows 10 64-bit</li><li><strong>İşlemci:</strong> Intel Core i5-12400</li><li><strong>Ekran Kartı:</strong> NVIDIA RTX 3060 8 GB VRAM</li><li><strong>Bellek:</strong> 16 GB RAM</li><li><strong>Depolama:</strong> 70 GB kullanılabilir alan</li><li><strong>DirectX:</strong> Sürüm 12</li></ul>",
    );
    expect(r.os).toBe("Windows 10 64-bit");
    expect(r.cpu).toBe("Intel Core i5-12400");
    expect(r.gpu).toContain("RTX 3060");
    expect(r.ramGB).toBe(16);
    expect(r.vramGB).toBe(8);
    expect(r.storageGB).toBe(70);
    expect(r.directX).toBe(12);
  });
  it("does not hallucinate requirements", () => {
    expect(parseRequirements("<p>No specification</p>").ramGB).toBeUndefined();
    expect(compatibility(newGame("Unknown", 0), emptyHardware).status).toBe("unknown");
  });
  const game = (): Game => ({
    ...newGame("Test", 0),
    minimum: {
      raw: "source",
      cpu: "Intel Core i5-12400",
      gpu: "NVIDIA RTX 3060",
      ramGB: 16,
      storageGB: 50,
      os: "Windows 10 64-bit",
      directX: 12,
    },
  });
  const h = {
    ...emptyHardware,
    cpu: "Intel Core i5-12400",
    gpu: "NVIDIA RTX 3060",
    ramGB: 32,
    diskFreeGB: 100,
    directX: 12,
    os: "Windows 11",
    architecture: "x64",
  };
  it("a store that publishes only minimum, met, means the requirements are met", () => {
    const c = compatibility(game(), h);
    expect(c.status).toBe("recommended");
    expect(c.label).toBe("Gereksinimleri karşılıyor");
  });
  it("marks recommended only when its checked requirements all pass", () => {
    const g = game();
    g.recommended = { ...g.minimum };
    expect(compatibility(g, h).status).toBe("recommended");
  });
  it("reports RAM/disk deficiency and suggests a reason group", () => {
    const c = compatibility(game(), { ...h, ramGB: 8, diskFreeGB: 20 });
    expect(c.status).toBe("unsupported");
    expect(c.suggestedGroups).toEqual(
      expect.arrayContaining(["Disk Yetmiyor", "RAM Yetmiyor"]),
    );
  });
  it("keeps unknown GPU and uncertain VRAM unknown", () => {
    const g = game();
    g.minimum.vramGB = 8;
    expect(
      compatibility(g, {
        ...h,
        gpu: "MysteryGPU",
        vramGB: 16,
        vramCertain: false,
      }).status,
    ).toBe("unknown");
  });
  it("does not confuse Windows family match with required version", () =>
    expect(
      compatibility(game(), { ...h, os: "Windows 7", osVersion: "6.1" }).status,
    ).toBe("unsupported"));
  it("does not infer a missing patch from unknown official support", () =>
    expect(compatibility(game(), h).suggestedGroups).not.toContain("Türkçe Yama Yok"));
});
