// Do not turn old generic search shortcuts into buttons labeled “product page”.
export function isStoreProductLink(name: string, raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return false;
    if (name === "Xbox")
      return (
        /(^|\.)xbox.com$/.test(u.hostname) &&
        /\/games\/store\/[^/]+\/[a-z0-9]{12}/i.test(u.pathname)
      );
    const host = u.hostname.replace(/^www\./, "");
    if (name === "Steam")
      return host === "store.steampowered.com" && /^\/app\/\d+(?:\/|$)/.test(u.pathname);
    if (name === "GOG")
      return host === "gog.com" && /^\/(?:[a-z]{2}\/)?game\/[^/]+/.test(u.pathname);
    if (name === "Epic Games" || name === "Epic")
      return (
        host === "store.epicgames.com" &&
        /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?p\/[^/]+/.test(u.pathname)
      );
    return (
      u.pathname !== "/" &&
      !/\/(search|browse|catalog|wishlist)(?:\/|$)/i.test(u.pathname) &&
      !["q", "query", "search", "searchQuery", "term"].some((k) => u.searchParams.has(k))
    );
  } catch {
    return false;
  }
}
