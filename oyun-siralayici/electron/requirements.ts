import * as cheerio from "cheerio";
import { normalizeName } from "../shared/domain";
import type { Requirements } from "../shared/types";
export function text(html: string) {
  const $ = cheerio.load(html || "");
  $("br").replaceWith("\n");
  $("li,p,div,h2,h3,h4,tr,td,th,dt,dd").append("\n");
  return $.text()
    .replace(/\*\*/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}
type Key = "os" | "cpu" | "gpu" | "ramGB" | "vramGB" | "storageGB" | "directX" | "vulkan";
// Store texts use many labels for the same thing (Steam with l=turkish mixes
// localized and publisher-written labels: "Sabit Disk Alanı", "Supported OS",
// "DirectX Version", "Video Card (ATI)" ...). One table drives both line
// splitting and extraction. Checked against real Steam, GOG, Epic and Microsoft
// Store data (scripts/store-audit.ts).
const main: Record<Key, string[]> = {
  os: [
    "OS",
    "Operating system",
    "Operating systems",
    "System",
    "Supported OS",
    "Supported operating system",
    "Supported operating systems",
    "OS version",
    "Platform OS",
    "İşletim sistemi",
    "İşletim sistemleri",
    "Desteklenen işletim sistemi",
    "Desteklenen işletim sistemleri",
    "İşletim sistemi sürümü",
  ],
  cpu: [
    "CPU",
    "Processor",
    "Processors",
    "CPU speed",
    "Processor speed",
    "İşlemci",
    "İşlemci hızı",
  ],
  gpu: [
    "GPU",
    "Graphics",
    "Graphic",
    "Graphics card",
    "Graphics cards",
    "Graphic card",
    "Video card",
    "Video cards",
    "Videocard",
    "Video",
    "Video adapter",
    "Graphics adapter",
    "Graphics processor",
    "Grafik",
    "Grafikler",
    "Grafik kartı",
    "Grafik işlemcisi",
    "Ekran kartı",
    "Video kartı",
  ],
  ramGB: [
    "RAM",
    "Memory",
    "System memory",
    "System RAM",
    "Bellek",
    "Sistem belleği",
    "RAM bellek",
  ],
  vramGB: [
    "VRAM",
    "Video memory",
    "Video RAM",
    "Graphics memory",
    "Video card memory",
    "GPU memory",
    "Ekran kartı belleği",
    "Grafik belleği",
    "Video belleği",
  ],
  storageGB: [
    "Storage",
    "Depolama",
    "Hard drive",
    "Hard drive space",
    "Hard disk",
    "Hard disk space",
    "Hard disk drive",
    "HDD",
    "HDD space",
    "Disk",
    "Disk space",
    "Free disk space",
    "Free space",
    "Available space",
    "Drive space",
    "Installation size",
    "Install size",
    "Sabit disk",
    "Sabit disk alanı",
    "Disk alanı",
    "Boş alan",
    "Boş disk alanı",
  ],
  directX: ["DirectX", "Direct X", "DX", "DirectX version", "DirectX sürümü"],
  vulkan: ["Vulkan"],
};
// Used only when no main label gave the value ("Display: 3D card ..." or a
// list of supported cards).
const fallback: Partial<Record<Key, string[]>> = {
  gpu: [
    "Display",
    "Supported video cards",
    "Supported video cards at time of release",
    "Supported video cards at time of retail release",
    "Supported video card chipsets",
    "Supported chipsets",
    "Desteklenen ekran kartları",
  ],
};
// Labels that belong to the requirement block but are not one of our fields.
// They must end the previous field so their text cannot leak into it.
const ignored = [
  "Sound",
  "Sound card",
  "Sound cards",
  "Sound cards supported",
  "Audio",
  "Ses",
  "Ses kartı",
  "Network",
  "Internet",
  "Internet connection",
  "Ağ",
  "Additional notes",
  "Additional",
  "Notes",
  "Note",
  "Important note",
  "Other",
  "Other requirements",
  "Further information",
  "İlave notlar",
  "Ek notlar",
  "Notlar",
  "Input",
  "Input devices",
  "Controller",
  "Controllers",
  "Controller support",
  "Controls",
  "Peripherals",
  "Supported peripherals",
  "Çevre birimleri",
  "Mouse",
  "Keyboard",
  "Mouse keyboard",
  "Klavye",
  "Fare",
  "VR support",
  "VR desteği",
  "VR CPU",
  "VR GPU",
  "VR controllers",
  "Multiplayer",
  "Multiplayer requirements",
  "Multi player requirements",
  "Required for multiplayer",
  "Co op multiplayer hosting",
  "Co op play",
  "Multiplay",
  "Çok oyunculu",
  "Çok oyunculu gereksinimleri",
  "Partner requirements",
  "Gerekenler",
  "Architecture",
  "Mimari",
  "Available on",
  "Şurada mevcut",
  "Minimum",
  "Recommended",
  "Optimum",
  "Optimal",
  "En düşük",
  "Önerilen",
  "Önerilenler",
  "En az",
  "System requirements",
  "Minimum system requirements",
  "Recommended system requirements",
  "Sistem gereksinimleri",
  "Requires",
  "Screen resolution",
  "Resolution",
  "Çözünürlük",
  "Disc drive",
  "CD ROM",
  "DVD ROM",
  "Optical drive",
  "Media",
];
type Rule = { key: Key | "ignore"; rank: number };
const rules = new Map<string, Rule>();
for (const [key, values] of Object.entries(main))
  for (const v of values) rules.set(normalizeName(v), { key: key as Key, rank: 0 });
for (const [key, values] of Object.entries(fallback))
  for (const v of values!) rules.set(normalizeName(v), { key: key as Key, rank: 3 });
for (const v of ignored) rules.set(normalizeName(v), { key: "ignore", rank: 0 });
// Block headings ("Gerekenler: …", "Minimum: …"): a value written on the same
// line is ordinary requirement text, not something to drop.
const headingWords = new Set(
  [
    "Gerekenler",
    "Minimum",
    "Recommended",
    "Optimum",
    "Optimal",
    "En düşük",
    "Önerilen",
    "Önerilenler",
    "En az",
    "System requirements",
    "Minimum system requirements",
    "Recommended system requirements",
    "Sistem gereksinimleri",
  ].map(normalizeName),
);
// Unknown labels: decide by the words they contain (rank 1, below exact labels).
function guess(n: string): Rule | undefined {
  const has = (re: RegExp) => re.test(n);
  if (
    has(
      /\b(sound|audio|ses|network|internet|ag|notes?|notlar|controllers?|input|mouse|keyboard|klavye|fare|vr|multiplayer|oyunculu|peripherals?|cevre|resolution|cozunurluk|partner|languages?|dil)\b/,
    )
  )
    return { key: "ignore", rank: 1 };
  if (
    has(/\b(video|graphics?|gpu|ekran|grafik)\b/) &&
    has(/\b(memory|ram|bellek|bellegi)\b/)
  )
    return { key: "vramGB", rank: 1 };
  if (has(/\b(disk|drive|hdd|ssd|storage|space|depolama|alan|alani)\b/))
    return { key: "storageGB", rank: 1 };
  if (has(/\b(memory|ram|bellek|bellegi)\b/)) return { key: "ramGB", rank: 1 };
  if (has(/\b(processors?|cpu|islemci)\b/)) return { key: "cpu", rank: 1 };
  if (has(/\b(video|graphics?|gpu|ekran|grafik|chipsets?|yongalar)\b/))
    return { key: "gpu", rank: 3 };
  if (has(/\b(directx|dx)\b/)) return { key: "directX", rank: 1 };
  if (has(/\b(os|operating|isletim)\b/)) return { key: "os", rank: 1 };
  return undefined;
}
// "Windows Processor" (Epic), "Video Card (NVidia)", "OS *", "DirectX®:".
export function labelRule(label: string, allowGuess = true): Rule | undefined {
  const base = normalizeName(label.replace(/\([^)]*\)/g, " "));
  if (!base || base.split(" ").length > 7) return;
  const forms = [
    base,
    base.replace(/^(?:windows|win|pc|mac|macos|linux|steamos)\s+(?=\S)/, ""),
  ];
  for (const form of [...forms])
    forms.push(
      form.replace(/\s+(?:version|surumu|surum|requirements?|gereksinimi)$/, ""),
    );
  for (const form of forms) {
    const rule = rules.get(form);
    if (rule) return rule;
  }
  // Word guesses only for real "Label:" prefixes; a value line such as
  // "256MB RAM" must not be taken for a heading.
  return allowGuess ? guess(forms[1]) : undefined;
}
const units =
  /(\d+(?:[.,]\d+)?)\s*(?:\(\+\)|\+)?\s*(GiB|MiB|TiB|GB|MB|TB|Gb|Mb)(?![a-z])/i;
function gigabytes(m: RegExpMatchArray) {
  const value = Number(m[1].replace(",", "."));
  return /^m/i.test(m[2]) ? value / 1024 : /^t/i.test(m[2]) ? value * 1024 : value;
}
function size(value?: string) {
  const m = value?.match(units);
  return m ? gigabytes(m) : undefined;
}
// "1 GB (XP), 2 GB (Vista)": a Windows 10/11 PC needs the newer system's value.
function memory(value?: string) {
  if (!value) return;
  const parts = [...value.matchAll(new RegExp(units.source + "([^,;/]*)", "gi"))];
  if (parts.length > 1) {
    const modern = parts.find((p) =>
      /(vista|win(?:dows)?\s*(?:7|8|10|11)|\b(?:7|8|10|11)\b)/i.test(p[3]),
    );
    const legacy = parts.some((p) => /\b(xp|2000|98|me)\b/i.test(p[3]));
    if (modern && legacy) return gigabytes(modern);
  }
  return parts[0] ? gigabytes(parts[0]) : undefined;
}
// DirectX: a feature level wins ("DirectX 12 API, Feature Level 11" → 11),
// then the number after DirectX/DX/Version, then a plausible bare number.
function directX(value?: string) {
  if (!value) return;
  const level = value.match(
    /(?:feature level|özellik seviyesi|özellik düzeyi)\s*(\d{1,2})(?:[._](\d))?/i,
  );
  if (level) return Number(level[1] + (level[2] ? "." + level[2] : ""));
  const named = value.match(
    /(?:directx|direct x|dx|version|sürüm|sürümü)[®™]?\s*:?\s*(?:version\s*)?(\d{1,2}(?:\.\d)?)/i,
  );
  if (named && Number(named[1]) >= 5 && Number(named[1]) <= 13) return Number(named[1]);
  for (const m of value.matchAll(/\b(\d{1,2}(?:\.\d)?)/g))
    if (Number(m[1]) >= 5 && Number(m[1]) <= 13) return Number(m[1]);
}
const clean = (s: string) =>
  s
    .replace(/^["'“”\s]+|["'“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
const junk =
  /^(?:belirtilmemiş|belirtilmemis|not specified|unspecified|n\/a|-|—|none|yok|tbd|tba|to be determined|to be announced|coming soon|yakında)$/i;
// Free-form texts without labels ("Microsoft Windows 2000, XP, Pentium 3
// 1.0Ghz ..., 256MB RAM, ... 9.9GB free disk space"). Only clear phrases are
// used; anything unclear is left out instead of guessed.
function segments(line: string) {
  const parts: string[] = [];
  let depth = 0,
    current = "";
  for (const ch of line) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map(clean).filter(Boolean);
}
const storageWords = /\b(?:disk|disc|drive|hdd|ssd|storage|space|depolama|alan|alanı)\b/i;
const dxMention = /(?:directx|direct x|\bdx)[®™]?\s*(?:version\s*)?\d/i;
function unlabeled(
  lines: string[],
  put: (key: Key, value: string, rank: number) => void,
) {
  let lastOs = false;
  for (const line of lines)
    for (const part of segments(line)) {
      const p = part.toLowerCase();
      // "(Windows 95/98/ME/NT Not Supported)" must not hide "Windows 2000/XP".
      const outside = p.replace(/\([^)]*\)/g, " ");
      const osHit =
        /(windows|\bwin\s?(?:xp|7|8|10|11)\b|\bvista\b|mac ?os|os x|linux|ubuntu|steamos)/i;
      if (
        /(sound|audio|ses kart|mouse|keyboard|klavye|fare|controller|gamepad|joystick|internet|network|broadband|online|cd-?rom|dvd|resolution|çözünürlük|requires|gerektirir|no longer|not supported|desteklenmiyor|desteklemiyor|desteklememektedir|desteklenmemektedir|desteklenmez)/i.test(
          outside,
        ) &&
        !/(geforce|radeon|nvidia|\bati\b|3d|graphics|video card|ekran kart)/i.test(
          outside,
        )
      ) {
        lastOs = false;
        continue;
      }
      if (units.test(part) && storageWords.test(p)) put("storageGB", part, 2);
      else if (
        units.test(part) &&
        /\b(ram|memory|bellek)\b/i.test(p) &&
        !/(video|graphics|vram|3d|card|kart)/i.test(p)
      )
        put("ramGB", part, 2);
      else if (
        /(geforce|radeon|nvidia|\bati\b|intel (?:hd|uhd|iris|arc)|\bgtx\b|\brtx\b|\brx \d|video card|graphics|3d accel|3d card|shader model|vram|video memory|ekran kart|grafik)/i.test(
          p,
        )
      ) {
        put("gpu", part, 2);
        if (dxMention.test(p)) put("directX", part, 4);
      } else if (
        /(pentium|athlon|core\s?i\d|core 2|ryzen|phenom|celeron|duron|sempron|xeon|\d\s*[gm]hz|processor|cpu|işlemci)/i.test(
          p,
        )
      )
        put("cpu", part, 2);
      else if (dxMention.test(p)) put("directX", part, 2);
      else if (osHit.test(part)) {
        put("os", part, 2);
        lastOs = true;
        continue;
      } else if (lastOs && /^(?:xp|vista|me|98|2000|7|8(?:\.1)?|10|11)\b/i.test(part)) {
        put("os", part, 2);
        continue;
      }
      lastOs = false;
    }
}
// One requirement block (one level) as text or HTML.
export function parseRequirements(html: string): Requirements {
  const raw = stripHeading(text(html)),
    found = new Map<Key, { value: string; rank: number }[]>();
  const put = (key: Key, value: string, rank: number) => {
    const v = clean(value);
    if (!v || junk.test(v)) return;
    found.set(key, [...(found.get(key) || []), { value: v, rank }]);
  };
  // Split "…, Memory: 4 GB; Graphics: …" written on one line.
  const lines = raw
    .replace(/[;,|•]\s*([^:：;,|\n]{1,60})[:：]/gu, (match, label) =>
      labelRule(label) ? "\n" + label + ":" : match,
    )
    .split(/\n/)
    .map((s) => s.trim().replace(/^[-*•#]+\s*/, ""))
    .filter(Boolean);
  let waiting: Rule | undefined;
  const free: string[] = [];
  for (const line of lines) {
    const match = line.match(/^([^:：]{1,60})[:：]\s*(.*)$/);
    if (match && labelLike(match[1])) {
      const rule = labelRule(match[1]);
      // Unknown labels ("Multiplayer Requirements:") end the previous field.
      waiting = undefined;
      if (headingWords.has(normalizeName(match[1]))) {
        if (match[2].trim()) free.push(match[2]);
        continue;
      }
      if (rule && rule.key !== "ignore") {
        // "Ekran Kartı: Graphics: NVIDIA …" – drop a repeated label of the same field.
        const inner = match[2].match(/^([^:：]{1,30})[:：]\s*(.+)$/);
        const value =
          inner && labelRule(inner[1])?.key === rule.key ? inner[2] : match[2];
        if (value.trim()) put(rule.key, value, rule.rank);
        else waiting = rule;
      }
      continue;
    }
    // A heading without a colon ("Hard Drive Space") followed by its value line.
    const heading = line.length <= 40 ? labelRule(line, false) : undefined;
    if (heading) {
      waiting = heading.key === "ignore" ? undefined : heading;
      continue;
    }
    if (waiting && waiting.key !== "ignore") {
      put(waiting.key, line, waiting.rank);
      waiting = undefined;
      continue;
    }
    free.push(line);
  }
  unlabeled(free, put);
  const best = (key: Key) => {
    const list = found.get(key) || [];
    const rank = Math.min(...list.map((x) => x.rank));
    return list.filter((x) => x.rank === rank).map((x) => x.value);
  };
  const rankOf = (key: Key) => Math.min(...(found.get(key) || []).map((x) => x.rank));
  const textValue = (key: Key) => {
    let values = [...new Set(best(key))];
    // Several labelled lines ("Video Card (ATI)", "Video Card (NVidia)") are
    // joined; for guessed text only the first, clearest phrase is used.
    if (key !== "os" && rankOf(key) >= 2) values = values.slice(0, 1);
    return values.length ? values.join(" / ").slice(0, 2000) : undefined;
  };
  // Publisher slips seen on Steam: "Memory: 1.55 GB of free hard disk space",
  // "Processor: … 256(+) MB of RAM".
  for (const item of [...(found.get("ramGB") || [])])
    if (
      storageWords.test(item.value) &&
      /(hard|free|boş|disk|hdd|ssd)/i.test(item.value)
    ) {
      found.set(
        "ramGB",
        (found.get("ramGB") || []).filter((x) => x !== item),
      );
      if (!found.get("storageGB")?.length) put("storageGB", item.value, item.rank);
    }
  if (!found.get("ramGB")?.length)
    for (const item of found.get("cpu") || []) {
      const m = item.value.match(
        new RegExp(units.source + "\\s*(?:of\\s+)?(?:system\\s+)?ram\\b", "i"),
      );
      if (m) put("ramGB", m[0], 2);
    }
  const gpu = textValue("gpu");
  const first = <T>(key: Key, read: (v?: string) => T | undefined) => {
    for (const value of best(key)) {
      const result = read(value);
      if (result !== undefined) return result;
    }
  };
  const result: Requirements = {
    raw,
    os: textValue("os")?.slice(0, 300),
    cpu: textValue("cpu"),
    gpu,
    ramGB: first("ramGB", memory),
    vramGB: first("vramGB", size) ?? size(gpu),
    storageGB: first("storageGB", size),
    // "DirectX 9.0c compatible video card": the card line states the version
    // when there is no DirectX line of its own.
    directX:
      first("directX", directX) ??
      (gpu && dxMention.test(gpu) ? directX(gpu) : undefined),
    vulkan:
      best("vulkan")[0]?.match(/\d+(?:\.\d+)*/)?.[0] ||
      raw.match(/Vulkan\s*(\d+(?:\.\d+)?)/i)?.[1],
  };
  for (const key of Object.keys(result) as (keyof Requirements)[])
    if (result[key] === undefined) delete result[key];
  return result;
}
// A "Label:" that is not ours ("Multiplayer Requirements:") is skipped, while a
// sentence with a colon ("Note: works on Windows 10") still goes to free text.
function labelLike(label: string) {
  return label.trim().split(/\s+/).length <= 5 && !/[.!?]$/.test(label.trim());
}
const headings =
  /(?:^|\n)[ \t]*(minimum|minimal|en düşük|en az|recommended|önerilen|önerilenler|optimum|optimal)(?:[ \t]+(?:configuration|requirements|system requirements|sistem gereksinimleri|specs?))?[ \t]*(?::|\n|$)/gi;
function stripHeading(raw: string) {
  const first = [...raw.matchAll(headings)][0];
  return first && first.index === 0 ? raw.slice(first[0].length).trim() : raw;
}
type Level = "minimum" | "recommended" | "optimum";
const levelOf = (word: string): Level =>
  /^(recommended|önerilen)/i.test(word)
    ? "recommended"
    : /^(optimum|optimal)/i.test(word)
      ? "optimum"
      : "minimum";
// A store block can hold several levels ("Minimum: … Recommended: … Optimal: …"
// or "Minimum configuration … Recommended configuration …"). Only minimum and
// recommended exist in the app; a third block only marks where the recommended
// one ends and its values are ignored.
export function splitLevels(raw: string) {
  const marks = [...raw.matchAll(headings)];
  const sections: Partial<Record<Level, string>> = {};
  if (!marks.length) return { minimum: raw } as Partial<Record<Level, string>>;
  const before = raw.slice(0, marks[0].index).trim();
  for (let i = 0; i < marks.length; i++) {
    const level = levelOf(marks[i][1]);
    const body = raw
      .slice(marks[i].index! + marks[i][0].length, marks[i + 1]?.index ?? raw.length)
      .trim();
    if (body && sections[level] === undefined) sections[level] = body;
  }
  if (before && sections.minimum === undefined) sections.minimum = before;
  return sections;
}
export function parseRequirementSections(minimumHTML: string, recommendedHTML = "") {
  const first = splitLevels(text(minimumHTML));
  const second = recommendedHTML ? splitLevels(text(recommendedHTML)) : {};
  const recommended = recommendedHTML
    ? (second.recommended ?? second.minimum ?? "")
    : (first.recommended ?? "");
  return {
    minimum: parseRequirements(first.minimum ?? ""),
    recommended: parseRequirements(recommended),
  };
}
// Structured store rows (GOG, Epic, Microsoft Store) go through the same parser
// as text, so every source understands the same labels.
export function rowsToRequirements(rows: { label: string; value?: string | null }[]) {
  return parseRequirements(
    rows
      .filter((r) => r.value && !junk.test(clean(String(r.value))))
      .map((r) => `${clean(r.label).replace(/[:：]$/, "")}: ${clean(String(r.value))}`)
      .join("\n"),
  );
}
export const requirementValueKeys = [
  "os",
  "cpu",
  "gpu",
  "ramGB",
  "vramGB",
  "storageGB",
  "directX",
  "vulkan",
] as const;
export function hasRequirementValues(r?: Partial<Requirements>) {
  return (
    !!r &&
    requirementValueKeys.some(
      (k) => r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "",
    )
  );
}
// Upgrade legacy records that have text but missing parsed columns. Only fill
// holes; preserve explicit values and explicit unpublished declarations.
export function repairRequirements(requirements: Requirements): Requirements {
  if (requirements.availability === "not_published")
    return { raw: "", availability: "not_published" };
  if (!requirements.raw) return requirements;
  const parsed = parseRequirements(requirements.raw),
    result = { ...requirements };
  for (const [key, value] of Object.entries(parsed)) {
    if (
      key === "raw" ||
      value === undefined ||
      requirements.unpublished?.includes(key as any)
    )
      continue;
    if ((result as any)[key] === undefined || (result as any)[key] === "")
      (result as any)[key] = value;
  }
  return result;
}
// Text kept with an AI edit: the saved fields in a fixed order. It parses back
// to the same values (labels are in the alias table above).
const textLabels = {
  os: "OS",
  cpu: "CPU",
  gpu: "GPU",
  ramGB: "RAM",
  vramGB: "VRAM",
  storageGB: "Storage",
  directX: "DirectX",
  vulkan: "Vulkan",
} as const;
export function requirementsText(requirements: Partial<Record<string, unknown>>) {
  return Object.entries(textLabels)
    .filter(([key]) => {
      const value = requirements[key];
      return value !== undefined && value !== null && value !== "";
    })
    .map(
      ([key, label]) =>
        `${label}: ${requirements[key]}${key.endsWith("GB") ? " GB" : ""}`,
    )
    .join("\n");
}
