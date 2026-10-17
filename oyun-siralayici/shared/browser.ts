// Shared with the isolated browser chrome; no Electron or application state here.
export interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  back: boolean;
  forward: boolean;
  error?: string;
}
export interface BrowserState {
  tabs: BrowserTabState[];
  activeId: string;
  notice?: string;
}
export function browserURL(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (value.length > 10000) throw new Error("Adres çok uzun.");
  let candidate = value;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    if (
      /^(?:localhost|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d+)?(?:[/?#][^\s]*)?$/u.test(
        candidate,
      )
    )
      candidate = "https://" + candidate;
    else {
      if (/^(?:javascript|file|data|vbscript|blob|about|steam|mailto):/i.test(candidate))
        throw new Error("Tarayıcı yalnızca HTTP(S) web adreslerini açar.");
      return "https://duckduckgo.com/?q=" + encodeURIComponent(value);
    }
  }
  const url = new URL(candidate);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Tarayıcı yalnızca HTTP(S) web adreslerini açar.");
  return url.toString();
}
export function webNavigation(url: string) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
