import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Store } from "../electron/store";
import { Providers, MetadataQueue } from "../electron/providers";
import { webRequest } from "../electron/network";
import {
  pcgwImageUrl,
  pcgwInfo,
  pcgwNames,
  pcgwPageUrl,
  pcgwRequirements,
  pageYears,
  windowsRequirements,
  wikiText,
} from "../electron/pcgamingwiki";
import { Updater } from "../electron/updater";
import {
  LEGACY_STOP_LOGIC,
  LEGACY_STOP_SCRIPT,
  legacyScripts,
  readHandoff,
  removeOldExe,
  resumeOldExeCleanup,
  stopLegacyUpdaters,
} from "../electron/update-cleanup";
import { researchStages } from "../electron/research-plan";
import {
  initialState,
  newGame,
  PCGW_INFO_MIGRATION,
  PCGW_MIGRATION,
} from "../shared/domain";
import type { AppState } from "../shared/types";

vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(),
}));
const fixture = (name: string) =>
  fs.readFileSync(path.resolve("tests/fixtures/pcgw", name), "utf8");
const reply = (value: any, url = "https://example.com/") => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  url,
  body: Buffer.from(""),
  type: "application/json",
});
// A small stand-in for the wiki's API that answers like the real one did
// (normalized / interwiki / redirects / pages, formatversion=2): "Unreal:" is
// an interwiki prefix there, titles get a capital first letter, the Steam ID
// lookup redirects to the page or ends on "No such AppID."
const wiki = {
  pages: {
    Unreal: fixture("unreal.wiki"),
    "Prince of Persia": fixture("prince-of-persia.wiki"),
    "Unreal (1991)":
      "{{Infobox game\n|release dates=\n{{Infobox game/row/date|DOS|1991}}\n}}\n==System requirements==\n{{System requirements\n|OSfamily = DOS\n|minCPU = Intel 286\n|minRAM = 640 KB\n}}",
  } as Record<string, string>,
  redirects: { "Unreal Gold": "Unreal" } as Record<string, string>,
  appids: { 13250: "Unreal" } as Record<number, string>,
};
const calls: string[] = [];
function fakeWiki(offline = false) {
  calls.length = 0;
  vi.mocked(webRequest).mockImplementation(async (url: string, o: any = {}) => {
    calls.push(url);
    const u = new URL(url);
    if (offline || u.hostname !== "www.pcgamingwiki.com") throw new Error("offline");
    if (u.pathname === "/api/appid.php") {
      const title = wiki.appids[Number(u.searchParams.get("appid"))];
      if (title) {
        const target = new URL(
          "https://www.pcgamingwiki.com/wiki/" + title.replace(/ /g, "_"),
        );
        if (o.stopAt?.(target))
          return { ...reply(""), url: target.toString(), stopped: true };
        return reply("<html>page</html>", target.toString());
      }
      return reply(
        "<h1>ID lookup</h1>No such AppID.",
        "https://www.pcgamingwiki.com/w/index.php?title=Special:IdLookup&field=steamappid&value=" +
          u.searchParams.get("appid"),
      );
    }
    expect(u.pathname).toBe("/w/api.php");
    expect(u.searchParams.get("formatversion")).toBe("2");
    const p = u.searchParams;
    if (p.get("list") === "search") {
      const term = p.get("srsearch")!.toLowerCase();
      const titles = [...Object.keys(wiki.pages), ...Object.keys(wiki.redirects)];
      const hits =
        p.get("srwhat") === "nearmatch"
          ? titles.filter((t) => t.toLowerCase() === term)
          : titles.filter((t) => t.toLowerCase().includes(term));
      return reply({
        batchcomplete: true,
        query: { search: hits.map((title) => ({ ns: 0, title })) },
      });
    }
    const normalized: any[] = [],
      interwiki: any[] = [],
      redirects: any[] = [],
      pages = new Map<string, any>();
    for (const asked of p.get("titles")!.split("|")) {
      let t = asked.replace(/_/g, " ").trim();
      const iw = t.match(/^unreal:\s*(.*)$/i);
      if (iw) {
        const to = "unreal:" + iw[1];
        normalized.push({ fromencoded: false, from: asked, to });
        interwiki.push({ title: to, iw: "unreal" });
        continue;
      }
      const cap = t[0].toUpperCase() + t.slice(1);
      if (cap !== asked) normalized.push({ fromencoded: false, from: asked, to: cap });
      t = cap;
      if (wiki.redirects[t]) {
        redirects.push({ from: t, to: wiki.redirects[t] });
        t = wiki.redirects[t];
      }
      pages.set(
        t,
        wiki.pages[t] !== undefined
          ? {
              pageid: 1,
              ns: 0,
              title: t,
              revisions: [
                { slots: { main: { contentmodel: "wikitext", content: wiki.pages[t] } } },
              ],
            }
          : { ns: 0, title: t, missing: true },
      );
    }
    return reply({
      batchcomplete: true,
      query: {
        ...(normalized.length ? { normalized } : {}),
        ...(interwiki.length ? { interwiki } : {}),
        ...(redirects.length ? { redirects } : {}),
        pages: [...pages.values()],
      },
    });
  });
}
let root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/205-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.mocked(webRequest).mockReset();
  vi.restoreAllMocks();
});

describe("PCGamingWiki page source → requirements", () => {
  it("cleans wiki markup out of values", () => {
    expect(wikiText("60 GB{{note|As of Update 5.00}}")).toBe("60 GB");
    expect(wikiText("[[Windows]] 7<br>8.1<ref>kaynak</ref>")).toBe("Windows 7, 8.1");
    expect(wikiText("{{abbr|VRAM|Video RAM}} 2 GB <!-- not -->")).toBe("VRAM 2 GB");
    expect(wikiText("'''4 GB''' {{CN}}")).toBe("4 GB");
    expect(wikiText("[https://example.com Intel Core 2 Duo]")).toBe("Intel Core 2 Duo");
  });
  it("Unreal: only the Windows block, minimum and recommended as written", () => {
    const r = windowsRequirements(fixture("unreal.wiki"));
    expect(r.families).toEqual(["Windows", "Mac OS"]);
    expect(r.minimum).toMatchObject({
      os: "Windows NT, 95, 98",
      cpu: "Intel Pentium 166 MHz",
    });
    expect(r.minimum!.ramGB).toBeCloseTo(16 / 1024, 5);
    expect(r.minimum!.storageGB).toBeCloseTo(100 / 1024, 5);
    expect(r.minimum!.raw).toContain("Graphics: 2 MB VRAM");
    expect(r.recommended).toMatchObject({
      cpu: "Intel Pentium II 266 MHz",
      gpu: "3dfx Voodoo 2",
    });
    expect(r.recommended!.ramGB).toBeCloseTo(128 / 1024, 5);
    expect(r.recommended!.storageGB).toBeCloseTo(450 / 1024, 5);
    expect(r.recommended!.os).toBeUndefined();
    // Nothing of the Mac OS block.
    expect(JSON.stringify(r)).not.toMatch(/PowerPC|7\.6/);
  });
  it("The Witcher 3: notes dropped, alternatives joined, the extra presets ignored", () => {
    const r = windowsRequirements(fixture("witcher3-sysreq.wiki"));
    expect(r.minimum).toMatchObject({
      os: "Windows 11",
      cpu: "Intel Core i3-8400 / AMD Ryzen 5 2600",
      ramGB: 12,
      storageGB: 60,
      vramGB: 6,
    });
    expect(r.minimum!.gpu).toContain("Nvidia GeForce GTX 1660");
    expect(r.minimum!.raw).not.toMatch(/note|Update 5\.00/);
    expect(r.recommended).toMatchObject({ ramGB: 16, vramGB: 8 });
    expect(JSON.stringify(r)).not.toMatch(/13700K|Ultra|1440p/);
  });
  it("Prince of Persia: only DOS and Mac OS blocks → no Windows requirements", () => {
    const r = windowsRequirements(fixture("prince-of-persia.wiki"));
    expect(r.minimum).toBeUndefined();
    expect(r.families).toEqual(["DOS", "Mac OS"]);
    expect(pageYears(fixture("prince-of-persia.wiki"))).toEqual([
      1990, 1992, 2014, 2014, 2014,
    ]);
  });
  it("names and page addresses", () => {
    expect(pcgwNames("Unreal: Gold", ["Unreal Gold"])).toEqual([
      "Unreal: Gold",
      "Unreal Gold",
    ]);
    expect(pcgwNames("Half-Life 2")).toEqual(["Half-Life 2"]);
    expect(pcgwPageUrl("The Witcher 3: Wild Hunt")).toBe(
      "https://www.pcgamingwiki.com/wiki/The_Witcher_3:_Wild_Hunt",
    );
    expect(pcgwPageUrl("Assassin's Creed (2007)")).toBe(
      "https://www.pcgamingwiki.com/wiki/Assassin's_Creed_(2007)",
    );
  });
});

describe("PCGamingWiki lookup", () => {
  it('My Abandonware "Unreal: Gold" (2000) → the wiki\'s "Unreal Gold" redirect → Unreal', async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Unreal: Gold", year: 2000 });
    expect(r).toMatchObject({
      status: "found",
      title: "Unreal",
      url: "https://www.pcgamingwiki.com/wiki/Unreal",
    });
    expect(r.minimum?.cpu).toBe("Intel Pentium 166 MHz");
    // One request: every name variant at once.
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.get("titles")).toBe(
      "Unreal: Gold (2000)|Unreal Gold (2000)|Unreal: Gold|Unreal Gold",
    );
  });
  it("2.1.5: a name typed by hand with a year in brackets still finds the page", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Unreal Gold (1998)" });
    expect(r).toMatchObject({ status: "found", title: "Unreal" });
    expect(r.minimum?.cpu).toBe("Intel Pentium 166 MHz");
  });
  it("a known Steam AppID finds the page without any name or year matching", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Unreal Gold", appId: 13250, year: 2008 });
    expect(r).toMatchObject({ status: "found", title: "Unreal" });
    expect(calls[0]).toContain("/api/appid.php?appid=13250");
    expect(new URL(calls[1]).searchParams.get("titles")).toBe("Unreal");
  });
  it("an unknown AppID falls back to the name", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Unreal Gold", appId: 999999 });
    expect(r).toMatchObject({ status: "found", title: "Unreal" });
  });
  it("a page of another game with the same name (other year) is not used", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Unreal", year: 1991 });
    expect(r.status).toBe("not_found");
    expect(r.message).toBe(
      "PCGamingWiki'de yalnızca DOS gereksinimi var; Windows için yok.",
    );
  });
  it("a page with only DOS / Mac OS requirements gives none, and says so", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "Prince of Persia", year: 1990 });
    expect(r).toMatchObject({
      status: "not_found",
      message: "PCGamingWiki'de yalnızca DOS / Mac OS gereksinimi var; Windows için yok.",
    });
  });
  it("different capitals: the wiki's own title match finds it", async () => {
    fakeWiki();
    const r = await pcgwRequirements({ name: "unreal gold" });
    expect(r).toMatchObject({ status: "found", title: "Unreal" });
    expect(calls.some((c) => c.includes("srwhat=nearmatch"))).toBe(true);
  });
  it("an unknown game is 'not found', an unreachable wiki is 'unavailable'", async () => {
    fakeWiki();
    expect(await pcgwRequirements({ name: "Bilinmeyen Oyun 1997" })).toEqual({
      status: "not_found",
      message: undefined,
    });
    fakeWiki(true);
    const r = await pcgwRequirements({ name: "Unreal: Gold", year: 2000 });
    expect(r.status).toBe("unavailable");
    expect(r.message).toMatch(/^PCGamingWiki'ye ulaşılamadı/);
  });
});

describe("PCGamingWiki in the game refresh", () => {
  const open = () => new Store(root);
  it("a My Abandonware game gets the wiki's requirements and the hardware stage", async () => {
    fakeWiki();
    const store = open();
    try {
      const id = store.add([
        {
          name: "Unreal: Gold",
          origin: {
            store: "My Abandonware",
            id: "unreal-gold-cq8",
            url: "https://www.myabandonware.com/game/unreal-gold-cq8",
          },
        } as any,
      ]).added[0];
      store.metadata(id, { year: 2000 });
      // My Abandonware, HowLongToBeat, Metacritic and Steam are offline here.
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.requirementSource).toMatchObject({
        store: "PCGamingWiki",
        url: "https://www.pcgamingwiki.com/wiki/Unreal",
      });
      expect(g.pcgw).toMatchObject({ status: "found", title: "Unreal" });
      expect(g.minimum.cpu).toBe("Intel Pentium 166 MHz");
      expect(g.recommended.gpu).toBe("3dfx Voodoo 2");
      // 2.1.0: these 1990s parts are compared from the hardware data; no
      // AI hardware stage is needed.
      expect(
        researchStages(true, g, {
          ...store.state.hardware,
          cpu: "Intel Core i5-4460",
          gpu: "NVIDIA GeForce GTX 1660 SUPER",
          directX: 12.1,
        }),
      ).toEqual(["summary"]);
      // The wiki cannot be reached on the next refresh: what it gave stays.
      fakeWiki(true);
      await new Providers(store, () => "").enrich(id, true);
      const again = store.requireGames([id])[0];
      expect(again.minimum.cpu).toBe("Intel Pentium 166 MHz");
      expect(again.requirementSource?.store).toBe("PCGamingWiki");
      expect(again.pcgw?.status).toBe("unavailable");
    } finally {
      store.close();
    }
  });
  it("not on the wiki either → none, and no hardware stage", async () => {
    fakeWiki();
    const store = open();
    try {
      const id = store.add([
        { name: "Prince of Persia", origin: { store: "none" } } as any,
      ]).added[0];
      store.metadata(id, { year: 1990 });
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.requirementSource?.store).not.toBe("PCGamingWiki");
      expect(g.pcgw).toMatchObject({
        status: "not_found",
        message:
          "PCGamingWiki'de yalnızca DOS / Mac OS gereksinimi var; Windows için yok.",
      });
      expect(researchStages(true, g, store.state.hardware)).toEqual(["summary"]);
      expect(researchStages(false, g, store.state.hardware)).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("a store that publishes requirements is used alone (the wiki is not asked)", async () => {
    const fx = JSON.parse(
      fs.readFileSync(path.resolve("tests/fixtures/stores-1.0.16.json"), "utf8"),
    );
    calls.length = 0;
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.includes("appdetails"))
        return reply({
          12140: {
            success: true,
            data: {
              name: "Max Payne",
              header_image: "https://shared.steamstatic.com/header.jpg",
              developers: ["Remedy Entertainment"],
              publishers: ["Rockstar Games"],
              genres: [{ description: "Aksiyon" }],
              release_date: { date: "12 Tem 2001" },
              short_description: "Max Payne, kaybedecek hiçbir şeyi olmayan bir adam.",
              platforms: { windows: true },
              pc_requirements: { minimum: fx.steam["12140"].minimum },
            },
          },
        });
      if (url.includes("steamstatic"))
        return {
          text: "",
          url,
          body: Buffer.from([0xff, 0xd8, 0xff]),
          type: "image/jpeg",
        };
      throw new Error("offline");
    });
    const store = open();
    try {
      const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.requirementSource?.store).toBe("Steam");
      expect(g.pcgw).toBeUndefined();
      expect(calls.some((c) => c.includes("pcgamingwiki"))).toBe(false);
    } finally {
      store.close();
    }
  });
  it("the retry asks only the wiki and stops at the first unreachable answer", async () => {
    const store = open();
    try {
      const ids = store.add([
        { name: "Unreal: Gold", origin: { store: "none" } } as any,
        { name: "Prince of Persia", origin: { store: "none" } } as any,
      ]).added;
      const at = "2026-10-01T00:00:00Z";
      for (const id of ids)
        store.metadata(id, { pcgw: { status: "unavailable", checkedAt: at } });
      const queue = new MetadataQueue(new Providers(store, () => ""), store);
      fakeWiki(true);
      queue.addRequirements(ids);
      await vi.waitFor(() => expect(queue.state.running).toBe(false));
      expect(calls.every((c) => c.includes("pcgamingwiki"))).toBe(true);
      // The second game was not tried after the first could not reach the wiki.
      expect(store.requireGames([ids[1]])[0].pcgw?.checkedAt).toBe(at);
      fakeWiki();
      queue.addRequirements(ids);
      await vi.waitFor(() => expect(queue.state.running).toBe(false), { timeout: 5000 });
      const [a, b] = store.requireGames(ids);
      expect(a.requirementSource?.store).toBe("PCGamingWiki");
      expect(a.minimum.cpu).toBe("Intel Pentium 166 MHz");
      expect(b.pcgw?.status).toBe("not_found");
      expect(b.fetchStatus).not.toBe("error");
    } finally {
      store.close();
    }
  });
  it("2.0.5 migration: games without requirements are refreshed once", () => {
    const state = initialState() as AppState;
    state.migrations = state.migrations.filter((m) => m !== PCGW_MIGRATION);
    const at = "2026-10-01T00:00:00Z";
    state.games = [
      { ...newGame("Unreal: Gold", 0), catalogCheckedAt: at },
      {
        ...newGame("Portal 2", 1),
        catalogCheckedAt: at,
        minimum: { raw: "Memory: 2 GB RAM", ramGB: 2 },
      },
      { ...newGame("Henüz bakılmadı", 2) },
    ] as any;
    fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
    const store = new Store(root);
    try {
      expect(store.state.games.map((g) => !!g.storeSync)).toEqual([true, false, false]);
      expect(store.state.migrations).toContain(PCGW_MIGRATION);
    } finally {
      store.close();
    }
  });
});

// 2.0.7: what the platform leaves empty comes from the same PCGamingWiki page.
describe("PCGamingWiki fills missing information", () => {
  const open = () => new Store(root);
  // The wiki stand-in plus Steam's answer and the wiki's image server.
  const withImages = (steam?: any) => {
    fakeWiki();
    const wikiImpl = vi.mocked(webRequest).getMockImplementation()!;
    vi.mocked(webRequest).mockImplementation(async (url: string, o: any) => {
      const u = new URL(url);
      if (u.hostname === "images.pcgamingwiki.com") {
        calls.push(url);
        return {
          text: "",
          url,
          body: Buffer.from([0xff, 0xd8, 0xff]),
          type: "image/jpeg",
        };
      }
      if (steam && url.includes("appdetails")) {
        calls.push(url);
        return reply(steam);
      }
      return wikiImpl(url, o);
    });
  };
  it("reads the infobox and the introduction; the cover's address", () => {
    const unreal = pcgwInfo(fixture("unreal.wiki"));
    expect(unreal).toMatchObject({
      cover: "Unreal cover.jpg",
      developers: ["Epic MegaGames", "Digital Extremes"],
      publishers: ["GT Interactive"],
      year: 1998,
      releaseDate: "1998-05-22",
      genres: ["Action", "FPS", "Shooter"],
    });
    expect(unreal.description).toBe(
      "Unreal is a singleplayer and multiplayer first-person FPS game in the Unreal series developed by Epic MegaGames and Digital Extremes and published by GT Interactive. The game marks the origin of Unreal Engine, a proprietary game engine that would see future iterations and be licensed to other developers.",
    );
    // A later Windows port (2014) is not the release year of a 1990 DOS game.
    expect(pcgwInfo(fixture("prince-of-persia.wiki"))).toEqual({
      cover: "Prince of Persia cover.jpg",
      developers: [],
      publishers: [],
      year: 1990,
      genres: [],
    });
    // Addresses checked against the wiki's own answer (imageinfo).
    expect(pcgwImageUrl("Unreal cover.jpg")).toBe(
      "https://images.pcgamingwiki.com/7/71/Unreal_cover.jpg",
    );
    expect(pcgwImageUrl("File:Prince of Persia cover.jpg")).toBe(
      "https://images.pcgamingwiki.com/c/c1/Prince_of_Persia_cover.jpg",
    );
    expect(pcgwImageUrl("notes.txt")).toBeUndefined();
  });
  it("My Abandonware: empty fields filled, the game's own data kept", async () => {
    withImages();
    const store = open();
    try {
      const id = store.add([
        {
          name: "Unreal: Gold",
          origin: {
            store: "My Abandonware",
            id: "unreal-gold-cq8",
            url: "https://www.myabandonware.com/game/unreal-gold-cq8",
          },
        } as any,
      ]).added[0];
      store.metadata(id, { year: 2000, developers: ["Epic Games"] });
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.cover).toMatch(/\.img$/);
      expect(fs.existsSync(path.join(root, "media", g.cover!))).toBe(true);
      expect(calls).toContain("https://images.pcgamingwiki.com/7/71/Unreal_cover.jpg");
      expect(g.developers).toEqual(["Epic Games"]);
      expect(g.publishers).toEqual(["GT Interactive"]);
      expect(g.genres).toEqual(["Action", "FPS", "Shooter"]);
      expect(g.description).toMatch(/^Unreal is a singleplayer and multiplayer/);
      // The Gold edition's own year stays; the 1998 date is another release.
      expect(g.year).toBe(2000);
      expect(g.releaseDate).toBeUndefined();
      const source = g.sources.find((s) => s.title === "PCGamingWiki");
      expect(source).toMatchObject({
        url: "https://www.pcgamingwiki.com/wiki/Unreal",
        kind: "community",
      });
      expect(source?.fields).toEqual(["cover", "publishers", "genres", "description"]);
      // Requirements as in 2.0.5.
      expect(g.requirementSource?.store).toBe("PCGamingWiki");
    } finally {
      store.close();
    }
  });
  it("Steam leaves fields empty: only those come from the wiki, Steam's requirements stay", async () => {
    withImages({
      13250: {
        success: true,
        data: {
          name: "Unreal Gold",
          platforms: { windows: true },
          release_date: { date: "17 Mar 2008" },
          pc_requirements: {
            minimum:
              "<strong>Minimum:</strong><ul><li><strong>Memory:</strong> 32 MB RAM</li></ul>",
          },
        },
      },
    });
    const store = open();
    try {
      const id = store.add([{ name: "Unreal Gold", appId: 13250 }]).added[0];
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.requirementSource?.store).toBe("Steam");
      expect(g.pcgw).toBeUndefined();
      expect(g.minimum.ramGB).toBeCloseTo(32 / 1024);
      // Found through the game's own Steam ID.
      expect(calls.some((c) => c.includes("/api/appid.php?appid=13250"))).toBe(true);
      expect(g.developers).toEqual(["Epic MegaGames", "Digital Extremes"]);
      expect(g.genres).toEqual(["Action", "FPS", "Shooter"]);
      expect(g.cover).toMatch(/\.img$/);
      expect(g.year).toBe(2008);
      expect(g.releaseDate).toBe("2008-03-17");
    } finally {
      store.close();
    }
  });
  it("'Platform yok': the page with only DOS requirements still gives its cover and year", async () => {
    withImages();
    const store = open();
    try {
      const id = store.add([
        { name: "Prince of Persia", origin: { store: "none" } } as any,
      ]).added[0];
      await new Providers(store, () => "").enrich(id, true);
      const g = store.requireGames([id])[0];
      expect(g.cover).toMatch(/\.img$/);
      expect(g.year).toBe(1990);
      expect(g.pcgw?.status).toBe("not_found");
      expect(researchStages(true, g, store.state.hardware)).toEqual(["summary"]);
    } finally {
      store.close();
    }
  });
  it("2.0.7 migration: games with empty information are refreshed once", () => {
    const state = initialState() as AppState;
    state.migrations = state.migrations.filter((m) => m !== PCGW_INFO_MIGRATION);
    const at = "2026-10-01T00:00:00Z";
    const full = {
      cover: "a".repeat(64) + ".img",
      developers: ["A"],
      publishers: ["B"],
      year: 2004,
      genres: ["Aksiyon"],
      description: "Bir oyun.",
      catalogCheckedAt: at,
    };
    state.games = [
      { ...newGame("Kapaksız", 0), ...full, cover: undefined },
      { ...newGame("Tam", 1), ...full },
      { ...newGame("Henüz bakılmadı", 2) },
    ] as any;
    fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
    const store = new Store(root);
    try {
      expect(store.state.games.map((g) => !!g.storeSync)).toEqual([true, false, false]);
      expect(store.state.migrations).toContain(PCGW_INFO_MIGRATION);
    } finally {
      store.close();
    }
  });
});

describe("2.0.5 updater: no script, no console window", () => {
  class FakeChild extends EventEmitter {
    unref = vi.fn();
  }
  const ready = (file: string, quit = vi.fn(), spawn?: any, handoffWait?: number) => {
    const u = new Updater("2.0.5", {
      platform: "win32",
      portableExe: () => "C:\\Oyun\\Oyun-Siralayici-2.0.5-Portable.exe",
      quit,
      spawn,
      handoffWait,
    });
    u.state = { ...u.state, status: "ready", latest: "2.0.6", file };
    return u;
  };
  it("starts the new EXE directly (detached, hidden from nothing), then waits for it", async () => {
    const file = path.join(root, "Oyun-Siralayici-2.0.6-Portable.exe");
    fs.writeFileSync(file, "exe");
    const child = new FakeChild();
    const spawn = vi.fn(() => {
      setTimeout(() => child.emit("spawn"), 5);
      return child;
    });
    const quit = vi.fn();
    process.env.PORTABLE_EXECUTABLE_FILE = "C:\\Oyun\\eski.exe";
    process.env.CHROME_CRASHPAD_PIPE_NAME = "\\\\.\\pipe\\crashpad";
    try {
      const u = ready(file, quit, spawn);
      await u.install();
      expect(spawn).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = spawn.mock.calls[0] as any;
      expect(cmd).toBe(file);
      expect(args).toEqual([]);
      expect(opts).toMatchObject({ cwd: root, detached: true, stdio: "ignore" });
      expect(cmd).not.toMatch(/cmd\.exe|powershell/i);
      expect(opts.env.PORTABLE_EXECUTABLE_FILE).toBeUndefined();
      expect(opts.env.CHROME_CRASHPAD_PIPE_NAME).toBeUndefined();
      const info = JSON.parse(opts.env.OYUN_GUNCELLEME);
      expect(info.eski).toBe("C:\\Oyun\\Oyun-Siralayici-2.0.5-Portable.exe");
      expect(info.token).toMatch(/^[a-f0-9]{48}$/);
      expect(child.unref).toHaveBeenCalled();
      expect(u.state.status).toBe("installing");
      expect(quit).not.toHaveBeenCalled();
      // A wrong token changes nothing; the right one closes this app.
      expect(u.handoff("yanlis")).toBe(false);
      expect(quit).not.toHaveBeenCalled();
      expect(u.handoff(info.token)).toBe(true);
      expect(quit).toHaveBeenCalledTimes(1);
      expect(u.handoff(info.token)).toBe(false);
      expect(fs.readdirSync(root).some((n) => n.endsWith(".cmd"))).toBe(false);
    } finally {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
      delete process.env.CHROME_CRASHPAD_PIPE_NAME;
    }
  });
  it("a start that fails is reported and can be retried", async () => {
    const file = path.join(root, "yeni.exe");
    fs.writeFileSync(file, "exe");
    const child = new FakeChild();
    const spawn = vi.fn(() => {
      setTimeout(
        () =>
          child.emit(
            "error",
            Object.assign(new Error("spawn EACCES"), { code: "EACCES" }),
          ),
        5,
      );
      return child;
    });
    const u = ready(file, vi.fn(), spawn);
    await expect(u.install()).rejects.toThrow(
      /Yeni sürüm başlatılamadı \(spawn EACCES\)/,
    );
    expect(u.state.status).toBe("ready");
  });
  it("no answer from the new version → a visible note after the wait", async () => {
    const file = path.join(root, "yeni.exe");
    fs.writeFileSync(file, "exe");
    const child = new FakeChild();
    const spawn = vi.fn(() => {
      setTimeout(() => child.emit("spawn"), 1);
      return child;
    });
    const u = ready(file, vi.fn(), spawn, 30);
    await u.install();
    await vi.waitFor(() => expect(u.state.note).toMatch(/2 dakikadır açılmadı/));
    expect(u.state.status).toBe("installing");
  });
});

describe("2.0.5 new version's cleanup after an update", () => {
  it("reads the update note once and never hands it down", () => {
    const env: NodeJS.ProcessEnv = {
      OYUN_GUNCELLEME: JSON.stringify({
        token: "a".repeat(48),
        eski: "C:\\x\\eski.exe",
        pid: 1,
      }),
    };
    expect(readHandoff(env)).toEqual({ token: "a".repeat(48), eski: "C:\\x\\eski.exe" });
    expect(env.OYUN_GUNCELLEME).toBeUndefined();
    expect(readHandoff({ OYUN_GUNCELLEME: "{bozuk" })).toBeUndefined();
    expect(
      readHandoff({ OYUN_GUNCELLEME: JSON.stringify({ token: "kısa" }) }),
    ).toBeUndefined();
  });
  it("deletes the old EXE once it is free, keeping a record until then", async () => {
    const old = path.join(root, "Oyun-Siralayici-2.0.5-Portable.exe"),
      record = path.join(root, "data", "guncelleme-temizlik.json");
    fs.writeFileSync(old, "eski");
    const real = fs.rmSync;
    let locked = 3;
    vi.spyOn(fs, "rmSync").mockImplementation(((p: any, o: any) => {
      if (p === old && locked-- > 0)
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      return real(p, o);
    }) as any);
    const done = removeOldExe(old, { record, delay: 5 });
    await new Promise((r) => setTimeout(r, 2));
    expect(JSON.parse(fs.readFileSync(record, "utf8")).file).toBe(old);
    expect(await done).toBe("removed");
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(record)).toBe(false);
  });
  it("never deletes its own EXE or anything that is not an .exe; finishes a recorded deletion", async () => {
    const own = path.join(root, "yeni.exe"),
      record = path.join(root, "kayit.json");
    fs.writeFileSync(own, "yeni");
    expect(await removeOldExe(own, { own, record })).toBe("skipped");
    expect(await removeOldExe(path.join(root, "notlar.txt"), { record })).toBe("skipped");
    expect(await removeOldExe("goreli.exe", { record })).toBe("skipped");
    expect(fs.existsSync(own)).toBe(true);
    const old = path.join(root, "eski.exe");
    fs.writeFileSync(old, "eski");
    fs.writeFileSync(
      record,
      JSON.stringify({ file: old, since: new Date().toISOString() }),
    );
    expect(await resumeOldExeCleanup(record, own)).toBe("removed");
    expect(fs.existsSync(old)).toBe(false);
    fs.writeFileSync(old, "eski");
    fs.writeFileSync(
      record,
      JSON.stringify({ file: old, since: "2026-01-01T00:00:00Z" }),
    );
    expect(await resumeOldExeCleanup(record, own)).toBe("skipped");
    expect(fs.existsSync(old)).toBe(true);
    expect(fs.existsSync(record)).toBe(false);
  });
  it("stops what 2.0.0–2.0.4 left behind, hidden, script first", async () => {
    const temp = path.join(root, "temp");
    fs.mkdirSync(temp);
    const runs: any[] = [];
    const run = vi.fn((cmd: string, args: string[], opts: any) => {
      runs.push({ cmd, args, opts });
      const child = new EventEmitter() as any;
      child.kill = vi.fn();
      setTimeout(() => child.emit("exit", 0), 1);
      return child;
    });
    expect(await stopLegacyUpdaters(temp, run as any)).toBe(0);
    expect(run).not.toHaveBeenCalled();
    fs.writeFileSync(
      path.join(temp, "oyun-siralayici-guncelle-1760000000000.cmd"),
      "@echo off",
    );
    fs.writeFileSync(path.join(temp, "baska-dosya.cmd"), "@echo off");
    expect(legacyScripts(temp)).toHaveLength(1);
    expect(await stopLegacyUpdaters(temp, run as any)).toBe(1);
    expect(runs[0].cmd).toBe("powershell.exe");
    expect(runs[0].opts).toMatchObject({ windowsHide: true, stdio: "ignore" });
    expect(runs[0].opts.detached).toBeUndefined();
    const script = Buffer.from(runs[0].args.at(-1), "base64").toString("utf16le");
    expect(script).toBe(LEGACY_STOP_SCRIPT);
    expect(script.indexOf("Stop-Process -Id $s.ProcessId")).toBeLessThan(
      script.indexOf("Stop-Process -Id $k.ProcessId"),
    );
    expect(fs.readdirSync(temp)).toEqual(["baska-dosya.cmd"]);
  });
  // Runs the real stop logic in PowerShell (when available) on a made-up
  // process list; Stop-Process only records what it would stop.
  const pwsh = [process.env.PWSH, "/tmp/pwsh/pwsh"].find((p) => p && fs.existsSync(p));
  it.skipIf(!pwsh)(
    "spares this app and what started it, stops the stuck script and its programs",
    () => {
      const script = [
        "$global:killed = @()",
        "function Stop-Process { param([int]$Id, [switch]$Force) $global:killed += $Id }",
        "$t0 = [datetime]'2026-10-16T10:00:00'",
        "function P($id, $parent, $name, $cmd, $min) { [pscustomobject]@{ ProcessId = [uint32]$id; ParentProcessId = [uint32]$parent; Name = $name; CommandLine = $cmd; CreationDate = $t0.AddMinutes($min) } }",
        "$all = @(",
        "  (P 4 0 'System' $null 0),",
        "  (P 100 4 'explorer.exe' 'C:\\Windows\\explorer.exe' 1),",
        // An earlier, stuck update: script → pipe side → find (+ its console).
        "  (P 200 100 'Oyun Siralayici.exe' $null 2),",
        "  (P 300 200 'cmd.exe' 'cmd.exe /d /c \"C:\\Temp\\oyun-siralayici-guncelle-1760000000000.cmd\"' 3),",
        "  (P 301 300 'cmd.exe' 'C:\\WINDOWS\\system32\\cmd.exe  /S /D /c\" find \"1324\" \"' 4),",
        "  (P 302 301 'find.exe' 'find  \"1324\"' 4),",
        "  (P 303 302 'conhost.exe' $null 4),",
        // Its ID reused by an older program's parent field: not a child.
        "  (P 310 300 'notepad.exe' 'notepad.exe' 2.5),",
        // The script that started this version (2.0.4 → 2.0.5): left alone.
        "  (P 400 100 'cmd.exe' 'cmd.exe /d /c \"C:\\Temp\\oyun-siralayici-guncelle-1760000999999.cmd\"' 10),",
        "  (P 404 400 'PING.EXE' 'ping -n 2 127.0.0.1' 10.5),",
        "  (P 401 400 'Oyun-Siralayici-2.0.5-Portable.exe' $null 11),",
        "  (P 402 401 'Oyun Siralayici.exe' $null 12),",
        "  (P 403 402 'Oyun Siralayici.exe' '--type=renderer' 13),",
        "  (P $PID 402 'powershell.exe' 'powershell.exe' 14)",
        ")",
        LEGACY_STOP_LOGIC,
        "($global:killed | Sort-Object) -join ','",
      ].join("\n");
      const out = execFileSync(pwsh!, [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ]).toString();
      expect(out.trim()).toBe("300,301,302,303");
    },
  );
});
