// 2.1.5 — stage 7: hardware names a store writes differently than the
// benchmark list, and PCGamingWiki names a user types by hand.
import { describe, expect, it } from "vitest";
import { compareCpu, compareGpu, findCpus, findGpus } from "../shared/hardware-match";
import { pcgwNames } from "../electron/pcgamingwiki";
import { initialState } from "../shared/domain";
import type { Hardware } from "../shared/types";

// The user's computer: i5-4460 / GTX 1660 SUPER 6 GB / Windows 10.
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
const names = (list: { name: string }[]) => list.map((e) => e.name);

describe("2.1.5 · a whole card generation: 'GeForce 600 series'", () => {
  it("is not read as the PCI board whose model number is 600", () => {
    expect(names(findGpus("GeForce 600 series"))).toEqual(["GeForce 600 serisi"]);
    const v = compareGpu("GeForce 600 series", pc);
    expect(v.reason).not.toContain("600 PCI");
    // The generation's weakest desktop card is the floor, and it is named.
    expect(v.status).toBe("pass");
    expect(v.estimated).toBe(true);
    expect(v.reason).toContain("GeForce GT 610");
    expect(v.reason).toContain("serisinin en zayıf masaüstü kartı");
  });

  it("two generations in one line: both are read, the user's brand decides", () => {
    const found = findGpus("NVIDIA GeForce 600 series or AMD Radeon HD 7000 series");
    expect(names(found)).toEqual(["GeForce 600 serisi", "Radeon HD 7000 serisi"]);
    const v = compareGpu("NVIDIA GeForce 600 series or AMD Radeon HD 7000 series", pc);
    expect(v.status).toBe("pass");
    expect(v.reason).toContain("GeForce 600 serisi");
  });

  it("an APU's graphics are not the floor of a card generation", () => {
    // "Radeon HD 7290" is an APU's integrated part (no memory of its own).
    const v = compareGpu("Radeon HD 7000 series", pc);
    expect(v.status).toBe("pass");
    expect(v.reason).not.toContain("HD 7290");
    expect(v.reason).toContain("Radeon HD 7350");
  });

  it("a model number still wins over the generation reading", () => {
    expect(names(findGpus("GeForce GTX 660"))).toEqual(["GeForce GTX 660"]);
    expect(names(findGpus("Radeon R7 260X series"))).toEqual(["Radeon R7 260X"]);
    expect(compareGpu("GeForce GTX 660", pc).estimated).toBeUndefined();
  });

  it("sizes and resolutions are still not cards", () => {
    expect(findGpus("256 MB video memory")).toEqual([]);
    expect(findGpus("1280 x 1024")).toEqual([]);
  });
});

describe("2.1.5 · 'Athlon II X4 760K' (the list writes 'Athlon X4 760K')", () => {
  it("finds the processor itself instead of guessing from the family", () => {
    expect(names(findCpus("Athlon II X4 760K"))).toEqual([
      "AMD Athlon X4 760K Quad Core",
    ]);
    const v = compareCpu("Athlon II X4 760K", pc, 2013);
    expect(v.status).toBe("pass");
    expect(v.estimated).toBeUndefined();
    expect(v.reason).toContain("AMD Athlon X4 760K Quad Core");
    expect(v.reason).not.toContain("559");
  });

  it("both sides of an 'or' are found", () => {
    expect(names(findCpus("AMD Athlon II X4 760K or Intel Core i5-2500"))).toEqual([
      "AMD Athlon X4 760K Quad Core",
      "Intel Core i5-2500",
    ]);
  });

  it("a real 'Athlon II X4' model is unchanged", () => {
    expect(names(findCpus("Athlon II X4 640"))).toEqual(["AMD Athlon II X4 640"]);
  });
});

describe("2.1.5 · 'i7 4700' — the list only has the suffixed models", () => {
  it("compares with the family and says which chip it used", () => {
    for (const text of ["Intel Core i7 4700", "i7 4700"]) {
      const found = findCpus(text);
      expect(names(found)).toEqual(["Intel Core i7-4700MQ"]);
      const v = compareCpu(text, pc, 2013);
      expect(v.status).toBe("pass");
      expect(v.estimated).toBe(true);
      expect(v.reason).toContain('Gereksinimde "Core i7 4700" yazıyor');
      expect(v.reason).toContain("Intel Core i7-4700MQ");
    }
  });

  it("another laptop number: i5 8250 → i5-8250U", () => {
    expect(names(findCpus("Intel Core i5 8250"))).toEqual(["Intel Core i5-8250U"]);
  });

  it("the exact name stays exact, and a family alone still needs a year", () => {
    const exact = compareCpu("Intel Core i7-4700MQ", pc, 2013);
    expect(exact.estimated).toBeUndefined();
    expect(exact.reason).not.toContain("Gereksinimde");
    expect(compareCpu("Intel Core i7", pc).status).toBe("unknown");
  });

  it("a modern requirement still fails honestly", () => {
    const v = compareCpu("Ryzen 5 2600", pc, 2018);
    expect(v.status).toBe("fail");
    expect(v.reason).toContain("AMD Ryzen 5 2600");
  });
});

describe("2.1.5 · a game typed by hand still finds its PCGamingWiki page", () => {
  it("drops a year or edition in brackets, and a trailing 'GOTY Edition'", () => {
    expect(pcgwNames("Unreal Gold (1998)")).toEqual([
      "Unreal Gold (1998)",
      "Unreal Gold",
    ]);
    expect(pcgwNames("Gothic II (Gold Edition)")).toEqual([
      "Gothic II (Gold Edition)",
      "Gothic II",
    ]);
    expect(pcgwNames("unreal gold goty")).toEqual(["unreal gold goty", "unreal gold"]);
  });

  it("never drops the words that tell one release from another", () => {
    expect(pcgwNames("Age of Empires II HD Edition")).toEqual([
      "Age of Empires II HD Edition",
      "Age of Empires II HD",
    ]);
    expect(pcgwNames("Half-Life 2")).toEqual(["Half-Life 2"]);
  });
});

// ---- the comparison engine under adversarial store text ----------------------
import { compatibility, withRawFields } from "../shared/compatibility";
import { newGame } from "../shared/domain";
import type { Game } from "../shared/types";

const weird = [
  "",
  " ",
  "-",
  "64",
  "32",
  "0",
  "999999999999",
  "NaN",
  "undefined",
  "null",
  "{}",
  "[]",
  "TBD",
  "Any",
  "—",
  "Intel",
  "AMD or Intel",
  "DirectX",
  "Version 11",
  "2 GB",
  "2 GB RAM",
  "GeForce",
  "GeForce 6",
  "GeForce 60",
  "GeForce 600",
  "GeForce 6000 series",
  "GeForce 600000 series",
  "Radeon HD 7000 series or better",
  "NVIDIA® GeForce® GTX 660 2GB",
  "Intel Core i7 4700",
  "Intel Core i7-4700",
  "i7",
  "i7 4",
  "i7 47",
  "i7 47000",
  "Athlon II X4 760K",
  "Athlon",
  "Athlon II",
  "Quad-core Intel or AMD processor, 2.5 GHz or faster",
  "1.2 GHz",
  "1280 x 1024",
  "1024x768",
  "Windows XP/Vista/7/8/10",
  "Windows",
  "64-bit processor and operating system",
  "Shader Model 5.0",
  "Vulkan 1.1",
  "OpenGL 3.3",
  "512 MB VRAM",
  "Integrated graphics are not supported",
  "3D",
  "Sound card",
  "Mouse and keyboard",
  "İşlemci: 2,4 GHz çift çekirdek",
  "Ekran kartı: GeForce 600 serisi",
  "بلا",
  "Minimum: 1 GHz / Recommended: 2 GHz",
  "\u{1F3AE}",
  "a".repeat(400),
  "1".repeat(400),
];
const game = (minimum: string, recommended: string): Game =>
  ({
    ...newGame("Deneme", 0),
    year: 2012,
    minimum: withRawFields({ raw: minimum }),
    recommended: withRawFields({ raw: recommended }),
  }) as unknown as Game;
// A store line the parser read as a component ("Processor: 64").
const labelled = (field: "cpu" | "gpu", text: string): Game =>
  ({
    ...newGame("Deneme", 0),
    year: 2012,
    minimum: { raw: "", [field]: text },
    recommended: { raw: "" },
  }) as unknown as Game;

describe("2.1.5 · the comparison engine never breaks on unreadable text", () => {
  it("answers for every weird requirement line, in Turkish, with no internals", () => {
    for (const text of weird) {
      for (const [a, b] of [
        [text, ""],
        ["", text],
        [text, text],
      ] as [string, string][]) {
        const c = compatibility(game(a, b), pc);
        expect(["recommended", "minimum", "unknown", "unsupported"]).toContain(c.status);
        const shown = [
          c.summary,
          c.label,
          ...[...c.minimum, ...c.recommended].flatMap((row) => [
            row.name,
            row.actual,
            row.required,
            row.reason,
          ]),
        ].join(" | ");
        expect(shown, `satır: ${JSON.stringify(text)}`).not.toMatch(
          /undefined|NaN|\[object|too_small|Expected|Invalid|\{/,
        );
        for (const row of [...c.minimum, ...c.recommended])
          expect(["pass", "fail", "unknown"], row.name).toContain(row.status);
      }
    }
  });
  it('a bare "64" is a bit-width, never a benchmark score', () => {
    const c = compatibility(labelled("cpu", "64"), pc);
    const row = c.minimum.find((r) => r.name === "CPU");
    expect(row?.status).toBe("pass");
    expect(row?.reason).toContain("64 bit");
    expect(row?.reason).not.toContain("PassMark");
  });
  it("a series requirement is compared, not sent away as unreadable", () => {
    const c = compatibility(labelled("gpu", "GeForce 600 series"), pc);
    const row = c.minimum.find((r) => r.name === "GPU");
    expect(row?.status).toBe("pass");
    expect(row?.reason).toContain("GeForce 600 serisi");
  });
});
