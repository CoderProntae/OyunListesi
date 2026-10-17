import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { Service } from "../electron/service";
import { communityTimes, hltbSearchTerms, hltbFromParent } from "../electron/catalogs";
import { metacriticScore } from "../electron/metacritic";
import { webRequest } from "../electron/network";
import { researchStages } from "../electron/research-plan";
import { researchProgress } from "../shared/research-progress";
import {
  initialState,
  newGame,
  suggestedSeriesName,
  TITLE_SEARCH_MIGRATION,
} from "../shared/domain";
import type { AppState, Game } from "../shared/types";

vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(),
}));
const reply = (value: any, url = "https://example.com/") => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  url,
  body: Buffer.from(""),
  type: "application/json",
});
let root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/204-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.mocked(webRequest).mockReset();
  vi.restoreAllMocks();
});

describe("hardware stage only for games whose store published requirements", () => {
  const hardware = initialState().hardware;
  const bare = (): Game => newGame("Unreal: Gold", 0);
  // 2.1.0: the hardware stage exists only for a row the hardware data cannot
  // decide (here an unknown CPU name on a computer with a known CPU).
  const known = { ...hardware, cpu: "Intel Core i5-4460" };
  const withReq = (): Game => ({
    ...newGame("Portal 2", 0),
    minimum: { raw: "Processor: Fixture CPU X1", cpu: "Fixture CPU X1", ramGB: 2 },
  });
  const computed = (): Game => ({
    ...newGame("Portal 2", 0),
    minimum: { raw: "Memory: 2 GB RAM", ramGB: 2 },
  });
  it("lists no hardware stage without requirements", () => {
    expect(researchStages(true, bare(), hardware)).toEqual(["summary"]);
    expect(researchStages(false, bare(), hardware)).toEqual([]);
    expect(researchStages(true, withReq(), known)).toEqual(["hardware", "summary"]);
    expect(researchStages(false, withReq(), known)).toEqual(["hardware"]);
    expect(researchStages(true, computed(), known)).toEqual(["summary"]);
    // Without a game the full list stays (old callers).
    expect(researchStages(true)).toEqual(["hardware", "summary"]);
    const p = researchProgress(bare(), hardware, true);
    expect(p.stages).toEqual(["summary"]);
    expect(p.pending).toEqual(["summary"]);
    expect(p.missing).toEqual(["oyun özeti"]);
  });
  const services: Service[] = [];
  afterEach(async () => {
    for (const s of services) {
      await s.call("stopResearch");
      s.close();
    }
    await new Promise((r) => setTimeout(r, 10));
    for (const s of services) s.store.close();
    services.length = 0;
  });
  const service = () => {
    const s = new Service(root);
    services.push(s);
    vi.spyOn(s.queue, "add").mockImplementation(() => {});
    s.store.settings({ lmModel: "test", requireApproval: false });
    vi.spyOn(s.lm, "models").mockResolvedValue([
      {
        id: "test",
        name: "test",
        loaded: true,
        context: null,
        tools: true,
        reasoning: [],
      },
    ]);
    return s;
  };
  const idle = (s: Service) =>
    vi.waitFor(() => {
      expect(s.agent.busy.size).toBe(0);
      expect((s as any).researchTasks.size).toBe(0);
    });
  it("a new game without requirements gets only the summary stage", async () => {
    const s = service();
    s.store.settings({ autoSummary: true });
    const id = s.store.add([{ name: "Unreal: Gold" }]).added[0];
    const stream = vi
      .spyOn(s.lm, "stream")
      .mockResolvedValue({ text: "Özet yazılmadı.", thinking: "", calls: [] });
    await s.call("researchGame", { id });
    await idle(s);
    const prompts = JSON.stringify(stream.mock.calls.map((c) => c[0]));
    expect(prompts).toContain("AŞAMA: ÖZET");
    expect(prompts).not.toContain("AŞAMA: DONANIM");
  });
  it("summary off: no model call, no empty research chat, a clear message", async () => {
    const s = service();
    s.store.settings({ autoSummary: false });
    const id = s.store.add([{ name: "Unreal: Gold" }]).added[0];
    const chats = s.store.state.chats.length;
    const stream = vi.spyOn(s.lm, "stream");
    await s.call("researchGame", { id });
    await idle(s);
    expect(stream).not.toHaveBeenCalled();
    expect(s.store.state.chats.length).toBe(chats);
    const g = s.store.requireGames([id])[0];
    expect(g.research?.status).toBe("done");
    expect(g.research?.message).toContain("Sistem gereksinimi bulunamadığı için");
  });
  it("a game with requirements still runs the hardware stage", async () => {
    const s = service();
    s.store.settings({ autoSummary: false });
    const id = s.store.add([{ name: "Portal 2" }]).added[0];
    s.store.hardware({ gpu: "NVIDIA GeForce GTX 1660 SUPER" });
    s.store.metadata(id, {
      minimum: { raw: "Graphics: Fixture GPU Z9", gpu: "Fixture GPU Z9" },
    });
    const stream = vi
      .spyOn(s.lm, "stream")
      .mockResolvedValue({ text: "Kaydedilmedi.", thinking: "", calls: [] });
    await s.call("researchGame", { id });
    await idle(s);
    expect(JSON.stringify(stream.mock.calls[0]?.[0])).toContain("AŞAMA: DONANIM");
  });
});

describe("HowLongToBeat search for names with separators", () => {
  it("builds a second search without separators", () => {
    expect(hltbSearchTerms("Unreal: Gold")).toEqual(["Unreal: Gold", "Unreal Gold"]);
    expect(hltbSearchTerms("Life is Strange - Episode 2")).toEqual([
      "Life is Strange - Episode 2",
      "Life is Strange Episode 2",
    ]);
    expect(hltbSearchTerms("S.T.A.L.K.E.R.: Shadow of Chernobyl")).toEqual([
      "S.T.A.L.K.E.R.: Shadow of Chernobyl",
      "S.T.A.L.K.E.R. Shadow of Chernobyl",
    ]);
    expect(hltbSearchTerms("Half-Life 2")).toEqual(["Half-Life 2"]);
    expect(hltbSearchTerms("Tom Clancy's Splinter Cell")).toEqual([
      "Tom Clancy's Splinter Cell",
    ]);
  });
  const searchAnswers = (answers: Record<string, any>) =>
    vi.mocked(webRequest).mockImplementation(async (url: string, o: any = {}) => {
      if (url.includes("/hltb/search")) {
        const term = JSON.parse(o.body).searchTerm;
        const a = answers[term];
        if (a === 404) throw new Error("Kaynak HTTP 404 döndürdü.");
        if (a === undefined) throw new Error("offline");
        return reply(a);
      }
      throw new Error("offline " + url);
    });
  it("finds Unreal: Gold (My Abandonware) when the exact search answers 404", async () => {
    searchAnswers({
      "Unreal: Gold": 404,
      "Unreal Gold": [
        { title: "Unreal Gold", hltbId: 10827, mainStory: 11.57, completionist: 20 },
      ],
    });
    const t = await communityTimes(newGame("Unreal: Gold", 0));
    expect(t).toMatchObject({
      status: "found",
      main: 11.57,
      url: "https://howlongtobeat.com/game/10827",
      title: "Unreal Gold",
    });
  });
  it('treats "does not yield any results" as no hits and still rejects other games', async () => {
    searchAnswers({
      "Unreal: Gold": "Searchterm 'Unreal: Gold' does not yield any results",
      "Unreal Gold": [{ title: "Unreal Tournament", hltbId: 10830, mainStory: 9 }],
    });
    expect(await communityTimes(newGame("Unreal: Gold", 0))).toBeUndefined();
  });
  it("the exact search is used first when it matches", async () => {
    searchAnswers({
      "Batman: Arkham Asylum": [
        { title: "Batman: Arkham Asylum", hltbId: 881, mainStory: 12 },
      ],
    });
    const t = await communityTimes(newGame("Batman: Arkham Asylum", 0));
    expect(t?.url).toBe("https://howlongtobeat.com/game/881");
    expect(vi.mocked(webRequest)).toHaveBeenCalledTimes(1);
  });
  it("a network failure on every search is still an error (no silent 'not found')", async () => {
    searchAnswers({});
    await expect(communityTimes(newGame("Unreal: Gold", 0))).rejects.toThrow("offline");
  });
  it("base-game lookup for episodes also retries without separators", async () => {
    const page = (row: any, relationships: any[] = []) =>
      `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { game: { data: { game: [row], relationships } } } },
      })}</script>`;
    vi.mocked(webRequest).mockImplementation(async (url: string, o: any = {}) => {
      if (url.includes("/hltb/search")) {
        const term = JSON.parse(o.body).searchTerm;
        if (term === "Diablo II: Lord of Destruction")
          throw new Error("Kaynak HTTP 404 döndürdü.");
        if (term === "Diablo II Lord of Destruction")
          return reply([{ title: "Diablo II: Lord of Destruction", hltbId: 2600 }]);
        return reply(`Searchterm '${term}' does not yield any results`);
      }
      if (url.endsWith("/game/2600"))
        return reply(
          page({ game_name: "Diablo II: Lord of Destruction" }, [
            { game_id: 2601, game_name: "Act V" },
          ]),
        );
      if (url.endsWith("/game/2601"))
        return reply(
          page({ game_name: "Diablo II: Lord of Destruction - Act V", comp_main: 7200 }),
        );
      throw new Error("offline " + url);
    });
    const t = await hltbFromParent({ name: "Diablo II: Lord of Destruction - Act V" });
    expect(t).toMatchObject({
      status: "found",
      main: 2,
      url: "https://howlongtobeat.com/game/2601",
    });
  });
});

describe("Metacritic: listed without a critic score", () => {
  const items = (list: any[]) =>
    vi.mocked(webRequest).mockResolvedValue(reply({ data: { items: list } }));
  const unrealGold = {
    type: "game-title",
    title: "Unreal Gold",
    slug: "unreal-gold",
    premiereYear: 1999,
    criticScoreSummary: { score: null },
  };
  it("reports the listing without inventing a score", async () => {
    items([
      {
        type: "game-title",
        title: "Unreal Tournament 2004",
        slug: "unreal-tournament-2004",
        premiereYear: 2004,
        criticScoreSummary: { score: 93 },
      },
      unrealGold,
    ]);
    const hit = await metacriticScore(["Unreal: Gold"], 2000);
    expect(hit).toEqual({
      score: undefined,
      url: "https://www.metacritic.com/game/unreal-gold/",
      title: "Unreal Gold",
      releaseDate: undefined,
    });
  });
  it("a scored match is still returned with its score", async () => {
    items([
      { ...unrealGold, criticScoreSummary: { score: 81 }, releaseDate: "1999-11-30" },
    ]);
    expect(await metacriticScore(["Unreal Gold"], 2000)).toMatchObject({ score: 81 });
  });
  it("another title or a far year is not taken", async () => {
    items([{ ...unrealGold, premiereYear: 2010 }]);
    expect(await metacriticScore(["Unreal: Gold"], 2000)).toBeUndefined();
    items([
      {
        ...unrealGold,
        title: "Unreal",
        slug: "unreal",
        criticScoreSummary: { score: 92 },
      },
    ]);
    expect(await metacriticScore(["Unreal: Gold"], 2000)).toBeUndefined();
  });
});

describe("manual series", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(root);
  });
  afterEach(() => store.close());
  const names = () => store.state.games.map((g) => g.name);
  it("suggests a name from the chosen games", () => {
    expect(suggestedSeriesName(["Unreal: Gold", "Unreal II: The Awakening"])).toBe(
      "Unreal",
    );
    expect(
      suggestedSeriesName(["Half-Life", "Half-Life 2", "Half-Life: Blue Shift"]),
    ).toBe("Half-Life");
    expect(suggestedSeriesName(["Unreal: Gold"])).toBe("Unreal");
    expect(suggestedSeriesName(["Half-Life 2"])).toBe("Half-Life");
    expect(suggestedSeriesName(["Doom"])).toBe("Doom");
    expect(suggestedSeriesName(["Portal", "Doom"])).toBe("");
    expect(suggestedSeriesName([])).toBe("");
  });
  it("creates, edits members and name, adds games, never reorders (2.0.6); undo works", () => {
    const [a, b, c, d] = store.add([
      { name: "Alpha" },
      { name: "Beta" },
      { name: "Gamma" },
      { name: "Delta" },
    ]).added;
    const s = store.series("create", { ids: [c, a], name: "  Benim serim " })!;
    expect(s.name).toBe("Benim serim");
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    store.series("update", { id: s.id, name: "Yeni ad", ids: [a, d] });
    const series = store.state.series.find((x) => x.id === s.id)!;
    expect(series.name).toBe("Yeni ad");
    const g = (id: string) => store.requireGames([id])[0];
    expect(g(a).seriesId).toBe(s.id);
    expect(g(d).seriesId).toBe(s.id);
    // Taken out by the user: not regrouped automatically.
    expect(g(c).seriesId).toBeUndefined();
    expect(g(c).autoSeries).toBe(false);
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    store.series("add", { id: s.id, ids: [b, a] });
    expect(store.state.games.filter((x) => x.seriesId === s.id)).toHaveLength(3);
    expect(() => store.series("update", { id: s.id, ids: [a] })).toThrow(
      "en az iki oyun",
    );
    store.undo();
    expect(store.state.games.filter((x) => x.seriesId === s.id)).toHaveLength(2);
  });
  it("taking games from another series removes a series left with one game", () => {
    const ids = store.add([
      { name: "Half-Life" },
      { name: "Half-Life 2" },
      { name: "Portal" },
    ]).added;
    const auto = store.state.series.find((x) => x.automatic)!;
    expect(auto).toBeTruthy();
    store.series("create", { ids: [ids[1], ids[2]], name: "Valve" });
    expect(store.state.series.some((x) => x.id === auto.id)).toBe(false);
    expect(store.requireGames([ids[0]])[0].seriesId).toBeUndefined();
    expect(store.requireGames([ids[1]])[0].seriesId).not.toBe(auto.id);
  });
  it("editing an automatic series' games makes it a manual one; renaming alone does not", () => {
    const ids = store.add([
      { name: "Half-Life" },
      { name: "Half-Life 2" },
      { name: "Portal" },
    ]).added;
    const auto = store.state.series.find((x) => x.automatic)!;
    store.series("update", { id: auto.id, name: "Half-Life serisi" });
    expect(store.state.series.find((x) => x.id === auto.id)?.automatic).toBe(true);
    store.series("update", { id: auto.id, ids: [ids[0], ids[1], ids[2]] });
    expect(store.state.series.find((x) => x.id === auto.id)?.automatic).toBe(false);
  });
  it("rejects an empty name and unknown games", () => {
    const [a, b] = store.add([{ name: "A" }, { name: "B" }]).added;
    expect(() => store.series("create", { ids: [a, b], name: "   " })).toThrow();
    expect(() => store.series("create", { ids: [a, "missing"], name: "X" })).toThrow();
  });
});

describe("2.0.4 migration", () => {
  it("refreshes once the games whose times the separator bug hid", () => {
    const state = initialState() as AppState;
    state.migrations = state.migrations.filter((m) => m !== TITLE_SEARCH_MIGRATION);
    const at = "2026-10-01T00:00:00Z";
    state.games = [
      {
        ...newGame("Unreal: Gold", 0),
        catalogCheckedAt: at,
        hltb: { status: "unavailable", checkedAt: at },
      },
      {
        ...newGame("Hades", 1),
        catalogCheckedAt: at,
        hltb: { status: "unavailable", checkedAt: at },
      },
      {
        ...newGame("Batman: Arkham Asylum", 2),
        catalogCheckedAt: at,
        hltb: { status: "found", main: 12, checkedAt: at },
      },
    ] as any;
    fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
    const store = new Store(root);
    try {
      expect(store.state.games.map((g) => !!g.storeSync)).toEqual([true, false, false]);
      expect(store.state.migrations).toContain(TITLE_SEARCH_MIGRATION);
    } finally {
      store.close();
    }
  });
});
