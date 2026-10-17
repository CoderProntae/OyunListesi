import crypto from "node:crypto";
import { webRequest } from "./network";
import { hasRequirementValues, rowsToRequirements } from "./requirements";
import { titleKey } from "../shared/titles";
import type { Requirements } from "../shared/types";
// 2.0.5: system requirements from PCGamingWiki for a game whose store publishes
// none (My Abandonware, "Platform yok", store pages without a requirement
// block). Only the page's Windows requirement block is used, exactly as
// written there: DOS, Mac OS or Linux blocks do not describe a Windows PC, and
// nothing is guessed when the wiki has no Windows block.
//
// The page is found by the Steam AppID when one is known (PCGamingWiki's own ID
// lookup), else by the game's name: the exact page title or a redirect the wiki
// keeps for that name, then the wiki's case-insensitive title match. A name
// match must also fit the release year (±2) when both years are known, and a
// "Name (Year)" page — the wiki's way to tell remakes apart — is tried first.
export const PCGW_HOST = "https://www.pcgamingwiki.com";
const API = PCGW_HOST + "/w/api.php";
export interface PcgwLookup {
  status: "found" | "not_found" | "unavailable";
  title?: string;
  url?: string;
  minimum?: Requirements;
  recommended?: Requirements;
  message?: string;
  // 2.0.7: the game's page (also when it has no Windows requirements), for
  // the information the platform did not give. Not saved.
  page?: { title: string; content: string };
}
export function pcgwPageUrl(title: string) {
  return (
    PCGW_HOST +
    "/wiki/" +
    encodeURIComponent(title.replace(/ /g, "_"))
      .replace(/%3A/gi, ":")
      .replace(/%2F/gi, "/")
      .replace(/%2C/gi, ",")
      .replace(/%3B/gi, ";")
      .replace(/%40/gi, "@")
      .replace(/%24/gi, "$")
  );
}
// Every {{Name …}} call in the text, braces balanced, without the outer braces.
export function templateCalls(text: string, name: string) {
  const out: string[] = [];
  const head = new RegExp(
    "\\{\\{\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(?=[|}])",
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = head.exec(text))) {
    let depth = 0,
      i = m.index,
      end = -1;
    for (; i < text.length - 1; i++) {
      if (text[i] === "{" && text[i + 1] === "{") {
        depth++;
        i++;
      } else if (text[i] === "}" && text[i + 1] === "}") {
        depth--;
        i++;
        if (depth === 0) {
          end = i - 1;
          break;
        }
      }
    }
    if (end < 0) break;
    out.push(text.slice(m.index + 2, end));
    head.lastIndex = end + 2;
  }
  return out;
}
const stripComments = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
// Top-level parts of one template call ("Name|a|b=c" → ["Name", "a", "b=c"]).
function templateParts(call: string) {
  const inner = stripComments(call),
    parts: string[] = [];
  let curly = 0,
    square = 0,
    start = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "}}" || two === "[[" || two === "]]") {
      if (two === "{{") curly++;
      else if (two === "}}") curly--;
      else if (two === "[[") square++;
      else square--;
      i++;
      continue;
    }
    if (inner[i] === "|" && curly <= 0 && square <= 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}
// Unnamed arguments ("{{Infobox game/row/developer|Epic MegaGames|Original}}").
const positional = (call: string) =>
  templateParts(call)
    .slice(1)
    .filter((part) => !/^\s*[^=|{}[\]]+=/.test(part))
    .map((part) => part.trim());
// Named parameters of one template call (names lower-case).
export function templateParams(call: string) {
  const params: Record<string, string> = {};
  for (const part of templateParts(call).slice(1)) {
    const eq = part.indexOf("=");
    if (eq > 0)
      params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return params;
}
// Templates whose first argument is the visible text; every other template
// inside a value (notes, citations, icons) is left out.
const wrappers = new Set(["abbr", "term", "tooltip", "nowrap", "small", "code"]);
function dropTemplates(value: string): string {
  let out = "",
    i = 0;
  while (i < value.length) {
    const start = value.indexOf("{{", i);
    if (start < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, start);
    let depth = 0,
      j = start,
      end = -1;
    for (; j < value.length - 1; j++) {
      if (value[j] === "{" && value[j + 1] === "{") {
        depth++;
        j++;
      } else if (value[j] === "}" && value[j + 1] === "}") {
        depth--;
        j++;
        if (depth === 0) {
          end = j - 1;
          break;
        }
      }
    }
    if (end < 0) break;
    const call = value.slice(start + 2, end);
    const name = call.split("|")[0].trim().toLowerCase();
    if (wrappers.has(name)) {
      const params = call.split("|");
      out += dropTemplates(params[1] || "");
    }
    i = end + 2;
  }
  return out;
}
// Wiki markup → plain text ("[[Windows]] 7<br>8{{note|…}}" → "Windows 7, 8").
export function wikiText(value: string) {
  return dropTemplates(stripComments(value).replace(/<br\s*\/?>/gi, ", "))
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]*)\]/g, "$1")
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\]/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*,(?:\s*,)+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
}
function level(p: Record<string, string>, prefix: "min" | "rec"): Requirements {
  const get = (key: string) => wikiText(p[prefix + key] || "");
  const os = get("os"),
    ogl = get("ogl");
  const gpu = [get("gpu"), get("gpu2"), get("gpu3")].filter(Boolean).join(" / ");
  return rowsToRequirements([
    { label: "OS", value: os ? (/windows/i.test(os) ? os : "Windows " + os) : "" },
    {
      label: "Processor",
      value: [get("cpu"), get("cpu2")].filter(Boolean).join(" / "),
    },
    { label: "Memory", value: get("ram") },
    {
      label: "Graphics",
      value: [gpu, ogl && "OpenGL " + ogl].filter(Boolean).join(", "),
    },
    { label: "VRAM", value: get("vram") },
    { label: "Storage", value: get("hd") },
    { label: "DirectX", value: get("dx") },
  ]);
}
// The page's Windows requirement block (minimum + recommended), plus the
// operating system families the page lists (for the "only DOS" note).
export function windowsRequirements(content: string) {
  const blocks = templateCalls(content, "System requirements").map(templateParams);
  const families = [
    ...new Set(blocks.map((p) => wikiText(p.osfamily || "")).filter(Boolean)),
  ];
  const win = blocks.find((p) => /^windows$/i.test(wikiText(p.osfamily || "")));
  if (!win) return { families };
  const minimum = level(win, "min"),
    recommended = level(win, "rec");
  if (!hasRequirementValues(minimum) && !hasRequirementValues(recommended))
    return { families };
  return { families, minimum, recommended };
}
// Years of the page's release dates (any platform).
export function pageYears(content: string) {
  return [...content.matchAll(/\{\{\s*Infobox game\/row\/date\s*\|[^|}]*\|([^|}]*)/gi)]
    .map((m) => Number(m[1].match(/\b(19[5-9]\d|20\d{2})\b/)?.[1]))
    .filter((y) => Number.isFinite(y) && y > 0);
}
const yearFits = (content: string, year?: number) => {
  if (!year) return true;
  const years = pageYears(content);
  return !years.length || years.some((y) => Math.abs(y - year) <= 2);
};
// 2.0.7: what the infobox and the introduction say — used only for fields the
// game's platform left empty.
export interface PcgwInfo {
  cover?: string;
  developers: string[];
  publishers: string[];
  year?: number;
  releaseDate?: string;
  genres: string[];
  description?: string;
}
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
function wikiDate(raw: string) {
  const text = wikiText(raw);
  const full = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*((?:19|20)\d{2})$/);
  const month = full ? MONTHS.indexOf(full[1].toLowerCase()) : -1;
  if (full && month >= 0)
    return {
      year: Number(full[3]),
      date: `${full[3]}-${String(month + 1).padStart(2, "0")}-${full[2].padStart(2, "0")}`,
    };
  const year = text.match(/\b(19[5-9]\d|20\d{2})\b/);
  return year ? { year: Number(year[1]) } : undefined;
}
// The original release's credits: rows without a note or noted "Original";
// ports, re-releases and patch teams only when nothing else is listed.
function credits(box: string, row: "developer" | "publisher") {
  const rows = templateCalls(box, `Infobox game/row/${row}`).map(positional);
  const original = rows.filter((a) => !a[1] || /^original$/i.test(wikiText(a[1])));
  return [
    ...new Set(
      (original.length ? original : rows)
        .map((a) => wikiText(a[0] || ""))
        .filter(Boolean),
    ),
  ].slice(0, 6);
}
export function pcgwInfo(content: string): PcgwInfo {
  const box = templateCalls(content, "Infobox game")[0] || "";
  const params = templateParams(box);
  const cover = wikiText(params.cover || "")
    .replace(/^(?:File|Image):/i, "")
    .trim();
  // The original release: the earliest year of any platform (later ports,
  // e.g. a Windows port of a DOS game, do not count); its exact date if given.
  const release = templateCalls(box, "Infobox game/row/date")
    .map(positional)
    .map((a) => wikiDate(a[1] || ""))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => a.year - b.year || Number(!a.date) - Number(!b.date))[0];
  const genres = (
    positional(templateCalls(box, "Infobox game/row/taxonomy/genres")[0] || "")[0] || ""
  )
    .split(",")
    .map((g) => wikiText(g))
    .filter(Boolean)
    .slice(0, 6);
  const intro = templateParams(
    templateCalls(content, "Introduction")[0] || "",
  ).introduction;
  const description = intro
    ? wikiText(
        intro.replace(
          /\{\{\s*Glossary:([^|}]+)(?:\|([^}]*))?\}\}/gi,
          (_m, term: string, text?: string) => {
            const t = (text || term).trim();
            return t === t.toUpperCase() ? t : t.toLowerCase();
          },
        ),
      ).slice(0, 3000)
    : "";
  return {
    ...(cover ? { cover } : {}),
    developers: credits(box, "developer"),
    publishers: credits(box, "publisher"),
    ...(release ? { year: release.year } : {}),
    ...(release?.date ? { releaseDate: release.date } : {}),
    genres,
    ...(description.length >= 20 ? { description } : {}),
  };
}
// The image file's address (MediaWiki's hashed upload folders).
export function pcgwImageUrl(file: string) {
  const name = file
    .trim()
    .replace(/^(?:File|Image):/i, "")
    .replace(/ /g, "_");
  if (!/\.(jpe?g|png|webp)$/i.test(name)) return undefined;
  const key = name[0].toUpperCase() + name.slice(1);
  const h = crypto.createHash("md5").update(key).digest("hex");
  return `https://images.pcgamingwiki.com/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(key)}`;
}
// Names to look up: the game's own name, the name without separators
// ("Unreal: Gold" → "Unreal Gold"; "Unreal:" is also a wiki prefix there) and
// extra names a verified source gave (HowLongToBeat's title).
export function pcgwNames(name: string, extra: (string | undefined)[] = []) {
  const clean = (s: string) =>
    s
      .replace(/[™®©]/g, "")
      .replace(/[[\]{}<>|#]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // 2.1.5: a game typed in by hand often carries something the wiki's title
  // does not: a year or edition in brackets ("Unreal Gold (1998)"), a trailing
  // "GOTY Edition". Both are dropped as extra candidates — never the words
  // that tell one release from another ("HD", "Remastered", "II").
  const extra2 = (s: string) =>
    clean(s.replace(/\s*\([^)]*\)/g, " "))
      .replace(/\s+(?:goty|game of the year|edition)\b/gi, " ")
      .trim();
  const out: string[] = [];
  for (const n of [name, ...extra]) {
    if (!n?.trim()) continue;
    const own = clean(n),
      plain = clean(n.replace(/\s+[-–—|]+\s+|[:;,/|–—]+/g, " "));
    for (const v of [own, plain, extra2(own), extra2(plain)])
      if (v.length >= 2 && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 8);
}
type Page = { title: string; content: string };
async function api(params: Record<string, string>, signal?: AbortSignal) {
  const query = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const r = await webRequest(`${API}?${query}`, {
    signal,
    maxBytes: 8_000_000,
    timeout: 20000,
    headers: { Accept: "application/json" },
  });
  let json: any;
  try {
    json = JSON.parse(r.text);
  } catch {
    throw new Error("PCGamingWiki geçerli yanıt vermedi.");
  }
  if (json?.error)
    throw new Error("PCGamingWiki: " + (json.error.info || json.error.code));
  return json;
}
// Titles → pages (content included), following the wiki's normalisation and
// redirects. Returns the page each asked title ends on.
async function pages(titles: string[], signal?: AbortSignal) {
  const json = await api(
    {
      action: "query",
      redirects: "1",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: titles.join("|"),
    },
    signal,
  );
  const q = json?.query || {};
  const normalized = new Map<string, string>(
    (q.normalized || []).map((n: any) => [n.from, n.to]),
  );
  const interwiki = new Set<string>((q.interwiki || []).map((n: any) => n.title));
  const redirects = new Map<string, string>(
    (q.redirects || []).map((n: any) => [n.from, n.to]),
  );
  const found = new Map<string, Page>();
  for (const p of q.pages || []) {
    const content = p?.revisions?.[0]?.slots?.main?.content;
    if (p?.ns === 0 && !p.missing && !p.invalid && typeof content === "string")
      found.set(p.title, { title: p.title, content });
  }
  return (title: string): Page | undefined => {
    let t = normalized.get(title) ?? title;
    if (interwiki.has(t)) return;
    for (let i = 0; i < 3 && redirects.has(t); i++) t = redirects.get(t)!;
    return found.get(t);
  };
}
// PCGamingWiki's Steam AppID lookup redirects to the game's page.
async function steamPage(appId: number, signal?: AbortSignal) {
  const r: any = await webRequest(`${PCGW_HOST}/api/appid.php?appid=${appId}`, {
    signal,
    timeout: 20000,
    stopAt: (u: URL) =>
      /(^|\.)pcgamingwiki\.com$/i.test(u.hostname) &&
      /^\/wiki\/(?!Special:)./i.test(u.pathname),
  });
  const m = String(r.url || "").match(/\/wiki\/([^?#]+)/);
  if (!r.stopped || !m) return;
  const title = decodeURIComponent(m[1]).replace(/_/g, " ").trim();
  return /^Special:/i.test(title) ? undefined : title;
}
export async function pcgwRequirements(
  game: { name: string; year?: number; appId?: number; names?: (string | undefined)[] },
  signal?: AbortSignal,
): Promise<PcgwLookup> {
  // A step that could not reach the wiki makes "nothing found" uncertain: the
  // answer is then "unavailable" (saved data stays, the next refresh retries).
  let failed: unknown,
    families: string[] = [];
  const attempt = async <T>(step: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await step();
    } catch (e) {
      signal?.throwIfAborted();
      failed ??= e;
      return undefined;
    }
  };
  const result = (
    page: Page,
    req: ReturnType<typeof windowsRequirements>,
  ): PcgwLookup => ({
    status: "found",
    title: page.title,
    url: pcgwPageUrl(page.title),
    minimum: req.minimum,
    recommended: req.recommended,
    page,
  });
  // The first page that is the game (title and year fit), with or without a
  // Windows block: its other information can still be used.
  let gamePage: Page | undefined;
  // 1. Steam AppID: the wiki's own ID → page. That page is the game, so a
  // missing Windows block there is the final answer.
  if (game.appId) {
    const title = await attempt(() => steamPage(game.appId!, signal));
    if (title) {
      const resolve = await attempt(() => pages([title], signal));
      const page = resolve?.(title);
      if (page) {
        const req = windowsRequirements(page.content);
        if (req.minimum) return result(page, req);
        return {
          status: "not_found",
          title: page.title,
          url: pcgwPageUrl(page.title),
          message: onlyOther(req.families),
          page,
        };
      }
    }
  }
  const names = pcgwNames(game.name, game.names);
  // A page of another game with the same name (other year) is ignored entirely.
  const accept = (page: Page | undefined, year?: number) => {
    if (!page || !yearFits(page.content, year)) return;
    gamePage ??= page;
    const req = windowsRequirements(page.content);
    families = [...new Set([...families, ...req.families])];
    return req.minimum ? result(page, req) : undefined;
  };
  // 2. Exact titles and the wiki's redirects ("Name (Year)" first).
  const titles = [
    ...(game.year ? names.map((n) => `${n} (${game.year})`) : []),
    ...names,
  ];
  if (titles.length) {
    const resolve = await attempt(() => pages(titles, signal));
    if (resolve)
      for (const t of titles) {
        const hit = accept(
          resolve(t),
          t.endsWith(` (${game.year})`) ? undefined : game.year,
        );
        if (hit) return hit;
      }
  }
  // 3. The wiki's title search: its case-insensitive exact title match, then a
  // text search; a hit counts only when its words are exactly the game's.
  const keys = new Set(names.map(titleKey));
  for (const what of ["nearmatch", "text"] as const) {
    const terms = what === "nearmatch" ? names : [names[1] || names[0]];
    const hits = new Set<string>();
    for (const term of terms.filter(Boolean)) {
      const json = await attempt(() =>
        api(
          {
            action: "query",
            list: "search",
            srwhat: what,
            srlimit: "10",
            srsearch: term,
          },
          signal,
        ),
      );
      for (const h of json?.query?.search || [])
        if (h?.ns === 0 && typeof h.title === "string" && keys.has(titleKey(h.title)))
          hits.add(h.title);
    }
    const wanted = [...hits].filter((t) => !titles.includes(t));
    if (!wanted.length) continue;
    const resolve = await attempt(() => pages(wanted, signal));
    if (resolve)
      for (const t of wanted) {
        const hit = accept(resolve(t), game.year);
        if (hit) return hit;
      }
  }
  if (failed)
    return {
      status: "unavailable",
      ...(gamePage ? { page: gamePage } : {}),
      message:
        "PCGamingWiki'ye ulaşılamadı: " +
        ((failed as Error).message || "bağlantı hatası"),
    };
  return {
    status: "not_found",
    message: onlyOther(families),
    ...(gamePage ? { page: gamePage } : {}),
  };
}
function onlyOther(families: string[]) {
  const other = families.filter((f) => !/^windows$/i.test(f));
  return other.length
    ? `PCGamingWiki'de yalnızca ${other.join(" / ")} gereksinimi var; Windows için yok.`
    : undefined;
}
