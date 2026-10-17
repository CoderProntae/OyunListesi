import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import { nativeTools, toolSpecs } from "../electron/tools";
import { prepareResearch } from "../electron/research";
import { agentPolicy } from "../electron/agent-policy";
import { compatibility } from "../shared/compatibility";
import { formatSize } from "../shared/format";
import { initialState, newGame, REQUIREMENTS_REPAIR_MIGRATION } from "../shared/domain";
// No network in these tests: every catalog lookup fails like an offline PC.
vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(async () => {
    throw new Error("offline in tests");
  }),
}));

// 1.0.15: the user asked the model to write 0.81 GB into "Önerilen Disk" for
// Max Payne. The model first wrote it into a third "optimum" level and then
// sent recommended {raw: "Storage: 0.81 GB"}, which erased the recommended
// CPU/GPU/RAM/VRAM/OS. The patches below are the ones from the user's report.
const at = "2026-10-16T09:00:00.000Z";
const hardware = {
  ...initialState().hardware,
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 16,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
};
const minimum = {
  raw: "OS: Windows 95, 98, ME, 2000\nCPU: 450 MHz AMD / Intel işlemci",
  availability: "published" as const,
  os: "Windows 95, 98, ME, 2000",
  cpu: "450 MHz AMD / Intel işlemci",
  gpu: "16 MB Direct3D uyumlu grafik kartı",
  ramGB: 0.09375,
  vramGB: 0.015625,
  storageGB: 0.81,
};
const recommended = {
  raw: "OS: Windows 98, ME, 2000, XP\nCPU: 700 MHz AMD / Intel işlemci",
  availability: "published" as const,
  os: "Windows 98, ME, 2000, XP",
  cpu: "700 MHz AMD / Intel işlemci",
  gpu: "32 MB Direct3D uyumlu grafik kartı",
  ramGB: 0.125,
  vramGB: 0.03125,
};
const hltb = {
  status: "found" as const,
  main: 8.09,
  mainExtra: 9.2,
  completionist: 11.49,
  via: "HowLongToBeat (Codepotatoes)",
  url: "https://howlongtobeat.com/game/5736",
  checkedAt: at,
};
const sources = [
  {
    url: "https://store.steampowered.com/app/1328674/",
    title: "Max Payne (Steam Store)",
  },
];
const firstPatch = {
  hltb: { status: "found", main: 8.5 },
  optimum: {
    availability: "published",
    raw: "Önerilen disk: 0.81 GB (tahmini, kaynakta sayısal önerilen belirtilmemiş; minimum 0.81 GB olarak alınmıştır).",
    storageGB: 0.81,
  },
};
const secondPatch = {
  optimum: { raw: "", storageGB: null },
  recommended: { availability: "published", raw: "Storage: 0.81 GB", storageGB: 0.81 },
};

let s: Service, root: string, id: string, chat: any, message: any;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/115-"));
  s = new Service(root);
  s.store.settings({
    lmModel: "fixture",
    autoResearch: false,
    autoSummary: false,
    requireApproval: false,
  });
  s.store.hardware(hardware);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  id = s.store.add([{ name: "Max Payne" }]).added[0];
  s.store.metadata(id, { minimum, recommended, hltb });
  chat = s.store.createChat();
  message = { id: "response", role: "assistant", createdAt: at, blocks: [] };
  chat.messages.push(message);
});
afterEach(async () => {
  s.close();
  await new Promise((r) => setTimeout(r, 5));
  fs.rmSync(root, { force: true, recursive: true });
  vi.restoreAllMocks();
});
const game = () => s.store.requireGames([id])[0];
const execute = (name: string, args: any) =>
  (s.agent as any).execute(chat, message, name, args, new AbortController().signal);
const update = (patch: any) =>
  execute("update_game_info", { gameId: id, patch, sources });
const cell = (level: "minimum" | "recommended", name: string) =>
  compatibility(game(), s.store.state.hardware)[level].find((r) => r.name === name);

describe("only two requirement levels: minimum and recommended", () => {
  it("the model is never offered a third level", () => {
    const offered = JSON.stringify(nativeTools) + agentPolicy;
    expect(offered).not.toMatch(/optimum/i);
    expect(offered).toContain("recommended");
  });
  it("the user's first patch is refused and changes nothing", async () => {
    const before = structuredClone(game());
    const r = await update(firstPatch);
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain("optimum");
    expect(r.instruction).toContain("minimum ve recommended");
    expect(game()).toEqual(before);
    expect(JSON.stringify(game())).not.toContain("optimum");
  });
  it("the user's second patch is refused too; nothing is erased", async () => {
    const before = structuredClone(game());
    expect((await update(secondPatch)).error).toContain("optimum");
    expect(game()).toEqual(before);
  });
  it("a comparison for a third level cannot be recorded", async () => {
    const r = await execute("record_compatibility", {
      gameId: id,
      contextKey: "x",
      level: "optimum",
      component: "CPU",
      status: "pass",
      reason: "fixture",
    });
    expect(r.error).toBeTruthy();
    expect(game().aiCompatibility).toBeUndefined();
    expect(() =>
      toolSpecs.record_compatibility.schema.parse({
        gameId: id,
        contextKey: "x",
        level: "optimum",
        component: "CPU",
        status: "pass",
        reason: "fixture",
      }),
    ).toThrow();
  });
});

describe("sizes are readable", () => {
  it("MB figures are shown in MB, GB figures with at most two decimals", () => {
    expect(formatSize(0.015625)).toBe("16 MB");
    expect(formatSize(0.09375)).toBe("96 MB");
    expect(formatSize(830 / 1024)).toBe("830 MB");
    expect(formatSize(0.81)).toBe("0,81 GB");
    expect(formatSize(0.09)).toBe("0,09 GB");
    expect(formatSize(8)).toBe("8 GB");
    expect(formatSize(12.5)).toBe("12,5 GB");
    expect(formatSize(15.958)).toBe("15,96 GB");
    expect(formatSize(0)).toBe("0 GB");
  });
  it("the Max Payne table no longer shows 0.015625 GB", () => {
    expect(cell("minimum", "VRAM")).toMatchObject({ required: "16 MB", actual: "6 GB" });
    expect(cell("minimum", "RAM")).toMatchObject({ required: "96 MB", actual: "8 GB" });
    expect(cell("minimum", "Disk")).toMatchObject({
      required: "0,81 GB",
      actual: "16 GB",
    });
    const g = newGame("DirectX", 0);
    g.minimum = { raw: "x", directX: 9, ramGB: 12 };
    const rows = compatibility(g, { ...hardware, directX: 12 }).minimum;
    expect(rows.find((r) => r.name === "DirectX özellik düzeyi")).toMatchObject({
      required: "9",
      actual: "12",
    });
    expect(rows.find((r) => r.name === "RAM")?.reason).toBe("4 GB eksik.");
  });
});

describe("one-time repair of libraries saved by 1.0.9–1.0.14", () => {
  // State after the two edits in the user's report, as 1.0.14 saved it.
  const damaged = (g: any) => ({
    ...g,
    optimum: { raw: "" },
    recommended: { raw: "Storage: 0.81 GB", availability: "published", storageGB: 0.81 },
    hltb: { ...hltb, main: 8.5 },
    aiEditedFields: [
      "hltb.status",
      "hltb.main",
      ...[
        "availability",
        "unpublished",
        "raw",
        "os",
        "cpu",
        "gpu",
        "ramGB",
        "vramGB",
        "storageGB",
        "directX",
        "vulkan",
      ].flatMap((f) => ["optimum." + f, "recommended." + f]),
    ],
    aiCompatibility: [
      {
        level: "optimum",
        component: "Disk",
        status: "pass",
        reason: "old",
        contextKey: "k",
        checkedAt: at,
      },
    ],
    sources: [
      {
        url: sources[0].url,
        title: sources[0].title,
        kind: "agent",
        checkedAt: at,
        fields: ["optimum.raw", "optimum.storageGB"],
      },
      {
        // 1.0.14 also listed every field of the level here, which kept the
        // erased fields locked against a store refresh.
        url: sources[0].url,
        title: sources[0].title,
        kind: "agent",
        checkedAt: at,
        fields: [
          "optimum.storageGB",
          "recommended.storageGB",
          "recommended.cpu",
          "recommended.os",
        ],
      },
    ],
  });
  function write(file: string, value: any) {
    fs.writeFileSync(file, JSON.stringify(value));
  }
  function prepare(withBackup = true) {
    // Closing saves the running library, so the edited files are written after it.
    s.close();
    const saved = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8"));
    // Saving also took a daily backup of the intact library; keep it only when wanted.
    const backups = path.join(root, "backups");
    if (!withBackup)
      for (const name of fs.readdirSync(backups)) fs.rmSync(path.join(backups, name));
    if (withBackup)
      write(path.join(root, "backups", "library-2026-10-15T08-00-00-000Z.json"), saved);
    const broken = {
      ...saved,
      migrations: saved.migrations.filter(
        (m: string) => m !== REQUIREMENTS_REPAIR_MIGRATION,
      ),
      games: saved.games.map(damaged),
    };
    write(path.join(root, "library.json"), broken);
    // Newer backup taken after the damage: it must not hide the older values.
    write(path.join(root, "backups", "library-2026-10-16T08-00-00-000Z.json"), broken);
  }
  it("brings back the erased recommended values and keeps 0,81 GB", () => {
    prepare();
    const store = new Store(root);
    try {
      const g = store.state.games[0];
      expect(g.recommended).toMatchObject({ ...recommended, raw: expect.any(String) });
      expect(g.recommended.storageGB).toBe(0.81);
      expect(g.recommended.raw).toContain("CPU: 700 MHz");
      expect(JSON.stringify(g)).not.toContain("optimum");
      expect(g.aiEditedFields).toContain("recommended.storageGB");
      expect(g.aiEditedFields).not.toContain("recommended.cpu");
      expect(g.sources.map((x) => x.fields)).toEqual([["recommended.storageGB"]]);
      expect(store.state.migrations).toContain(REQUIREMENTS_REPAIR_MIGRATION);
      const table = compatibility(g, store.state.hardware).recommended;
      expect(table.find((r) => r.name === "GPU")?.required).toBe(recommended.gpu);
      expect(table.find((r) => r.name === "RAM")?.required).toBe("128 MB");
      store.flush();
    } finally {
      store.close();
    }
    const again = new Store(root);
    try {
      expect(again.state.games[0].recommended.cpu).toBe(recommended.cpu);
    } finally {
      again.close();
    }
  });
  it("without a usable backup the empty fields are at least unlocked for a store refresh", () => {
    prepare(false);
    const store = new Store(root);
    try {
      const g = store.state.games[0];
      expect(g.recommended.cpu).toBeUndefined();
      expect(g.recommended.storageGB).toBe(0.81);
      expect(g.aiEditedFields).toEqual(
        expect.arrayContaining(["recommended.storageGB", "hltb.main"]),
      );
      expect(g.aiEditedFields).not.toContain("recommended.cpu");
    } finally {
      store.close();
    }
  });
  it("runs once and does not undo a later deliberate clear", () => {
    prepare();
    const first = new Store(root);
    const g = first.state.games[0];
    expect(g.recommended.cpu).toBe(recommended.cpu);
    // Later the model clears the CPU on purpose (null in update_game_info).
    first.metadata(
      g.id,
      prepareResearch(g, { gameId: g.id, patch: { recommended: { cpu: null } } }),
    );
    expect(first.state.games[0].aiEditedFields).toContain("recommended.cpu");
    first.flush();
    first.close();
    const second = new Store(root);
    try {
      expect(second.state.games[0].recommended.cpu).toBeUndefined();
    } finally {
      second.close();
    }
  });
});

describe("'Süreleri yenile' shows HowLongToBeat's own figures", () => {
  beforeEach(() => {
    vi.spyOn(s.providers as any, "steam").mockRejectedValue(new Error("offline"));
    vi.spyOn(s.providers as any, "image").mockResolvedValue(undefined);
  });
  it("real times replace a duration the model wrote; an automatic refresh keeps it", async () => {
    await update({ hltb: { status: "found", main: 8.5 } });
    expect(game().hltb?.main).toBe(8.5);
    vi.spyOn(s.providers, "completionTimes").mockResolvedValue({
      ...hltb,
      checkedAt: new Date().toISOString(),
    });
    await s.providers.enrich(id, false);
    expect(game().hltb?.main).toBe(8.5);
    await s.providers.enrich(id, true);
    expect(game().hltb).toMatchObject({
      main: 8.09,
      mainExtra: 9.2,
      completionist: 11.49,
    });
    expect(game().aiEditedFields?.filter((f) => f.startsWith("hltb"))).toEqual([]);
    expect(game().sources.some((x) => x.fields?.some((f) => f.startsWith("hltb")))).toBe(
      false,
    );
  });
  it("when HowLongToBeat returns nothing, the saved value stays", async () => {
    await update({ hltb: { status: "found", main: 8.5 } });
    vi.spyOn(s.providers, "completionTimes").mockResolvedValue({
      status: "unavailable",
      checkedAt: new Date().toISOString(),
    });
    await s.providers.enrich(id, true);
    expect(game().hltb?.main).toBe(8.5);
    expect(game().aiEditedFields).toContain("hltb.main");
  });
});
