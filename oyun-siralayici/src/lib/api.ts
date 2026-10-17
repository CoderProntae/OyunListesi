import type { AppEvent } from "../../shared/types";
declare global {
  interface Window {
    desktop?: {
      call: (method: string, args: any) => Promise<any>;
      onEvent: (cb: (e: AppEvent) => void) => () => void;
    };
  }
}
export const api = {
  async call<T = any>(method: string, args: any = {}): Promise<T> {
    if (window.desktop) return window.desktop.call(method, args);
    const response = await fetch("/api/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Oyun-Client": "desktop-preview",
      },
      body: JSON.stringify({ method, args }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
    return data.result;
  },
  listen(callback: (event: AppEvent) => void) {
    if (window.desktop) return window.desktop.onEvent(callback);
    const source = new EventSource("/api/events");
    source.onmessage = (e) => {
      try {
        callback(JSON.parse(e.data));
      } catch {}
    };
    return () => source.close();
  },
};
export function media(name?: string) {
  return name && /^[a-f0-9]{64}\.img$/.test(name)
    ? window.desktop
      ? "app-media://cache/" + name
      : "/media/" + name
    : undefined;
}
export function external(url: string) {
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol)) return;
    if (window.desktop) void api.call("openExternal", { url }).catch(() => {});
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch {}
}
export function download(text: string, name: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const date = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Henüz kontrol edilmedi";
