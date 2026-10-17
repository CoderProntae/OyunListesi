import { isStoreProductLink } from "../shared/links";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { Providers } from "../electron/providers";
import {
  communityTimes,
  xboxCatalog,
  epicCatalog,
  epicProductURL,
  gogCatalog,
  hltbFromGog,
  hltbFromPage,
  sameTitle,
} from "../electron/catalogs";
import { webRequest, searchWeb } from "../electron/network";
import { newGame } from "../shared/domain";
import { browserURL, webNavigation } from "../shared/browser";
import { preserveResearchFields, prepareResearch } from "../electron/research";
vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(),
  searchWeb: vi.fn(),
}));
const reply = (value: any, url = "https://example.com/") => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  url,
  body: Buffer.from(""),
  type: "application/json",
});
const offer = {
  id: "live-catalog-id",
  title: "Test Game",
  productSlug: "catalog-provided-slug",
  offerType: "BASE_GAME",
  offerMappings: [{ pageType: "productHome", pageSlug: "catalog-provided-slug" }],
  description: "Epic description",
  developerDisplayName: "Test Developer",
  publisherDisplayName: "Test Publisher",
  tags: [{ name: "Windows" }],
  price: {
    country: "TR",
    price: { discountPrice: 23500, currencyCode: "TRY" },
    updatedAt: "2026-01-08T00:00:00.000Z",
  },
};
const gogProduct = {
  id: "123",
  title: "Test Game",
  productType: "game",
  storeLink: "https://www.gog.com/en/game/supplied_slug",
  price: { finalMoney: { amount: "5.99", currency: "USD" } },
  genres: [{ name: "Simulation" }],
  developers: ["GOG Developer"],
  operatingSystems: ["windows"],
};
const gogHTML =
  '<div class="howlongtobeat-section"><div class="howlongtobeat-box"><span class="howlongtobeat-box__time">53 h</span><span class="howlongtobeat-box__name">Main</span></div><div class="howlongtobeat-box"><span class="howlongtobeat-box__time">94.5 h</span><span class="howlongtobeat-box__name">Main + Sides</span></div><div class="howlongtobeat-box"><span class="howlongtobeat-box__time">172.5 h</span><span class="howlongtobeat-box__name">Completionist</span></div><a href="https://howlongtobeat.com/game/34716">HowLongToBeat</a></div>';
let root: string, store: Store, providers: Providers;
beforeEach(() => {
  vi.resetAllMocks();
  root = fs.mkdtempSync(path.resolve(".cache/catalog-tests-"));
  store = new Store(root);
  providers = new Providers(store, () => "");
  vi.mocked(searchWeb).mockResolvedValue({
    query: "test",
    provider: "fixture",
    results: [],
  });
  vi.mocked(webRequest).mockImplementation(async (url, options) => {
    options?.signal?.throwIfAborted();
    if (url.includes("storesearch")) return reply({ items: [] });
    if (url.includes("catalog.gog.com")) return reply({ products: [] });
    if (url.includes("api.egdata.app")) return reply({ total: 1, offers: [offer] });
    throw new Error("Unexpected URL: " + url);
  });
  vi.spyOn(providers, "image").mockResolvedValue(undefined);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
it("matches titles conservatively without conflating sequels or DLC", () => {
  expect(sameTitle("Hades™", "Hades")).toBe(true);
  expect(sameTitle("Hades II", "Hades")).toBe(false);
  expect(sameTitle("Portal 2: Peer Review", "Portal 2")).toBe(false);
});
it("uses Epic product mappings, never a guessed title or offer urlSlug", () => {
  expect(epicProductURL(offer)).toBe(
    "https://store.epicgames.com/tr/p/catalog-provided-slug",
  );
  expect(
    epicProductURL({ title: "Test Game", urlSlug: "not-a-product" }),
  ).toBeUndefined();
  expect(epicProductURL({ productSlug: "../malicious" })).toBeUndefined();
  expect(epicProductURL({ productSlug: "hades/home" })).toBe(
    "https://store.epicgames.com/tr/p/hades",
  );
  expect(
    epicProductURL({
      offerMappings: [{ pageType: "offer", pageSlug: "mobile-version" }],
    }),
  ).toContain("/p/mobile-version");
});
it("fetches metadata and direct links from Epic when Steam has no match", async () => {
  const id = store.add([{ name: "Test Game", steamMatchMode: "auto" }]).added[0];
  await providers.enrich(id, true);
  const g = store.requireGames([id])[0];
  expect(g.fetchStatus).toBe("done");
  expect(g.fetchError).toBeUndefined();
  expect(g.description).toBe("Epic description");
  expect(g.developers).toEqual(["Test Developer"]);
  expect(g.storeChecks?.map((c) => c.status)).toEqual([
    "not_found",
    "not_found",
    "found",
    "unavailable",
  ]);
  expect(g.stores[0]).toMatchObject({
    name: "Epic Games",
    price: "235.00 TRY",
    priceUpdatedAt: "2026-01-08T00:00:00.000Z",
  });
  expect(vi.mocked(webRequest).mock.calls.some(([u]) => u.includes("steamdb"))).toBe(
    false,
  );
});
it("preserves failed-vs-absent status separately and does not fail the whole game", async () => {
  const base = vi.mocked(webRequest).getMockImplementation()!;
  vi.mocked(webRequest).mockImplementation((url, options) => {
    if (url.includes("storesearch")) throw new Error("HTTP 503");
    return base(url, options);
  });
  const id = store.add([{ name: "Test Game", steamMatchMode: "auto" }]).added[0];
  await providers.enrich(id, true);
  expect(store.requireGames([id])[0].storeChecks?.map((c) => c.status)).toEqual([
    "unavailable",
    "not_found",
    "found",
    "unavailable",
  ]);
  expect(store.requireGames([id])[0].fetchStatus).toBe("done");
});
it("does not interpret malformed provider JSON as absence", async () => {
  vi.mocked(webRequest).mockResolvedValue(reply({ error: "changed API" }));
  await expect(epicCatalog(newGame("Test Game", 0))).rejects.toThrow("tanınmadı");
  await expect(gogCatalog(newGame("Test Game", 0))).rejects.toThrow("tanınmadı");
});
it("accepts legacy OTHERS desktop offers, deduplicates one canonical page and ignores mobile variants", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({
      total: 3,
      offers: [
        { ...offer, offerType: "OTHERS" },
        { ...offer, id: "duplicate", offerType: "OTHERS", offerMappings: null },
        {
          ...offer,
          id: "mobile",
          tags: [{ name: "Android" }],
          productSlug: "mobile",
          offerMappings: [{ pageType: "offer", pageSlug: "mobile" }],
        },
      ],
    }),
  );
  const result = await epicCatalog(newGame("Test Game", 0));
  expect(result.check.status).toBe("found");
  expect(result.check.url).toContain("catalog-provided-slug");
  expect(JSON.parse(vi.mocked(webRequest).mock.calls[0][1]!.body!)).not.toHaveProperty(
    "offerType",
  );
});
it("different same-name Epic products remain ambiguous instead of silently choosing", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({
      total: 2,
      offers: [
        offer,
        {
          ...offer,
          productSlug: "another-product",
          offerMappings: [{ pageType: "productHome", pageSlug: "another-product" }],
        },
      ],
    }),
  );
  const result = await epicCatalog(newGame("Test Game", 0));
  expect(result.check.status).toBe("review");
  expect(result.patch).toBeUndefined();
});
it("does not guess a GOG link from a slug", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({ products: [{ ...gogProduct, storeLink: undefined, slug: "test_game" }] }),
  );
  await expect(gogCatalog(newGame("Test Game", 0))).rejects.toThrow("bağlantısı");
});
it("GOG details/pages failing do not erase a real product match", async () => {
  vi.mocked(webRequest).mockImplementation(async (u) => {
    if (u.includes("catalog.gog")) return reply({ products: [gogProduct] });
    throw new Error("HTTP 503");
  });
  const r = await gogCatalog(newGame("Test Game", 0));
  expect(r.check.status).toBe("found");
  expect(r.patch?.stores?.[0].url).toBe(gogProduct.storeLink);
  expect(r.check.message).toContain("503");
});
it("GOG supplies real HLTB numbers with the actual HLTB link and attribution", () => {
  expect(hltbFromGog(gogHTML, gogProduct.storeLink)).toMatchObject({
    status: "found",
    main: 53,
    mainExtra: 94.5,
    completionist: 172.5,
    url: "https://howlongtobeat.com/game/34716",
    sourceUrl: gogProduct.storeLink,
  });
});
it("HLTB markup without an actual source link or duration never fabricates time", () => {
  expect(hltbFromGog("<p>Test Game 25 hours</p>", gogProduct.storeLink)).toBeUndefined();
  expect(
    hltbFromGog(gogHTML.replace(/\d+(?:\.\d+)? h/g, "--"), gogProduct.storeLink)?.status,
  ).toBe("not_found");
});
it("reads HLTB page JSON, converting seconds to hours and checking the title", () => {
  const html =
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({
      props: {
        pageProps: {
          game: {
            data: {
              game: [
                {
                  game_name: "Test Game",
                  comp_main: 30600,
                  comp_plus: 50400,
                  comp_100: 0,
                },
              ],
            },
          },
        },
      },
    }) +
    "</script>";
  expect(
    hltbFromPage(html, "Test Game", "https://howlongtobeat.com/game/123"),
  ).toMatchObject({
    status: "found",
    main: 8.5,
    mainExtra: 14,
    completionist: undefined,
  });
  expect(() =>
    hltbFromPage(html, "Test Game 2", "https://howlongtobeat.com/game/123"),
  ).toThrow("eşleşen");
});
it("an HLTB 403 retains dated old values without calling them freshly fetched", async () => {
  const g = newGame("Test Game", 0);
  g.hltb = {
    status: "found",
    main: 8.5,
    checkedAt: "2025-01-01T00:00:00.000Z",
    url: "https://howlongtobeat.com/game/123",
  };
  vi.mocked(webRequest).mockRejectedValue(new Error("Kaynak HTTP 403 döndürdü."));
  const r = await providers.completionTimes(g, {
    check: {
      store: "GOG",
      source: "GOG",
      checkedAt: new Date().toISOString(),
      status: "not_found",
    },
  });
  expect(r).toMatchObject({
    status: "unavailable",
    main: 8.5,
    checkedAt: "2025-01-01T00:00:00.000Z",
  });
  expect(r.attemptedAt).toBeTruthy();
  expect(r.message).toContain("403");
  expect(webRequest).toHaveBeenCalledTimes(2);
});
it("AI can update HLTB and preserve it across metadata refresh without evidence gates", () => {
  const g = newGame("Test Game", 0),
    merged = prepareResearch(g, {
      gameId: g.id,
      patch: { hltb: { status: "found", main: 12, checkedAt: new Date().toISOString() } },
    }) as typeof g;
  expect(
    preserveResearchFields(merged, {
      hltb: { status: "found", main: 20, checkedAt: new Date().toISOString() },
    }).hltb?.main,
  ).toBe(12);
});
it("looks up HLTB by Steam ID without generic search and records community provenance", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({
      steamAppId: 1145360,
      hltbId: 62941,
      title: "Hades",
      mainStory: 23.5,
      mainStoryWithExtras: 48.5,
      completionist: 95,
      lastUpdatedAt: "2026-09-15T00:00:00Z",
    }),
  );
  const r = await communityTimes(newGame("Personal alias", 0, 1145360));
  expect(r).toMatchObject({
    main: 23.5,
    url: "https://howlongtobeat.com/game/62941",
    sourceUpdatedAt: "2026-09-15T00:00:00Z",
  });
  expect(r?.via).toContain("topluluk");
  expect(searchWeb).not.toHaveBeenCalled();
});
it("HLTB title fallback rejects different sequels and never treats missing times as zero hours", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply([{ title: "Hades II", hltbId: 999, mainStory: 25 }]),
  );
  expect(await communityTimes(newGame("Hades", 0))).toBeUndefined();
  vi.mocked(webRequest).mockResolvedValue(
    reply([{ title: "Hades", hltbId: 62941, mainStory: null, completionist: 0 }]),
  );
  expect(await communityTimes(newGame("Hades", 0))).toBeUndefined();
});
it("upgrades old Steam-only caches instead of skipping new providers", async () => {
  const id = store.add([{ name: "Test Game", steamMatchMode: "auto" }]).added[0];
  store.metadata(id, { updatedAt: new Date().toISOString() });
  expect((await providers.enrich(id)).cached).toBe(false);
  expect((await providers.enrich(id)).cached).toBe(true);
});
it("cancellation propagates rather than committing unavailable records", async () => {
  const id = store.add([{ name: "Test Game", steamMatchMode: "auto" }]).added[0],
    controller = new AbortController();
  controller.abort();
  await expect(providers.enrich(id, true, controller.signal)).rejects.toThrow();
  expect(store.requireGames([id])[0].storeChecks).toBeUndefined();
});
it("new metadata survives export/import validation without losing fields", async () => {
  const id = store.add([{ name: "Test Game", steamMatchMode: "auto" }]).added[0];
  await providers.enrich(id, true);
  const state = store.validate(store.exportState());
  expect(state.games[0].storeChecks?.[2].status).toBe("found");
  expect(state.games[0].hltb?.status).toBe("unavailable");
  expect(state.games[0].catalogCheckedAt).toBeTruthy();
  expect(state.games[0]).not.toHaveProperty("turkish");
});
it("AI store entries remain while newly discovered other stores are added", () => {
  const g = newGame("Test Game", 0);
  g.aiEditedFields = ["stores"];
  g.stores = [{ name: "Custom", url: "https://example.com/product", verified: true }];
  const p = preserveResearchFields(g, {
    stores: [{ name: "GOG", url: gogProduct.storeLink, verified: true }],
  });
  expect(p.stores?.map((s) => s.name)).toEqual(["Custom", "GOG"]);
});
it("normalizes manual browser addresses and searches without accepting executable schemes", () => {
  expect(browserURL("steamdb.info/app/620/")).toBe("https://steamdb.info/app/620/");
  expect(browserURL("oyun haberleri")).toBe("https://duckduckgo.com/?q=oyun%20haberleri");
  expect(browserURL("")).toBe("");
  for (const u of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hello",
    "https://user:password@example.com/",
  ])
    expect(() => browserURL(u)).toThrow();
  expect(webNavigation("file:///x")).toBe(false);
  expect(webNavigation("https://example.com/")).toBe(true);
});

it("never labels old generic store searches as direct product links", () => {
  expect(isStoreProductLink("GOG", "https://www.google.com/search?q=game+gog")).toBe(
    false,
  );
  expect(
    isStoreProductLink("Epic Games", "https://store.epicgames.com/tr/browse?q=game"),
  ).toBe(false);
  expect(isStoreProductLink("GOG", "https://www.gog.com/en/game/stardew_valley")).toBe(
    true,
  );
  expect(isStoreProductLink("Steam", "https://store.steampowered.com/app/620/")).toBe(
    true,
  );
  expect(isStoreProductLink("Other", "https://example.com/search?q=game")).toBe(false);
});

it("Xbox uses actual product IDs, platform data and unconditional price rather than membership discounts", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({
      Payload: {
        SearchResults: [
          {
            Title: "Hades",
            ProductId: "9P8DL6W0JBB8",
            AvailableDevicesNarratorText: "Bilgisayar,Xbox One",
            SkusSummary: [
              {
                DisplayMSRP: "100 TRY",
                SalePrices: [
                  { DisplayPrice: "10 TRY", Conditions: { Type: "Entitlement" } },
                  { DisplayPrice: "80 TRY" },
                ],
              },
            ],
          },
        ],
      },
    }),
  );
  const r = await xboxCatalog(newGame("Hades", 0));
  expect(r.check.status).toBe("found");
  expect(r.patch?.stores?.[0]).toMatchObject({
    url: "https://www.xbox.com/tr-TR/games/store/-/9P8DL6W0JBB8",
    price: "80 TRY",
  });
  expect(r.check.message).toContain("Xbox One");
  expect(isStoreProductLink("Xbox", r.check.url!)).toBe(true);
  expect(isStoreProductLink("Xbox", "https://www.xbox.com/search?q=Hades")).toBe(false);
});
it("Xbox ambiguous editions stay review instead of choosing the first catalog result", async () => {
  vi.mocked(webRequest).mockResolvedValue(
    reply({
      Payload: {
        SearchResults: [
          { Title: "Halo Infinite", ProductId: "9PP5G1F0C2B6" },
          { Title: "Halo Infinite", ProductId: "9NP1P1WFS0LB" },
        ],
      },
    }),
  );
  const r = await xboxCatalog(newGame("Halo Infinite", 0));
  expect(r.check.status).toBe("review");
  expect(r.check.candidates).toHaveLength(2);
  expect(r.patch?.stores).toBeUndefined();
});
it("manual Steam selection mode never silently matches the entered title", async () => {
  const id = store.add([{ name: "Test Game" }]).added[0];
  await providers.enrich(id, true);
  expect(
    store.requireGames([id])[0].storeChecks?.find((c) => c.store === "Steam")?.status,
  ).toBe("review");
  expect(vi.mocked(webRequest).mock.calls.some(([u]) => u.includes("storesearch"))).toBe(
    false,
  );
});
it("a full metadata refresh still fetches HowLongToBeat times but no language table or patch search", async () => {
  vi.mocked(webRequest).mockImplementation(async (url, options) => {
    options?.signal?.throwIfAborted();
    if (url.includes("appdetails"))
      return reply({
        620: {
          success: true,
          data: {
            name: "Test Game",
            supported_languages: "English, Turkish",
            developers: ["Steam Developer"],
            genres: [{ description: "Bulmaca" }],
            pc_requirements: { minimum: "<strong>RAM:</strong> 4 GB" },
          },
        },
      });
    if (url.includes("appreviews")) return reply({ query_summary: {} });
    if (url.includes("catalog.gog.com")) return reply({ products: [gogProduct] });
    if (url.includes("api.gog.com"))
      return reply({
        description: "GOG description",
        _embedded: {
          product: { title: "Test Game" },
          localizations: [{ _embedded: { language: { code: "tr" } } }],
        },
      });
    if (url === gogProduct.storeLink) return { ...reply(gogHTML), type: "text/html" };
    if (url.includes("api.egdata.app")) return reply({ total: 0, offers: [] });
    if (url.includes("storeedgefd")) return reply({ Payload: { SearchResults: [] } });
    throw new Error("Unexpected URL: " + url);
  });
  const id = store.add([{ name: "Test Game", appId: 620 }]).added[0];
  await providers.enrich(id, true);
  const urls = vi.mocked(webRequest).mock.calls.map(([u]) => u);
  expect(urls).toContain(gogProduct.storeLink);
  expect(urls.some((u) => u.includes("?l=english"))).toBe(false);
  expect(searchWeb).not.toHaveBeenCalled();
  const g = store.requireGames([id])[0];
  expect(g.fetchStatus).toBe("done");
  expect(g.minimum.ramGB).toBe(4);
  expect(g.hltb).toMatchObject({ status: "found", main: 53, mainExtra: 94.5 });
  expect(g.sources.some((s) => s.fields?.includes("hltb"))).toBe(true);
  expect(g).not.toHaveProperty("turkish");
});
it("times-only refresh fills durations from GOG's HLTB section without touching stores or fetch status", async () => {
  vi.mocked(webRequest).mockImplementation(async (url) => {
    if (url.includes("catalog.gog.com")) return reply({ products: [gogProduct] });
    if (url.includes("api.gog.com")) throw new Error("HTTP 503");
    if (url === gogProduct.storeLink) return { ...reply(gogHTML), type: "text/html" };
    throw new Error("Unexpected URL: " + url);
  });
  const id = store.add([{ name: "Test Game" }]).added[0];
  const stores = [{ name: "Custom", url: "https://example.com/product", verified: true }];
  store.metadata(id, { fetchStatus: "review", stores });
  const times = await providers.refreshTimes(id);
  const g = store.requireGames([id])[0];
  expect(times).toMatchObject({ status: "found" });
  expect(g.hltb?.completionist).toBe(172.5);
  expect(g.fetchStatus).toBe("review");
  expect(g.stores).toEqual(stores);
  expect(g.sources[0]).toMatchObject({ kind: "community", fields: ["hltb"] });
  // GOG answers but no time can be found: recorded like a normal refresh.
  vi.mocked(webRequest).mockImplementation(async (url) => {
    if (url.includes("catalog.gog.com")) return reply({ products: [] });
    throw new Error("HTTP 503");
  });
  const unknown = store.add([{ name: "Unknown Game" }]).added[0];
  expect(await providers.refreshTimes(unknown)).toMatchObject({ status: "unavailable" });
  expect(store.requireGames([unknown])[0].hltb?.status).toBe("unavailable");
  // Nothing reachable (offline): nothing is written, the next start retries.
  vi.mocked(webRequest).mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
  const other = store.add([{ name: "Offline Game" }]).added[0];
  expect(await providers.refreshTimes(other)).toBe("offline");
  expect(store.requireGames([other])[0].hltb).toBeUndefined();
  expect(store.requireGames([other])[0].fetchStatus).not.toBe("error");
});
