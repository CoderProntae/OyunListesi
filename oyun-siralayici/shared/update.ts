// Update channel. The manifest is a small JSON text kept on a Telegraph page
// (stable address, editable only with the publisher's key); the EXE itself is
// on file hosts listed in the manifest. Every download is checked against the
// manifest's SHA-256 before it can replace anything.
export const UPDATE_PAGE = "oyun-siralayici-guncelleme-10-16";
export const UPDATE_CHANNEL = `https://api.telegra.ph/getPage/${UPDATE_PAGE}?return_content=true`;
export interface UpdateAsset {
  // The EXE as it lands on the Desktop: name, size and SHA-256.
  name: string;
  size: number;
  sha256: string;
  urls: string[];
  // Some hosts refuse .exe files; the file may travel gzip-compressed.
  encoding?: "gzip";
  transferSize?: number;
}
export interface UpdateManifest {
  channel: "oyun-siralayici";
  version: string;
  date?: string;
  notes: string;
  assets: UpdateAsset[];
}
export type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";
export interface UpdateState {
  status: UpdateStatus;
  current: string;
  latest?: string;
  date?: string;
  notes?: string;
  size?: number;
  progress?: number;
  received?: number;
  file?: string;
  error?: string;
  checkedAt?: string;
  canInstall?: boolean;
  // 2.0.2: "download" → "verify" while downloading; bytes per second.
  phase?: "download" | "verify";
  speed?: number;
  // Something the user should know about a finished download.
  note?: string;
}
export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0),
    pb = b.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
function nodeText(node: any): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  return (node.children || []).map(nodeText).join("");
}
export function parseManifest(value: unknown, insecure = false): UpdateManifest {
  const m = value as any;
  if (!m || m.channel !== "oyun-siralayici") throw new Error("Güncelleme bilgisi tanınmadı.");
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version))
    throw new Error("Güncelleme sürüm numarası geçersiz.");
  const assets = (Array.isArray(m.assets) ? m.assets : [])
    .filter(
      (a: any) =>
        a &&
        typeof a.name === "string" &&
        /^[\w .()-]+\.exe$/i.test(a.name) &&
        Number.isFinite(a.size) &&
        a.size > 1_000_000 &&
        /^[a-f0-9]{64}$/i.test(a.sha256) &&
        Array.isArray(a.urls),
    )
    .map((a: any) => ({
      name: a.name,
      size: a.size,
      sha256: a.sha256.toLowerCase(),
      ...(a.encoding === "gzip" ? { encoding: "gzip" as const } : {}),
      ...(Number.isFinite(a.transferSize) && a.transferSize > 0 ? { transferSize: a.transferSize } : {}),
      urls: a.urls.filter(
        (u: unknown) =>
          typeof u === "string" &&
          (/^https:\/\//.test(u) || (insecure && /^http:\/\/127\.0\.0\.1[:/]/.test(u))),
      ),
    }))
    .filter((a: UpdateAsset) => a.urls.length);
  return {
    channel: "oyun-siralayici",
    version: m.version,
    date: typeof m.date === "string" ? m.date : undefined,
    notes: typeof m.notes === "string" ? m.notes.slice(0, 20000) : "",
    assets,
  };
}
// Telegraph getPage answer → manifest (the JSON is the page text).
export function manifestFromTelegraph(json: any): UpdateManifest {
  if (!json?.ok) throw new Error("Güncelleme kanalı yanıt vermedi.");
  const text = (json.result?.content || []).map(nodeText).join("\n").trim();
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Güncelleme bilgisi boş.");
  return parseManifest(JSON.parse(text.slice(start, end + 1)));
}
