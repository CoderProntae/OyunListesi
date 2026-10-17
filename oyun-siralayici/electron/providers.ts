import {
  gogCatalog,
  epicCatalog,
  xboxCatalog,
  communityTimes,
  unavailable,
  sameTitle,
  hltbFromParent,
  hltbFromGog,
  hltbFromPage,
  productURL,
  type CatalogResult,
} from "./catalogs";
import {
  searchPlatform,
  steamSearch,
  gogDetails,
  epicDetails,
  xboxDetails,
  abandonwareDetails,
  type StoreProduct,
} from "./platforms";
import { preserveResearchFields } from "./research";
import { hasCompletionHours } from "../shared/catalog-state";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { webRequest, readableHTML, searchWeb, publicURL } from "./network";
import { missingInfo, now } from "../shared/domain";
import { parseStoreDate, titleMatch } from "../shared/titles";
import { metacriticScore } from "./metacritic";
import { pcgwImageUrl, pcgwInfo, pcgwPageUrl, pcgwRequirements } from "./pcgamingwiki";
import type { PcgwLookup } from "./pcgamingwiki";
import { hasRequirementValues } from "./requirements";
import type {
  Game,
  OriginStore,
  PlatformHit,
  SearchGame,
  Source,
  CompletionTimes,
} from "../shared/types";
import { Store } from "./store";
export { parseRequirements } from "./requirements";
import { parseRequirementSections } from "./requirements";
// Bumped when store data handling changes so cached records are fetched again.
export const CATALOG_VERSION = 106;
// The store a game's data and system requirements come from: the platform the
// user picked when adding it, else Steam (Steam ID known), else undecided.
export function originOf(game: Game): Game["origin"] {
  return (
    game.origin ?? (game.appId ? { store: "Steam", id: String(game.appId) } : undefined)
  );
}
// 1.0.17: system requirements are the data source's own and nothing else (the
// store, or PCGamingWiki when the store publishes none — 2.0.5). A value a
// model wrote earlier (in research or in any chat) never outlives a refresh;
// no level or component is kept that the source does not publish.
function applyRequirements(current: Game, merged: Partial<Game>, patch: Partial<Game>) {
  if (!patch.minimum && !patch.recommended) return;
  const req = (field: string) => /^(minimum|recommended)(\.|$)/.test(field);
  merged.minimum = patch.minimum;
  merged.recommended = patch.recommended;
  merged.aiEditedFields = (merged.aiEditedFields || current.aiEditedFields || []).filter(
    (f) => !req(f),
  );
  merged.sources = (merged.sources || current.sources).flatMap((source) => {
    if (source.kind !== "agent" || !source.fields?.some(req)) return [source];
    const fields = source.fields.filter((f) => !req(f));
    return fields.length ? [{ ...source, fields }] : [];
  });
}
export class Providers {
  constructor(
    public store: Store,
    private key: (name: string) => string,
  ) {}
  async searchGames(query: string, signal?: AbortSignal): Promise<SearchGame[]> {
    if (query.trim().length < 2) return [];
    return (await steamSearch(query, signal)).slice(0, 8).map((x: PlatformHit) => ({
      appId: x.appId!,
      name: x.name,
      image: x.image,
      price: x.detail,
    }));
  }
  // Oyun ekle → 1. Platform → 2. Oyun: results of the chosen platform only.
  async searchPlatform(store: OriginStore, query: string, signal?: AbortSignal) {
    return searchPlatform(store, query, this.store.root, signal);
  }
  async image(url: string, signal?: AbortSignal) {
    let u: URL;
    try {
      u = publicURL(url);
    } catch {
      return undefined;
    }
    if (
      !/(^|\.)(steamstatic\.com|steamcdn-a\.akamaihd\.net|steampowered\.com|steamusercontent\.com|akamaihd\.net|gog-statics\.com|cdn1\.epicgames\.com|cdn2\.unrealengine\.com|store-images\.s-microsoft\.com|myabandonware\.com|pcgamingwiki\.com)$/.test(
        u.hostname,
      )
    )
      return undefined;
    const name = crypto.createHash("sha256").update(url).digest("hex") + ".img",
      file = path.join(this.store.root, "media", name);
    if (fs.existsSync(file)) return name;
    try {
      const r = await webRequest(url, { signal, maxBytes: 4_000_000 });
      if (!/^image\/(jpeg|png|webp)/i.test(r.type)) return undefined;
      fs.writeFileSync(file, r.body);
      return name;
    } catch (e) {
      if (signal?.aborted) throw e;
      return undefined;
    }
  }
  private async steam(game: Game, signal?: AbortSignal): Promise<CatalogResult> {
    let appId = game.appId;
    if (!appId && game.steamMatchMode === "manual")
      return {
        check: {
          store: "Steam",
          status: "review",
          source: "Steam Store",
          checkedAt: now(),
          message:
            "Steam oyunu seçilmedi. Mağazalar bölümünden arayıp kendin seçebilirsin.",
        },
      };
    if (!appId) {
      const candidates = await this.searchGames(game.name, signal);
      const exact = candidates.filter((c) => sameTitle(c.name, game.name));
      if (exact.length !== 1)
        return {
          check: {
            store: "Steam",
            status: exact.length > 1 ? "review" : "not_found",
            source: "Steam Store",
            checkedAt: now(),
            message:
              exact.length > 1
                ? "Birden fazla eşleşme var; mağaza bölümünden seçim yapabilirsin."
                : "Bu adla Steam mağazasında ürün bulunamadı.",
          },
          patch: { candidates },
        };
      appId = exact[0].appId;
    }
    const details = async (region: boolean) =>
      JSON.parse(
        (
          await webRequest(
            `https://store.steampowered.com/api/appdetails?appids=${appId}&l=turkish${region ? "&cc=TR" : ""}`,
            { signal, maxBytes: 3_000_000 },
          )
        ).text,
      )?.[String(appId)];
    // Some games (Max Payne) return nothing for the Turkish region although the
    // store page exists; the same data then comes without the region, only
    // without a Turkish price.
    let j = await details(true),
      regional = true;
    if (!j?.success || !j.data) {
      j = await details(false);
      regional = false;
    }
    if (!j?.success || !j.data)
      throw new Error("Steam bu oyun için veri döndürmedi (yaş/bölge kısıtı olabilir).");
    const d = j.data;
    const at = now(),
      url = `https://store.steampowered.com/app/${appId}/`,
      source: Source = {
        title: "Steam Store",
        url,
        checkedAt: at,
        kind: "official",
      };
    const patch: Partial<Game> = {
      appId,
      cover: await this.image(d.header_image, signal),
      hero: d.background_raw ? await this.image(d.background_raw, signal) : undefined,
      description: readableHTML(
        d.detailed_description || d.about_the_game || d.short_description || "",
        20000,
      ).text,
      year:
        Number(String(d.release_date?.date || "").match(/\b(?:19|20)\d{2}\b/)?.[0]) ||
        undefined,
      releaseDate: parseStoreDate(d.release_date?.date),
      appType: typeof d.type === "string" ? d.type.slice(0, 40) : undefined,
      baseGame:
        d.type === "dlc" && d.fullgame?.name
          ? {
              appId: Number(d.fullgame.appid) > 0 ? Number(d.fullgame.appid) : undefined,
              name: String(d.fullgame.name).slice(0, 300),
            }
          : undefined,
      developers: d.developers || [],
      publishers: d.publishers || [],
      genres: (d.genres || []).map((g: any) => g.description),
      platforms: Object.entries(d.platforms || {})
        .filter(([, on]) => on)
        .map(([k]) => (k === "osx" ? "mac" : k)),
      ...parseRequirementSections(
        d.pc_requirements?.minimum || "",
        d.pc_requirements?.recommended || "",
      ),
      metacritic: d.metacritic?.score,
      price: d.is_free
        ? "Ücretsiz"
        : regional
          ? d.price_overview?.final_formatted
          : undefined,
      stores: [
        {
          name: "Steam",
          url,
          verified: true,
          source: "Steam Store",
          checkedAt: at,
          priceUpdatedAt: at,
          price: d.is_free
            ? "Ücretsiz"
            : regional
              ? d.price_overview?.final_formatted
              : undefined,
        },
      ],
      screenshots: (d.screenshots || []).slice(0, 8).map((s: any) => s.path_full),
      trailer: d.movies?.[0]?.mp4?.max || d.movies?.[0]?.webm?.max,
      sources: [source],
      updatedAt: at,
      fetchStatus: "done",
      fetchError: undefined,
      candidates: undefined,
    };
    try {
      const rr = await webRequest(
        `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`,
        { signal, maxBytes: 500000 },
      );
      const qs = JSON.parse(rr.text).query_summary;
      if (qs?.total_reviews) {
        patch.steamScore = Math.round((100 * qs.total_positive) / qs.total_reviews);
        patch.steamReviewCount = qs.total_reviews;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
    signal?.throwIfAborted();
    return {
      patch,
      check: {
        store: "Steam",
        status: "found",
        source: "Steam Store",
        url,
        matchedTitle: d.name,
        checkedAt: at,
        priceUpdatedAt: at,
      },
    };
  }
  async completionTimes(
    game: Game,
    gog: CatalogResult,
    signal?: AbortSignal,
  ): Promise<CompletionTimes> {
    let url = productURL(game.hltb?.url, "howlongtobeat.com", /^\/game\/\d+\/?$/);
    try {
      if (gog.gogHTML && gog.check.url) {
        const times = hltbFromGog(gog.gogHTML, gog.check.url);
        if (times) return times;
      }
      try {
        const times = await communityTimes(game, signal);
        if (times) return times;
      } catch {
        signal?.throwIfAborted();
      }
      // DLC / episodes: listed under the base game on HowLongToBeat (2.0).
      try {
        const times = await hltbFromParent(game, signal);
        if (times) return times;
      } catch {
        signal?.throwIfAborted();
      }
      if (!url) {
        const result = await this.search(
          `site:howlongtobeat.com/game/ "${game.name}"`,
          signal,
        );
        const matches = result.results.filter(
          (r) =>
            productURL(r.url, "howlongtobeat.com", /^\/game\/\d+\/?$/) &&
            titleMatch(
              r.title.replace(/^How long is /i, "").replace(/\?\s*(?:\|.*)?$/, ""),
              game.name,
            ),
        );
        const links = [...new Set(matches.map((r) => r.url))];
        if (links.length === 1) url = links[0];
      }
      if (!url)
        throw new Error(
          "HowLongToBeat için kesin oyun eşleşmesi alınamadı; süre bilinmiyor.",
        );
      const page = await webRequest(url, { signal, maxBytes: 4_000_000 });
      return hltbFromPage(page.text, game.name, url);
    } catch (error) {
      signal?.throwIfAborted();
      return {
        ...game.hltb,
        status: "unavailable",
        url,
        checkedAt: game.hltb?.checkedAt || now(),
        attemptedAt: now(),
        message: (error as Error).message,
      };
    }
  }
  // Times-only refresh used to refill durations dropped by 1.0.12. It never
  // changes store results or fetch status. When even the GOG catalog cannot be
  // reached and no time was found (most likely offline), nothing is written so
  // the game stays "missing" and the next start tries again.
  async refreshTimes(
    id: string,
    signal?: AbortSignal,
  ): Promise<CompletionTimes | "offline" | undefined> {
    const game = this.store.requireGames([id])[0];
    let gog: CatalogResult;
    try {
      gog = await gogCatalog(game, signal);
    } catch (error) {
      signal?.throwIfAborted();
      gog = unavailable("GOG", "GOG kataloğu", error);
    }
    const hltb = await this.completionTimes(game, gog, signal);
    signal?.throwIfAborted();
    if (gog.check.status === "unavailable" && hltb.status === "unavailable")
      return "offline";
    const current = this.store.state.games.find((g) => g.id === id);
    if (!current) return undefined;
    const patch: Partial<Game> = { hltb };
    if (hltb.status === "found" && hltb.sourceUrl)
      patch.sources = [
        {
          title: hltb.via || "HowLongToBeat",
          url: hltb.sourceUrl,
          checkedAt: hltb.checkedAt,
          kind: "community" as const,
          fields: ["hltb"],
        },
        ...current.sources.filter(
          (s) => !(s.url === hltb.sourceUrl && s.kind === "community"),
        ),
      ].slice(0, 100);
    this.store.metadata(id, preserveResearchFields(current, patch));
    return hltb;
  }
  // Steam only as a shop link for a game added from another platform: exact
  // title, no data import and no "choose the Steam game" prompt.
  private async steamLink(game: Game, signal?: AbortSignal): Promise<CatalogResult> {
    const at = now();
    const exact = (await this.searchGames(game.name, signal)).filter((c) =>
      sameTitle(c.name, game.name),
    );
    if (exact.length !== 1)
      return {
        check: {
          store: "Steam",
          status: exact.length > 1 ? "review" : "not_found",
          source: "Steam Store",
          checkedAt: at,
          message:
            exact.length > 1
              ? "Steam’de aynı adlı birden fazla ürün var; bağlantı eklenmedi."
              : "Bu adla Steam mağazasında ürün bulunamadı.",
        },
        patch: {},
      };
    const url = `https://store.steampowered.com/app/${exact[0].appId}/`;
    return {
      check: {
        store: "Steam",
        status: "found",
        source: "Steam Store",
        url,
        matchedTitle: exact[0].name,
        checkedAt: at,
        priceUpdatedAt: at,
      },
      patch: {
        stores: [
          {
            name: "Steam",
            url,
            verified: true,
            source: "Steam Store",
            checkedAt: at,
            price: exact[0].price,
            priceUpdatedAt: at,
          },
        ],
      },
    };
  }
  async enrich(id: string, force = false, signal?: AbortSignal) {
    const game = this.store.requireGames([id])[0];
    if (
      !force &&
      !game.storeSync &&
      game.catalogVersion === CATALOG_VERSION &&
      game.catalogCheckedAt &&
      Date.now() - Date.parse(game.catalogCheckedAt) <
        this.store.state.settings.cacheHours * 3600000
    ) {
      this.store.metadata(id, { fetchStatus: "done", fetchError: undefined });
      return { cached: true, game };
    }
    const origin = originOf(game);
    const safe = async (
      name: "Steam" | "GOG" | "Epic Games" | "Xbox",
      source: string,
      fn: () => Promise<CatalogResult>,
    ) => {
      try {
        return await fn();
      } catch (error) {
        signal?.throwIfAborted();
        return unavailable(name, source, error);
      }
    };
    const chosen = async (
      fn: (id: string, signal?: AbortSignal) => Promise<StoreProduct>,
    ): Promise<CatalogResult> => {
      const product = await fn(origin!.id || "", signal);
      return { ...product, check: product.check! };
    };
    // "Platform yok": no store is asked, the record keeps only what the user
    // wrote; HowLongToBeat is still looked up by name.
    const none = origin?.store === "none";
    const results: CatalogResult[] = none
      ? []
      : await Promise.all([
          safe("Steam", "Steam Store", () =>
            origin && origin.store !== "Steam"
              ? this.steamLink(game, signal)
              : this.steam(game, signal),
          ),
          safe("GOG", "GOG kataloğu", () =>
            origin?.store === "GOG" ? chosen(gogDetails) : gogCatalog(game, signal),
          ),
          safe("Epic Games", "EGData · topluluk kataloğu", () =>
            origin?.store === "Epic Games"
              ? chosen(epicDetails)
              : epicCatalog(game, signal),
          ),
          safe("Xbox", "Microsoft Store kataloğu", () =>
            origin?.store === "Xbox" ? chosen(xboxDetails) : xboxCatalog(game, signal),
          ),
        ]);
    let abandon: StoreProduct | undefined;
    if (origin?.store === "My Abandonware")
      try {
        abandon = await abandonwareDetails(origin.id || "", signal);
      } catch {
        signal?.throwIfAborted();
      }
    const [steam, gog, epic, xbox] = results;
    // The data source: the chosen platform, else (bulk import, older records)
    // the first store that has the game in the order Steam, GOG, Epic, Xbox.
    let primary: CatalogResult | StoreProduct | undefined;
    let primaryStore: string | undefined;
    // definitive = the stores answered, so "no requirements" is a real answer
    // and not a network failure.
    let definitive = true;
    if (origin && !none) {
      primaryStore = origin.store;
      primary =
        origin.store === "My Abandonware"
          ? abandon
          : results.find((r) => r.check.store === origin.store);
      if (!primary || (primary as CatalogResult).check?.status === "unavailable") {
        primary = undefined;
        definitive = false;
      }
    } else if (!origin) {
      primary = results.find((r) => r.check.status === "found");
      primaryStore = (primary as CatalogResult | undefined)?.check.store;
      if (!primary)
        definitive = !results.some(
          (r) =>
            r.check.status === "unavailable" ||
            (r.check.store === "Steam" &&
              r.check.status === "review" &&
              !!r.patch?.candidates?.length),
        );
    }
    // Epic / Xbox answers from a search do not include the product page; load it
    // when that store is the data source.
    if (
      primary &&
      (primary as CatalogResult).partial &&
      (primary as CatalogResult).productId
    ) {
      const loader =
        primaryStore === "Epic Games"
          ? epicDetails
          : primaryStore === "Xbox"
            ? xboxDetails
            : undefined;
      if (loader)
        try {
          const product = await loader((primary as CatalogResult).productId!, signal);
          primary = {
            ...(primary as CatalogResult),
            ...product,
            check: (primary as CatalogResult).check,
            partial: false,
            patch: {
              ...product.patch,
              stores: (primary as CatalogResult).patch?.stores || product.patch.stores,
              sources: [
                ...(product.patch.sources || []),
                ...((primary as CatalogResult).patch?.sources || []),
              ],
            },
          };
        } catch {
          signal?.throwIfAborted();
        }
    }
    const patch: Partial<Game> = {};
    for (const [key, value] of Object.entries(primary?.patch || {})) {
      if (
        [
          "sources",
          "stores",
          "fetchStatus",
          "fetchError",
          "updatedAt",
          "minimum",
          "recommended",
          "candidates",
        ].includes(key)
      )
        continue;
      if (value !== undefined && value !== "" && (!Array.isArray(value) || value.length))
        (patch as any)[key] = value;
    }
    const at = now();
    // System requirements are the data source's own text, complete and
    // nothing added: no level or component that the store does not publish.
    // A failed lookup leaves the saved requirements untouched.
    if (primary && !(primary as CatalogResult).partial) {
      patch.minimum = primary.patch?.minimum || { raw: "" };
      patch.recommended = primary.patch?.recommended || { raw: "" };
      patch.requirementSource = {
        store: primaryStore!,
        url: (primary as CatalogResult).check?.url || primary.patch?.stores?.[0]?.url,
        checkedAt: at,
      };
    } else if (!primary && definitive) {
      patch.minimum = { raw: "" };
      patch.recommended = { raw: "" };
      patch.requirementSource = undefined;
    }
    if (definitive && primary && (primary as CatalogResult).partial) definitive = false;
    if (!patch.cover)
      for (const result of [primary, gog, epic, xbox]) {
        if (result?.coverUrl) patch.cover = await this.image(result.coverUrl, signal);
        if (patch.cover) break;
      }
    if (!patch.hero)
      for (const result of [primary, gog, epic, xbox]) {
        if (result?.heroUrl) patch.hero = await this.image(result.heroUrl, signal);
        if (patch.hero) break;
      }
    patch.hltb = await this.completionTimes(
      {
        ...game,
        appId: steam?.patch?.appId || game.appId,
        baseGame: steam?.patch?.baseGame || patch.baseGame || game.baseGame,
      },
      gog || unavailable("GOG", "GOG kataloğu", "Platform seçilmedi."),
      signal,
    );
    // Steam leaves the release date and the score empty for many DLC (2.0):
    // HowLongToBeat and Metacritic list them for the same entry.
    if (!patch.releaseDate && patch.hltb.status === "found" && patch.hltb.releaseDate) {
      patch.releaseDate = patch.hltb.releaseDate;
      if (!patch.year) patch.year = Number(patch.hltb.releaseDate.slice(0, 4));
    }
    let scoreSource: Source | undefined;
    if (patch.metacritic !== undefined) patch.metacriticNoScore = undefined;
    if (
      origin?.store !== "none" &&
      patch.metacritic === undefined &&
      (force || game.metacritic === undefined)
    ) {
      try {
        const hit = await metacriticScore(
          [patch.hltb.status === "found" ? patch.hltb.title : undefined, game.name],
          patch.year ?? game.year,
          signal,
        );
        // Listed without a critic score: shown as "puan yok", not as missing.
        patch.metacriticNoScore =
          hit && hit.score === undefined
            ? { url: hit.url, title: hit.title.slice(0, 300), checkedAt: at }
            : undefined;
        if (hit && hit.score !== undefined) {
          patch.metacritic = hit.score;
          scoreSource = {
            title: "Metacritic",
            url: hit.url,
            checkedAt: at,
            kind: "community",
            fields: ["metacritic"],
          };
          if (!patch.releaseDate && hit.releaseDate) {
            patch.releaseDate = hit.releaseDate;
            if (!patch.year) patch.year = Number(hit.releaseDate.slice(0, 4));
          }
        }
      } catch {
        signal?.throwIfAborted();
      }
    }
    // 2.0.5: the store publishes no system requirements (My Abandonware never
    // does) → PCGamingWiki's Windows block, if the wiki has one.
    // 2.0.7: information the platform left empty (cover, developer, publisher,
    // year, genres, description) is taken from the same PCGamingWiki page.
    const wikiQuery = {
      name: game.name,
      year: patch.year ?? game.year,
      // Only the game's own Steam ID: a Steam link found by name for a game
      // from another platform can be a different game with the same name.
      appId:
        origin?.store === "Steam" || !origin
          ? steam?.patch?.appId || game.appId
          : undefined,
      names: [patch.hltb.status === "found" ? patch.hltb.title : undefined],
    };
    const before = this.store.state.games.find((g) => g.id === id) || game;
    let wiki: PcgwLookup | undefined;
    if (
      origin?.store === "My Abandonware" ||
      (patch.minimum !== undefined &&
        !hasRequirementValues(patch.minimum) &&
        !hasRequirementValues(patch.recommended))
    )
      wiki = await this.wikiRequirements(id, patch, wikiQuery, at, signal);
    else {
      if (patch.minimum !== undefined) patch.pcgw = undefined;
      if (missingInfo(patch, before).length)
        wiki = await pcgwRequirements(wikiQuery, signal);
    }
    const wikiSource = await this.wikiInfo(patch, before, wiki, at, signal);
    signal?.throwIfAborted();
    const current = this.store.state.games.find((g) => g.id === id);
    if (!current) return { cached: false, deleted: true };
    patch.storeChecks = results.map((r) => r.check);
    const foundStores = [
      ...results.flatMap((r) => r.patch?.stores || []),
      ...(abandon?.patch.stores || []),
    ];
    patch.stores = [
      ...foundStores,
      ...current.stores.filter(
        (s) =>
          !foundStores.some((f) => f.name === s.name) &&
          !results.some(
            (r) => r.check.store === s.name && r.check.status === "not_found",
          ),
      ),
    ];
    const sourceList = [
      ...results.flatMap((r) => r.patch?.sources || []),
      ...(abandon?.patch.sources || []),
      ...current.sources,
    ];
    if (scoreSource) sourceList.unshift(scoreSource);
    if (wikiSource) sourceList.unshift(wikiSource);
    if (patch.hltb.status === "found" && patch.hltb.sourceUrl)
      sourceList.unshift({
        title: patch.hltb.via || "HowLongToBeat",
        url: patch.hltb.sourceUrl,
        checkedAt: patch.hltb.checkedAt,
        kind: "community",
        fields: ["hltb"],
      });
    patch.sources = sourceList
      .filter(
        (s, i) => sourceList.findIndex((v) => v.url === s.url && v.kind === s.kind) === i,
      )
      .slice(0, 100);
    // A failed refresh retains old times without pretending they were freshly checked.
    patch.catalogVersion = CATALOG_VERSION;
    patch.catalogCheckedAt = at;
    patch.updatedAt = at;
    patch.fetchStatus = "done";
    patch.fetchError = undefined;
    patch.candidates =
      origin && origin.store !== "Steam" ? undefined : steam?.patch?.candidates;
    if (definitive) patch.storeSync = undefined;
    signal?.throwIfAborted();
    const merged = preserveResearchFields(current, patch);
    // A refresh the user asked for ("Süreleri yenile", "Mağazaları yenile"):
    // real HowLongToBeat times replace durations a model wrote earlier, so the
    // section labelled HowLongToBeat shows HowLongToBeat's figures. Automatic
    // refreshes and failed lookups keep the AI values as before.
    if (force && patch.hltb.status === "found" && hasCompletionHours(patch.hltb)) {
      const times = (field: string) => /^hltb(\.|$)/.test(field);
      merged.hltb = patch.hltb;
      merged.aiEditedFields = (current.aiEditedFields || []).filter((f) => !times(f));
      merged.sources = (merged.sources || current.sources).flatMap((source) => {
        if (source.kind !== "agent" || !source.fields?.some(times)) return [source];
        const fields = source.fields.filter((f) => !times(f));
        return fields.length ? [{ ...source, fields }] : [];
      });
    }
    applyRequirements(current, merged, patch);
    this.store.metadata(id, merged);
    return { cached: false, game: this.store.state.games.find((g) => g.id === id) };
  }
  // PCGamingWiki lookup for a game without store requirements: found → its
  // Windows requirements become the saved ones (source "PCGamingWiki"). When
  // the wiki cannot be reached, requirements saved from it earlier stay.
  private async wikiRequirements(
    id: string,
    patch: Partial<Game>,
    query: Parameters<typeof pcgwRequirements>[0],
    at: string,
    signal?: AbortSignal,
  ) {
    const lookup = await pcgwRequirements(query, signal);
    signal?.throwIfAborted();
    this.wikiRequirementsResult(id, patch, lookup, at);
    return lookup;
  }
  private wikiRequirementsResult(
    id: string,
    patch: Partial<Game>,
    lookup: PcgwLookup,
    at: string,
  ) {
    patch.pcgw = {
      status: lookup.status,
      checkedAt: at,
      ...(lookup.title ? { title: lookup.title.slice(0, 300) } : {}),
      ...(lookup.url ? { url: lookup.url } : {}),
      ...(lookup.message ? { message: lookup.message.slice(0, 500) } : {}),
    };
    if (lookup.status === "found") {
      patch.minimum = lookup.minimum || { raw: "" };
      patch.recommended = lookup.recommended || { raw: "" };
      patch.requirementSource = { store: "PCGamingWiki", url: lookup.url, checkedAt: at };
    } else if (
      lookup.status === "unavailable" &&
      this.store.state.games.find((g) => g.id === id)?.requirementSource?.store ===
        "PCGamingWiki"
    ) {
      delete patch.minimum;
      delete patch.recommended;
      delete patch.requirementSource;
    }
  }
  // 2.0.7: fields still empty after the platform's data (patch over the saved
  // game) come from the game's PCGamingWiki page. Returns the source entry.
  private async wikiInfo(
    patch: Partial<Game>,
    game: Game,
    lookup: PcgwLookup | undefined,
    at: string,
    signal?: AbortSignal,
  ): Promise<Source | undefined> {
    const missing = missingInfo(patch, game);
    if (!lookup?.page || !missing.length) return undefined;
    const info = pcgwInfo(lookup.page.content);
    const filled: string[] = [];
    for (const field of missing) {
      if (field === "cover") {
        const url = info.cover ? pcgwImageUrl(info.cover) : undefined;
        const cover = url ? await this.image(url, signal) : undefined;
        if (cover) patch.cover = cover;
      } else if (field === "year") {
        if (info.year) patch.year = info.year;
      } else if (field === "description") {
        if (info.description) patch.description = info.description;
      } else if (info[field].length) patch[field] = info[field];
      if (patch[field] !== undefined) filled.push(field);
    }
    // The exact date only when it is the same release (year) as the game's.
    const year = patch.year ?? game.year;
    if (
      !(patch.releaseDate ?? game.releaseDate) &&
      info.releaseDate &&
      info.year === year
    ) {
      patch.releaseDate = info.releaseDate;
      filled.push("releaseDate");
    }
    if (!filled.length) return undefined;
    return {
      title: "PCGamingWiki",
      url: pcgwPageUrl(lookup.page.title),
      checkedAt: at,
      kind: "community",
      fields: filled,
    };
  }
  // Retry for games whose last PCGamingWiki lookup could not reach the wiki
  // (no store data is fetched again). "offline": still unreachable.
  async refreshRequirements(
    id: string,
    signal?: AbortSignal,
  ): Promise<"offline" | "found" | "not_found" | undefined> {
    const game = this.store.requireGames([id])[0];
    if (hasRequirementValues(game.minimum) || hasRequirementValues(game.recommended))
      return undefined;
    const patch: Partial<Game> = {};
    const at = now();
    const lookup = await this.wikiRequirements(
      id,
      patch,
      {
        name: game.name,
        year: game.year,
        appId: !game.origin || game.origin.store === "Steam" ? game.appId : undefined,
        names: [game.hltb?.status === "found" ? game.hltb.title : undefined],
      },
      at,
      signal,
    );
    const source = await this.wikiInfo(patch, game, lookup, at, signal);
    signal?.throwIfAborted();
    const current = this.store.state.games.find((g) => g.id === id);
    if (!current || !patch.pcgw) return undefined;
    if (source)
      patch.sources = [
        source,
        ...current.sources.filter(
          (s) => !(s.title === "PCGamingWiki" && s.kind === "community"),
        ),
      ].slice(0, 100);
    const merged = preserveResearchFields(current, patch);
    applyRequirements(current, merged, patch);
    this.store.metadata(id, merged);
    return patch.pcgw.status === "unavailable" ? "offline" : patch.pcgw.status;
  }
  async search(query: string, signal?: AbortSignal) {
    return searchWeb(query, this.store.state.settings, this.key("brave"), signal);
  }
  async page(url: string, signal?: AbortSignal) {
    const r = await webRequest(url, { signal });
    if (!/text|json|xml|html/i.test(r.type))
      throw new Error("Bu araç yalnızca okunabilir metin/HTML sayfalarını destekler.");
    return {
      url: r.url,
      ...readableHTML(r.text, Infinity),
      retrievedAt: now(),
      notice: "Sayfa metni alındı.",
    };
  }
}
export class MetadataQueue {
  // times: background refill of HowLongToBeat durations only (see refreshTimes).
  // requirements: PCGamingWiki retry only (see refreshRequirements).
  jobs: { id: string; force: boolean; times?: boolean; requirements?: boolean }[] = [];
  controller: AbortController | null = null;
  state = {
    running: false,
    total: 0,
    done: 0,
    errors: 0,
    cancelled: false,
    current: undefined as string | undefined,
    timesOnly: false,
    requirementsOnly: false,
  };
  onChange = () => {};
  onItemDone: ((id: string, signal: AbortSignal) => Promise<void>) | null = null;
  constructor(
    private providers: Providers,
    private store: Store,
  ) {}
  add(ids: string[], force = false) {
    for (const id of ids) {
      // A game whose times-only lookup is running still gets its full refresh
      // (the 1.0.16 store refresh starts right after the times refill).
      if (
        !this.store.state.games.some((g) => g.id === id) ||
        (this.state.current === id &&
          !this.state.timesOnly &&
          !this.state.requirementsOnly)
      )
        continue;
      const pending = this.jobs.find((j) => j.id === id);
      if (pending) {
        // A full refresh includes durations and requirements: upgrade a waiting
        // times-only or requirements-only job.
        if (pending.times || pending.requirements) {
          pending.times = false;
          pending.requirements = false;
          pending.force = pending.force || force;
          this.store.metadata(id, { fetchStatus: "queued" });
        }
        continue;
      }
      this.jobs.push({ id, force });
      this.store.metadata(id, { fetchStatus: "queued" });
      this.state.total++;
    }
    this.state.cancelled = false;
    this.onChange();
    void this.run();
  }
  // No fetch-status change, no error banner and no AI follow-up for these jobs.
  addTimes(ids: string[]) {
    for (const id of ids) {
      if (
        !this.store.state.games.some((g) => g.id === id) ||
        this.jobs.some((j) => j.id === id) ||
        this.state.current === id
      )
        continue;
      this.jobs.push({ id, force: false, times: true });
      this.state.total++;
    }
    this.state.cancelled = false;
    this.onChange();
    void this.run();
  }
  addRequirements(ids: string[]) {
    for (const id of ids) {
      if (
        !this.store.state.games.some((g) => g.id === id) ||
        this.jobs.some((j) => j.id === id) ||
        this.state.current === id
      )
        continue;
      this.jobs.push({ id, force: false, requirements: true });
      this.state.total++;
    }
    this.state.cancelled = false;
    this.onChange();
    void this.run();
  }
  async run() {
    if (this.state.running) return;
    this.state.running = true;
    this.onChange();
    while (this.jobs.length && !this.state.cancelled) {
      const job = this.jobs.shift()!;
      if (!this.store.state.games.some((g) => g.id === job.id)) continue;
      this.state.current = job.id;
      this.state.timesOnly = !!job.times;
      this.state.requirementsOnly = !!job.requirements;
      this.controller = new AbortController();
      if (job.requirements) {
        this.onChange();
        try {
          const result = await this.providers.refreshRequirements(
            job.id,
            this.controller.signal,
          );
          if (result === "offline") {
            const waiting = this.jobs.filter((j) => j.requirements).length;
            this.jobs = this.jobs.filter((j) => !j.requirements);
            this.state.total -= waiting;
          } else if (result === "found" && this.onItemDone)
            await this.onItemDone(job.id, this.controller.signal);
        } catch {
          // Cancelled or the game was removed meanwhile; nothing else changes.
        }
      } else if (job.times) {
        this.onChange();
        try {
          const result = await this.providers.refreshTimes(
            job.id,
            this.controller.signal,
          );
          if (result === "offline") {
            // The other waiting times-only jobs would fail the same way; they
            // are retried on the next start. Full refresh jobs stay queued.
            const waiting = this.jobs.filter((j) => j.times).length;
            this.jobs = this.jobs.filter((j) => !j.times);
            this.state.total -= waiting;
          }
        } catch {
          // Cancelled or the game was removed meanwhile; nothing else changes.
        }
      } else {
        this.store.metadata(job.id, { fetchStatus: "loading" });
        this.onChange();
        try {
          await this.providers.enrich(job.id, job.force, this.controller.signal);
          if (this.onItemDone) await this.onItemDone(job.id, this.controller.signal);
        } catch (e: any) {
          if (this.controller.signal.aborted)
            this.store.metadata(job.id, { fetchStatus: "idle" });
          else {
            this.state.errors++;
            this.store.metadata(job.id, {
              fetchStatus: "error",
              fetchError: e.message,
            });
          }
        }
      }
      this.state.done++;
      this.onChange();
      if (this.jobs.length && !this.state.cancelled)
        await new Promise((r) => setTimeout(r, 650));
    }
    this.state.running = false;
    this.state.current = undefined;
    this.state.timesOnly = false;
    this.state.requirementsOnly = false;
    this.controller = null;
    this.onChange();
  }
  cancel() {
    this.state.cancelled = true;
    this.controller?.abort();
    for (const j of this.jobs)
      if (!j.times && !j.requirements) this.store.metadata(j.id, { fetchStatus: "idle" });
    this.jobs = [];
    this.onChange();
  }
  resetCounters() {
    if (!this.state.running && this.jobs.length === 0) {
      this.state.total = 0;
      this.state.done = 0;
      this.state.errors = 0;
    }
  }
}
