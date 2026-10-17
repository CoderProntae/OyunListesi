// 2.1.0: builds shared/hardware-db.json, the data behind the hardware
// comparison (shared/hardware-match.ts):
//   - PassMark CPU and video card lists: one score scale each (CPU Mark +
//     single-thread rating, G3D Mark), cores/threads/clock, memory, year;
//   - TechPowerUp GPU database export (RonnyMuthomi/GPUs-Specs): DirectX
//     feature level, OpenGL, Vulkan, Shader Model, release year, memory, bus.
// Run: npx tsx scripts/hardware-data.ts
// release.mjs runs it for every release; on any failure the previous file is
// kept, so a release never ships without data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cpuClockNamed, cpuKey, gpuKey } from "../shared/hardware-names";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "shared/hardware-db.json");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TPU_CSV =
  "https://raw.githubusercontent.com/RonnyMuthomi/GPUs-Specs/main/gpu_1986-2026.csv";

type Row = Record<string, string>;
async function passmark(host: string, page: string): Promise<Row[]> {
  const first = await fetch(`https://${host}/${page}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!first.ok) throw new Error(`${host}: HTTP ${first.status}`);
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const res = await fetch(`https://${host}/data/?_=${Date.now()}`, {
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://${host}/${page}`,
      Cookie: cookie,
    },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`${host} veri: HTTP ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data) || data.length < 1000)
    throw new Error(`${host}: beklenmeyen veri (${data?.length ?? 0} satır)`);
  return data;
}
const num = (v?: string) => {
  const n = Number(String(v ?? "").replace(/[,$*\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const yearOf = (v?: string) =>
  Number(String(v ?? "").match(/\b(19[89]\d|20\d\d)\b/)?.[1] || 0);
const round = (n: number) => Math.round(n * 10) / 10;

function csv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

// ---- CPUs -----------------------------------------------------------------
const ARM =
  /\b(?:snapdragon|qualcomm|mediatek|helio|dimensity|exynos|kirin|hisilicon|unisoc|spreadtrum|rockchip|allwinner|amlogic|tegra|apple|cortex|arm\w*|tensor|samsung|marvell|broadcom|kryo|ampere|altra|graviton|loongson|zhaoxin|hygon|phytium)\b/i;
function cpuFlags(cat: string, clockNamed: boolean) {
  let f = 0;
  if (/desktop/i.test(cat)) f |= 1;
  if (/laptop/i.test(cat)) f |= 2;
  if (/server/i.test(cat)) f |= 4;
  if (/mobile/i.test(cat)) f |= 8;
  return f | (clockNamed ? 16 : 0);
}
function buildCpus(data: Row[]) {
  const best = new Map<string, { row: (string | number)[]; samples: number }>();
  for (const c of data) {
    const mark = num(c.cpumark);
    if (
      !mark ||
      num(c.cpuCount) > 1 ||
      /\[(?:dual|quad)/i.test(c.name) ||
      ARM.test(c.name)
    )
      continue;
    const clockNamed = cpuClockNamed(c.name);
    const { key } = cpuKey(c.name);
    if (!key.length || (!clockNamed && !key.some((t) => /\d/.test(t)))) continue;
    const base = num(c.speed);
    const cores = num(c.cores) + num(c.secondaryCores);
    const threads =
      num(c.cores) * (num(c.logicals) || 1) +
      num(c.secondaryCores) * (num(c.secondaryLogicals) || 1);
    const row = [
      c.name.replace(/\s*@.*$/, "").trim(),
      mark,
      num(c.thread),
      cores,
      threads,
      base,
      num(c.turbo),
      yearOf(c.date),
      cpuFlags(c.cat || "", clockNamed),
    ];
    const id = key.join(" ") + (clockNamed ? "@" + base : "");
    const samples = num(c.samples);
    const prev = best.get(id);
    if (!prev || samples > prev.samples) best.set(id, { row, samples });
  }
  return [...best.values()]
    .map((v) => v.row)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

// ---- GPUs -----------------------------------------------------------------
// kind: 0 desktop/unknown, 1 mobile, 2 integrated · bus: 0 unknown, 1 PCIe,
// 2 AGP, 3 PCI, 4 integrated
interface Gpu {
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
  samples: number;
}
const integratedName =
  /^intel\b(?!.*\barc a\d)|\bwith radeon\b|\bradeon (?:\d{3,4}m\b|vega \d+$|r[2-7] graphics|graphics)|^(?:ryzen|athlon)\b/i;
function busCode(text = "") {
  if (/agp/i.test(text)) return 2;
  if (/pci[- ]?e|pcie|pci express|mxm/i.test(text)) return 1;
  if (/\bpci\b/i.test(text)) return 3;
  if (/igp|ring bus|system shared|on-?die|integrated/i.test(text)) return 4;
  return 0;
}
const version = (text = "") => round(num(text.match(/\d+(?:\.\d+)?/)?.[0]));
// "12 (12_1)" → 12.1, "11.1 (10_0)" → 10 (the hardware feature level counts).
function featureLevel(text = "") {
  const fl = text.match(/\((\d+)_(\d)\)/);
  if (fl) return round(Number(fl[1]) + Number(fl[2]) / 10);
  return version(text);
}
function shaderModel(sm: string, dx: string) {
  if (version(sm)) return version(sm);
  const level = featureLevel(dx);
  if (/9\.0c/i.test(dx)) return 3;
  if (level >= 12) return 5.1;
  if (level >= 11) return 5;
  if (level >= 10.1) return 4.1;
  if (level >= 10) return 4;
  if (level >= 9) return 2;
  if (level >= 8) return 1.1;
  return 0;
}
function memoryMB(text = "") {
  const m = text.match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 0;
  return Math.round(Number(m[1]) * (/gb/i.test(m[2]) ? 1024 : 1));
}
function buildGpus(data: Row[], tpuText: string) {
  const byKey = new Map<string, Gpu>();
  for (const g of data) {
    const score = num(g.g3d);
    const { key } = gpuKey(g.name);
    if (!score || !key.length) continue;
    const entry: Gpu = {
      name: g.name.trim(),
      score,
      vram: memoryMB(g.memSize),
      year: yearOf(g.date),
      dx: 0,
      gl: 0,
      vk: 0,
      sm: 0,
      kind: integratedName.test(g.name) ? 2 : /mobile/i.test(g.cat || "") ? 1 : 0,
      bus: busCode(g.bus),
      samples: num(g.samples),
    };
    const id = key.join(" ");
    const prev = byKey.get(id);
    if (!prev || entry.samples > prev.samples) byKey.set(id, entry);
    // "Radeon RX 470/570": each named model gets the shared score unless it
    // has its own entry.
    if (g.name.includes("/")) {
      const [first, ...rest] = g.name.split("/").map((p) => p.trim());
      for (const part of [
        first,
        ...rest.map((p) => (/\s/.test(p) ? p : first.replace(/\S+$/, p))),
      ]) {
        const k = gpuKey(part).key.join(" ");
        if (k && !byKey.has(k)) byKey.set(k, { ...entry, name: part, samples: 0 });
      }
    }
  }
  const rows = csv(tpuText);
  const head = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  const col = (row: string[], name: string) => (row[head.indexOf(name)] || "").trim();
  if (!head.includes("Name") || !head.includes("Graphics Features__DirectX"))
    throw new Error("TechPowerUp dosyasının sütunları değişmiş.");
  let matched = 0,
    added = 0;
  for (const r of rows.slice(1)) {
    const name = col(r, "Name"),
      brand = col(r, "Brand");
    if (!name) continue;
    const known = /^(?:nvidia|amd|ati|intel)$/i.test(brand);
    const { key } = gpuKey((known ? brand + " " : "") + name);
    if (!key.length) continue;
    const desk = col(r, "Graphics Card__Release Date"),
      mobile = col(r, "Mobile Graphics__Release Date"),
      igp = col(r, "Integrated Graphics__Release Date");
    const dxText = col(r, "Graphics Features__DirectX");
    const features = {
      dx: featureLevel(dxText),
      gl: version(col(r, "Graphics Features__OpenGL").replace(/^es.*/i, "")),
      vk: version(col(r, "Graphics Features__Vulkan")),
      sm: shaderModel(col(r, "Graphics Features__Shader Model"), dxText),
    };
    const year = yearOf(desk || mobile || igp);
    const kind = igp ? 2 : mobile ? 1 : 0;
    const bus = busCode(
      col(r, "Graphics Card__Bus Interface") ||
        col(r, "Mobile Graphics__Bus Interface") ||
        col(r, "Integrated Graphics__Bus Interface"),
    );
    const vram = memoryMB(col(r, "Memory__Memory Size") || col(r, "Top__MEMORY SIZE"));
    const id = key.join(" ");
    // "GeForce GTX 1060 6 GB" also describes PassMark's "GeForce GTX 1060".
    const base = id.replace(/\s\d+(?:\.\d+)?\s(?:gb|mb)\b/g, "");
    const target = byKey.get(id) || byKey.get(base);
    if (target) {
      matched++;
      if (!target.dx) Object.assign(target, features);
      target.year ||= year;
      target.bus ||= bus;
      if (target.kind === 0 && kind) target.kind = kind;
      if (!target.vram && byKey.get(id) === target) target.vram = vram;
      continue;
    }
    added++;
    byKey.set(id, {
      name: (known || /^(?:geforce|radeon|quadro)/i.test(name) ? "" : brand + " ") + name,
      score: 0,
      vram,
      year,
      ...features,
      kind,
      bus,
      samples: 0,
    });
  }
  console.log(`TechPowerUp: ${matched} eşleşti, ${added} yalnız özellik olarak eklendi`);
  return [...byKey.values()]
    .map((g) => [g.name, g.score, g.vram, g.year, g.dx, g.gl, g.vk, g.sm, g.kind, g.bus])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

async function main() {
  const [cpuData, gpuData, tpu] = await Promise.all([
    passmark("www.cpubenchmark.net", "CPU_mega_page.html"),
    passmark("www.videocardbenchmark.net", "GPU_mega_page.html"),
    fetch(TPU_CSV, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(60000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`TechPowerUp dosyası: HTTP ${r.status}`);
      return r.text();
    }),
  ]);
  const cpu = buildCpus(cpuData),
    gpu = buildGpus(gpuData, tpu);
  if (cpu.length < 3000 || gpu.length < 3000)
    throw new Error(`Çok az kayıt: ${cpu.length} işlemci, ${gpu.length} ekran kartı`);
  const date = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify({ v: 1, date, cpu, gpu });
  fs.writeFileSync(OUT, json + "\n");
  console.log(
    `hardware-db.json: ${cpu.length} işlemci, ${gpu.length} ekran kartı, ${Math.round(json.length / 1024)} KB (${date})`,
  );
}
main().catch((e) => {
  console.error(`Donanım verisi yenilenemedi, mevcut dosya korunuyor: ${e.message}`);
  process.exit(fs.existsSync(OUT) ? 0 : 1);
});
