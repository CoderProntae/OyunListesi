// Real-data audit of store requirement parsing (not shipped in the app).
//   npx tsx scripts/store-audit.ts [corpusDir] [--live]
// corpusDir holds steam.json / gog.json / epic.json / xbox.json collected from
// the real store APIs. --live additionally loads products through the app's own
// network code (platforms.ts) and parses My Abandonware pages.
// For every requirement level the source text is scanned independently for
// signs of each component (a disk/RAM size, a CPU/GPU/OS name, a DirectX
// version); a component the text clearly lists but the parser did not fill is a
// failure. A recommended block in the store text must yield recommended values,
// and a store without one must yield none.
import fs from "node:fs";
import path from "node:path";
import {
  parseRequirementSections,
  splitLevels,
  text,
  hasRequirementValues,
} from "../electron/requirements";
import {
  gogProduct,
  epicRequirements,
  xboxRequirements,
  gogDetails,
  epicDetails,
  xboxDetails,
  abandonwareDetails,
  platformKey,
} from "../electron/platforms";
import type { Requirements } from "../shared/types";
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) || ".cache/store-corpus";
const live = args.includes("--live");
const load = (name: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  } catch {
    return {};
  }
};
type Failure = {
  store: string;
  game: string;
  level: string;
  field: string;
  source: string;
};
const failures: Failure[] = [];
const counts: Record<string, { games: number; levels: number; fields: number }> = {};
const size = /\d+(?:[.,]\d+)?\s*(?:gb|mb|tb|gib|mib)\b/i;
function expectations(source: string) {
  // "Processor TBD" (to be determined) announces nothing.
  const lines = source
    .split(/\n|;|,(?![^()]*\))/)
    .filter((l) => !/\b(tbd|tba|to be determined)\b/i.test(l));
  const has = (re: RegExp, extra?: (l: string) => boolean) =>
    lines.some((l) => re.test(l) && (!extra || extra(l)));
  return {
    storageGB: has(/(disk|drive|hdd|ssd|storage|depolama|space|alan)/i, (l) =>
      size.test(l),
    ),
    ramGB: has(
      /(memory|\bram\b|bellek)/i,
      (l) => size.test(l) && !/(video|graphics|vram|ekran|grafik|3d)/i.test(l),
    ),
    cpu: has(/(processor|\bcpu\b|işlemci|pentium|athlon|core\s?i\d|ryzen|\d\s*[gm]hz)/i),
    gpu: has(
      /(graphics|video card|\bgpu\b|ekran kart|grafik|geforce|radeon|nvidia|\bati\b)/i,
    ),
    os: has(
      /(windows|\bos\b|işletim sistemi|operating system|mac ?os|linux|ubuntu)/i,
      (l) =>
        !/(no longer|not supported|sound|ses kart|mouse|keyboard|\bram\b|memory|bellek|desteklem)/i.test(
          l,
        ),
    ),
    // A DirectX version on a sound-card line is not a graphics requirement.
    directX: has(
      /(directx|direct x|\bdx)[®™]?\s*(?:version\s*)?\d/i,
      (l) => !/(sound|audio|\bses\b|ses kart)/i.test(l),
    ),
  };
}
function check(
  store: string,
  game: string,
  level: string,
  source: string,
  r: Requirements,
) {
  const want = expectations(source);
  const c = (counts[store] ||= { games: 0, levels: 0, fields: 0 });
  c.levels++;
  for (const [field, expected] of Object.entries(want)) {
    const value = (r as any)[field];
    if (value !== undefined) c.fields++;
    if (expected && (value === undefined || value === ""))
      failures.push({
        store,
        game,
        level,
        field,
        source: source.replace(/\s+/g, " ").slice(0, 400),
      });
  }
}
// ---- Steam ----
const steam = load("steam.json");
for (const [id, rec] of Object.entries<any>(steam)) {
  const v = rec.tr?.pc_requirements !== undefined ? rec.tr : rec.nocc;
  if (!v?.pc_requirements) continue;
  const pc = Array.isArray(v.pc_requirements) ? {} : v.pc_requirements;
  const levels = parseRequirementSections(pc.minimum || "", pc.recommended || "");
  const first = splitLevels(text(pc.minimum || ""));
  const second = pc.recommended ? splitLevels(text(pc.recommended)) : {};
  const recSource = pc.recommended
    ? (second.recommended ?? second.minimum ?? "")
    : (first.recommended ?? "");
  const name = `${v.name} (${id})`;
  counts.Steam = counts.Steam || { games: 0, levels: 0, fields: 0 };
  counts.Steam.games++;
  check("Steam", name, "minimum", first.minimum || "", levels.minimum);
  if (recSource.trim())
    check("Steam", name, "recommended", recSource, levels.recommended);
  if (!recSource.trim() && hasRequirementValues(levels.recommended))
    failures.push({
      store: "Steam",
      game: name,
      level: "recommended",
      field: "(eklenmemeli)",
      source: "",
    });
  for (const p of Object.entries(v.platforms || {})
    .filter(([, on]) => on)
    .map(([k]) => k))
    if (!["windows", "mac", "linux"].includes(platformKey(p)))
      failures.push({
        store: "Steam",
        game: name,
        level: "-",
        field: "platform " + p,
        source: "",
      });
}
// ---- GOG ----
const gog = load("gog.json");
for (const [q, rec] of Object.entries<any>(gog)) {
  if (!rec.supported) continue;
  const product = gogProduct({
    _embedded: {
      supportedOperatingSystems: rec.supported,
      product: { title: rec.title },
    },
    _links: { store: { href: "https://www.gog.com/en/game/x" } },
  });
  const win = rec.supported.find((o: any) => o.operatingSystem?.name === "windows");
  counts.GOG = counts.GOG || { games: 0, levels: 0, fields: 0 };
  counts.GOG.games++;
  for (const type of ["minimum", "recommended"] as const) {
    const block = win?.systemRequirements?.find((b: any) => b.type === type);
    const source = block
      ? (block.requirements || [])
          .filter((r: any) => r.description)
          .map((r: any) => `${r.name} ${r.description}`)
          .join("\n") || text(block.description || "")
      : "";
    const r = (product.patch as any)[type] as Requirements;
    if (source) check("GOG", `${rec.title} (${rec.id})`, type, source, r);
    else if (hasRequirementValues(r))
      failures.push({
        store: "GOG",
        game: rec.title,
        level: type,
        field: "(eklenmemeli)",
        source: "",
      });
  }
}
// ---- Epic ----
const epic = load("epic.json");
for (const [q, rec] of Object.entries<any>(epic)) {
  if (!rec.systems?.length) continue;
  const levels = epicRequirements({
    pages: [{ type: "productHome", data: { requirements: { systems: rec.systems } } }],
  });
  const win = rec.systems.find((s: any) => /^win/i.test(s.systemType || ""));
  if (!levels || !win) continue;
  counts.Epic = counts.Epic || { games: 0, levels: 0, fields: 0 };
  counts.Epic.games++;
  for (const type of ["minimum", "recommended"] as const) {
    const source = (win.details || [])
      .filter((d: any) => d[type] && !/^vr /i.test(d.title || ""))
      .map((d: any) => `${d.title} ${d[type]}`)
      .join("\n");
    if (source) check("Epic", `${rec.title} (${rec.slug})`, type, source, levels[type]);
    else if (hasRequirementValues(levels[type]))
      failures.push({
        store: "Epic",
        game: rec.title,
        level: type,
        field: "(eklenmemeli)",
        source: "",
      });
  }
}
// ---- Xbox ----
const xbox = load("xbox.json");
for (const [q, rec] of Object.entries<any>(xbox)) {
  if (!rec.sys) continue;
  const levels = xboxRequirements(rec.sys);
  counts.Xbox = counts.Xbox || { games: 0, levels: 0, fields: 0 };
  counts.Xbox.games++;
  for (const [type, key] of [
    ["minimum", "Minimum"],
    ["recommended", "Recommended"],
  ] as const) {
    const source = (rec.sys[key]?.Items || [])
      .filter(
        (i: any) =>
          ["ops", "cpu", "gpu", "nts"].includes(i.ItemCode) ||
          /^[mv]\d+$|^d[a-z]{2}$/i.test(i.ItemCode),
      )
      .filter((i: any) => i.Description && !/belirtilmemiş/i.test(i.Description))
      .map((i: any) => `${i.Name} ${i.Description}`)
      .join("\n");
    if (source) check("Xbox", `${rec.title} (${rec.id})`, type, source, levels[type]);
  }
}
async function liveRun() {
  const sample = {
    gog: Object.values<any>(gog)
      .filter((r) => r.id)
      .slice(0, 12),
    epic: Object.values<any>(epic)
      .filter((r) => r.id)
      .slice(0, 12),
    xbox: Object.values<any>(xbox)
      .filter((r) => r.id)
      .slice(0, 10),
    abandonware: [
      "/game/spider-man-3qc",
      "/game/hitman-kak",
      "/game/fallout-w5",
      "/game/prince-of-persia-pd",
      "/game/kane-5up",
    ],
  };
  const report = (store: string, name: string, product: any) => {
    const p = product.patch;
    const ok = (v: any) =>
      Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
    const fields = [
      "description",
      "year",
      "developers",
      "publishers",
      "genres",
      "platforms",
      "screenshots",
    ];
    const missing = fields.filter((f) => !ok(p[f]));
    console.log(
      `  ${store} · ${name}: min=${JSON.stringify(Object.keys(p.minimum || {}).filter((k) => k !== "raw"))} rec=${JSON.stringify(Object.keys(p.recommended || {}).filter((k) => k !== "raw"))} platforms=${JSON.stringify(p.platforms)}${missing.length ? " eksik: " + missing.join(",") : ""}`,
    );
  };
  console.log("\nCanlı ürün yükleme (uygulamanın kendi kodu):");
  for (const r of sample.gog)
    try {
      report("GOG", r.title, await gogDetails(String(r.id)));
    } catch (e) {
      console.log("  GOG HATA", r.title, (e as Error).message);
    }
  for (const r of sample.epic)
    try {
      report("Epic", r.title, await epicDetails(r.id));
    } catch (e) {
      console.log("  Epic HATA", r.title, (e as Error).message);
    }
  for (const r of sample.xbox)
    try {
      report("Xbox", r.title, await xboxDetails(r.id));
    } catch (e) {
      console.log("  Xbox HATA", r.title, (e as Error).message);
    }
  for (const p of sample.abandonware)
    try {
      report("My Abandonware", p, await abandonwareDetails(p));
    } catch (e) {
      console.log("  My Abandonware HATA", p, (e as Error).message);
    }
}
(async () => {
  console.log("Gerçek mağaza verisi denetimi");
  for (const [store, c] of Object.entries(counts))
    console.log(
      `  ${store}: ${c.games} oyun, ${c.levels} gereksinim düzeyi, ${c.fields} dolu alan`,
    );
  const real = failures.filter((f) => f.field !== "(eklenmemeli)");
  console.log(
    `Eksik okunan alan: ${real.length}; mağazada olmayıp eklenen düzey: ${failures.length - real.length}`,
  );
  for (const f of failures.slice(0, 80))
    console.log(
      `  ✕ ${f.store} · ${f.game} · ${f.level} · ${f.field}\n      ${f.source}`,
    );
  if (live) await liveRun();
  process.exitCode = failures.length ? 1 : 0;
})();
