// Numbers shown to the user use Turkish formatting: 2.887,5 instead of 2887.5.
// `fixed` keeps exactly `digits` decimals (8,0 GB); otherwise trailing zeros go (120).
export function formatNumber(value: number, digits = 1, fixed = true) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: fixed ? digits : 0,
    maximumFractionDigits: digits,
  });
}
// Requirement sizes are stored in GB. A value with at most two decimals was
// given in GB (0,81 GB, 8 GB). A longer fraction comes from an MB figure
// (16 MB = 0.015625 GB) and is shown in MB again instead of 0,015625 GB.
// Below 1 GB a whole number of MB (256 MB, 512 MB) is shown as MB, as stores
// write it; 0,81 GB (not a whole MB figure) stays in GB.
export function formatSize(gb: number) {
  const mb = gb * 1024;
  if (gb > 0 && gb < 1 && Math.abs(mb - Math.round(mb)) < 1e-6)
    return `${formatNumber(Math.round(mb), 0)} MB`;
  if (gb >= 1 || Math.abs(gb * 100 - Math.round(gb * 100)) < 1e-6)
    return `${formatNumber(gb, 2, false)} GB`;
  return `${formatNumber(Math.round(mb), 0)} MB`;
}
// Platform keys from stores (windows, mac, linux) in their usual spelling;
// other names (DOS, Xbox One …) are shown as the store wrote them.
const platformNames: Record<string, string> = {
  windows: "Windows",
  mac: "macOS",
  osx: "macOS",
  linux: "Linux",
};
export function platformLabel(key: string) {
  return platformNames[key.toLowerCase()] || key;
}
// Version numbers such as DirectX 9 or 12.1 keep their usual dot.
export function formatVersion(value: number) {
  return String(Math.round(value * 10) / 10);
}
// 2.1.0: store text can carry HTML entities ("T&amp;L"); shown as text.
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return entities[code.toLowerCase()] ?? m;
  });
}
// The preview card is small: show the AI summary as plain text, not raw Markdown.
export function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\|?(\s*:?-{3,}:?\s*\|?)+\s*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\*\*|__|~~|`|\*/g, "")
    .replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Backup files are named library-<UTC time>[-reason].json; show the local date.
export function backupLabel(name: string) {
  const m = name.match(
    /^library-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-\d{3})?Z(?:-([a-z-]+))?\.json$/,
  );
  if (!m) return { title: name, note: "" };
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return {
    title: date.toLocaleString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    note: m[7] === "yukseltme-oncesi" ? "Güncelleme öncesi yedeği" : "",
  };
}
// Electron wraps IPC failures as "Error invoking remote method 'app:call':
// Error: <asıl mesaj>"; the user only needs the real message.
export function cleanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const m = raw.match(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]*)$/);
  const text = (m ? m[1] : raw).trim();
  return text || "İşlem tamamlanamadı.";
}
