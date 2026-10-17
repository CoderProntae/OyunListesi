import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  compareCpu,
  compareGpu,
  cpuIsa,
  findCpus,
  findGpus,
  hardwareDataInfo,
} from "../shared/hardware-match";
import { compatibility } from "../shared/compatibility";
import { researchProgress } from "../shared/research-progress";
import { initialState, newGame } from "../shared/domain";
import { Store } from "../electron/store";
import type { Game, Hardware } from "../shared/types";

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

describe("hardware data", () => {
  it("ships thousands of processors and cards with a date", () => {
    expect(hardwareDataInfo.cpus).toBeGreaterThan(3000);
    expect(hardwareDataInfo.gpus).toBeGreaterThan(3000);
    expect(hardwareDataInfo.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("reading model names", () => {
  it("finds every alternative, keeping the brand to its own part", () => {
    expect(
      names(findGpus("NVIDIA GeForce GTX 660 2GB or AMD Radeon HD 7870 2GB")),
    ).toEqual(["GeForce GTX 660", "Radeon HD 7870"]);
    expect(names(findCpus("Intel Core i5-2500K / AMD FX-8350"))).toEqual([
      "Intel Core i5-2500K",
      "AMD FX-8350 Eight-Core",
    ]);
  });
  it("does not mistake sizes, resolutions or longer numbers for models", () => {
    expect(findGpus("NVIDIA 256 MB card")).toEqual([]);
    expect(findGpus("1280x1024 display")).toEqual([]);
    expect(names(findGpus("Radeon RX 5700 XT"))).toEqual(["Radeon RX 5700 XT"]);
    expect(names(findGpus("Radeon RX 570"))).toEqual(["Radeon RX 570"]);
  });
  it("understands the usual short forms", () => {
    expect(names(findGpus("GeForce 1060 / Radeon 580"))).toEqual([
      "GeForce GTX 1060",
      "Radeon RX 580",
    ]);
    expect(names(findGpus("Intel HD Graphics 4000"))).toEqual(["Intel HD 4000"]);
    expect(names(findGpus("760 GTX"))).toEqual(["GeForce GTX 760"]);
    expect(names(findGpus("NVIDIA GeForce GTX 550 or higher"))).toEqual([
      "GeForce GTX 550 Ti",
    ]);
    expect(names(findCpus("Intel G640"))).toEqual(["Intel Pentium G640"]);
    expect(names(findCpus("Ryzen 3600 or better"))).toEqual(["AMD Ryzen 5 3600"]);
    expect(names(findCpus("Core 2 Duo E8400"))).toEqual(["Intel Core2 Duo E8400"]);
    expect(names(findCpus("AMD Athlon 64 3200+"))).toEqual(["AMD Athlon 64 3200+"]);
  });
  it("picks an old processor by its clock", () => {
    expect(names(findCpus("Pentium 4 2.0 GHz or equivalent"))).toEqual([
      "Intel Pentium 4 2.00GHz",
    ]);
  });
});

describe("GPU comparison", () => {
  it("reads a feature-only 1990s line piece by piece", () => {
    const v = compareGpu(
      "64MB DirectX 9 compatible AGP graphics card with hardware T&amp;L support",
      pc,
    );
    expect(v.status).toBe("pass");
    expect(v.reason).toContain("64 MB bellek ve DirectX 9 istiyor");
    expect(v.reason).toContain("6 GB ve DirectX 12.1 var");
    expect(v.reason).toContain("AGP yuvası ve donanımsal T&L o dönemin özellikleri");
  });
  it("compares named cards with PassMark scores", () => {
    const pass = compareGpu("NVIDIA GeForce GTX 760", pc);
    expect(pass.status).toBe("pass");
    expect(pass.reason).toMatch(
      /GeForce GTX 760 kartından yaklaşık [\d,]+ kat güçlü \(PassMark/,
    );
    const fail = compareGpu("NVIDIA GeForce RTX 4060", pc);
    expect(fail.status).toBe("fail");
    expect(fail.reason).toMatch(/zayıf: gücü onun yaklaşık %\d+ seviyesinde/);
  });
  it("checks OpenGL, Shader Model, memory and dedicated cards", () => {
    expect(compareGpu("OpenGL 3.0 compliant with 512MB of video RAM.", pc).status).toBe(
      "pass",
    );
    expect(compareGpu("DX10 (SM 4.0) capable, 512MB VRAM", pc).reason).toContain(
      "Shader Model 4.0",
    );
    expect(compareGpu("Integrated graphics are not supported", pc).status).toBe("pass");
    const igpu = {
      ...pc,
      gpu: "Intel(R) UHD Graphics 630",
      vramCertain: false,
      vramGB: null,
    };
    expect(compareGpu("Integrated graphics are not supported", igpu).status).toBe("fail");
  });
  it("needs no model when the line asks for nothing specific", () => {
    expect(compareGpu("Any", pc).status).toBe("pass");
    expect(compareGpu("1280 x 720", pc).status).toBe("pass");
    expect(compareGpu("3D", pc).status).toBe("pass");
  });
  it("leaves what it cannot read to the AI", () => {
    expect(compareGpu("Fixture GPU Z9", pc).status).toBe("unknown");
    expect(
      compareGpu("NVIDIA GeForce GTX 760", { ...pc, gpu: "Fixture GPU Z9" }).status,
    ).toBe("unknown");
  });
});

describe("CPU comparison", () => {
  it("uses multi- and single-core scores, with a 10 % band for 'yaklaşık eşit'", () => {
    expect(compareCpu("Intel Core 2 Quad Q6600", pc).status).toBe("pass");
    expect(compareCpu("Intel Core i7-8700K", pc).status).toBe("fail");
    const near = compareCpu("Intel Core i5-4440", pc);
    expect(near).toMatchObject({ status: "pass", near: true });
    expect(near.reason).toContain("yaklaşık eşit");
    expect(near.reason).toContain("tek çekirdek");
  });
  it("prefers the alternative of the computer's own brand", () => {
    const v = compareCpu("AMD Ryzen 5 3600 | Intel Core i5-8400", pc);
    expect(v.status).toBe("fail");
    expect(v.reason).toContain("Intel Core i5-8400");
  });
  it("compares 'dual core 2.4 GHz' with processors of the game's years", () => {
    const v = compareCpu("Dual core 2.4 GHz", pc, 2012);
    expect(v).toMatchObject({ status: "pass", estimated: true });
    expect(v.reason).toContain("2007–2012 arasında çıkan");
    expect(compareCpu("8 cores required", pc, 2020).status).toBe("fail");
  });
  it("knows 1990s processors and instruction sets", () => {
    expect(compareCpu("Intel Pentium 166 MHz", pc).status).toBe("pass");
    expect(cpuIsa("Intel Core i5-4460")?.has("avx2")).toBe(true);
    expect(cpuIsa("Intel Core i5-2500K")?.has("avx2")).toBe(false);
    expect(
      compareCpu("SSE2 and AVX2 support required, 64-bit processor", pc).status,
    ).toBe("pass");
    expect(
      compareCpu("AVX2 support required", { ...pc, cpu: "Intel Core i5-2500K" }).status,
    ).toBe("fail");
  });
  it("needs no model for 'any processor' and decides a family without a year only when clear", () => {
    expect(compareCpu("Any x86 CPU", pc).status).toBe("pass");
    expect(compareCpu("Intel Core2 Duo or better", pc).status).toBe("pass");
    expect(compareCpu("Intel Core i5", pc).status).toBe("unknown");
  });
});

describe("in the requirements table", () => {
  const game = (
    minimum: Partial<Game["minimum"]>,
    recommended?: Partial<Game["minimum"]>,
  ) =>
    ({
      ...newGame("Oyun", 0),
      year: 2014,
      minimum: { raw: "fixture", ...minimum },
      recommended: recommended
        ? { raw: "fixture", ...recommended }
        : { raw: "", availability: "not_published" },
    }) as Game;
  it("marks data rows, keeps them from the AI and counts 'yaklaşık eşit' as met", () => {
    const c = compatibility(
      game({ cpu: "Intel Core i5-4440", gpu: "NVIDIA GeForce GTX 760" }),
      pc,
    );
    const cpu = c.minimum.find((r) => r.name === "CPU")!;
    expect(cpu).toMatchObject({
      status: "pass",
      near: true,
      db: true,
      aiEditable: false,
    });
    expect(cpu.aiBlockReason).toContain("donanım verisiyle");
    expect(c.status).toBe("recommended");
  });
  it("takes the card's memory, DirectX and Vulkan from the data when the PC could not tell", () => {
    const unsure = {
      ...pc,
      vramGB: 4,
      vramCertain: false,
      directX: null,
      vulkan: "Doğrulanamadı",
    };
    const c = compatibility(game({ vramGB: 6, directX: 12, vulkan: "1.1" }), unsure);
    const row = (n: string) => c.minimum.find((r) => r.name === n)!;
    expect(row("VRAM")).toMatchObject({ status: "pass", actual: "6 GB" });
    expect(row("VRAM").reason).toContain("donanım verisinden");
    expect(row("DirectX özellik düzeyi").status).toBe("pass");
    expect(row("Vulkan")).toMatchObject({ status: "pass", actual: "Vulkan 1.3" });
  });
  it("compares old Windows names", () => {
    const c = compatibility(game({ os: "Windows 95/98/XP" }), pc);
    expect(c.minimum.find((r) => r.name === "İşletim sistemi")?.status).toBe("pass");
  });
  it("runs no AI hardware stage when every row is computed", () => {
    const computed = game({
      cpu: "Intel Core 2 Quad Q6600",
      gpu: "GeForce 8800 GT",
      ramGB: 2,
    });
    expect(researchProgress(computed, pc, true).stages).toEqual(["summary"]);
    const open = game({ cpu: "Fixture CPU X1", ramGB: 2 });
    expect(researchProgress(open, pc, true).stages).toEqual(["hardware", "summary"]);
  });
});

describe("an AI answer is reused for the same requirement", () => {
  let root: string, store: Store;
  beforeEach(() => {
    fs.mkdirSync(".cache", { recursive: true });
    root = fs.mkdtempSync(path.resolve(".cache/210-"));
    store = new Store(root);
    store.hardware(pc);
  });
  afterEach(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("fills the same unknown row of other games, never a user mark", () => {
    const [a, b, c] = store.add([{ name: "A" }, { name: "B" }, { name: "C" }]).added;
    for (const id of [a, b, c])
      store.metadata(id, { minimum: { raw: "x", gpu: "Fixture GPU Z9" } });
    const row = (id: string) =>
      compatibility(store.requireGames([id])[0], store.state.hardware).minimum.find(
        (r) => r.name === "GPU",
      )!;
    expect(row(b).status).toBe("unknown");
    store.metadata(c, {
      aiCompatibility: [
        {
          level: "minimum",
          component: "GPU",
          status: "fail",
          reason: "Senin kararın: Geçmedi.",
          contextKey: row(c).contextKey!,
          checkedAt: "2026-10-16T10:00:00Z",
          decidedBy: "user",
        },
      ],
    });
    expect(store.applyLearnedChecks()).toBe(0);
    store.metadata(a, {
      aiCompatibility: [
        {
          level: "minimum",
          component: "GPU",
          status: "pass",
          reason: "AI: güçlü bir kart.",
          contextKey: row(a).contextKey!,
          checkedAt: "2026-10-16T10:00:00Z",
        },
      ],
    });
    expect(store.applyLearnedChecks()).toBe(1);
    expect(row(b)).toMatchObject({
      status: "pass",
      ai: true,
      reason: "AI: güçlü bir kart.",
    });
    expect(row(c)).toMatchObject({ status: "fail", user: true });
    // Another computer: the answer does not apply.
    store.hardware({ gpu: "Fixture GPU Y8" });
    expect(row(b).status).toBe("unknown");
  });
});
