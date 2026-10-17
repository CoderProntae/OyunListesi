import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Store } from "../electron/store";
import { Service } from "../electron/service";
import { Providers, originOf } from "../electron/providers";
import { parseRequirementSections, parseRequirements } from "../electron/requirements";
import {
  gogProduct,
  epicRequirements,
  xboxRequirements,
  abandonwareProduct,
  parseAbandonwareSitemap,
  rankTitles,
  platformKey,
  searchPlatform,
} from "../electron/platforms";
import { webRequest } from "../electron/network";
import { compatibility } from "../shared/compatibility";
import { assessGame } from "../shared/analysis";
import { formatSize, platformLabel } from "../shared/format";
import { initialState, STORE_REQUIREMENTS_MIGRATION } from "../shared/domain";
import { agentPolicy } from "../electron/agent-policy";
import { researchStage } from "../electron/research-plan";
vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(async () => {
    throw new Error("offline in tests");
  }),
}));
// Real store answers saved from Steam (l=turkish&cc=TR), GOG, Epic, the
// Microsoft Store and My Abandonware while checking 1.0.16.
const fx = JSON.parse(
  fs.readFileSync(path.resolve("tests/fixtures/stores-1.0.16.json"), "utf8"),
);
const steam = (id: string) =>
  parseRequirementSections(fx.steam[id].minimum, fx.steam[id].recommended);
const values = (r: any) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => k !== "raw"));
const reply = (value: any, url = "https://example.com/") => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  url,
  body: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),
  type: "application/json",
});
const hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 15.97,
  directX: 12.1,
};

describe("Steam requirement texts are read completely", () => {
  it("Kane and Lynch: Dead Men: the 7 GB disk, the one-line recommended block, no third block", () => {
    const r = steam("8080");
    expect(values(r.minimum)).toEqual({
      os: "Windows XP Service Pack 2, Windows Vista",
      cpu: "Intel Pentium 4 2Ghz or AMD Athlon XP 1800+",
      gpu: "128 MB NVIDIA 6600 or better/ATI X1300 or better",
      ramGB: 1,
      vramGB: 0.125,
      storageGB: 7,
    });
    expect(values(r.recommended)).toEqual({
      cpu: "Intel Pentium 4 2.5Ghz or AMD Athlon XP 2400+",
    });
    expect(JSON.stringify(r)).not.toContain("8300");
  });
  it("Kane & Lynch 2: nothing recommended, no disk on the store page, RAM for Vista and later", () => {
    const r = steam("28000");
    expect(values(r.minimum)).toEqual({
      os: "Windows XP/Vista/7",
      cpu: "Intel 3.0 GHz or AMD 2.5 GHz or higher",
      gpu: "Nvidia 7800 / ATI X1800 or better (Shader Model 3.0, 512 MB Video Memory)",
      ramGB: 2,
      vramGB: 0.5,
      directX: 9,
    });
    expect(values(r.recommended)).toEqual({});
  });
  it("labels Steam mixes in: Supported OS, DirectX Version, Hard Drive …, Sabit Disk Alanı", () => {
    expect(steam("9480").minimum).toMatchObject({
      os: "Windows XP or Vista.",
      directX: 9,
      storageGB: 15,
    });
    expect(steam("105600").minimum).toMatchObject({
      storageGB: 200 / 1024,
      os: "Windows Xp, Vista, 7",
    });
    expect(steam("12210").minimum).toMatchObject({
      os: "Windows 10 (64-bit)",
      storageGB: 22,
      directX: 9,
    });
  });
  it("free text without labels and inline Minimum / Recommended / Optimal blocks", () => {
    const r = steam("7000");
    expect(r.minimum).toMatchObject({
      os: "Microsoft Windows 2000 / XP",
      cpu: "Pentium 3 1.0Ghz or Athlon XP Equivalent",
      ramGB: 0.25,
      storageGB: 9.9,
      directX: 9,
    });
    expect(r.recommended).toMatchObject({ ramGB: 0.5, vramGB: 0.25, storageGB: 9.9 });
    expect(JSON.stringify(r)).not.toContain("7800");
  });
  it("lists under a heading, a repeated label and publisher slips", () => {
    expect(steam("2600").minimum).toMatchObject({
      storageGB: 3.3,
      ramGB: 0.375,
      directX: 9,
    });
    expect(steam("2600").minimum.gpu).toContain("Ekran Kartı");
    expect(steam("208650").minimum.gpu).toBe(
      "NVIDIA GeForce GTX 660 (2 GB Memory Minimum) | AMD Radeon HD 7870 (2 GB Memory Minimum)",
    );
    // "Memory: 1.55 GB of free hard disk space" is disk space, not RAM.
    expect(steam("12110").recommended).toMatchObject({ storageGB: 1.55, ramGB: 0.25 });
  });
  it("Max Payne: the region-free answer has every minimum value and no recommended", () => {
    const r = steam("12140");
    expect(r.minimum).toMatchObject({
      ramGB: 96 / 1024,
      vramGB: 16 / 1024,
      storageGB: 830 / 1024,
      directX: 8,
    });
    expect(values(r.recommended)).toEqual({});
  });
});

describe("GOG, Epic and Microsoft Store rows", () => {
  it("GOG structured rows, empty rows skipped", () => {
    const p: any = gogProduct({
      _embedded: {
        supportedOperatingSystems: fx.gog["Fallout 2"].supported,
        product: {},
      },
      _links: { store: { href: "https://www.gog.com/en/game/fallout_2" } },
    }).patch;
    expect(p.minimum).toMatchObject({
      os: "Windows 10",
      cpu: "1.8 GHz",
      ramGB: 2,
      directX: 9,
    });
    expect(values(p.recommended)).toEqual({});
    expect(p.platforms).toEqual(["windows"]);
  });
  it("Epic: 'Windows OS' style titles, both levels; TBD is not a value; VR rows ignored", () => {
    const wrap = (systems: any) => ({
      pages: [{ type: "productHome", data: { requirements: { systems } } }],
    });
    const alan = epicRequirements(wrap(fx.epic["Alan Wake 2"].systems))!;
    expect(alan.minimum).toMatchObject({
      os: "Windows 10/11 64-bit",
      ramGB: 16,
      storageGB: 90,
    });
    expect(alan.recommended.cpu).toBe("Ryzen 7 3700X or Intel equivalent");
    const celeste = epicRequirements(wrap(fx.epic.Celeste.systems))!;
    expect(values(celeste.recommended)).toEqual({});
    const fortnite = epicRequirements(wrap(fx.epic.Fortnite.systems))!;
    expect(fortnite.minimum.cpu).not.toMatch(/^VR/);
  });
  it("Microsoft Store codes: devices are not DirectX, feature level wins, notes give the disk", () => {
    const halo = xboxRequirements(fx.xbox["Halo Infinite"].sys);
    expect(halo.minimum).toMatchObject({ directX: 11, ramGB: 8, vramGB: 4 });
    const starfield = xboxRequirements(fx.xbox.Starfield.sys);
    expect(starfield.minimum.storageGB).toBe(125);
    const forza = xboxRequirements(fx.xbox["Forza Horizon 5"].sys);
    expect(forza.recommended.vramGB).toBeUndefined();
    expect(forza.recommended.ramGB).toBe(16);
  });
  it("My Abandonware page: year, platform, genre, makers, text and screenshots, no requirements", () => {
    const page = abandonwareProduct(
      fx.abandonware,
      "https://www.myabandonware.com/game/spider-man-3qc",
    );
    expect(page.patch).toMatchObject({
      year: 2001,
      platforms: ["windows"],
      developers: ["Neversoft Entertainment, Inc."],
      publishers: ["Activision Publishing, Inc."],
    });
    expect(page.patch.genres).toContain("Action");
    expect(page.patch.description).toContain("Spider-Man");
    expect(page.patch.screenshots!.length).toBeGreaterThan(0);
    expect(values(page.patch.minimum!)).toEqual({});
    expect(page.patch.stores?.[0]).toMatchObject({ name: "My Abandonware" });
  });
  it("My Abandonware search uses the public sitemap titles", () => {
    const items = parseAbandonwareSitemap(fx.sitemap);
    expect(items.find((i) => i.path === "/game/hitman-kak")?.title).toBe("Hitman");
    expect(items.some((i) => i.title.includes("&amp;"))).toBe(false);
    expect(rankTitles(items, "prince persia")[0].title).toContain("Prince of Persia 2");
    expect(rankTitles(items, "hitman")[0].path).toBe("/game/hitman-kak");
  });
  it("platform names are shown properly", () => {
    expect(platformLabel("windows")).toBe("Windows");
    expect(platformLabel("mac")).toBe("macOS");
    expect(platformLabel("linux")).toBe("Linux");
    expect(platformLabel("DOS")).toBe("DOS");
    expect(platformKey("Bilgisayar")).toBe("windows");
    expect(platformKey("osx")).toBe("mac");
    expect(platformKey("Xbox One")).toBe("Xbox One");
  });
  it("sizes keep the store's unit", () => {
    expect(formatSize(0.5)).toBe("512 MB");
    expect(formatSize(0.25)).toBe("256 MB");
    expect(formatSize(0.81)).toBe("0,81 GB");
    expect(formatSize(0)).toBe("0 GB");
  });
});

describe("only what the store publishes is shown and compared", () => {
  const game = (minimum: any, recommended: any = { raw: "" }) => ({
    ...initialState(),
    ...{
      id: "g",
      name: "G",
      createdAt: "",
      order: 0,
      groupIds: [],
      inPlayList: true,
      status: "planned",
      tags: [],
      rating: null,
      genres: [],
      platforms: [],
      developers: [],
      publishers: [],
      screenshots: [],
      stores: [],
      sources: [],
      fetchStatus: "done",
      minimum,
      recommended,
    },
  });
  it("Kane & Lynch 2: no recommended column, no disk row, nothing missing", () => {
    const r = steam("28000");
    const g: any = game(r.minimum, r.recommended);
    const c = compatibility(g, hardware);
    expect(c.recommended).toEqual([]);
    expect(c.minimum.map((x) => x.name)).toEqual([
      "CPU",
      "GPU",
      "RAM",
      "VRAM",
      "DirectX özellik düzeyi",
      "İşletim sistemi",
    ]);
    expect(c.minimum.find((x) => x.name === "VRAM")?.required).toBe("512 MB");
    const a = assessGame(g, hardware);
    expect(a).not.toHaveProperty("missingFields");
    expect(a.pending.every((p) => /karşılaştırması$/.test(p))).toBe(true);
  });
  it("a game without store requirements is 'not specified' and complete", () => {
    const g: any = game({ raw: "" });
    expect(compatibility(g, hardware).minimum).toEqual([]);
    expect(assessGame(g, hardware)).toMatchObject({ complete: true, status: "none" });
  });
  it("the shared rules say requirements come from the store", () => {
    expect(agentPolicy).toContain(
      "mağazadan/platformdan (yayımlamıyorsa PCGamingWiki'den) otomatik ve tam gelir",
    );
    expect(agentPolicy).not.toMatch(/missingFields|not_published/);
    const stage = researchStage(
      { name: "X", id: "x" } as any,
      hardware,
      "hardware",
    ).prompt;
    expect(stage).toContain("Gereksinim ekleme, değiştirme veya silme");
  });
});

describe("the chosen platform is the data source", () => {
  let root: string, store: Store, providers: Providers;
  beforeEach(() => {
    root = fs.mkdtempSync(path.resolve(".cache/116-"));
    store = new Store(root);
    providers = new Providers(store, () => "");
    vi.mocked(webRequest).mockReset();
  });
  afterEach(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const gogV2 = {
    description: "<p>GOG text</p>",
    _links: { store: { href: "https://www.gog.com/en/game/fallout_2" } },
    _embedded: {
      product: { title: "Fallout 2", globalReleaseDate: "1998-09-30" },
      developers: [{ name: "Black Isle Studios" }],
      publisher: { name: "Bethesda" },
      tags: [{ name: "RPG" }],
      supportedOperatingSystems: fx.gog["Fallout 2"].supported,
    },
  };
  it("a game added from GOG takes GOG's data; Steam is only a shop link", async () => {
    const urls: string[] = [];
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      urls.push(url);
      if (url.includes("api.gog.com/v2/games/1440166436")) return reply(gogV2);
      if (url.startsWith("https://www.gog.com/")) return reply("<html></html>");
      if (url.includes("storesearch")) return reply({ items: [] });
      if (url.includes("egdata")) return reply({ total: 0, offers: [] });
      if (url.includes("storeedgefd")) return reply({ Payload: { SearchResults: [] } });
      throw new Error("offline " + url);
    });
    const id = store.add([
      { name: "Fallout 2", origin: { store: "GOG", id: "1440166436" } },
    ]).added[0];
    await providers.enrich(id, true);
    const g = store.requireGames([id])[0];
    expect(g.minimum).toMatchObject({ os: "Windows 10", ramGB: 2 });
    expect(values(g.recommended)).toEqual({});
    expect(g.requirementSource).toMatchObject({ store: "GOG" });
    expect(g.developers).toEqual(["Black Isle Studios"]);
    expect(g.platforms).toEqual(["windows"]);
    expect(urls.some((u) => u.includes("appdetails"))).toBe(false);
    expect(g.storeChecks?.find((c) => c.store === "GOG")?.status).toBe("found");
  });
  it("'Platform yok' asks no store and leaves the requirements not specified", async () => {
    const urls: string[] = [];
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      urls.push(url);
      throw new Error("offline");
    });
    const id = store.add([{ name: "Kendi oyunum", origin: { store: "none" } }]).added[0];
    await providers.enrich(id, true);
    const g = store.requireGames([id])[0];
    // No store; HowLongToBeat by name and (2.0.5) PCGamingWiki for requirements.
    expect(
      urls.every(
        (u) => u.includes("hltbapi") || u.includes("howlongtobeat") || u.includes("pcgamingwiki"),
      ),
    ).toBe(true);
    expect(g.pcgw?.status).toBe("unavailable");
    expect(g.storeChecks).toEqual([]);
    expect(values(g.minimum)).toEqual({});
    expect(g.requirementSource).toBeUndefined();
    expect(g.fetchStatus).toBe("done");
  });
  it("Steam without the Turkish region still gives the requirements, without a price", async () => {
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      if (url.includes("appdetails") && url.includes("cc=TR"))
        return reply({ 12140: { success: false } });
      if (url.includes("appdetails"))
        return reply({
          12140: {
            success: true,
            data: {
              name: "Max Payne",
              platforms: { windows: true, mac: false, linux: false },
              pc_requirements: { minimum: fx.steam["12140"].minimum },
              price_overview: { final_formatted: "$4.99" },
            },
          },
        });
      throw new Error("offline");
    });
    const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
    await providers.enrich(id, true);
    const g = store.requireGames([id])[0];
    expect(g.minimum.storageGB).toBe(830 / 1024);
    expect(g.platforms).toEqual(["windows"]);
    expect(g.stores.find((s) => s.name === "Steam")?.price).toBeUndefined();
    expect(g.requirementSource?.store).toBe("Steam");
  });
  it("a failed lookup keeps the saved requirements", async () => {
    const id = store.add([{ name: "Saved", origin: { store: "GOG", id: "123" } }])
      .added[0];
    store.metadata(id, { minimum: { raw: "RAM: 4 GB", ramGB: 4 } });
    await providers.enrich(id, true);
    expect(store.requireGames([id])[0].minimum.ramGB).toBe(4);
  });
  it("a store result without the game in any store clears automatic values", async () => {
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      if (url.includes("storesearch")) return reply({ items: [] });
      if (url.includes("catalog.gog.com")) return reply({ products: [] });
      if (url.includes("egdata")) return reply({ total: 0, offers: [] });
      if (url.includes("storeedgefd")) return reply({ Payload: { SearchResults: [] } });
      throw new Error("offline");
    });
    const id = store.add([{ name: "Nowhere", steamMatchMode: "auto" }]).added[0];
    store.metadata(id, { minimum: { raw: "RAM: 4 GB", ramGB: 4 } });
    await providers.enrich(id, true);
    expect(values(store.requireGames([id])[0].minimum)).toEqual({});
    expect(originOf(store.requireGames([id])[0])).toBeUndefined();
  });
  it("searching a platform returns that platform's games", async () => {
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      if (url.includes("catalog.gog.com"))
        return reply({
          products: [
            {
              id: 1440166436,
              title: "Fallout 2",
              productType: "pack",
              storeLink: "https://www.gog.com/en/game/fallout_2",
              releaseDate: "1998.09.30",
              developers: ["Black Isle Studios"],
            },
            { id: 1, title: "Fallout 2 Soundtrack", productType: "dlc" },
          ],
        });
      if (url.includes("sitemap.xml.gz"))
        return {
          ...reply(""),
          body: Buffer.from(
            zlib.gzipSync(Buffer.from(fx.sitemap)),
          ) as Buffer<ArrayBuffer>,
          url,
        };
      throw new Error("offline");
    });
    const gog = await searchPlatform("GOG", "fallout 2", root);
    expect(gog).toEqual([
      expect.objectContaining({ store: "GOG", id: "1440166436", name: "Fallout 2" }),
    ]);
    const old = await searchPlatform("My Abandonware", "hitman", root);
    expect(old[0]).toMatchObject({ store: "My Abandonware", id: "/game/hitman-kak" });
    expect(fs.existsSync(path.join(root, "cache", "myabandonware-index.json"))).toBe(
      true,
    );
  });
});

describe("1.0.16 update of saved libraries", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.resolve(".cache/116m-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it("research-written requirements give way to the store, the user's own chat edits stay", () => {
    const base = initialState();
    const game = {
      id: "kane",
      name: "Kane and Lynch: Dead Men",
      appId: 8080,
      createdAt: "2026-10-16T08:07:49.115Z",
      order: 0,
      groupIds: [],
      inPlayList: true,
      status: "finished",
      tags: [],
      rating: null,
      genres: [],
      platforms: ["windows"],
      developers: [],
      publishers: [],
      screenshots: [],
      stores: [],
      sources: [
        {
          title: "Wrong page",
          url: "https://example.com/kl2",
          checkedAt: "2026-10-16T08:10:00Z",
          kind: "agent",
          fields: ["minimum.cpu", "minimum.storageGB"],
        },
      ],
      fetchStatus: "done",
      catalogCheckedAt: "2026-10-16T08:07:50.711Z",
      minimum: {
        raw: "OS: Windows XP/Vista/7",
        os: "Windows XP/Vista/7",
        cpu: "Intel 3.0 GHz or AMD 2.5 GHz or higher",
        directX: 9,
        unpublished: ["storageGB"],
      },
      recommended: { raw: "", availability: "not_published" },
      aiEditedFields: [
        "minimum.os",
        "minimum.cpu",
        "minimum.directX",
        "minimum.storageGB",
        "minimum.unpublished",
        "recommended.availability",
        "recommended.storageGB",
      ],
    };
    const chats = [
      {
        id: "user-chat",
        title: "Sohbet",
        createdAt: "2026-10-16T09:00:00Z",
        allowedTools: [],
        messages: [
          {
            id: "m",
            role: "assistant",
            createdAt: "2026-10-16T09:00:00Z",
            blocks: [
              {
                id: "b",
                type: "tool",
                name: "update_game_info",
                args: {
                  gameId: "kane",
                  patch: { recommended: { raw: "Storage: 0.81 GB" } },
                },
                status: "done",
                startedAt: 1,
              },
            ],
          },
        ],
        apiHistory: [],
      },
    ];
    fs.writeFileSync(
      path.join(root, "library.json"),
      JSON.stringify({
        ...base,
        games: [game],
        chats,
        migrations: base.migrations.filter((m) => m !== STORE_REQUIREMENTS_MIGRATION),
      }),
    );
    const store = new Store(root);
    try {
      const g = store.state.games[0];
      expect(g.storeSync).toBe(true);
      expect(g.aiEditedFields).toEqual(["recommended.storageGB"]);
      expect(g.sources.some((s) => s.kind === "agent")).toBe(false);
      expect(store.state.migrations).toContain(STORE_REQUIREMENTS_MIGRATION);
    } finally {
      store.close();
    }
  });
  it("a running times-only lookup does not swallow the store refresh", async () => {
    const store = new Store(root);
    const providers = new Providers(store, () => "");
    let release!: () => void;
    vi.spyOn(providers, "refreshTimes").mockImplementation(
      () => new Promise((r) => (release = () => r(undefined))),
    );
    const enrich = vi
      .spyOn(providers, "enrich")
      .mockResolvedValue({ cached: true } as any);
    const { MetadataQueue } = await import("../electron/providers");
    const queue = new MetadataQueue(providers, store);
    const id = store.add([{ name: "Kane", appId: 8080 }]).added[0];
    queue.addTimes([id]);
    expect(queue.state.current).toBe(id);
    queue.add([id], true);
    release();
    await vi.waitFor(() =>
      expect(enrich).toHaveBeenCalledWith(id, true, expect.anything()),
    );
    store.close();
  });
  it("marked games are refreshed from their store once at start", async () => {
    const s = new Service(root);
    const add = vi.spyOn(s.queue, "add").mockImplementation(() => {});
    const id = s.store.add([{ name: "Sync me", appId: 8080 }]).added[0];
    s.store.metadata(id, { storeSync: true });
    (s as any).syncStoreRequirements();
    await new Promise((r) => setTimeout(r, 0));
    expect(add).toHaveBeenCalledWith([id], true);
    s.close();
  });
});
