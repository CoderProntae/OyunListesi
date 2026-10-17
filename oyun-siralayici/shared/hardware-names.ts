// 2.1.0: hardware name normalisation, shared by the database builder
// (scripts/hardware-data.ts) and the matcher (shared/hardware-match.ts).
// Both sides must produce exactly the same tokens, so this file has no data.

export type Brand = "nvidia" | "amd" | "intel";

// Vendor words are never part of a model key; they only tell the brand.
export const brandWords: Record<string, Brand> = {
  nvidia: "nvidia",
  geforce: "nvidia",
  amd: "amd",
  ati: "amd",
  radeon: "amd",
  intel: "intel",
};
const lineBrands: [RegExp, Brand][] = [
  [/\b(?:quadro|titan|tesla|nvs|rtx|gtx|gts)\b/i, "nvidia"],
  [
    /\b(?:firepro|firegl|instinct|ryzen|athlon|phenom|sempron|opteron|epyc|threadripper|turion|duron|fx-?\d)/i,
    "amd",
  ],
  [/\b(?:iris|celeron|pentium|xeon|atom|core\s*(?:i\d|2|ultra|duo|solo))/i, "intel"],
];
const stopWords = new Set([
  "graphics",
  "gpu",
  "with",
  "design",
  "series",
  "processor",
  "cpu",
  "apu",
  "family",
  "integrated",
  "igpu",
  "video",
  "card",
  "chipset",
  "the",
]);
const roman: Record<string, string> = { ii: "2", iii: "3", iv: "4" };
// Alternative separators survive as "|" so a brand named before "/" or "or"
// does not leak into the next alternative.
export const separators = new Set(["|", "or", "veya", "and", "ve", "yada"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\((?:r|tm|c)\)|[®™©]/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[/|;,]+/g, " | ")
    .split(/[^a-z0-9.|]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .map((t) => roman[t] || t);
}

// 2.1.5: "GeForce 600 series" is a whole generation, not a card called "600".
// The word survives as a marker so the matcher can see it (the database keys
// never contain it) and refuse to read the number as a model.
export const SERIES = "series";
const seriesWords = new Set([
  "series",
  "serisi",
  "serisinden",
  "serisine",
  "ailesi",
  "family",
]);
// Text tokens for matching: the same words are left out as in the keys.
export function matchTokens(text: string, cpu: boolean) {
  return tokenize(text)
    .map((t) => (seriesWords.has(t) ? SERIES : t))
    .filter(
      (t) => t === "|" || t === SERIES || !(stopWords.has(t) || (cpu && t === "core")),
    );
}

const codeNames =
  /\b(?:sandy ?bridge|ivy ?bridge|haswell|broadwell|skylake|kaby ?lake|coffee ?lake|comet ?lake|cannon ?lake|ice ?lake|tiger ?lake|rocket ?lake|alder ?lake|raptor ?lake|meteor ?lake|lunar ?lake|arrow ?lake|panther ?lake|gemini ?lake|apollo ?lake|jasper ?lake|elkhart ?lake|whiskey ?lake|amber ?lake|bay ?trail|cherry ?trail|braswell|ironlake|clarkdale|arrandale)\b/gi;

function keyFrom(source: string, cpu: boolean) {
  let brand: Brand | undefined;
  const key: string[] = [];
  for (const t of tokenize(source)) {
    if (t === "|") continue;
    const b = brandWords[t];
    if (b) {
      brand ??= b;
      continue;
    }
    if (stopWords.has(t) || (cpu && t === "core")) continue;
    key.push(t);
  }
  brand ??= lineBrands.find(([re]) => re.test(source))?.[1];
  return { key, brand };
}

export function gpuKey(name: string) {
  return keyFrom(
    name
      // "256MB DDR Radeon 9800 XT"
      .replace(/^\s*\d+\s*[mg]b\s+(?:g?ddr\d?\s+)?/i, " ")
      // "Intel 3rd Generation IvyBridge HD 4000" → "Intel HD 4000"
      .replace(/\b\d+(?:st|nd|rd|th)\s+generation\b/gi, " ")
      .replace(codeNames, " ")
      .replace(/\b(?:agp|pci[- ]?express|pci[- ]?e|pcie|pci)\b(?:\s*\d+x)?/gi, " "),
    false,
  );
}

// PassMark names old CPUs by clock ("Intel Pentium 4 2.00GHz"); newer ones
// carry the clock after "@", which is not part of the model name.
export function cpuClockNamed(name: string) {
  return !name.includes("@") && /\d(?:\.\d+)?\s*[gm]hz/i.test(name);
}
export function cpuKey(name: string) {
  return keyFrom(
    name
      .replace(/@.*$/, " ")
      .replace(/\bwith\b.*$/i, " ")
      .replace(
        /\b(?:single|dual|triple|quad|six|hexa|eight|octa|ten|twelve|sixteen)[- ]core\b/gi,
        " ",
      )
      .replace(/\b\d+(?:\.\d+)?\s*[gm]hz\b/gi, " "),
    true,
  );
}
