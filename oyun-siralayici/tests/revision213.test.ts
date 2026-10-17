import { describe, expect, it } from "vitest";
import { initialState, newGame } from "../shared/domain";
import { compatibility } from "../shared/compatibility";
import { assessGame } from "../shared/analysis";
import type { Game, Hardware } from "../shared/types";
// 2.1.3: the user's own Karşılıyor / Karşılamıyor / Bilinmiyor mark for a game
// without published requirements has to reach every place a computed result
// does (library dot, sorting, statistics, assessment) — not only one text.
const pc: Hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  architecture: "x64",
  cpu: "Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz",
  cores: 4,
  threads: 4,
  clockGHz: 3.2,
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  vramGB: 6,
  vramCertain: true,
  ramGB: 8,
  diskFreeGB: 200,
  directX: 12.1,
};
const bare = (verdict?: Game["reqVerdict"]): Game => {
  const g = newGame("Bendy and the Ink Machine", 1) as Game & {
    reqVerdict?: Game["reqVerdict"];
  };
  if (verdict) g.reqVerdict = verdict;
  return g;
};
describe("user verdict for games without requirements", () => {
  it("Karşılıyor becomes the green result", () => {
    const c = compatibility(bare("meets"), pc);
    expect(c.status).toBe("recommended");
    expect(c.userVerdict).toBe("meets");
    expect(c.label).toBe("Karşılıyor (senin kararın)");
    expect(c.summary).toContain("sen işaretledin");
    expect(c.minimum).toEqual([]);
    expect(c.recommended).toEqual([]);
  });
  it("Karşılamıyor becomes the red result, without an invented component", () => {
    const c = compatibility(bare("fails"), pc);
    expect(c.status).toBe("unsupported");
    expect(c.userVerdict).toBe("fails");
    expect(c.label).toBe("Karşılamıyor (senin kararın)");
    expect(c.suggestedGroups).toEqual([]);
  });
  it("Bilinmiyor stays a question; no mark says the requirement is missing", () => {
    const unknown = compatibility(bare("unknown"), pc);
    expect(unknown.status).toBe("unknown");
    expect(unknown.label).toBe("Bilinmiyor (senin kararın)");
    const none = compatibility(bare(), pc);
    expect(none.status).toBe("unknown");
    expect(none.userVerdict).toBeUndefined();
    expect(none.label).toBe("Gereksinim belirtilmemiş");
    expect(none.summary).toContain("belirtilmemiş");
  });
  it("never overrides a real comparison", () => {
    const g = { ...bare("meets"), minimum: { raw: "", ramGB: 32 } };
    const c = compatibility(g, pc);
    expect(c.status).toBe("unsupported");
    expect(c.userVerdict).toBeUndefined();
    expect(c.label).toBe("Gereksinim eksik");
  });
  it("the assessment text follows the mark", () => {
    expect(assessGame(bare("meets"), pc).summary).toContain("sen işaretledin");
    expect(assessGame(bare("fails"), pc).summary).toContain("karşılamadığını");
    expect(assessGame(bare(), pc).summary).toContain("belirtilmemiş");
    expect(assessGame(bare("meets"), pc).comparisonStatus).toBe("recommended");
  });
});
