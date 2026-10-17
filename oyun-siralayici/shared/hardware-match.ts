// 2.1.0: deterministic hardware comparison. The store's CPU/GPU requirement
// text is read piece by piece (model names, "or" alternatives, memory,
// DirectX/Shader Model/OpenGL/Vulkan, T&L, AGP, "integrated not supported",
// instruction sets, "2.4 GHz dual core" …) and compared with the computer using
// shared/hardware-db.json (PassMark scores + TechPowerUp features, rebuilt by
// scripts/hardware-data.ts for every release). Anything it cannot read stays
// "unknown" and goes to the AI research as before.
import raw from "./hardware-db.json";
import type { Hardware } from "./types";
import { formatSize } from "./format";
import {
  brandWords,
  cpuKey,
  gpuKey,
  matchTokens,
  separators,
  SERIES,
  type Brand,
} from "./hardware-names";

export interface CpuEntry {
  name: string;
  mark: number;
  thread: number;
  cores: number;
  threads: number;
  base: number;
  turbo: number;
  year: number;
  flags: number;
  key: string[];
  brand?: Brand;
  // 2.1.5: the model in the requirement text was not in the database by name;
  // this entry stands for it (its family's weakest member). Says so in text.
  via?: string;
}
export interface GpuEntry {
  name: string;
  score: number;
  vram: number;
  year: number;
  dx: number;
  gl: number;
  vk: number;
  sm: number;
  kind: number;
  bus: number;
  key: string[];
  brand?: Brand;
  via?: string;
}
export interface Verdict {
  status: "pass" | "fail" | "unknown";
  near?: boolean;
  estimated?: boolean;
  reason: string;
}
interface Group<T> {
  key: string[];
  members: T[];
  brand?: Brand;
}
interface Index<T> {
  first: Map<string, Group<T>[]>;
  alias: Map<string, Group<T>[]>;
}
const db = raw as unknown as {
  date: string;
  cpu: [string, number, number, number, number, number, number, number, number][];
  gpu: [string, number, number, number, number, number, number, number, number, number][];
};
export const hardwareDataInfo = {
  date: db.date,
  cpus: db.cpu.length,
  gpus: db.gpu.length,
  sources:
    "PassMark (işlemci ve ekran kartı puanları), TechPowerUp (ekran kartı özellikleri)",
};

let cpus: CpuEntry[] | undefined, gpus: GpuEntry[] | undefined;
let cpuIndex: Index<CpuEntry> | undefined, gpuIndex: Index<GpuEntry> | undefined;
function cpuList() {
  return (cpus ??= db.cpu.map(
    ([name, mark, thread, cores, threads, base, turbo, year, flags]) => ({
      name,
      mark,
      thread,
      cores,
      threads,
      base,
      turbo,
      year,
      flags,
      ...cpuKey(name),
    }),
  ));
}
function gpuList() {
  return (gpus ??= db.gpu.map(([name, score, vram, year, dx, gl, vk, sm, kind, bus]) => ({
    name,
    score,
    vram,
    year,
    dx,
    gl,
    vk,
    sm,
    kind,
    bus,
    ...gpuKey(name),
  })));
}
// Right after a brand name the family word may be left out: "GeForce 1060",
// "Radeon 580" (GPU), "Intel G640" (Pentium), "AMD 5600X" (Ryzen 5).
const gpuFamilies = new Set(["gtx", "rtx", "gts", "gt", "rx", "hd"]);
function gpuAlias(key: string[]): string[][] {
  return gpuFamilies.has(key[0]) && /^\d/.test(key[1] || "") ? [key.slice(1)] : [];
}
const amdFamilies = new Set([
  "athlon",
  "phenom",
  "sempron",
  "turion",
  "opteron",
  "duron",
]);
function cpuAlias(key: string[]): string[][] {
  const out: string[][] = [];
  // "Pentium Gold G6400" is also written "Pentium G6400" and "G6400"
  const k =
    key[0] === "pentium" && key[1] === "gold" ? ["pentium", ...key.slice(2)] : key;
  if (k !== key) out.push(k);
  if (
    (k[0] === "pentium" || k[0] === "celeron") &&
    /^[a-z]$/.test(k[1] || "") &&
    /^\d/.test(k[2] || "")
  )
    out.push(k.slice(1));
  // "Ryzen 5 3600" is also written "Ryzen 3600" and "AMD 3600"
  if (key[0] === "ryzen" && /^\d$/.test(key[1] || "") && /^\d{4}/.test(key[2] || ""))
    out.push(["ryzen", ...key.slice(2)], key.slice(2));
  // 2.1.5: the benchmark list drops the Roman numeral in "Athlon X4 760K",
  // requirements keep saying "Athlon II X4 760K" — both spellings must find it.
  if (amdFamilies.has(key[0]) && key[1] === "x" && /^\d$/.test(key[2] || ""))
    out.push([key[0], "2", ...key.slice(1)]);
  return out;
}
function buildIndex<T extends { key: string[]; brand?: Brand }>(
  entries: T[],
  alias: (key: string[]) => string[][],
): Index<T> {
  const groups = new Map<string, Group<T>>();
  for (const e of entries) {
    // "MOBILITY", "HD Family": names without a model number match nothing.
    if (!e.key.length || (e.key.length < 2 && !e.key.some((t) => /\d/.test(t)))) continue;
    const id = e.key.join(" ") + "|" + (e.brand || "");
    const g = groups.get(id);
    if (g) g.members.push(e);
    else groups.set(id, { key: e.key, members: [e], brand: e.brand });
  }
  const index: Index<T> = { first: new Map(), alias: new Map() };
  const put = (map: Map<string, Group<T>[]>, g: Group<T>) => {
    const list = map.get(g.key[0]);
    if (list) list.push(g);
    else map.set(g.key[0], [g]);
  };
  for (const g of groups.values()) {
    put(index.first, g);
    for (const short of alias(g.key))
      if (short.length) put(index.alias, { ...g, key: short });
  }
  for (const map of [index.first, index.alias])
    for (const list of map.values()) list.sort((a, b) => b.key.length - a.key.length);
  return index;
}
const cpuIdx = () => (cpuIndex ??= buildIndex(cpuList(), cpuAlias));
const gpuIdx = () => (gpuIndex ??= buildIndex(gpuList(), gpuAlias));

const unitWords = new Set(["mb", "gb", "ghz", "mhz", "bit", "x", "p", "hz", "fps"]);
function clockAfter(tokens: string[], at: number) {
  for (let j = at; j < Math.min(tokens.length, at + 5); j++) {
    if (separators.has(tokens[j])) break;
    const v = Number(tokens[j]);
    if (!Number.isFinite(v)) continue;
    if (tokens[j + 1] === "ghz") return v * 1000;
    if (tokens[j + 1] === "mhz") return v;
  }
  return 0;
}
// Old CPUs share a name and differ by clock ("Pentium 4 2.0 GHz"); without a
// clock the weakest of the family is the requirement ("Pentium 4 or better").
function pickCpu(g: Group<CpuEntry>, tokens: string[], end: number) {
  if (g.members.length === 1) return g.members[0];
  const mhz = clockAfter(tokens, end);
  const byMark = [...g.members].sort((a, b) => a.mark - b.mark);
  if (mhz) {
    const near = byMark.filter((m) => m.base && Math.abs(m.base - mhz) / mhz <= 0.04);
    if (near.length) return near[0];
  }
  return byMark[0];
}
// Model suffixes a requirement sometimes leaves out ("GTX 550" = GTX 550 Ti,
// "GeForce 8800" = any 8800, "GT 540" = GT 540M): the weakest variant counts.
const suffixWords = new Set([
  "ti",
  "se",
  "super",
  "xt",
  "xtx",
  "pro",
  "gt",
  "gts",
  "gtx",
  "gs",
  "le",
  "ultra",
  "m",
]);
function scan<T extends { brand?: Brand }>(
  tokens: string[],
  index: Index<T>,
  pick: (g: Group<T>, tokens: string[], end: number) => T,
  variants?: (members: T[]) => T,
) {
  const found: T[] = [];
  let brand: Brand | undefined;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (separators.has(t)) {
      brand = undefined;
      i++;
      continue;
    }
    if (brandWords[t]) {
      brand = brandWords[t];
      i++;
      continue;
    }
    const prev = tokens[i - 1];
    const prevBrand = prev ? brandWords[prev] : undefined;
    const fits = (key: string[], groupBrand?: Brand) => {
      if (brand && groupBrand && groupBrand !== brand) return false;
      // A bare number is a model only right after a brand ("GeForce 256"),
      // never a size or clock ("256 MB").
      if (key.length === 1 && /^\d+$/.test(key[0])) {
        if (!prevBrand) return false;
        if (unitWords.has(tokens[i + 1] || "")) return false;
      }
      // "1280 x 1024" is a resolution, not a Radeon X1024.
      if (key[0].length === 1 && prev && /^\d/.test(prev)) return false;
      // "GeForce 600 series": the number names a generation; a card whose whole
      // key is that number ("600 PCI", a 2004 PCI board) is not what is asked.
      if (tokens[i + key.length] === SERIES && /^\d+$/.test(key[key.length - 1] || ""))
        return false;
      return true;
    };
    const equal = (key: string[]) => key.every((k, j) => tokens[i + j] === k);
    let match: { entry: T; len: number } | undefined;
    const exact =
      (index.first.get(t) || []).find((g) => equal(g.key) && fits(g.key, g.brand)) ||
      (index.alias.get(t) || []).find(
        (g) =>
          equal(g.key) &&
          fits(g.key, g.brand) &&
          // a family word ("Ryzen 3600") stands on its own; a bare model
          // number needs the brand right before it ("GeForce 1060")
          (prevBrand ? !g.brand || g.brand === prevBrand : /^[a-z]{3,}$/.test(g.key[0])),
      );
    if (exact)
      match = { entry: pick(exact, tokens, i + exact.key.length), len: exact.key.length };
    else if (variants)
      for (let k = Math.min(3, tokens.length - i); k >= 1 && !match; k--) {
        const prefix = tokens.slice(i, i + k);
        if (
          prefix.some((x) => separators.has(x) || brandWords[x]) ||
          suffixWords.has(prefix[k - 1])
        )
          continue;
        if (!fits(prefix, undefined)) continue;
        const next = tokens[i + k];
        if (next && /^\d/.test(next) && !unitWords.has(tokens[i + k + 1] || "")) continue;
        const members = (index.first.get(t) || [])
          .filter(
            (g) =>
              g.key.length === k + 1 &&
              suffixWords.has(g.key[k]) &&
              prefix.every((x, j) => g.key[j] === x) &&
              (!brand || !g.brand || g.brand === brand),
          )
          .flatMap((g) => g.members);
        if (members.length) match = { entry: variants(members), len: k };
      }
    if (match) {
      if (!found.includes(match.entry)) found.push(match.entry);
      i += match.len;
    } else i++;
  }
  return found;
}
const clean = (text: string) =>
  text
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/[®™©]|\((?:r|tm)\)/gi, " ")
    // resolutions are not model numbers
    .replace(/\b\d{3,4}\s*[x×*]\s*\d{3,4}\b/g, " ");

const found = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (found.has(key)) return found.get(key) as T;
  if (found.size > 20000) found.clear();
  const value = make();
  found.set(key, value);
  return value;
}
// 2.1.5: "Intel Core i7 4700" — the benchmark list only carries the suffixed
// models (i7-4700MQ/HQ/EQ). The family's weakest member is what the
// requirement asks for at least, and the answer names that chip.
const cpuLabel = (prefix: string[]) =>
  prefix[0] === "i" && /^\d$/.test(prefix[1] || "")
    ? `Core i${prefix[1]} ${prefix.slice(2).join(" ")}`.trim()
    : prefix.join(" ");
function cpuSuffixFamily(tokens: string[]): CpuEntry[] {
  const idx = cpuIdx();
  const out: CpuEntry[] = [];
  let brand: Brand | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (separators.has(t)) {
      brand = undefined;
      continue;
    }
    if (brandWords[t]) {
      brand = brandWords[t];
      continue;
    }
    for (let k = Math.min(4, tokens.length - i); k >= 2; k--) {
      const prefix = tokens.slice(i, i + k);
      if (
        prefix.some((x) => separators.has(x) || brandWords[x] || x === SERIES) ||
        !/^\d{3,5}$/.test(prefix[k - 1])
      )
        continue;
      const next = tokens[i + k];
      if (next && /^\d/.test(next)) continue;
      const members = (idx.first.get(prefix[0]) || [])
        .filter(
          (g) =>
            g.key.length === k + 1 &&
            /^[a-z]{1,3}$/.test(g.key[k]) &&
            prefix.every((x, j) => g.key[j] === x) &&
            (!brand || !g.brand || g.brand === brand),
        )
        .flatMap((g) => g.members)
        .filter((m) => m.mark);
      if (!members.length) continue;
      const weakest = members.reduce((a, b) => (b.mark < a.mark ? b : a));
      out.push({ ...weakest, via: cpuLabel(prefix) });
      i += k - 1;
      break;
    }
  }
  return out;
}
// 2.1.5: "GeForce 600 series", "Radeon HD 7000 series" — a generation, not one
// card. The weakest desktop card of that generation is the floor; the reason
// text names it, so the comparison stays visible.
// Written as the vendor writes them: "GeForce 600 serisi", not "Geforce …".
const gpuLines: Record<string, string> = {
  geforce: "GeForce",
  radeon: "Radeon",
  quadro: "Quadro",
  titan: "Titan",
  firepro: "FirePro",
  firegl: "FireGL",
  tesla: "Tesla",
  nvs: "NVS",
  instinct: "Instinct",
};
function seriesFloor(
  line: string | undefined,
  family: string | undefined,
  brand: Brand | undefined,
  num: string,
): GpuEntry | undefined {
  const digits = num.replace(/0+$/, "") || num;
  const members = gpuList().filter((e) => {
    if (!e.score) return false;
    if (brand && e.brand !== brand) return false;
    if (line && !e.name.toLowerCase().includes(line)) return false;
    if (family && !e.key.includes(family)) return false;
    const model = e.key.find((k) => /^\d+$/.test(k));
    return !!model && model.length === num.length && model.startsWith(digits);
  });
  if (!members.length) return undefined;
  // Integrated graphics (Radeon HD 7290, an APU's) are not what "Radeon HD 7000
  // series" asks for: a card with its own memory first, then any desktop card.
  const own = (m: GpuEntry) =>
    m.kind !== 1 && m.kind !== 2 && !/\d+m\b|mobile|laptop/i.test(m.name);
  const desktop = members.filter(own);
  const discrete = desktop.filter((m) => m.vram);
  const weakest = (
    discrete.length ? discrete : desktop.length ? desktop : members
  ).reduce((a, b) => (b.score < a.score ? b : a));
  const label = [
    line ? gpuLines[line] || line : "",
    family ? family.toUpperCase() : "",
    num,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ...weakest,
    name: `${label} serisi`,
    via: `${label} serisinin en zayıf masaüstü kartı ${weakest.name}`,
  };
}
function gpuSeries(tokens: string[]): GpuEntry[] {
  const out: GpuEntry[] = [];
  let brand: Brand | undefined, line: string | undefined, family: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (separators.has(t)) {
      brand = line = family = undefined;
      continue;
    }
    if (gpuLines[t]) {
      line = t;
      brand ??= brandWords[t];
      continue;
    }
    if (brandWords[t]) {
      brand = brandWords[t];
      continue;
    }
    if (gpuFamilies.has(t)) {
      family = t;
      continue;
    }
    if (t !== SERIES || !/^\d{3,4}$/.test(tokens[i - 1] || "")) continue;
    const entry = seriesFloor(line, family, brand, tokens[i - 1]);
    if (entry && !out.some((o) => o.name === entry.name)) out.push(entry);
    line = family = undefined;
  }
  return out;
}
export function findCpus(text: string): CpuEntry[] {
  return cached("c\u0000" + text, () => {
    const tokens = matchTokens(clean(text), true);
    const found = scan(tokens, cpuIdx(), pickCpu);
    return found.length ? found : cpuSuffixFamily(tokens);
  });
}
export function findGpus(text: string): GpuEntry[] {
  return cached("g\u0000" + text, () => {
    const tokens = matchTokens(
      // "760 GTX" / "450 GTS" are GTX 760 / GTS 450 (not 8800 GTX, a 4-digit model)
      clean(text).replace(/\b(\d{3})\s*(gtx|gts|rtx)\b/gi, "$2 $1"),
      false,
    );
    const found = scan(
      tokens,
      gpuIdx(),
      (g) => [...g.members].sort((a, b) => b.score - a.score)[0],
      (members) => {
        const scored = members.filter((m) => m.score);
        const desktop = scored.filter(
          (m) => m.kind !== 1 && !/\d+m\b|mobile|laptop/i.test(m.name),
        );
        const pool = desktop.length ? desktop : scored.length ? scored : members;
        return pool.reduce((a, b) => (b.score < a.score ? b : a));
      },
    );
    for (const s of gpuSeries(tokens))
      if (!found.some((f) => f.name === s.name)) found.push(s);
    return found;
  });
}
export function userCpu(h: Hardware): CpuEntry | undefined {
  return h.cpu ? findCpus(h.cpu)[0] : undefined;
}
export function userGpu(h: Hardware): GpuEntry | undefined {
  if (!h.gpu) return undefined;
  const direct = findGpus(h.gpu)[0];
  if (direct) return direct;
  // "AMD Radeon(TM) Graphics" names no model; the APU's entry carries the CPU
  // name ("Ryzen 5 5600G with Radeon Graphics").
  if (/radeon/i.test(h.gpu) && h.cpu) {
    const apu = findGpus(h.cpu)[0];
    if (apu?.kind === 2) return apu;
  }
  return undefined;
}

// ---- numbers and wording ----------------------------------------------------
const tr = (n: number) => Math.round(n).toLocaleString("tr-TR");
const dec = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const times = (r: number) => (r >= 10 ? String(Math.round(r)) : dec(r));
const pct = (r: number) => Math.round(r * 100);
function band(ratio: number): Pick<Verdict, "status" | "near"> {
  if (ratio >= 1.1) return { status: "pass" };
  if (ratio < 0.9) return { status: "fail" };
  return { status: "pass", near: true };
}
const versionText = (v: number) => String(Math.round(v * 10) / 10);
// OpenGL/Shader Model/Vulkan are written with one decimal ("3.0", "4.6").
const minorText = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const sizeText = (mb: number) => formatSize(mb / 1024);
function list(items: string[]) {
  return items.length <= 1
    ? items.join("")
    : items.slice(0, -1).join(", ") + " ve " + items[items.length - 1];
}
const median = (values: number[]) => {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- the computer's own GPU facts (also used by the VRAM/DirectX/Vulkan rows)
export interface GpuFacts {
  entry?: GpuEntry;
  vramGB: number | null;
  vramFromData: boolean;
  dx: number | null;
  dxFromData: boolean;
  sm: number;
  gl: number;
  vk: number;
  integrated: boolean | null;
  modern: boolean | null;
}
const parseVersion = (text?: string) => Number(text?.match(/\d+(?:\.\d+)?/)?.[0] || 0);
function smFromDx(dx: number) {
  if (dx >= 12) return 5.1;
  if (dx >= 11) return 5;
  if (dx >= 10.1) return 4.1;
  if (dx >= 10) return 4;
  if (dx >= 9) return 2;
  return 0;
}
export function gpuFacts(h: Hardware): GpuFacts {
  const entry = userGpu(h);
  const vramFromData = !h.vramCertain && !!entry?.vram;
  const vramGB = h.vramCertain ? h.vramGB : entry?.vram ? entry.vram / 1024 : null;
  const dxFromData = h.directX === null && !!entry?.dx;
  const dx = h.directX ?? (entry?.dx || null);
  const sm = entry?.sm || smFromDx(dx || 0);
  // Without data: a DirectX 11 card has at least OpenGL 4.0, a DirectX 10
  // card 3.3, a Shader Model 3 card 2.1.
  const gl = entry?.gl || (dx ? (dx >= 11 ? 4 : dx >= 10 ? 3.3 : sm >= 3 ? 2.1 : 0) : 0);
  const vk = parseVersion(h.vulkan) || entry?.vk || 0;
  const integrated = entry
    ? entry.kind === 2
    : h.gpu
      ? /\b(?:intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics)\b/i.test(
          h.gpu,
        ) && !/\barc a\d/i.test(h.gpu)
      : null;
  const modern = entry ? entry.year >= 2005 || entry.dx >= 9 : dx ? dx >= 9 : null;
  return { entry, vramGB, vramFromData, dx, dxFromData, sm, gl, vk, integrated, modern };
}

// ---- GPU ---------------------------------------------------------------------
interface Check {
  ok: boolean | null;
  need: string;
  have?: string;
  era?: boolean;
}
function memoryNeedMB(text: string) {
  const sizes = [
    ...text.matchAll(
      /(\d+(?:[.,]\d+)?)\s*(gb|mb|gig)\b(\s*(?:of\s+)?(?:vram|video|graphics|memory|ram|card|dedicated))?/gi,
    ),
  ]
    .map((m) => ({
      mb: Number(m[1].replace(",", ".")) * (/m/i.test(m[2]) ? 1 : 1024),
      labelled: !!m[3],
    }))
    // "2 MB VRAM" is a (1990s) card memory; an unlabelled "2 MB" is not.
    .filter((s) => s.mb <= 49152 && (s.mb >= 8 || (s.labelled && s.mb >= 1)))
    .map((s) => s.mb);
  return sizes.length ? Math.min(...sizes) : 0;
}
function gpuChecks(text: string, f: GpuFacts): Check[] {
  const checks: Check[] = [];
  const mem = memoryNeedMB(text);
  if (mem)
    checks.push({
      need: `${sizeText(mem)} bellek`,
      ok: f.vramGB === null ? null : f.vramGB * 1024 >= mem - 1,
      have: f.vramGB === null ? undefined : formatSize(f.vramGB),
    });
  const dx = text.match(
    /\b(?:direct\s?x|direct3d|d3d|dx)\s*:?\s*(?:version\s*)?(\d{1,2}(?:\.\d)?)/i,
  );
  if (dx) {
    const need = Number(dx[1]);
    checks.push({
      need: `DirectX ${versionText(need)}`,
      ok: f.dx === null ? null : f.dx + 0.001 >= need,
      have: f.dx === null ? undefined : `DirectX ${versionText(f.dx)}`,
    });
  } else if (/\b(?:direct\s?x|direct3d)\b/i.test(text))
    checks.push({
      need: "DirectX desteği",
      ok: f.dx === null ? f.modern : f.dx >= 7,
      have: f.dx === null ? undefined : `DirectX ${versionText(f.dx)}`,
    });
  const sm =
    text.match(/\b(?:shader model|sm)\s*(\d(?:\.\d)?)\b/i) ||
    text.match(/\b(?:pixel|vertex)\s*shaders?\s*(?:model\s*)?(\d(?:\.\d)?)\b/i) ||
    text.match(/\b(?:ps|vs)\s*(\d\.\d)\b/i) ||
    text.match(/\bshaders?\s*(\d\.\d)\b/i);
  if (sm) {
    const need = Number(sm[1]);
    checks.push({
      need: `Shader Model ${minorText(need)}`,
      ok: f.sm ? f.sm + 0.001 >= need : null,
      have: f.sm ? `Shader Model ${minorText(f.sm)}` : undefined,
    });
  }
  const gl = text.match(/\bopen\s?gl\s*(?:version\s*)?(\d(?:\.\d)?)?/i);
  if (gl) {
    const need = Number(gl[1] || 0);
    checks.push({
      need: need ? `OpenGL ${minorText(need)}` : "OpenGL desteği",
      ok: f.gl ? f.gl + 0.001 >= need : null,
      have: f.gl ? `OpenGL ${minorText(f.gl)}` : undefined,
    });
  }
  const vk = text.match(/\bvulkan\s*(?:api\s*)?(\d(?:\.\d)?)?/i);
  if (vk) {
    const need = Number(vk[1] || 0);
    checks.push({
      need: need ? `Vulkan ${minorText(need)}` : "Vulkan desteği",
      ok: f.vk ? f.vk + 0.001 >= need : null,
      have: f.vk ? `Vulkan ${minorText(f.vk)}` : undefined,
    });
  }
  const pcie = f.entry
    ? f.entry.bus === 1 || f.entry.bus === 4 || f.entry.year >= 2005
    : f.modern;
  if (/\bagp\b/i.test(text)) checks.push({ need: "AGP yuvası", ok: pcie, era: true });
  else if (/\bpci\b(?![- ]?e)/i.test(text))
    checks.push({ need: "PCI kart", ok: pcie, era: true });
  if (/\bt\s*&\s*l\b|transform\s*(?:&|and)\s*lighting/i.test(text))
    checks.push({
      need: "donanımsal T&L",
      ok: f.entry ? f.entry.dx >= 7 || f.entry.year >= 2003 : f.modern,
      era: true,
    });
  if (
    /(?:integrated|onboard|on-board|intel\s+(?:hd|gma))[^.;|]{0,40}\b(?:not supported|unsupported|not recommended|desteklenmez)|not\s+support\w*[^.;|]{0,30}\b(?:integrated|onboard)|\b(?:dedicated|discrete|discreet)\b/i.test(
      text,
    )
  )
    checks.push({
      need: "ayrı (harici) ekran kartı",
      ok: f.integrated === null ? null : !f.integrated,
      have:
        f.integrated === null
          ? undefined
          : f.integrated
            ? "dahili grafik"
            : "harici kart",
    });
  // 1990s wording and cards too old for the lists: any later card is above.
  const old = [
    ...text.matchAll(
      /\b(?:super vga|svga|vga|3d[- ]?accelerat\w*|3d[- ]capable|3d graphics (?:card|accelerator)|hardware[- ]accelerat\w*(?: graphics)?|3dfx|voodoo\s*\d?|riva\s*tnt\s*\d?|tnt\s*2|glide|(?:16|24|32)[- ]?bit colou?r|256 colou?rs?|high colou?r|true colou?r)\b/gi,
    ),
  ].map((m) => m[0].trim());
  for (const need of [...new Set(old.map((t) => t.toLowerCase()))].map(
    (t) => old.find((o) => o.toLowerCase() === t)!,
  ))
    checks.push({ need, ok: f.modern, era: true });
  return checks;
}
function gpuPerformance(reqs: GpuEntry[], user: GpuEntry | undefined): Verdict {
  const names = reqs.map((r) => r.name).join(", ");
  if (!user)
    return {
      status: "unknown",
      reason: `Bilgisayarındaki ekran kartı veritabanında bulunamadı; istenen: ${names}.`,
    };
  if (reqs.includes(user))
    return {
      status: "pass",
      reason: `Senin kartın gereksinimdeki modelle aynı: ${user.name}.`,
    };
  const scored = reqs.filter((r) => r.score);
  const same = scored.filter((r) => r.brand && r.brand === user.brand);
  const pool = same.length ? same : scored;
  if (pool.length && user.score) {
    const ref = pool.reduce((a, b) => (b.score < a.score ? b : a));
    const ratio = user.score / ref.score;
    const b = band(ratio);
    const scores = `(PassMark: ${tr(user.score)} / ${tr(ref.score)})`;
    const note = ref.via
      ? ` Gereksinim tek model değil seri adı veriyor; ${ref.via} esas alındı.`
      : "";
    return {
      ...b,
      ...(ref.via ? { estimated: true } : {}),
      reason:
        (b.near
          ? `${user.name} ile istenen ${ref.name} yaklaşık eşit: fark %${pct(Math.abs(1 - ratio))} ${scores}.`
          : b.status === "pass"
            ? `${user.name}, istenen ${ref.name} kartından yaklaşık ${times(ratio)} kat güçlü ${scores}.`
            : `${user.name}, istenen ${ref.name} kartından zayıf: gücü onun yaklaşık %${pct(ratio)} seviyesinde ${scores}.`) +
        note,
    };
  }
  // A card too old for PassMark (Voodoo, Radeon 9600 …): the year tells.
  const old = reqs.filter((r) => r.year).sort((a, b) => b.year - a.year)[0];
  if (old && user.year && user.year - old.year >= 8)
    return {
      status: "pass",
      estimated: true,
      reason: `İstenen ${old.name} ${old.year} yılının kartı; senin ${user.name} kartın ${user.year} yılından ve çok daha güçlü.`,
    };
  return {
    status: "unknown",
    reason: `İstenen kart (${names}) için karşılaştırma puanı yok.`,
  };
}
interface Who {
  loc: string;
  gen: string;
}
const card: Who = { loc: "senin kartında", gen: "senin kartın" };
const processor: Who = { loc: "senin işlemcinde", gen: "senin işlemcin" };
function combine(perf: Verdict | undefined, checks: Check[], who: Who): Verdict {
  if (!perf && !checks.length)
    return {
      status: "unknown",
      reason:
        "Gereksinim metninde karşılaştırılabilir bir model ya da özellik bulunamadı.",
    };
  const ok = checks.filter((c) => c.ok && !c.era);
  const withHave = ok.filter((c) => c.have),
    noHave = ok.filter((c) => !c.have);
  const failed = checks.filter((c) => c.ok === false);
  const open = checks.filter((c) => c.ok === null);
  const era = checks.filter((c) => c.era && c.ok);
  const parts: string[] = [];
  if (perf) parts.push(perf.reason);
  const lead = perf ? "Ayrıca" : "Bu satır";
  if (withHave.length)
    parts.push(
      `${lead} ${list(withHave.map((c) => c.need))} istiyor; ${who.loc} ${list(withHave.map((c) => c.have!))} var.`,
    );
  if (noHave.length)
    parts.push(
      `${withHave.length ? "" : lead + " "}${list(noHave.map((c) => c.need))} istiyor; ${who.loc} var.`.replace(
        /^./,
        (c) => c.toUpperCase(),
      ),
    );
  if (era.length)
    parts.push(
      `${list(era.map((c) => c.need))} o dönemin ${era.length > 1 ? "özellikleri" : "özelliği"}; ${who.gen} ${era.length > 1 ? "bunları" : "bunu"} karşılıyor.`,
    );
  if (failed.length)
    parts.push(
      `Yetmeyen: ${list(failed.map((c) => (c.have ? `${c.need} (sende ${c.have})` : c.need)))}.`,
    );
  if (open.length) parts.push(`Doğrulanamayan: ${list(open.map((c) => c.need))}.`);
  const reason = parts.join(" ");
  if (failed.length || perf?.status === "fail")
    return { status: "fail", reason, estimated: perf?.estimated };
  if (open.length || perf?.status === "unknown") return { status: "unknown", reason };
  return { status: "pass", near: perf?.near, estimated: perf?.estimated, reason };
}

const verdicts = new Map<string, Verdict>();
function remember(key: string, make: () => Verdict) {
  const hit = verdicts.get(key);
  if (hit) return { ...hit };
  if (verdicts.size > 20000) verdicts.clear();
  const v = make();
  verdicts.set(key, v);
  return { ...v };
}
const hwKey = (h: Hardware) =>
  [
    h.cpu,
    h.gpu,
    h.cores,
    h.threads,
    h.clockGHz,
    h.directX,
    h.vramGB,
    h.vramCertain,
    h.vulkan,
    h.architecture,
  ].join("\u0001");

// No model and no number: any card meets the stated requirement.
const anyGpu =
  /^(?:any(?:thing)?|any\s+(?:gpu|graphics(?:\s+card)?|video\s+card|card|modern\s+(?:gpu|graphics\s+card))|herhangi(?:\s+bir)?(?:\s+ekran\s+kartı)?)\.?$/i;
// "Integrated graphics" / "Intel HD" as the requirement: the floor is an
// integrated chip.
const integratedClass =
  /^(?:(?:intel|amd|nvidia)(?:\s*\/\s*(?:intel|amd|nvidia))*\s+)?(?:integrated|onboard|on-board)(?:\s+(?:graphics|gpu|video|card|chip(?:set)?))*\.?$|^intel(?:\s+(?:hd|uhd|iris|graphics|integrated|gpu))*\.?$/i;
const resolution = /\b\d{3,4}\s*[x×*]\s*\d{3,4}\b/;
function resolutionOnly(text: string) {
  return (
    resolution.test(text) &&
    !text
      .replace(new RegExp(resolution.source, "g"), " ")
      .replace(
        /\b(?:resolution|minimum|min|display|screen|monitor|pixels?|px|over|or|higher|better|at|least|with|a|of|recommended|and|above|full|hd|supported|support|required|ekran|çözünürlük|en az)\b/gi,
        " ",
      )
      .replace(/[^a-z0-9]+/gi, "")
  );
}
export function compareGpu(required: string, h: Hardware): Verdict {
  return remember("g\u0000" + required + "\u0000" + hwKey(h), () => {
    const facts = gpuFacts(h);
    const plain = clean(required).trim();
    if (anyGpu.test(plain))
      return {
        status: "pass",
        reason: "Belirli bir ekran kartı istenmiyor; her kart bu satırı karşılar.",
      };
    if (
      /^3d(?:\s+(?:card|graphics(?:\s+card)?|video\s+card|capable|support))?\.?$/i.test(
        plain,
      )
    )
      return facts.modern
        ? {
            status: "pass",
            estimated: true,
            reason: "Bu satır yalnız 3D desteği istiyor; bugünkü her kart bunu karşılar.",
          }
        : {
            status: "unknown",
            reason: "Bu satır yalnız 3D desteği istiyor; kartın doğrulanamadı.",
          };
    if (integratedClass.test(plain)) {
      const e = facts.entry;
      return e && e.kind !== 2 && (e.score >= 1500 || e.year >= 2012)
        ? {
            status: "pass",
            estimated: true,
            reason: `Bu satır dahili grafiği yeterli sayıyor; senin ${e.name} kartın ondan güçlü.`,
          }
        : {
            status: "unknown",
            reason:
              "Bu satır yalnız dahili grafik diyor; hangi model olduğu belli değil.",
          };
    }
    if (resolutionOnly(required))
      return {
        status: "pass",
        estimated: true,
        reason: "Bu satır yalnız ekran çözünürlüğü belirtiyor; ekran kartın bunu sağlar.",
      };
    const text = clean(required);
    const reqs = findGpus(required);
    const perf = reqs.length ? gpuPerformance(reqs, facts.entry) : undefined;
    return combine(perf, gpuChecks(text, facts), card);
  });
}

// ---- CPU ---------------------------------------------------------------------
type Isa =
  | "sse"
  | "sse2"
  | "sse3"
  | "ssse3"
  | "sse4.1"
  | "sse4.2"
  | "avx"
  | "avx2"
  | "avx512";
const isaOrder: Isa[] = [
  "sse",
  "sse2",
  "sse3",
  "ssse3",
  "sse4.1",
  "sse4.2",
  "avx",
  "avx2",
];
const upTo = (last: Isa) => new Set(isaOrder.slice(0, isaOrder.indexOf(last) + 1));
// What a CPU model supports, from its name. undefined = not known.
export function cpuIsa(name: string): Set<Isa> | undefined {
  const n = name.toLowerCase();
  let m: RegExpMatchArray | null;
  if (/core\s*ultra/.test(n)) return upTo("avx2");
  if ((m = n.match(/\bi[3579][- ]?(\d{3,5})([a-z]*)/))) {
    const d = m[1];
    const gen =
      d.length === 3
        ? 1
        : d.length === 5
          ? Number(d.slice(0, 2))
          : d[0] === "1"
            ? Number(d.slice(0, 2))
            : Number(d[0]);
    if (gen <= 1) return upTo("sse4.2");
    if (gen <= 3) return upTo("avx");
    const set = upTo("avx2");
    if (gen === 11 || (gen === 10 && /g\d/.test(m[2]))) set.add("avx512");
    return set;
  }
  if (/core\s*2|core2/.test(n))
    return /\b[eqtps]\s?[789]\d{3}|\bq[89]\d{3}|\bt[69]\d{3}|\bsp\d{4}|\bsl\d{4}/.test(n)
      ? upTo("sse4.1")
      : upTo("ssse3");
  if (/ryzen|threadripper|epyc/.test(n)) {
    const set = upTo("avx2");
    if (/ryzen\s*\d\s*[79]\d{3}(?:x3d|x|f)?\b|ryzen\s*\d\s*8\d{3}g/.test(n))
      set.add("avx512");
    return set;
  }
  if (/\bfx[- ]?\d{4}|\ba\d{1,2}[- ]\d{4}|athlon\s*(?:x4\s*)?8\d{2}k?\b/.test(n))
    return upTo("avx");
  if (/phenom|athlon\s*(?:ii|2\b|x2|64)|turion|sempron/.test(n)) return upTo("sse3");
  if (/pentium\s*(?:4|d)\b|celeron\s*d\b/.test(n)) return upTo("sse3");
  if (/pentium\s*m\b|pentium\s*(?:iii|3)\b/.test(n)) return upTo("sse2");
  if (/xeon/.test(n)) {
    if (/\b(?:gold|silver|bronze|platinum)\b|\bw-\d{4}/.test(n))
      return new Set([...upTo("avx2"), "avx512" as Isa]);
    if (/e[357]-\d{4}[a-z]*\s*v[3-9]/.test(n)) return upTo("avx2");
    if (/e[357]-\d{4}/.test(n)) return upTo("avx");
    if (/\b[xelw]\d{4}\b/.test(n)) return upTo("sse4.2");
  }
  return undefined;
}
function cpuChecks(text: string, h: Hardware, user: CpuEntry | undefined): Check[] {
  const checks: Check[] = [];
  const isa = cpuIsa(user?.name || h.cpu || "");
  const wanted = new Set<Isa>();
  for (const m of text.matchAll(
    /\b(ssse\s?3|sse\s?4[.,]?[12]|sse\s?[234]|sse|avx[- ]?512|avx\s?2|avx)\b/gi,
  )) {
    const t = m[1].toLowerCase().replace(/\s|-/g, "").replace(",", ".");
    const id = (
      t === "sse4" ? "sse4.1" : t === "sse41" ? "sse4.1" : t === "sse42" ? "sse4.2" : t
    ) as Isa;
    wanted.add(id);
  }
  if (wanted.size) {
    const ids = [...wanted];
    const missing = isa ? ids.filter((id) => !isa.has(id)) : [];
    checks.push({
      need: `${list(ids.map((id) => id.toUpperCase()))} desteği`,
      ok: !isa ? null : !missing.length,
      have: missing.length
        ? `${list(missing.map((id) => id.toUpperCase()))} yok`
        : undefined,
    });
  }
  if (
    /\b64[- ]?bit\b|\bx64\b|\bx86[-_]64\b|\bamd64\b|(^|[\s,;/(])64([\s,;.)./]|$)/i.test(
      text,
    )
  ) {
    const yes = /64/.test(h.architecture) || !!isa || (!!user && user.year >= 2008);
    checks.push({
      need: "64 bit işlemci",
      ok: yes ? true : null,
      have: yes ? "64 bit desteği" : undefined,
    });
  } else if (/\b32[- ]?bit\b|(^|[\s,;/(])32([\s,;.)./]|$)/i.test(text)) {
    // A bare "32": a 32-bit CPU is asked; any 64-bit CPU runs those too.
    checks.push({
      need: "32 bit işlemci",
      ok: true,
      have: "64 bit desteği (32 biti de çalıştırır)",
    });
  }
  return checks;
}
function cpuRatio(user: CpuEntry, mark: number, thread: number) {
  const multi = user.mark / mark;
  return user.thread && thread ? Math.sqrt(multi * (user.thread / thread)) : multi;
}
const cpuScores = (u: CpuEntry, mark: number, thread: number) =>
  `(PassMark çok çekirdek ${tr(u.mark)} / ${tr(mark)}` +
  (u.thread && thread ? `, tek çekirdek ${tr(u.thread)} / ${tr(thread)})` : ")");
function cpuPerformance(reqs: CpuEntry[], user: CpuEntry | undefined): Verdict {
  const names = reqs.map((r) => r.name).join(", ");
  if (!user)
    return {
      status: "unknown",
      reason: `Bilgisayarındaki işlemci veritabanında bulunamadı; istenen: ${names}.`,
    };
  if (reqs.includes(user))
    return {
      status: "pass",
      reason: `Senin işlemcin gereksinimdeki modelle aynı: ${user.name}.`,
    };
  const same = reqs.filter((r) => r.brand && r.brand === user.brand);
  const pool = same.length ? same : reqs;
  const ref = pool.reduce((a, b) =>
    cpuRatio(user, b.mark, b.thread) > cpuRatio(user, a.mark, a.thread) ? b : a,
  );
  const ratio = cpuRatio(user, ref.mark, ref.thread);
  const b = band(ratio);
  const scores = cpuScores(user, ref.mark, ref.thread);
  const note = ref.via
    ? ` Gereksinimde "${ref.via}" yazıyor; veritabanında bu modelin yalnız uzantılı sürümleri var, en zayıfı (${ref.name}) esas alındı.`
    : "";
  return {
    ...b,
    ...(ref.via ? { estimated: true } : {}),
    reason:
      (b.near
        ? `${user.name} ile istenen ${ref.name} yaklaşık eşit: fark %${pct(Math.abs(1 - ratio))} ${scores}.`
        : b.status === "pass"
          ? `${user.name}, istenen ${ref.name} işlemcisinden yaklaşık ${times(ratio)} kat güçlü ${scores}.`
          : `${user.name}, istenen ${ref.name} işlemcisinden zayıf: gücü onun yaklaşık %${pct(ratio)} seviyesinde ${scores}.`) +
      note,
  };
}
const coreWords: Record<string, number> = {
  single: 1,
  one: 1,
  dual: 2,
  two: 2,
  double: 2,
  triple: 3,
  three: 3,
  quad: 4,
  four: 4,
  hexa: 6,
  six: 6,
  octa: 8,
  eight: 8,
  ten: 10,
  twelve: 12,
  sixteen: 16,
};
const families: [RegExp, string[], string][] = [
  [/\bcore\s*2\s*duo\b/i, ["2", "duo"], "Core 2 Duo"],
  [/\bcore\s*2\s*quad\b/i, ["2", "quad"], "Core 2 Quad"],
  [/\bcore\s*i3\b|\bi3\b/i, ["i", "3"], "Core i3"],
  [/\bcore\s*i5\b|\bi5\b/i, ["i", "5"], "Core i5"],
  [/\bcore\s*i7\b|\bi7\b/i, ["i", "7"], "Core i7"],
  [/\bcore\s*i9\b|\bi9\b/i, ["i", "9"], "Core i9"],
  [/\bryzen\s*3\b/i, ["ryzen", "3"], "Ryzen 3"],
  [/\bryzen\s*5\b/i, ["ryzen", "5"], "Ryzen 5"],
  [/\bryzen\s*7\b/i, ["ryzen", "7"], "Ryzen 7"],
  [/\bpentium\s*(?:4|iv)\b|\bp4\b/i, ["pentium", "4"], "Pentium 4"],
  [/\bpentium\s*d\b/i, ["pentium", "d"], "Pentium D"],
  [/\bpentium\s*m\b/i, ["pentium", "m"], "Pentium M"],
  [/\bpentium\s*gold\b/i, ["pentium", "gold"], "Pentium Gold"],
  [/\bathlon\s*64\s*x2\b/i, ["athlon", "64", "x", "2"], "Athlon 64 X2"],
  [/\bathlon\s*64\b/i, ["athlon", "64"], "Athlon 64"],
  [/\bathlon\s*(?:ii|2)\s*x4\b/i, ["athlon", "2", "x", "4"], "Athlon II X4"],
  [/\bathlon\s*(?:ii|2)\b/i, ["athlon", "2"], "Athlon II"],
  [/\bathlon\s*x4\b/i, ["athlon", "x", "4"], "Athlon X4"],
  [/\bathlon\s*xp\b/i, ["athlon", "xp"], "Athlon XP"],
  [/\bphenom\s*(?:ii|2)\b/i, ["phenom", "2"], "Phenom II"],
  [/\bphenom\b/i, ["phenom"], "Phenom"],
  [/\bcore\s*duo\b/i, ["duo"], "Core Duo"],
  [/\bceleron\b/i, ["celeron"], "Celeron"],
  [/\bsempron\b/i, ["sempron"], "Sempron"],
  [/\bpentium\b/i, ["pentium"], "Pentium"],
];
// 1990s processors are not in the benchmark lists; any later CPU is far above.
const ancient =
  /\b(?:386|486|pentium\s*(?:mmx|pro|ii|iii|2|3)\b|pentium\s*\d{2,3}\b|k6(?:-?2|-?3|-?iii)?\b|cyrix|duron|celeron\s*\d{3}\b)/i;
// No model and no number: any processor meets the stated requirement.
const anyCpu =
  /^(?:any\b(?!.*\b(?:ghz|mhz|cores?|i[3579]|ryzen|athlon|pentium|celeron|core\s*2)\b).*|herhangi(?:\s+bir)?(?:\s+işlemci)?|(?:(?:intel|amd)\s*)?x86(?:[-_ ]?64)?(?:\s+(?:cpu|processor))?|(?:intel|amd)(?:\s*(?:\/|or|and|,|veya)\s*(?:intel|amd))?)(?:\s+(?:processor|cpu|compatible|equivalent|or\s+(?:equivalent|compatible|better)))*\.?$/i;
function genericCpu(
  text: string,
  h: Hardware,
  user: CpuEntry | undefined,
  year?: number,
): Verdict | undefined {
  if (anyCpu.test(text.trim()))
    return {
      status: "pass",
      reason: "Belirli bir işlemci istenmiyor; her işlemci bu satırı karşılar.",
    };
  const word = text.match(
    /\b(single|one|dual|two|double|triple|three|quad|four|hexa|six|octa|eight|ten|twelve|sixteen)[- ]?(?:core|cores|çekirdek)/i,
  );
  const digit = text.match(
    /\b(\d{1,2})\s*\+?\s*[- ]?(?:physical\s+)?(?:core|cores|çekirdek)\b/i,
  );
  const cores = word ? coreWords[word[1].toLowerCase()] : digit ? Number(digit[1]) : 0;
  const ghz = text.match(/(\d+(?:[.,]\d+)?)\s*\+?\s*(?:ghz|gigahertz)/i),
    mhz = text.match(/\b(\d{3,4})\s*\+?\s*mhz/i);
  const clock = ghz ? Number(ghz[1].replace(",", ".")) : mhz ? Number(mhz[1]) / 1000 : 0;
  const fam = families.find(([re]) => re.test(text));
  const gen = text.match(
    /\b(\d{1,2})\s*(?:st|nd|rd|th|\.)\s*gen(?:eration)?\b|\bgen(?:eration)?\s*(\d{1,2})\b/i,
  );
  const generation = gen ? Number(gen[1] || gen[2]) : 0;
  const userCores = user?.cores || h.cores || 0,
    userThreads = user?.threads || h.threads || 0;
  const userClock = Math.max(user?.turbo || 0, user?.base || 0) / 1000 || h.clockGHz || 0;
  if (ancient.test(text) || (clock && clock < 1 && !cores)) {
    const strong = user ? user.mark >= 500 || user.year >= 2008 : userClock >= 1.5;
    return strong
      ? {
          status: "pass",
          estimated: true,
          reason:
            "Bu satır 1990'lar ya da 2000'lerin başından bir işlemci istiyor; senin işlemcin onun çok üstünde.",
        }
      : {
          status: "unknown",
          reason: "Çok eski bir işlemci isteniyor; senin işlemcin karşılaştırılamadı.",
        };
  }
  if (!cores && !clock && !fam && !(generation && /\bcore\b|\bintel\b/i.test(text)))
    return undefined;
  const label = [
    generation ? `${generation}. nesil` : "",
    fam?.[2] || (generation ? "Intel Core" : ""),
    cores ? `${cores} çekirdek` : "",
    clock ? `${dec(clock)} GHz` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/ (\d+ çekirdek)/, ", $1")
    .replace(/ (\d+(?:,\d)? GHz)/, ", $1");
  const coresOk = !cores || userCores >= cores;
  const coresSoft = !coresOk && userThreads >= cores;
  const clockOk = !clock || userClock >= clock * 0.97;
  if (!coresOk && !coresSoft)
    return {
      status: "fail",
      reason: `Bu satır en az ${cores} çekirdek istiyor; sende ${userCores || "?"} çekirdek var.`,
    };
  if (!user)
    return coresOk && clockOk && (cores || clock)
      ? {
          status: "pass",
          estimated: true,
          reason: `Model adı yok; ${label} istiyor. Sende ${userCores} çekirdek ve ${dec(userClock)} GHz var.`,
        }
      : {
          status: "unknown",
          reason: "Bilgisayarındaki işlemci veritabanında bulunamadı.",
        };
  const kind = (e: CpuEntry) =>
    !!(e.flags & 3) && (!fam || fam[1].every((t, i) => e.key[i] === t));
  // "4th generation Core i3": the Core i models of that generation.
  if (generation) {
    const digits = (e: CpuEntry) => e.key[2] || "";
    const ref = cpuList().filter(
      (e) =>
        kind(e) &&
        e.key[0] === "i" &&
        (generation <= 9
          ? new RegExp(`^${generation}\\d{3}$`).test(digits(e))
          : new RegExp(`^${generation}\\d{3}$`).test(digits(e))),
    );
    if (ref.length >= 3)
      return judgeGeneric(
        user,
        ref,
        label,
        `${generation}. nesil`,
        coresOk,
        clockOk,
        coresSoft,
        userCores,
        userThreads,
        userClock,
      );
  }
  // "Core 2 Duo or better" without the game's year: decided only when the whole
  // family is clearly below (or above) this computer.
  if (!cores && !clock && !year) {
    const members = cpuList().filter(kind);
    if (!members.length) return undefined;
    const strongest = members.reduce((a, b) =>
      cpuRatio(user, b.mark, b.thread) < cpuRatio(user, a.mark, a.thread) ? b : a,
    );
    const weakest = members.reduce((a, b) =>
      cpuRatio(user, b.mark, b.thread) > cpuRatio(user, a.mark, a.thread) ? b : a,
    );
    if (cpuRatio(user, strongest.mark, strongest.thread) >= 1.1)
      return {
        status: "pass",
        estimated: true,
        reason: `Model adı yok; ${label} istiyor. Bu ailenin en güçlü modeli (${strongest.name}) bile senin işlemcinden zayıf ${cpuScores(user, strongest.mark, strongest.thread)}.`,
      };
    if (cpuRatio(user, weakest.mark, weakest.thread) < 0.9)
      return {
        status: "fail",
        estimated: true,
        reason: `Model adı yok; ${label} istiyor. Bu ailenin en zayıf modeli (${weakest.name}) bile senin işlemcinden güçlü ${cpuScores(user, weakest.mark, weakest.thread)}.`,
      };
    return {
      status: "unknown",
      reason: `Yalnız işlemci ailesi yazıyor (${label}); oyunun yılı bilinmeden karşılaştırılamaz.`,
    };
  }
  // The clock alone misleads across generations: compare with the processors
  // of this kind from the years the game came out.
  const pick = (era: boolean) =>
    cpuList().filter(
      (e) =>
        kind(e) &&
        (!cores || e.cores === cores) &&
        (!clock || (e.base && Math.abs(e.base / 1000 - clock) / clock <= 0.08)) &&
        (!year || e.year <= Math.max(year, 2010)) &&
        (!era || !year || year <= 2010 || e.year >= year - 5),
    );
  let ref = pick(true),
    span = !year
      ? ""
      : year <= 2010
        ? "2010'a kadar çıkan"
        : `${year - 5}–${year} arasında çıkan`;
  if (ref.length < 3) {
    ref = pick(false);
    span = year ? `${year} yılına kadar çıkan` : "";
  }
  if (ref.length < 3)
    return coresOk && clockOk
      ? {
          status: "pass",
          estimated: true,
          reason: `Model adı yok; ${label} istiyor. Sende ${userCores} çekirdek ve ${dec(userClock)} GHz var; sayılar tutuyor.`,
        }
      : {
          status: "unknown",
          reason: `Model adı yok (${label}) ve karşılaştırılacak benzer işlemci bulunamadı.`,
        };
  return judgeGeneric(
    user,
    ref,
    label,
    span,
    coresOk,
    clockOk,
    coresSoft,
    userCores,
    userThreads,
    userClock,
  );
}
function judgeGeneric(
  user: CpuEntry,
  ref: CpuEntry[],
  label: string,
  span: string,
  coresOk: boolean,
  clockOk: boolean,
  coresSoft: boolean,
  userCores: number,
  userThreads: number,
  userClock: number,
): Verdict {
  const mark = median(ref.map((e) => e.mark)),
    thread = median(ref.map((e) => e.thread));
  const ratio = cpuRatio(user, mark, thread);
  const b = band(ratio);
  const scores = cpuScores(user, mark, thread);
  const intro = `Model adı yok; ${label} istiyor. ${span ? span + " bu" : "Bu"} özellikteki ${ref.length} işlemcinin ortasına göre`;
  if (b.status === "fail" && coresOk && clockOk && !/nesil/.test(span))
    return {
      status: "pass",
      near: true,
      estimated: true,
      reason: `${intro} senin işlemcin zayıf kalıyor (yaklaşık %${pct(ratio)}) ama istenen sayılar tutuyor (sende ${userCores} çekirdek, ${dec(userClock)} GHz): sınırda ${scores}.`,
    };
  if (b.status === "fail")
    return {
      status: "fail",
      estimated: true,
      reason: `${intro} senin işlemcin yaklaşık %${pct(ratio)} seviyesinde ${scores}.`,
    };
  return {
    status: "pass",
    near: b.near || coresSoft,
    estimated: true,
    reason:
      `${intro} senin işlemcin ${b.near ? "yaklaşık aynı seviyede" : `yaklaşık ${times(ratio)} kat güçlü`} ${scores}.` +
      (coresSoft
        ? ` Çekirdek sayın az (${userCores}) ama iş parçacığı (${userThreads}) yetiyor; sınırda.`
        : ""),
  };
}
export function compareCpu(required: string, h: Hardware, year?: number): Verdict {
  return remember(
    "c\u0000" + required + "\u0000" + hwKey(h) + "\u0000" + (year || ""),
    () => {
      const user = userCpu(h);
      const text = clean(required);
      const reqs = findCpus(required);
      const perf = reqs.length
        ? cpuPerformance(reqs, user)
        : genericCpu(text, h, user, year);
      return combine(perf, cpuChecks(text, h, user), processor);
    },
  );
}
