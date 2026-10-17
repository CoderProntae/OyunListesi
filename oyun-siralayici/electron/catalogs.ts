import * as cheerio from "cheerio";
import { webRequest } from "./network";
import { normalizeName, now } from "../shared/domain";
import { baseTitles, titleKey, titleMatch, titleRemainder } from "../shared/titles";
import type { CompletionTimes, Game, StoreCheck } from "../shared/types";
import {
  productURL,
  epicProductURL,
  gogRoute,
  gogDetails,
  gogPage,
  epicProduct,
  xboxProduct,
  xboxURL,
  type StoreProduct,
} from "./platforms";
export { productURL, epicProductURL } from "./platforms";
export interface CatalogResult extends Omit<StoreProduct, "patch"> {
  check: StoreCheck;
  patch?: Partial<Game>;
  // Found, but the product's own page (requirements) was not read: either it
  // failed or it is only needed when this store is the game's data source
  // (then providers.enrich loads it with productId). Saved requirements are
  // never cleared because of a partial result.
  partial?: boolean;
  productId?: string;
}
const strings = (v: any) =>
  Array.isArray(v) ? v.filter((x: any) => typeof x === "string") : [];
export function sameTitle(a: string, b: string) {
  return (
    normalizeName(a.replace(/[™®©]/g, "")) ===
    normalizeName(b.replace(/[™®©]/g, ""))
  );
}
export function unavailable(
  store: StoreCheck["store"],
  source: string,
  error: unknown,
): CatalogResult {
  return {
    check: {
      store,
      status: "unavailable",
      source,
      checkedAt: now(),
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
export async function gogCatalog(
  game: Game,
  signal?: AbortSignal,
): Promise<CatalogResult> {
  const at = now(),
    source = "GOG kataloğu",
    check: StoreCheck = {
      store: "GOG",
      source,
      checkedAt: at,
      status: "not_found",
      message: "Bu adla GOG kataloğunda ürün bulunamadı.",
    };
  const r = await webRequest(
    "https://catalog.gog.com/v1/catalog?" +
      new URLSearchParams({
        query: game.name,
        limit: "48",
        countryCode: "TR",
        locale: "en-US",
        currencyCode: "USD",
      }),
    { signal, maxBytes: 4_000_000 },
  );
  const data = JSON.parse(r.text);
  if (!Array.isArray(data.products)) throw new Error("GOG katalog yanıtı tanınmadı.");
  const same = data.products.filter(
    (p: any) => typeof p.title === "string" && sameTitle(p.title, game.name),
  );
  // Some classics are sold only as a "pack" (Fallout 2); a game entry wins.
  const games = same.filter((p: any) => p.productType === "game");
  const matches = games.length
    ? games
    : same.filter((p: any) => p.productType === "pack");
  if (matches.length !== 1) {
    if (matches.length > 1) {
      check.status = "review";
      check.message = "Birden fazla aynı adlı GOG kaydı var; otomatik eşleştirilmedi.";
    }
    check.candidates = data.products
      .flatMap((p: any) => {
        const url = productURL(p.storeLink, "gog.com", gogRoute);
        return url &&
          typeof p.title === "string" &&
          normalizeName(p.title).includes(normalizeName(game.name))
          ? [{ name: p.title, url }]
          : [];
      })
      .slice(0, 8);
    return { check };
  }
  const p = matches[0],
    url = productURL(p.storeLink, "gog.com", gogRoute);
  if (!url)
    throw new Error("GOG ürün kaydı bulundu fakat doğrudan ürün bağlantısı alınamadı.");
  const money = p.price?.finalMoney;
  const price =
    typeof money?.amount === "string" && typeof money?.currency === "string"
      ? money.amount + " " + money.currency
      : undefined;
  const found: StoreCheck = {
    ...check,
    status: "found",
    url,
    matchedTitle: p.title,
    message: undefined,
    priceUpdatedAt: at,
  };
  const store = {
    name: "GOG",
    url,
    price,
    verified: true,
    source,
    checkedAt: at,
    priceUpdatedAt: at,
  };
  // Details and the product page (HowLongToBeat section) are loaded side by
  // side; one failing does not hide the other.
  const [details, gogHTML] = await Promise.all([
    gogDetails(String(p.id), signal, { url, page: false }).catch((error: Error) => {
      signal?.throwIfAborted();
      return error;
    }),
    gogPage(url, signal),
  ]);
  if (!(details instanceof Error)) {
    const product = details;
    return {
      ...product,
      gogHTML,
      check: found,
      coverUrl: p.coverHorizontal || product.coverUrl,
      heroUrl: p.galaxyBackgroundImage || product.heroUrl,
      patch: { ...product.patch, stores: [store] },
    };
  }
  {
    const error = details;
    // Catalog availability survives a detail outage; requirements stay as saved.
    return {
      check: { ...found, message: "Ayrıntılar: " + error.message },
      partial: true,
      gogHTML,
      coverUrl: p.coverHorizontal,
      heroUrl: p.galaxyBackgroundImage,
      patch: {
        year:
          Number(String(p.releaseDate || "").match(/^(?:19|20)\d{2}/)?.[0]) || undefined,
        developers: strings(p.developers),
        publishers: strings(p.publishers),
        genres: (p.genres || [])
          .map((g: any) => g.name)
          .filter((n: any) => typeof n === "string"),
        platforms: strings(p.operatingSystems).map((o: string) =>
          o === "osx" ? "mac" : o,
        ),
        stores: [store],
        sources: [{ title: "GOG Store", url, checkedAt: at, kind: "official" }],
      },
    };
  }
}
export async function epicCatalog(
  game: Game,
  signal?: AbortSignal,
): Promise<CatalogResult> {
  const at = now(),
    source = "EGData · topluluk kataloğu",
    check: StoreCheck = {
      store: "Epic Games",
      source,
      checkedAt: at,
      status: "not_found",
      message: "Bu adla Epic ürün kaydı EGData kataloğunda bulunamadı.",
    };
  const response = await webRequest(
    "https://api.egdata.app/search/v2/search?country=TR&locale=en-US",
    {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: game.name, page: 1, limit: 40 }),
      maxBytes: 6_000_000,
    },
  );
  const data = JSON.parse(response.text);
  if (!Array.isArray(data.offers) || typeof data.total !== "number")
    throw new Error("EGData katalog yanıtı tanınmadı.");
  let exact = data.offers.filter(
    (o: any) =>
      typeof o.title === "string" &&
      sameTitle(o.title, game.name) &&
      !/test account/i.test(o.seller?.name || ""),
  );
  const desktop = exact.filter((o: any) =>
    o.tags?.some((t: any) => /^(Windows|Mac OS)$/i.test(t.name)),
  );
  if (desktop.length) exact = desktop;
  // Legacy/free titles may have OTHERS offerType. Several offers can map to one product.
  // Prefer an explicit productHome mapping, then deduplicate by catalog-provided URL.
  exact.sort(
    (a: any, b: any) =>
      Number(Boolean(b.offerMappings?.some((m: any) => m.pageType === "productHome"))) -
      Number(Boolean(a.offerMappings?.some((m: any) => m.pageType === "productHome"))),
  );
  const canonical = new Map<string, any>();
  for (const offer of exact) {
    const url = epicProductURL(offer);
    if (url && !canonical.has(url)) canonical.set(url, offer);
  }
  if (canonical.size) exact = [...canonical.values()];
  if (exact.length !== 1) {
    if (exact.length > 1) {
      check.status = "review";
      check.message = "Aynı adlı birden fazla Epic sürümü var; otomatik eşleştirilmedi.";
    }
    check.candidates = data.offers
      .flatMap((o: any) => {
        const url = epicProductURL(o);
        return url &&
          typeof o.title === "string" &&
          normalizeName(o.title).includes(normalizeName(game.name))
          ? [{ name: o.title, url }]
          : [];
      })
      .slice(0, 8);
    return { check };
  }
  const o = exact[0],
    url = epicProductURL(o);
  if (!url) throw new Error("Epic kaydı bulundu fakat ürün sayfası eşlemesi yok.");
  const regional =
    !o.countriesBlacklist?.includes("TR") &&
    (!o.countriesWhitelist?.length || o.countriesWhitelist.includes("TR"));
  const money = o.price?.price;
  const price =
    regional &&
    o.price?.country === "TR" &&
    typeof money?.discountPrice === "number" &&
    typeof money?.currencyCode === "string"
      ? money.discountPrice === 0
        ? "Ücretsiz"
        : `${(money.discountPrice / 100).toFixed(2)} ${money.currencyCode}`
      : undefined;
  const priceUpdatedAt =
    typeof o.price?.updatedAt === "string" &&
    Number.isFinite(Date.parse(o.price.updatedAt))
      ? o.price.updatedAt
      : undefined;
  const found: StoreCheck = {
    ...check,
    status: "found",
    url,
    matchedTitle: o.title,
    priceUpdatedAt,
    message: regional
      ? "Ürün bağlantısı EGData katalog eşlemesinden alındı; Epic sayfası canlı doğrulaması değildir."
      : "Ürün kaydı var; Türkiye için bölge kısıtı bildirilmiş.",
  };
  const store = {
    name: "Epic Games",
    url,
    verified: true,
    price,
    source,
    checkedAt: at,
    priceUpdatedAt,
  };
  const egdata = {
    title: "EGData · Epic Games katalog verisi",
    url: "https://egdata.app/offers/" + encodeURIComponent(o.id),
    kind: "community" as const,
    checkedAt: at,
  };
  const product = epicProduct(o);
  return {
    ...product,
    check: found,
    partial: true,
    productId: o.id,
    patch: { ...product.patch, stores: [store], sources: [egdata] },
  };
}
function hours(value: unknown, seconds = false): number | undefined {
  const number =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 && number < 360_000_000
    ? Math.round((number / (seconds ? 3600 : 1)) * 100) / 100
    : undefined;
}
export function hltbFromGog(
  html: string,
  sourceUrl: string,
): CompletionTimes | undefined {
  const $ = cheerio.load(html),
    section = $(".howlongtobeat-section").first();
  if (!section.length) return;
  const url = productURL(
    section.find('a[href*="howlongtobeat.com/game/"]').attr("href"),
    "howlongtobeat.com",
    /^\/game\/\d+\/?$/,
  );
  if (!url) return;
  const result: CompletionTimes = {
    status: "not_found",
    url,
    sourceUrl,
    via: "HowLongToBeat · GOG üzerinde yayımlanan süreler",
    checkedAt: now(),
  };
  section.find(".howlongtobeat-box").each((_i, box) => {
    const label = $(box).find(".howlongtobeat-box__name").text().trim(),
      raw = $(box).find(".howlongtobeat-box__time").text().trim();
    const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hours?)$/i);
    if (!match) return;
    const key = (
      {
        Main: "main",
        "Main + Sides": "mainExtra",
        "Main + Extras": "mainExtra",
        Completionist: "completionist",
        "All Styles": "allStyles",
      } as const
    )[label as "Main"];
    if (key) result[key] = hours(match[1]);
  });
  if (
    [result.main, result.mainExtra, result.completionist, result.allStyles].some(
      (v) => v !== undefined,
    )
  )
    result.status = "found";
  return result;
}
function nextData(html: string) {
  const raw = cheerio.load(html)("script#__NEXT_DATA__").text();
  return raw ? JSON.parse(raw) : null;
}
function hltbRows(data: any): any[] {
  const records =
    data?.props?.pageProps?.game?.data?.game ||
    data?.props?.pageProps?.game?.game ||
    data?.props?.pageProps?.game?.data ||
    [];
  return (Array.isArray(records) ? records : [records]).filter(
    (g: any) => g && typeof g.game_name === "string",
  );
}
const isoDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith("0000")
    ? v
    : undefined;
function timesFromRow(row: any, url: string, via = "HowLongToBeat"): CompletionTimes {
  const result: CompletionTimes = {
    status: "not_found",
    main: hours(row.comp_main, true),
    mainExtra: hours(row.comp_plus, true),
    completionist: hours(row.comp_100, true),
    allStyles: hours(row.comp_all, true),
    url,
    sourceUrl: url,
    via,
    checkedAt: now(),
    title: String(row.game_name).slice(0, 300),
    releaseDate:
      isoDate(row.release_world) || isoDate(row.release_na) || isoDate(row.release_eu),
  };
  if (
    [result.main, result.mainExtra, result.completionist, result.allStyles].some(
      (v) => v !== undefined,
    )
  )
    result.status = "found";
  return result;
}
export function hltbFromPage(html: string, name: string, url: string): CompletionTimes {
  const row = hltbRows(nextData(html)).find((g: any) => titleMatch(g.game_name, name));
  if (!row) throw new Error("HowLongToBeat sayfasında eşleşen süre kaydı okunamadı.");
  return timesFromRow(row, url);
}

const HLTB_SEARCH = "https://hltbapi.codepotatoes.de/hltb/search";
// HowLongToBeat only finds titles that contain every search word as written:
// "Unreal:" (My Abandonware's "Unreal: Gold") matches nothing in "Unreal Gold"
// and the API answers 404. The same name is then searched once more without
// separators. Results are still accepted only by the caller's title check.
export function hltbSearchTerms(name: string) {
  const plain = name
    .replace(/[™®©]/g, "")
    .replace(/\s+[-–—|]+\s+|[:;,/|–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([name.trim(), plain].filter(Boolean))];
}
async function communitySearch(
  name: string,
  accept: (title: string) => boolean,
  signal?: AbortSignal,
): Promise<any[]> {
  let failure: unknown,
    answered = false;
  for (const term of hltbSearchTerms(name)) {
    let list: unknown;
    try {
      const r = await webRequest(HLTB_SEARCH, {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm: term, matchType: 2 }),
      });
      // "Searchterm '…' does not yield any results" = an answer with no hits.
      list = /does not yield any results/i.test(r.text) ? [] : JSON.parse(r.text);
    } catch (error) {
      signal?.throwIfAborted();
      if (/HTTP 404\b/.test((error as Error).message)) answered = true;
      else failure = error;
      continue;
    }
    if (!Array.isArray(list)) {
      failure = new Error("HLTB topluluk arama yanıtı tanınmadı.");
      continue;
    }
    answered = true;
    const hits = list.filter((x) => x && typeof x.title === "string" && accept(x.title));
    if (hits.length) return hits;
  }
  if (!answered && failure) throw failure;
  return [];
}
/** Community API, explicitly attributed. No HLTB token/challenge bypass. */
export async function communityTimes(
  game: Game,
  signal?: AbortSignal,
): Promise<CompletionTimes | undefined> {
  let row: any,
    sourceUrl = "";
  if (game.appId) {
    sourceUrl = `https://hltbapi.codepotatoes.de/steam/${game.appId}`;
    try {
      const r = await webRequest(sourceUrl, { signal });
      const j = JSON.parse(r.text);
      if (Number(j.steamAppId) === game.appId) row = j;
    } catch {
      signal?.throwIfAborted();
    }
  }
  if (!row) {
    sourceUrl = HLTB_SEARCH;
    const exact = await communitySearch(
      game.name,
      (title) => titleMatch(title, game.name),
      signal,
    );
    if (exact.length === 1) row = exact[0];
  }
  if (!row || !/^\d+$/.test(String(row.hltbId))) return;
  const result: CompletionTimes = {
    status: "found",
    main: hours(row.mainStory),
    mainExtra: hours(row.mainStoryWithExtras),
    completionist: hours(row.completionist),
    url: `https://howlongtobeat.com/game/${row.hltbId}`,
    sourceUrl: `https://hltbapi.codepotatoes.de/hltb/${row.hltbId}`,
    via: "HowLongToBeat · Codepotatoes topluluk API’si",
    checkedAt: now(),
    title: typeof row.title === "string" ? row.title.slice(0, 300) : undefined,
    sourceUpdatedAt:
      typeof row.lastUpdatedAt === "string" ? row.lastUpdatedAt : undefined,
  };
  if ([result.main, result.mainExtra, result.completionist].every((v) => v === undefined))
    return;
  return result;
}
// A DLC or episode is often missing from the community search (it lists base
// games only), yet HowLongToBeat lists it under its base game as additional
// content. Find the base game, read its "relationships" and take the entry
// whose name matches; a Steam id on the entry's own page must agree. Generic:
// no game is special-cased.
async function hltbExact(name: string, signal?: AbortSignal) {
  const exact = (
    await communitySearch(name, (title) => titleKey(title) === titleKey(name), signal)
  ).filter((x) => /^\d+$/.test(String(x.hltbId)));
  return exact.length === 1
    ? { id: String(exact[0].hltbId), title: exact[0].title }
    : undefined;
}
export async function hltbFromParent(
  game: Pick<Game, "name" | "appId" | "baseGame">,
  signal?: AbortSignal,
): Promise<CompletionTimes | undefined> {
  const bases = [
    ...new Set(
      [
        game.baseGame?.name,
        ...baseTitles(game.name),
        ...(game.baseGame?.name ? baseTitles(game.baseGame.name) : []),
      ].filter((x): x is string => !!x && titleKey(x) !== titleKey(game.name)),
    ),
  ].slice(0, 5);
  const seen = new Set<string>();
  for (const baseName of bases) {
    let base;
    try {
      base = await hltbExact(baseName, signal);
    } catch {
      signal?.throwIfAborted();
      continue;
    }
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    const page = await webRequest(`https://howlongtobeat.com/game/${base.id}`, {
      signal,
      maxBytes: 4_000_000,
    });
    const data = nextData(page.text);
    const parentName = hltbRows(data)[0]?.game_name || base.title;
    const related = (data?.props?.pageProps?.game?.data?.relationships || []).filter(
      (r: any) => r && /^\d+$/.test(String(r.game_id)) && typeof r.game_name === "string",
    );
    const rest =
      titleRemainder(game.name, parentName) || titleRemainder(game.name, baseName);
    const named = related.filter(
      (r: any) =>
        titleMatch(r.game_name, game.name) ||
        (rest && titleMatch(r.game_name, rest)) ||
        titleMatch(`${parentName} ${r.game_name}`, game.name),
    );
    const candidates = named.length ? named : game.appId ? related.slice(0, 12) : [];
    for (const r of candidates) {
      const url = `https://howlongtobeat.com/game/${r.game_id}`;
      const row = hltbRows(
        nextData((await webRequest(url, { signal, maxBytes: 4_000_000 })).text),
      )[0];
      if (!row) continue;
      const steamId = Number(row.profile_steam) || undefined;
      const proven = !!game.appId && steamId === game.appId;
      if (game.appId && steamId && !proven) continue;
      if (!proven && named.length !== 1) continue;
      const times = timesFromRow(row, url, "HowLongToBeat · ana oyunun ek içerikleri");
      if (times.status === "found") return times;
    }
  }
  return undefined;
}
export async function xboxCatalog(
  game: Game,
  signal?: AbortSignal,
): Promise<CatalogResult> {
  const at = now(),
    source = "Microsoft Store kataloğu",
    check: StoreCheck = {
      store: "Xbox",
      source,
      checkedAt: at,
      status: "not_found",
      message: "Bu adla Xbox / Microsoft Store ürün kaydı bulunamadı.",
    };
  const r = await webRequest(
    "https://storeedgefd.dsx.mp.microsoft.com/v9.0/search?" +
      new URLSearchParams({
        market: "TR",
        locale: "tr-tr",
        query: game.name,
        productFamilyNames: "Games",
      }),
    { signal, maxBytes: 6_000_000 },
  );
  const items = JSON.parse(r.text)?.Payload?.SearchResults;
  if (!Array.isArray(items)) throw new Error("Microsoft Store arama yanıtı tanınmadı.");
  const matches = items.filter(
    (p: any) =>
      typeof p.Title === "string" &&
      sameTitle(p.Title, game.name) &&
      /^[A-Z0-9]{12}$/i.test(p.ProductId),
  );
  if (matches.length !== 1) {
    if (matches.length > 1) {
      check.status = "review";
      check.message = "Aynı adlı birden fazla Xbox / PC sürümü var.";
    }
    check.candidates = matches.map((p: any) => ({
      name: p.Title + " · " + (p.AvailableDevicesNarratorText || p.ProductId),
      url: xboxURL(p.ProductId),
    }));
    return { check };
  }
  const p = matches[0],
    url = xboxURL(p.ProductId),
    sku = p.SkusSummary?.find((s: any) => s.DisplayMSRP !== undefined),
    price =
      sku?.SalePrices?.find((x: any) => !x.Conditions)?.DisplayPrice || sku?.DisplayMSRP;
  const found: StoreCheck = {
    ...check,
    status: "found",
    url,
    matchedTitle: p.Title,
    priceUpdatedAt: at,
    message: p.AvailableDevicesNarratorText
      ? "Platformlar: " + p.AvailableDevicesNarratorText
      : "Platform bilgisi alınamadı; satın almadan önce ürün sürümünü kontrol et.",
  };
  const store = {
    name: "Xbox",
    url,
    verified: true,
    price,
    source,
    checkedAt: at,
    priceUpdatedAt: at,
  };
  const product = xboxProduct(p);
  return {
    ...product,
    check: found,
    partial: true,
    productId: p.ProductId,
    coverUrl:
      product.coverUrl || p.Images?.find((i: any) => i.ImageType === "BoxArt")?.Url,
    patch: {
      ...product.patch,
      stores: [store],
      minimum: undefined,
      recommended: undefined,
    },
  };
}
