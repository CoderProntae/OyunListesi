import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as cheerio from "cheerio";
import { webRequest, readableHTML } from "./network";
import { normalizeName, now } from "../shared/domain";
import { parseRequirements, rowsToRequirements } from "./requirements";
import { platformLabel } from "../shared/format";
import type {
  Game,
  OriginStore,
  PlatformHit,
  Requirements,
  StoreCheck,
} from "../shared/types";
// One store answer for one product: data for the game record, the store check
// shown in the Stores tab and image URLs that are downloaded separately.
export interface StoreProduct {
  check?: StoreCheck;
  patch: Partial<Game>;
  coverUrl?: string;
  heroUrl?: string;
  gogHTML?: string;
}
const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
const unique = <T>(v: T[]) => [...new Set(v)];
const yearOf = (v: unknown) =>
  Number(String(v || "").match(/\b(?:19|20)\d{2}\b/)?.[0]) || undefined;
const https = (v: unknown) =>
  typeof v !== "string"
    ? undefined
    : v.startsWith("//")
      ? "https:" + v
      : /^https:\/\//.test(v)
        ? v
        : undefined;
export function productURL(
  value: unknown,
  host: string,
  route: RegExp,
): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    if (
      u.protocol === "https:" &&
      (u.hostname === host || u.hostname === "www." + host) &&
      !u.username &&
      !u.password &&
      route.test(u.pathname) &&
      !u.search
    )
      return u.toString();
  } catch {}
}
export const gogRoute = /^\/(?:[a-z]{2}\/)?game\/[a-z0-9_]+\/?$/i;
export function epicProductURL(offer: any): string | undefined {
  // Only catalog-provided product mappings; urlSlug is an offer identifier, NOT a product URL.
  const slug = epicSlug(offer);
  return slug ? "https://store.epicgames.com/tr/p/" + slug : undefined;
}
export function epicSlug(offer: any): string | undefined {
  const mappings = [
    ...(Array.isArray(offer?.offerMappings) ? offer.offerMappings : []),
    ...(offer?.catalogNs?.mappings || []),
  ];
  const slug =
    mappings.find(
      (m: any) => m.pageType === "productHome" && typeof m.pageSlug === "string",
    )?.pageSlug ||
    mappings.find((m: any) => m.pageType === "offer" && typeof m.pageSlug === "string")
      ?.pageSlug ||
    offer?.productSlug;
  if (typeof slug !== "string") return;
  const clean = slug.replace(/\/home\/?$/, "");
  return /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+)*$/i.test(clean) ? clean : undefined;
}
// Store platform names → one spelling. windows/mac/linux are shown as
// "Windows", "macOS", "Linux" (shared/format platformLabel); other platforms
// (DOS, Xbox One …) keep the store's own name.
export function platformKey(name: string): string {
  const n = normalizeName(name);
  if (
    /^(windows|win|pc|bilgisayar|windows desktop|windows pc|microsoft windows)$/.test(n)
  )
    return "windows";
  if (/^(mac|osx|os x|mac os|macos|mac os x|apple mac)$/.test(n)) return "mac";
  if (/^(linux|steamos|steam os|ubuntu)$/.test(n)) return "linux";
  return name.trim().slice(0, 60);
}
const empty = (): Requirements => ({ raw: "" });
// ---------- Steam ----------
export async function steamSearch(query: string, signal?: AbortSignal) {
  const r = await webRequest(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query.slice(0, 150))}&l=turkish&cc=TR`,
    { signal },
  );
  const j = JSON.parse(r.text);
  if (!Array.isArray(j.items)) throw new Error("Steam arama yanıtı tanınmadı.");
  return j.items.slice(0, 10).map(
    (x: any): PlatformHit => ({
      store: "Steam",
      id: String(x.id),
      appId: x.id,
      name: x.name,
      image: x.tiny_image,
      url: `https://store.steampowered.com/app/${x.id}/`,
      detail: x.price
        ? `${(x.price.final / 100).toFixed(2)} ${x.price.currency}`
        : undefined,
    }),
  );
}
// ---------- GOG ----------
export async function gogSearch(query: string, signal?: AbortSignal) {
  const r = await webRequest(
    "https://catalog.gog.com/v1/catalog?" +
      new URLSearchParams({
        query: query.slice(0, 150),
        limit: "24",
        countryCode: "TR",
        locale: "en-US",
        currencyCode: "USD",
      }),
    { signal, maxBytes: 4_000_000 },
  );
  const data = JSON.parse(r.text);
  if (!Array.isArray(data.products)) throw new Error("GOG katalog yanıtı tanınmadı.");
  return data.products
    .filter(
      (p: any) =>
        typeof p.title === "string" &&
        /^\d+$/.test(String(p.id)) &&
        ["game", "pack"].includes(p.productType),
    )
    .slice(0, 10)
    .map(
      (p: any): PlatformHit => ({
        store: "GOG",
        id: String(p.id),
        name: p.title,
        url: productURL(p.storeLink, "gog.com", gogRoute),
        image: typeof p.coverHorizontal === "string" ? p.coverHorizontal : undefined,
        detail: [yearOf(p.releaseDate), strings(p.developers)[0]]
          .filter(Boolean)
          .join(" · "),
      }),
    );
}
function gogFormat(href: unknown, formatters: unknown, prefer: string[]) {
  if (typeof href !== "string") return;
  if (!href.includes("{formatter}")) return https(href);
  const list = strings(formatters);
  const pick = prefer.find((p) => list.includes(p)) || list[0];
  return pick ? https(href.replace("{formatter}", pick)) : undefined;
}
// GOG product (api.gog.com/v2/games/{id}): structured requirement rows per OS.
export function gogProduct(d: any, knownUrl?: string): StoreProduct {
  const e = d?._embedded || {},
    product = e.product || {},
    at = now();
  const url =
    productURL(d?._links?.store?.href, "gog.com", gogRoute) ||
    productURL(knownUrl, "gog.com", gogRoute);
  const windows = (e.supportedOperatingSystems || []).find(
    (o: any) => o.operatingSystem?.name === "windows",
  );
  const level = (type: string): Requirements => {
    const block = windows?.systemRequirements?.find((v: any) => v.type === type);
    if (!block) return empty();
    const rows = (block.requirements || []).map((row: any) => ({
      label: row.id === "system" ? "OS" : String(row.name || row.id),
      value: typeof row.description === "string" ? row.description : "",
    }));
    return rows.some((r: any) => r.value.trim())
      ? rowsToRequirements(rows)
      : parseRequirements(String(block.description || ""));
  };
  const check: StoreCheck | undefined = url
    ? {
        store: "GOG",
        status: "found",
        source: "GOG",
        url,
        matchedTitle: typeof product.title === "string" ? product.title : undefined,
        checkedAt: at,
      }
    : undefined;
  return {
    check,
    coverUrl: gogFormat(product._links?.image?.href, product._links?.image?.formatters, [
      "800",
      "product_630_2x",
      "product_630",
    ]),
    heroUrl:
      https(d?._links?.galaxyBackgroundImage?.href) ||
      https(d?._links?.backgroundImage?.href),
    patch: {
      description:
        typeof d?.description === "string"
          ? readableHTML(d.description, 20000).text
          : undefined,
      year: yearOf(product.globalReleaseDate || product.gogReleaseDate),
      developers: (e.developers || []).map((x: any) => x?.name).filter(Boolean),
      publishers: typeof e.publisher?.name === "string" ? [e.publisher.name] : [],
      genres: (e.tags || [])
        .map((t: any) => t?.name)
        .filter((n: any) => typeof n === "string")
        .slice(0, 6),
      platforms: unique(
        (e.supportedOperatingSystems || [])
          .map((o: any) => o.operatingSystem?.name)
          .filter((n: any) => typeof n === "string")
          .map(platformKey),
      ),
      screenshots: (e.screenshots || [])
        .map((s: any) =>
          gogFormat(s?._links?.self?.href, s?._links?.self?.formatters, [
            "1600",
            "product_card_screenshot_748",
            "ggvgm_2x",
          ]),
        )
        .filter(Boolean)
        .slice(0, 8),
      minimum: level("minimum"),
      recommended: level("recommended"),
      ...(url
        ? {
            stores: [{ name: "GOG", url, verified: true, source: "GOG", checkedAt: at }],
            sources: [
              { title: "GOG Store", url, checkedAt: at, kind: "official" as const },
            ],
          }
        : {}),
    },
  };
}
// The product page carries GOG's published HowLongToBeat section.
export async function gogPage(url: string, signal?: AbortSignal) {
  try {
    return (await webRequest(url, { signal, maxBytes: 6_000_000 })).text;
  } catch {
    signal?.throwIfAborted();
  }
}
export async function gogDetails(
  id: string,
  signal?: AbortSignal,
  options: { url?: string; page?: boolean } = {},
): Promise<StoreProduct> {
  if (!/^\d+$/.test(id)) throw new Error("Geçersiz GOG ürün kimliği.");
  const r = await webRequest(`https://api.gog.com/v2/games/${id}?locale=en-US`, {
    signal,
    maxBytes: 4_000_000,
  });
  const result = gogProduct(JSON.parse(r.text), options.url);
  if (!result.check?.url)
    throw new Error("GOG ürün kaydı bulundu fakat ürün sayfası bağlantısı alınamadı.");
  if (options.page !== false) result.gogHTML = await gogPage(result.check.url, signal);
  return result;
}
// ---------- Epic Games ----------
const epicGenres = new Set(
  [
    "Action",
    "Action-Adventure",
    "Adventure",
    "Card Game",
    "Casual",
    "City Builder",
    "Comedy",
    "Dungeon Crawler",
    "Exploration",
    "Fighting",
    "First Person",
    "Horror",
    "Indie",
    "MMO",
    "Music",
    "Narration",
    "Open World",
    "Party",
    "Platformer",
    "Puzzle",
    "Racing",
    "Retro",
    "Rogue-Lite",
    "RPG",
    "RTS",
    "Shooter",
    "Simulation",
    "Space",
    "Sports",
    "Stealth",
    "Strategy",
    "Survival",
    "Tower Defense",
    "Trivia",
    "Turn-Based",
    "Turn-Based Strategy",
  ].map((g) => g.toLowerCase()),
);
const epicTags = (o: any) =>
  (Array.isArray(o?.tags) ? o.tags : [])
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === "string");
export async function epicSearch(query: string, signal?: AbortSignal) {
  const r = await webRequest(
    "https://api.egdata.app/search/v2/search?country=TR&locale=en-US",
    {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: query.slice(0, 150), page: 1, limit: 40 }),
      maxBytes: 6_000_000,
    },
  );
  const data = JSON.parse(r.text);
  if (!Array.isArray(data.offers)) throw new Error("EGData katalog yanıtı tanınmadı.");
  const seen = new Set<string>();
  const hits: PlatformHit[] = [];
  const rank = (o: any) =>
    o.offerType === "BASE_GAME" ? 0 : o.offerType === "EDITION" ? 1 : 2;
  const offers = [...data.offers]
    .filter(
      (o: any) =>
        o.offerType !== "OTHERS" ||
        !/(soundtrack|\bost\b|^map\b|\bmap -|\bold$|\bdemo\b|\btest\b|artbook|wallpaper)/i.test(
          String(o.title || ""),
        ),
    )
    .sort((a: any, b: any) => rank(a) - rank(b));
  for (const o of offers) {
    const url = epicProductURL(o);
    if (
      typeof o.title !== "string" ||
      typeof o.id !== "string" ||
      !url ||
      seen.has(url) ||
      /test account/i.test(o.seller?.name || "") ||
      !["BASE_GAME", "OTHERS", "EDITION", "BUNDLE"].includes(o.offerType) ||
      /^2099/.test(String(o.releaseDate || ""))
    )
      continue;
    seen.add(url);
    hits.push({
      store: "Epic Games",
      id: o.id,
      name: o.title,
      url,
      detail: [yearOf(o.releaseDate), o.developerDisplayName || o.seller?.name]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return hits.slice(0, 10);
}
// Epic's own product page data: per OS a list of {title, minimum, recommended}.
export function epicRequirements(content: any) {
  const pages = Array.isArray(content?.pages) ? content.pages : [];
  const page =
    pages.find(
      (p: any) => p?.type === "productHome" && p?.data?.requirements?.systems?.length,
    ) || pages.find((p: any) => p?.data?.requirements?.systems?.length);
  const systems = page?.data?.requirements?.systems || [];
  const windows = systems.find((s: any) => /^win/i.test(String(s?.systemType || "")));
  if (!windows) return;
  const details = Array.isArray(windows.details) ? windows.details : [];
  const level = (key: "minimum" | "recommended") =>
    rowsToRequirements(
      details.map((d: any) => ({ label: String(d?.title || ""), value: d?.[key] })),
    );
  return { minimum: level("minimum"), recommended: level("recommended") };
}
// EGData's normalized copy, used only when Epic's page data cannot be read.
export function egdataRequirements(data: any) {
  const req = data?.windows?.requirements;
  if (!req) return;
  const level = (l: any) => {
    if (!l) return empty();
    const dx = (l.graphicsApis || []).find((a: any) => /directx/i.test(a?.api || ""));
    return rowsToRequirements([
      { label: "OS", value: l.os?.raw || l.os?.rawEvidence },
      { label: "Processor", value: l.cpu?.rawEvidence },
      { label: "Graphics", value: l.gpu?.rawEvidence },
      { label: "Memory", value: l.ram?.raw || l.ram?.rawEvidence },
      { label: "VRAM", value: l.vram?.raw || l.vram?.rawEvidence },
      { label: "Storage", value: l.storage?.raw || l.storage?.rawEvidence },
      {
        label: "DirectX",
        value: dx ? dx.rawEvidence || `DirectX ${dx.version || ""}` : undefined,
      },
    ]);
  };
  return { minimum: level(req.minimum), recommended: level(req.recommended) };
}
export function epicProduct(o: any): StoreProduct {
  const url = epicProductURL(o),
    at = now();
  const images = Array.isArray(o?.keyImages) ? o.keyImages : [];
  const image = (...types: string[]) =>
    types
      .map((t) => images.find((i: any) => i?.type === t)?.url)
      .map(https)
      .find(Boolean);
  const tags = epicTags(o);
  return {
    check: url
      ? {
          store: "Epic Games",
          status: "found",
          source: "Epic Games Store",
          url,
          matchedTitle: o.title,
          checkedAt: at,
        }
      : undefined,
    coverUrl: image(
      "OfferImageWide",
      "DieselStoreFrontWide",
      "Thumbnail",
      "OfferImageTall",
    ),
    heroUrl: image("OfferImageWide", "DieselStoreFrontWide"),
    patch: {
      description:
        typeof (o.longDescription || o.description) === "string"
          ? readableHTML(String(o.longDescription || o.description), 20000).text
          : undefined,
      year: yearOf(o.pcReleaseDate || o.releaseDate),
      developers:
        typeof o.developerDisplayName === "string" ? [o.developerDisplayName] : [],
      publishers:
        typeof o.publisherDisplayName === "string"
          ? [o.publisherDisplayName]
          : typeof o.seller?.name === "string" && !/test account/i.test(o.seller.name)
            ? [o.seller.name]
            : [],
      genres: tags.filter((t: string) => epicGenres.has(t.toLowerCase())).slice(0, 6),
      platforms: unique(
        tags.filter((t: string) => /^(windows|mac os|macos)$/i.test(t)).map(platformKey),
      ),
      screenshots: images
        .filter((i: any) => ["featuredMedia", "GalleryImage"].includes(i?.type))
        .map((i: any) => https(i.url))
        .filter(Boolean)
        .slice(0, 8),
      ...(url
        ? {
            stores: [
              {
                name: "Epic Games",
                url,
                verified: true,
                source: "Epic Games Store",
                checkedAt: at,
              },
            ],
            sources: [
              {
                title: "Epic Games Store",
                url,
                checkedAt: at,
                kind: "official" as const,
              },
            ],
          }
        : {}),
    },
  };
}
export async function epicDetails(
  id: string,
  signal?: AbortSignal,
  known?: any,
): Promise<StoreProduct> {
  if (!/^[a-z0-9]{8,64}$/i.test(id)) throw new Error("Geçersiz Epic ürün kimliği.");
  const offer =
    known ||
    JSON.parse(
      (
        await webRequest(
          `https://api.egdata.app/offers/${encodeURIComponent(id)}?locale=en-US`,
          { signal, maxBytes: 4_000_000 },
        )
      ).text,
    );
  const result = epicProduct(offer);
  if (!result.check?.url) throw new Error("Epic kaydında ürün sayfası eşlemesi yok.");
  let levels: { minimum: Requirements; recommended: Requirements } | undefined;
  const slug = epicSlug(offer);
  try {
    if (slug)
      levels = epicRequirements(
        JSON.parse(
          (
            await webRequest(
              `https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products/${slug.split("/")[0]}`,
              { signal, maxBytes: 6_000_000 },
            )
          ).text,
        ),
      );
  } catch {
    signal?.throwIfAborted();
  }
  if (!levels)
    try {
      levels = egdataRequirements(
        JSON.parse(
          (
            await webRequest(
              `https://api.egdata.app/offers/${encodeURIComponent(id)}/requirements`,
              { signal, maxBytes: 2_000_000 },
            )
          ).text,
        ),
      );
    } catch {
      signal?.throwIfAborted();
    }
  result.patch.minimum = levels?.minimum || empty();
  result.patch.recommended = levels?.recommended || empty();
  return result;
}
// ---------- Xbox / Microsoft Store ----------
export async function xboxSearch(query: string, signal?: AbortSignal) {
  const r = await webRequest(
    "https://storeedgefd.dsx.mp.microsoft.com/v9.0/search?" +
      new URLSearchParams({
        market: "TR",
        locale: "tr-tr",
        query: query.slice(0, 150),
        productFamilyNames: "Games",
      }),
    { signal, maxBytes: 6_000_000 },
  );
  const items = JSON.parse(r.text)?.Payload?.SearchResults;
  if (!Array.isArray(items)) throw new Error("Microsoft Store arama yanıtı tanınmadı.");
  return items
    .filter(
      (p: any) => typeof p.Title === "string" && /^[A-Z0-9]{12}$/i.test(p.ProductId),
    )
    .slice(0, 10)
    .map(
      (p: any): PlatformHit => ({
        store: "Xbox",
        id: p.ProductId,
        name: p.Title,
        url: xboxURL(p.ProductId),
        // Year, devices and price tell same-name products apart (Halo Infinite
        // multiplayer is free, the campaign is not).
        detail:
          [
            yearOf(p.ReleaseDate),
            typeof p.AvailableDevicesNarratorText === "string"
              ? p.AvailableDevicesNarratorText.replace(/,/g, ", ")
              : undefined,
            typeof p.DisplayPrice === "string" && !/:\s*$/.test(p.DisplayPrice)
              ? p.DisplayPrice
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      }),
    );
}
export const xboxURL = (id: string) => `https://www.xbox.com/tr-TR/games/store/-/${id}`;
// Microsoft Store requirement items carry fixed codes (ops = OS, m08 = 8 GB
// memory, v04 = video memory, dxb/dcb = DirectX …). "Notlar" can hold the rest
// ("125 GB Free Space;SSD required"), so it is read as free text.
export function xboxRequirements(sys: any) {
  const level = (name: "Minimum" | "Recommended") => {
    const items = Array.isArray(sys?.[name]?.Items) ? sys[name].Items : [];
    const lines: string[] = [];
    for (const it of items) {
      const code = String(it?.ItemCode || ""),
        value = typeof it?.Description === "string" ? it.Description : "";
      if (!value.trim() || /^(belirtilmemiş|not specified)$/i.test(value.trim()))
        continue;
      const label =
        code === "ops"
          ? "OS"
          : code === "cpu"
            ? "CPU"
            : code === "gpu"
              ? "GPU"
              : /^m\d+$/i.test(code)
                ? "RAM"
                : /^v\d+$/i.test(code)
                  ? "VRAM"
                  : /^d[xc][a-z]$/i.test(code)
                    ? "DirectX"
                    : code === "nts"
                      ? ""
                      : undefined;
      if (label === undefined) continue;
      if (label) lines.push(`${label}: ${value}`);
      else
        lines.push(
          ...value
            .split(/[;\n]/)
            .map((part: string) => part.trim())
            .filter(Boolean),
        );
    }
    return parseRequirements(lines.join("\n"));
  };
  return { minimum: level("Minimum"), recommended: level("Recommended") };
}
export function xboxProduct(p: any): StoreProduct {
  const id = String(p?.ProductId || ""),
    url = /^[A-Z0-9]{12}$/i.test(id) ? xboxURL(id) : undefined,
    at = now();
  const images = Array.isArray(p?.Images) ? p.Images : [];
  const image = (...types: string[]) =>
    types
      .map((t) => images.find((i: any) => String(i?.ImageType).toLowerCase() === t)?.Url)
      .map(https)
      .find(Boolean);
  const devices =
    typeof p?.AvailableDevicesNarratorText === "string"
      ? p.AvailableDevicesNarratorText.split(",")
      : [];
  const levels = xboxRequirements(p?.SystemRequirements);
  const price =
    typeof p?.DisplayPrice === "string" && p.DisplayPrice.trim()
      ? p.DisplayPrice
      : undefined;
  return {
    check: url
      ? {
          store: "Xbox",
          status: "found",
          source: "Microsoft Store",
          url,
          matchedTitle: typeof p.Title === "string" ? p.Title : undefined,
          checkedAt: at,
          message: devices.length ? "Platformlar: " + devices.join(", ") : undefined,
        }
      : undefined,
    coverUrl: image("boxart", "poster", "superheroart", "titledheroart"),
    heroUrl: image("hero", "superheroart", "titledheroart"),
    patch: {
      description:
        typeof (p?.Description || p?.LongDescription) === "string"
          ? readableHTML(String(p.Description || p.LongDescription), 20000).text
          : undefined,
      year: yearOf(p?.ReleaseDateUtc || p?.ReleaseDate),
      developers: typeof p?.DeveloperName === "string" ? [p.DeveloperName] : [],
      publishers: typeof p?.PublisherName === "string" ? [p.PublisherName] : [],
      genres: strings(p?.Categories).slice(0, 6),
      platforms: unique(devices.map((d: string) => platformKey(d)).filter(Boolean)),
      screenshots: images
        .filter((i: any) => String(i?.ImageType).toLowerCase() === "screenshot")
        .map((i: any) => https(i.Url))
        .filter(Boolean)
        .slice(0, 8),
      minimum: levels.minimum,
      recommended: levels.recommended,
      ...(url
        ? {
            stores: [
              {
                name: "Xbox",
                url,
                verified: true,
                price,
                source: "Microsoft Store",
                checkedAt: at,
                priceUpdatedAt: price ? at : undefined,
              },
            ],
            sources: [
              {
                title: "Xbox / Microsoft Store",
                url,
                checkedAt: at,
                kind: "official" as const,
              },
            ],
          }
        : {}),
    },
  };
}
export async function xboxDetails(
  id: string,
  signal?: AbortSignal,
): Promise<StoreProduct> {
  if (!/^[A-Z0-9]{12}$/i.test(id))
    throw new Error("Geçersiz Microsoft Store ürün kimliği.");
  const r = await webRequest(
    `https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/${id}?market=TR&locale=tr-tr&deviceFamily=Windows.Desktop`,
    { signal, maxBytes: 6_000_000 },
  );
  const payload = JSON.parse(r.text)?.Payload;
  if (!payload) throw new Error("Microsoft Store ürün yanıtı tanınmadı.");
  return xboxProduct(payload);
}
// ---------- My Abandonware ----------
// The site's search pages sit behind a browser check and are closed to robots,
// so search uses the public sitemap (game address + title), kept for two weeks.
// Game pages (/game/…) are open; they list year, platform, genre, publisher,
// developer, description and screenshots, but no system requirements.
const abandonwareHost = "https://www.myabandonware.com";
let abandonwareIndex:
  | { at: number; items: { path: string; title: string }[] }
  | undefined;
function decode(s: string) {
  return cheerio.load(`<i>${s}</i>`)("i").text();
}
export function parseAbandonwareSitemap(xml: string) {
  const items: { path: string; title: string }[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(
      /<loc>\s*https:\/\/www\.myabandonware\.com(\/game\/[a-z0-9-]+)\s*<\/loc>/i,
    );
    if (!loc) continue;
    const caption = m[1].match(
      /<image:caption>\s*In game screenshot of ([\s\S]*?)<\/image:caption>/i,
    );
    const title = caption
      ? decode(caption[1]).trim()
      : loc[1]
          .replace(/^\/game\//, "")
          .replace(/-[a-z0-9]{1,5}$/i, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
    if (title) items.push({ path: loc[1], title: title.slice(0, 300) });
  }
  return items;
}
async function abandonwareItems(root: string, signal?: AbortSignal) {
  const file = path.join(root, "cache", "myabandonware-index.json");
  const fresh = (at: number) => Date.now() - at < 14 * 86400000;
  if (abandonwareIndex && fresh(abandonwareIndex.at)) return abandonwareIndex.items;
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(saved.items) && fresh(saved.at)) {
      abandonwareIndex = saved;
      return saved.items as { path: string; title: string }[];
    }
  } catch {}
  const r = await webRequest(abandonwareHost + "/sitemap.xml.gz", {
    signal,
    maxBytes: 8_000_000,
    timeout: 45000,
  });
  const xml = (
    r.body[0] === 0x1f && r.body[1] === 0x8b ? zlib.gunzipSync(r.body) : r.body
  ).toString("utf8");
  const items = parseAbandonwareSitemap(xml);
  if (!items.length) throw new Error("My Abandonware oyun listesi okunamadı.");
  abandonwareIndex = { at: Date.now(), items };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(abandonwareIndex));
  } catch {}
  return items;
}
export function rankTitles<T extends { title: string }>(
  items: T[],
  query: string,
  limit = 10,
) {
  const q = normalizeName(query);
  const words = q.split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const t = normalizeName(item.title);
    if (!words.every((w) => t.includes(w))) continue;
    const score =
      (t === q
        ? 0
        : t.startsWith(q)
          ? 1
          : (" " + t + " ").includes(" " + q + " ")
            ? 2
            : 3) *
        1000 +
      t.length;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.item);
}
// Same title, different releases (DOS 1989 / Mac 1992): those few results get
// their year and platform from the game page so the user can tell them apart.
const abandonwareHints = new Map<string, string>();
async function abandonwareHint(id: string, signal?: AbortSignal) {
  if (abandonwareHints.has(id)) return abandonwareHints.get(id);
  try {
    const r = await webRequest(abandonwareHost + id, {
      signal,
      maxBytes: 4_000_000,
      timeout: 12000,
    });
    const p = abandonwareProduct(r.text, abandonwareHost + id).patch;
    const hint = [p.year, ...(p.platforms || []).map(platformLabel)]
      .filter(Boolean)
      .join(" · ");
    abandonwareHints.set(id, hint);
    return hint;
  } catch {
    signal?.throwIfAborted();
  }
}
export async function abandonwareSearch(
  query: string,
  root: string,
  signal?: AbortSignal,
) {
  const items = await abandonwareItems(root, signal);
  const hits = rankTitles(items, query).map(
    (i): PlatformHit => ({
      store: "My Abandonware",
      id: i.path,
      name: i.title,
      url: abandonwareHost + i.path,
    }),
  );
  const count = new Map<string, number>();
  for (const h of hits) {
    const key = normalizeName(h.name);
    count.set(key, (count.get(key) || 0) + 1);
  }
  const twins = hits.filter((h) => count.get(normalizeName(h.name))! > 1).slice(0, 6);
  await Promise.all(
    twins.map(async (h) => {
      h.detail = (await abandonwareHint(h.id, signal)) || undefined;
    }),
  );
  return hits;
}
export function abandonwareProduct(html: string, url: string): StoreProduct {
  const $ = cheerio.load(html);
  const info = new Map<string, string>(),
    links = new Map<string, string[]>();
  $("table.gameInfo tr").each((_i, tr) => {
    const key = $(tr).find("th").first().text().trim().toLowerCase(),
      td = $(tr).find("td").first();
    info.set(key, td.text().replace(/\s+/g, " ").trim());
    // Each value is its own link ("Neversoft Entertainment, Inc." is one name).
    links.set(
      key,
      td
        .find("a")
        .map((_j, a) => $(a).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean),
    );
  });
  const list = (key: string) =>
    links.get(key)?.length
      ? links.get(key)!
      : (info.get(key) || "")
          .split(/,(?!\s*(?:inc|ltd|llc|co|corp|gmbh|s\.a)\b\.?)/i)
          .map((s) => s.trim())
          .filter(Boolean);
  const absolute = (src?: string) =>
    src ? https(new URL(src, abandonwareHost).toString()) : undefined;
  const shots = unique(
    $(".items.screens a.item")
      .map((_i, a) => absolute($(a).attr("href")))
      .get()
      .filter(Boolean) as string[],
  ).slice(0, 8);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h2").first().text().trim();
  const at = now();
  const description = $(".gameDescription").first().text().replace(/\s+\n/g, "\n").trim();
  return {
    coverUrl: absolute($('meta[property="og:image"]').attr("content")) || shots[0],
    patch: {
      description: description ? description.slice(0, 20000) : undefined,
      year: yearOf(info.get("year")),
      developers: list("developer"),
      publishers: list("publisher"),
      genres: [...list("genre"), ...list("theme")].slice(0, 6),
      platforms: unique(list("platform").map(platformKey)),
      screenshots: shots,
      // My Abandonware pages publish no system requirements.
      minimum: empty(),
      recommended: empty(),
      stores: [
        {
          name: "My Abandonware",
          url,
          verified: true,
          source: "My Abandonware",
          checkedAt: at,
        },
      ],
      sources: [
        {
          title: title ? `My Abandonware · ${title}`.slice(0, 300) : "My Abandonware",
          url,
          checkedAt: at,
          kind: "community" as const,
        },
      ],
    },
  };
}
export async function abandonwareDetails(id: string, signal?: AbortSignal) {
  if (!/^\/game\/[a-z0-9-]+$/i.test(id))
    throw new Error("Geçersiz My Abandonware sayfası.");
  const r = await webRequest(abandonwareHost + id, { signal, maxBytes: 4_000_000 });
  const url = new URL(r.url);
  if (url.hostname !== "www.myabandonware.com" || !/^\/game\//.test(url.pathname))
    throw new Error("My Abandonware oyun sayfası bulunamadı.");
  return abandonwareProduct(r.text, url.origin + url.pathname);
}
export async function searchPlatform(
  store: OriginStore,
  query: string,
  root: string,
  signal?: AbortSignal,
): Promise<PlatformHit[]> {
  if (query.trim().length < 2) return [];
  switch (store) {
    case "Steam":
      return steamSearch(query, signal);
    case "GOG":
      return gogSearch(query, signal);
    case "Epic Games":
      return epicSearch(query, signal);
    case "Xbox":
      return xboxSearch(query, signal);
    case "My Abandonware":
      return abandonwareSearch(query, root, signal);
    default:
      return [];
  }
}
