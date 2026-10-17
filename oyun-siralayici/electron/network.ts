import dns from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as request } from "undici";
import * as cheerio from "cheerio";
export function isPublicIp(address: string) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && (a as any).isIPv4MappedAddress())
      a = (a as any).toIPv4Address();
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
export function publicURL(raw: string) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Yalnızca herkese açık http/https sayfaları açılabilir.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!host.includes(".") && !isIP(host)) ||
    (isIP(host) && !isPublicIp(host))
  )
    throw new Error("Yerel/özel ağ adresleri web aracında engellendi.");
  return u;
}
async function resolvePublicHost(host: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = () => reject(signal.reason || new Error("DNS sorgusu durduruldu."));
    signal.addEventListener("abort", abort, { once: true });
    dns
      .lookup(host, { all: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function webRequest(
  raw: string,
  options: {
    signal?: AbortSignal;
    maxBytes?: number;
    timeout?: number;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
    body?: string;
    // A redirect whose target matches is not followed: the answer is the
    // target address alone (stopped: true), without downloading that page.
    stopAt?: (url: URL) => boolean;
  } = {},
): Promise<{ url: string; body: Buffer; text: string; type: string; stopped?: boolean }> {
  let url = publicURL(raw);
  let method = options.method || "GET",
    bodyText = options.body;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeout || 18000)])
    : AbortSignal.timeout(options.timeout || 18000);
  for (let redirect = 0; redirect < 4; redirect++) {
    const host = url.hostname.replace(/^\[|\]$/g, ""),
      addresses = await resolvePublicHost(host, signal);
    if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
      throw new Error("Adres özel ağa yönleniyor; istek engellendi.");
    const pinned = addresses[0];
    const agent = new Agent({
      connect: {
        lookup: ((_hostname: any, opts: any, cb: any) => {
          if (opts?.all) cb(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        }) as any,
      },
    });
    try {
      const res = await request(url, {
        dispatcher: agent,
        method,
        body: bodyText,
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": "OyunSiralayici/1.0 (+desktop game library)",
          Accept: "text/html,application/json,application/xml;q=0.9,*/*;q=0.5",
          ...options.headers,
        },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const next = res.headers.get("location");
        await res.body?.cancel();
        if (!next) throw new Error("Boş yönlendirme.");
        const target = publicURL(new URL(next, url).toString());
        if (options.stopAt?.(target))
          return {
            url: target.toString(),
            body: Buffer.alloc(0),
            text: "",
            type: "",
            stopped: true,
          };
        if (method === "POST") {
          if (res.status === 303 || res.status === 301 || res.status === 302) {
            method = "GET";
            bodyText = undefined;
          } else if (target.origin !== url.origin)
            throw new Error("POST yönlendirmesi başka kaynağa aktarılmadı.");
        }
        url = target;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`Kaynak HTTP ${res.status} döndürdü.`);
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const part of res.body as any) {
        size += part.length;
        if (size > (options.maxBytes || 2_000_000))
          throw new Error("Sunucu yanıtı bu isteğin indirme boyutunu aştı.");
        chunks.push(part);
      }
      const body = Buffer.concat(chunks);
      return {
        url: url.toString(),
        body,
        text: body.toString("utf8"),
        type: res.headers.get("content-type") || "",
      };
    } finally {
      await agent.destroy();
    }
  }
  throw new Error("Çok fazla yönlendirme.");
}
export function readableHTML(html: string, max = 16000) {
  const $ = cheerio.load(html);
  $("script,style,iframe,object,embed,svg,noscript,nav,footer,header,form").remove();
  $("br").replaceWith("\n");
  $("li,p,h1,h2,h3,h4,div").append("\n");
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  return {
    title: $("title").text().trim().slice(0, 250),
    text: root
      .text()
      .replace(/[\t ]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim()
      .slice(0, max),
  };
}
export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}
export async function searchWeb(
  query: string,
  settings: { searchProvider: string; searxUrl: string },
  braveKey = "",
  signal?: AbortSignal,
): Promise<{
  query: string;
  provider: string;
  results: WebResult[];
  warning?: string;
}> {
  if (!query.trim() || query.length > 1000)
    throw new Error("Arama sorgusu 1–1000 karakter olmalı.");
  if (settings.searchProvider === "brave") {
    if (!braveKey) throw new Error("Brave API anahtarı ayarlarda eksik.");
    const r = await webRequest(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
      {
        signal,
        headers: {
          "X-Subscription-Token": braveKey,
          Accept: "application/json",
        },
      },
    );
    const j = JSON.parse(r.text);
    return {
      query,
      provider: "Brave",
      results: (j.web?.results || []).slice(0, 8).map((x: any) => ({
        title: x.title,
        url: x.url,
        snippet: readableHTML(x.description || "").text,
        domain: new URL(x.url).hostname,
      })),
    };
  }
  if (settings.searchProvider === "searxng") {
    const u = publicURL(settings.searxUrl);
    u.pathname = u.pathname.replace(/\/$/, "") + "/search";
    u.search = new URLSearchParams({
      q: query,
      format: "json",
      language: "tr-TR",
    }).toString();
    const r = await webRequest(u.toString(), { signal });
    const j = JSON.parse(r.text);
    return {
      query,
      provider: "SearXNG",
      results: (j.results || [])
        .slice(0, 8)
        .filter((x: any) => {
          try {
            publicURL(x.url);
            return true;
          } catch {
            return false;
          }
        })
        .map((x: any) => ({
          title: x.title,
          url: x.url,
          snippet: x.content || "",
          domain: new URL(x.url).hostname,
        })),
    };
  }
  const errors: string[] = [];
  try {
    const r = await webRequest(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { signal },
    );
    const $ = cheerio.load(r.text),
      results: WebResult[] = [];
    $(".result").each((_, el) => {
      const a = $(el).find(".result__a");
      try {
        const u = new URL(a.attr("href") || "", "https://duckduckgo.com");
        const final = publicURL(u.searchParams.get("uddg") || u.toString());
        results.push({
          title: a.text(),
          url: final.toString(),
          snippet: $(el).find(".result__snippet").text().slice(0, 500),
          domain: final.hostname,
        });
      } catch {}
    });
    const matches = results;
    if (matches.length)
      return {
        query,
        provider: "DuckDuckGo (anahtarsız)",
        results: matches.slice(0, 20),
      };
    errors.push("DuckDuckGo ilgili sonuç vermedi veya CAPTCHA istedi.");
  } catch (e: any) {
    if (signal?.aborted) throw e;
    errors.push(e.message);
  }
  try {
    const r = await webRequest(
      `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,
      { signal },
    );
    const $ = cheerio.load(r.text, { xml: true }),
      results: WebResult[] = [];
    $("item").each((_, el) => {
      try {
        const u = publicURL($(el).find("link").text());
        results.push({
          title: $(el).find("title").text(),
          url: u.toString(),
          snippet: $(el).find("description").text().slice(0, 500),
          domain: u.hostname,
        });
      } catch {}
    });
    const matches = results;
    if (matches.length)
      return {
        query,
        provider: "Bing RSS (anahtarsız yedek)",
        results: matches.slice(0, 20),
      };
    errors.push("Bing ilgili sonuç vermedi.");
  } catch (e: any) {
    if (signal?.aborted) throw e;
    errors.push(e.message);
  }
  throw new Error(
    `Anahtarsız aramada ilgili sonuç alınamadı. SearXNG/Brave seçebilir veya yeniden deneyebilirsin. ${errors.join(" ")}`,
  );
}
