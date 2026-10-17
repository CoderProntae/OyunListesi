import type {
  Compatibility,
  ComponentCheck,
  Game,
  Hardware,
  Requirements,
} from "./types";
import { compatLabels } from "./types";
import { formatSize, formatVersion } from "./format";
import { compareCpu, compareGpu, gpuFacts } from "./hardware-match";
// 2.1.0: CPU and GPU rows are compared with real data (PassMark scores and
// TechPowerUp features, shared/hardware-match.ts). Only what that cannot read
// stays "unknown" for the AI research.
function performance(
  label: "CPU" | "GPU",
  actual: string,
  req: string | undefined,
  h: Hardware,
  year?: number,
): ComponentCheck {
  if (!knownText(req))
    return {
      name: label,
      actual: actual || "Bilinmiyor",
      required: "Belirtilmemiş",
      status: "unknown",
      reason: "Kaynakta bu bileşen için karşılaştırılabilir bilgi yok.",
    };
  if (!knownText(actual))
    return {
      name: label,
      actual: "Algılanamadı",
      required: req,
      status: "unknown",
      reason: "Sistem bileşenini ayarlardan gir.",
    };
  const v = label === "CPU" ? compareCpu(req, h, year) : compareGpu(req, h);
  return {
    name: label,
    actual,
    required: req,
    status: v.status,
    reason: v.reason,
    ...(v.near ? { near: true } : {}),
    ...(v.estimated ? { estimated: true } : {}),
    ...(v.status !== "unknown" ? { db: true } : {}),
  };
}
// Sizes are GB values shown as "16 MB" / "0,81 GB"; DirectX is a version.
function quantity(
  name: string,
  actual: number | null,
  required: number | undefined,
  format: (value: number) => string = formatSize,
  certain = true,
): ComponentCheck {
  if (required === undefined)
    return {
      name,
      actual: actual === null ? "Bilinmiyor" : format(actual),
      required: "Belirtilmemiş",
      status: "unknown",
      reason: "Sayısal gereksinim bulunamadı.",
    };
  if (actual === null || !certain)
    return {
      name,
      actual: actual === null ? "Bilinmiyor" : `~${format(actual)}`,
      required: format(required),
      status: "unknown",
      reason: "Donanım değeri kesin algılanamadı; ayarlardan düzeltilebilir.",
    };
  return {
    name,
    actual: format(actual),
    required: format(required),
    status: actual >= required ? "pass" : "fail",
    reason:
      actual >= required
        ? "Gereksinimi karşılıyor."
        : format === formatSize
          ? `${formatSize(required - actual)} eksik.`
          : "Gereken sürümden düşük.",
  };
}
// A requirement block sometimes arrives as unlabeled sentences only ("64-bit
// işlemci gerektirir"): put each line into its component so the level still
// gets a row and a comparison (Bendy and the Ink Machine, 2.1.2).
export function withRawFields(req: Requirements): Requirements {
  if (
    !knownText(req.raw) ||
    knownText(req.cpu) ||
    knownText(req.gpu) ||
    knownText(req.os) ||
    req.ramGB !== undefined ||
    req.vramGB !== undefined ||
    req.storageGB !== undefined ||
    req.directX !== undefined ||
    req.vulkan
  )
    return req;
  const out: Requirements = { ...req };
  const gb = (t: string) => {
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(gb|mb)\b/i);
    if (!m) return undefined;
    const v = Number(m[1].replace(",", "."));
    return /mb/i.test(m[2]) ? Math.max(0.1, Math.round((v / 1024) * 100) / 100) : v;
  };
  for (const line of String(req.raw).split(/\n+|;\s*/)) {
    const t = line.trim();
    if (t.length < 3) continue;
    if (!knownText(out.cpu) && /işlemci|processor|\bcpu\b/i.test(t)) out.cpu = t;
    else if (!knownText(out.os) && /işletim|windows|operating|\bos\b/i.test(t))
      out.os = t;
    else if (
      !knownText(out.gpu) &&
      /ekran kartı|graphics|\bgpu\b|video card|grafik/i.test(t)
    )
      out.gpu = t;
    else if (out.ramGB === undefined && /\b(bellek|memory|ram)\b/i.test(t))
      out.ramGB = gb(t);
    else if (
      out.storageGB === undefined &&
      /\b(depolama|storage|disk|sabit disk|hard drive)\b/i.test(t)
    )
      out.storageGB = gb(t);
  }
  return out;
}
// Rows only for what the requirement text actually lists. A component the
// store does not publish gets no row (1.0.16), so it can neither count as
// "missing" nor block the result.
function checks(raw: Requirements, h: Hardware, year?: number): ComponentCheck[] {
  const req = withRawFields(raw);
  const rows: ComponentCheck[] = [];
  if (knownText(req.cpu)) rows.push(performance("CPU", h.cpu, req.cpu, h, year));
  if (knownText(req.gpu)) rows.push(performance("GPU", h.gpu, req.gpu, h));
  if (req.ramGB !== undefined) rows.push(quantity("RAM", h.ramGB, req.ramGB));
  if (req.storageGB !== undefined)
    rows.push(quantity("Disk", h.diskFreeGB, req.storageGB));
  // 2.1.0: when the computer could not tell its card's memory or DirectX
  // level, the card's known values from the hardware data are used.
  const card =
    req.vramGB !== undefined || req.directX !== undefined || req.vulkan
      ? gpuFacts(h)
      : undefined;
  if (req.vramGB !== undefined) {
    const row = quantity(
      "VRAM",
      card!.vramGB,
      req.vramGB,
      formatSize,
      h.vramCertain || card!.vramFromData,
    );
    if (card!.vramFromData && row.status !== "unknown")
      row.reason += " Kartın belleği donanım verisinden alındı.";
    rows.push(row);
  }
  if (req.directX !== undefined) {
    const row = quantity("DirectX özellik düzeyi", card!.dx, req.directX, formatVersion);
    if (card!.dxFromData && row.status !== "unknown")
      row.reason += " Kartın DirectX düzeyi donanım verisinden alındı.";
    rows.push(row);
  }
  if (req.vulkan) {
    const need = Number(req.vulkan.match(/\d+(?:\.\d+)?/)?.[0] || 0),
      have = card!.vk;
    rows.push(
      have
        ? {
            name: "Vulkan",
            actual: `Vulkan ${formatVersion(have)}`,
            required: req.vulkan,
            status: have + 0.001 >= need ? "pass" : "fail",
            reason:
              have + 0.001 >= need
                ? `Kartın Vulkan ${formatVersion(have)} destekliyor.`
                : `Kartın Vulkan ${formatVersion(have)} destekliyor; ${formatVersion(need)} gerekiyor.`,
          }
        : {
            name: "Vulkan",
            actual: h.vulkan,
            required: req.vulkan,
            status: "unknown",
            reason: "Sürücü/API sürümü otomatik bir oyun uyumluluk garantisi vermez.",
          },
    );
  }
  if (knownText(req.os)) {
    // 2.1.0: old Windows names count too (95, 98, ME, 2000, XP, Vista); the
    // Windows block of a store or PCGamingWiki may list them without "Windows".
    const order = [
      "95",
      "nt",
      "98",
      "me",
      "2000",
      "xp",
      "vista",
      "7",
      "8",
      "8.1",
      "10",
      "11",
    ];
    const versions = [
      ...req.os.matchAll(
        /(?:Windows\s*)?\b(11|10|8\.1|8|7|vista|xp|2000|me|98|95|nt)(?=[^0-9.]|$)/gi,
      ),
    ].map((m) => order.indexOf(m[1].toLowerCase()));
    // A bare version ("10", "7 64-bit") is a Windows requirement: stores write
    // it without the word (Bendy and the Ink Machine, 2.1.2).
    const windows =
      /windows|\b(?:xp|vista|95|98|nt)\b/i.test(req.os) ||
      (versions.length > 0 && !/[a-z]{3,}/i.test(req.os.replace(/bit/gi, "")));
    const actualWindows = /windows/i.test(h.os);
    const actualName =
      h.os.match(/Windows\s*(11|10|8\.1|8|7|vista|xp)\b/i)?.[1] ||
      h.osVersion.match(/^(11|10|8\.1|8|7)(?:\.|$)/)?.[1];
    const actualVersion = actualName ? order.indexOf(actualName.toLowerCase()) : -1;
    let status: ComponentCheck["status"] = "unknown",
      reason = "İşletim sistemi sürüm gereksinimini ayrıca doğrula.";
    if (windows && actualWindows && versions.length && actualVersion >= 0) {
      status = actualVersion >= Math.min(...versions) ? "pass" : "fail";
      reason =
        status === "pass"
          ? "Windows sürümü gereksinimin en düşük seçeneğini karşılıyor; eski oyunlar ek ayar gerektirebilir."
          : "Windows sürümü gereksinimden daha eski.";
    }
    if (/64/.test(req.os) && /32|ia32/.test(h.architecture)) {
      status = "fail";
      reason = "64 bit işletim sistemi gerekiyor.";
    }
    rows.push({
      name: "İşletim sistemi",
      actual: `${h.os} ${h.osVersion}`,
      required: req.os,
      status,
      reason,
    });
  }
  return rows;
}
// A short fingerprint of the raw block: the key travels in tool results and
// model messages, so it must stay small while still changing with the text.
function rawKey(raw?: string) {
  if (!raw) return undefined;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `${raw.length}:${(h >>> 0).toString(36)}`;
}
export function compatibilityKey(g: Game, h: Hardware): string {
  // Order matters: scopedContext picks these by index; new fields go last.
  const req = (r?: Requirements) =>
    r && [
      r.os,
      r.cpu,
      r.gpu,
      r.ramGB,
      r.vramGB,
      r.storageGB,
      r.directX,
      r.vulkan,
      rawKey(r.raw),
    ];
  return JSON.stringify({
    minimum: req(g.minimum),
    recommended: req(g.recommended),
    hardware: [
      h.cpu,
      h.gpu,
      h.ramGB,
      h.vramGB,
      h.vramCertain,
      h.diskFreeGB,
      h.os,
      h.osVersion,
      h.architecture,
      h.directX,
      h.vulkan,
    ],
  });
}
type Level = "minimum" | "recommended";
function scopedContext(
  level: Level,
  component: string,
  req: unknown[],
  hardware: unknown[],
): string {
  const indexes: Record<string, [number, number[]]> = {
    CPU: [1, [0]],
    GPU: [2, [1]],
    RAM: [3, [2]],
    VRAM: [4, [3, 4]],
    Disk: [5, [5]],
    "İşletim sistemi": [0, [6, 7, 8]],
    "DirectX özellik düzeyi": [6, [9]],
    Vulkan: [7, [10]],
  };
  const selected = indexes[component];
  if (!selected) return "";
  return JSON.stringify([
    "component-v2",
    level,
    component,
    req[selected[0]],
    ...selected[1].map((i) => hardware[i]),
  ]);
}
// 2.1.0: the same CPU/GPU requirement text on the same computer, whatever the
// game or level — the key for reusing an AI comparison made once.
export function learnKey(contextKey: string): string | undefined {
  try {
    const k = JSON.parse(contextKey);
    if (!Array.isArray(k) || k[0] !== "component-v2" || !["CPU", "GPU"].includes(k[2]))
      return undefined;
    const text = String(k[3] ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return text ? JSON.stringify([k[2], text, ...k.slice(4)]) : undefined;
  } catch {
    return undefined;
  }
}
export function componentCompatibilityKey(
  g: Game,
  h: Hardware,
  level: Level,
  component: string,
): string {
  const context = JSON.parse(compatibilityKey(g, h));
  return scopedContext(level, component, context[level] || [], context.hardware);
}
function savedContextMatches(
  saved: string,
  key: string,
  level: Level,
  component: string,
): boolean {
  if (saved === key) return true;
  // Old global snapshots retain the old values; compare only this row's inputs.
  // No migration, extra model call or loss of valid older AI results is needed.
  try {
    const old = JSON.parse(saved);
    return (
      Array.isArray(old.hardware) &&
      Array.isArray(old[level]) &&
      scopedContext(level, component, old[level], old.hardware) === key
    );
  } catch {
    return false;
  }
}
const knownText = (value?: string): value is string =>
  !!value?.trim() &&
  !/^(?:bilinmiyor|algılanamadı|unknown|unavailable|n\/a|belirtilmemiş|belirtilmedi|yayımlanmamış|yayınlanmamış|yok|none|tbd|tba|not specified|unspecified|-|—|–)$/i.test(
    value.trim(),
  );
export function aiComparisonBlockReason(
  g: Game,
  h: Hardware,
  level: Level,
  component: string,
): string | undefined {
  const req = g[level];
  const row = req && checks(req, h, g.year).find((r) => r.name === component);
  if (!row) return "Bileşen bu gereksinim düzeyinde bulunamadı.";
  if (
    row.required === "Belirtilmemiş" ||
    row.required === "Yayımlanmamış" ||
    !knownText(row.required)
  )
    return "Önce gerçek oyun gereksinimini kaydet; eksik gereksinime karşılaştırma uygulanamaz.";
  const actual =
    component === "CPU"
      ? h.cpu
      : component === "GPU"
        ? h.gpu
        : component === "Vulkan"
          ? h.vulkan
          : component === "İşletim sistemi"
            ? h.os
            : row.actual;
  if (!knownText(actual))
    return "Gerçek donanım algılanmadı veya girilmedi; AI karşılaştırması donanımın yerine geçemez.";
  if (row.db && row.status !== "unknown")
    return "Bu satır donanım verisiyle (PassMark puanları, TechPowerUp özellikleri) hesaplandı; AI karşılaştırması gerekmiyor. Yanlışsa donanım adını veya gereksinimi düzelt.";
  if (["RAM", "Disk", "VRAM", "DirectX özellik düzeyi"].includes(component))
    return "Bu satır sayısal ölçümden hesaplanır; yanlışsa gerçek donanım veya gereksinim değerini düzelt.";
  if (!["CPU", "GPU"].includes(component) && row.status !== "unknown")
    return "Bu satır doğrudan kayıtlı değerlerden hesaplanıyor; yanlışsa ilgili kaydı düzelt.";
  return undefined;
}
export function compatibility(g: Game, h: Hardware): Compatibility {
  const min = checks(g.minimum, h, g.year),
    rec = checks(g.recommended, h, g.year);
  for (const [level, rows] of [
    ["minimum", min],
    ["recommended", rec],
  ] as const)
    for (const row of rows) {
      const key = componentCompatibilityKey(g, h, level, row.name);
      row.contextKey = key;
      row.aiBlockReason = aiComparisonBlockReason(g, h, level, row.name);
      row.aiEditable = !row.aiBlockReason;
      const saved = g.aiCompatibility?.find(
        (r) =>
          r.level === level &&
          r.component === row.name &&
          savedContextMatches(r.contextKey, key, level, row.name),
      );
      // 2.0.8: the user's own mark wins over a computed or AI status.
      if (saved?.decidedBy === "user") {
        row.status = saved.status;
        row.reason = saved.reason;
        row.user = true;
        continue;
      }
      if (!row.aiEditable) continue;
      if (saved) {
        row.status = saved.status;
        row.reason = saved.reason;
        row.ai = true;
        row.estimated = true;
      }
    }
  let status: Compatibility["status"] = "unknown";
  const hasMin = min.length > 0,
    hasRec = rec.length > 0;
  // Components the recommended level does not list still count from minimum.
  const listed = new Set(rec.map((r) => r.name));
  const rest = min.filter((r) => !listed.has(r.name));
  if (hasMin && min.some((r) => r.status === "fail")) status = "unsupported";
  else if (
    hasRec &&
    rec.every((r) => r.status === "pass") &&
    rest.every((r) => r.status === "pass")
  )
    status = "recommended";
  // 1.0.17: a store that publishes only one level has nothing above it; meeting
  // it is meeting the game's requirements, not "only the minimum".
  else if (!hasRec && hasMin && min.every((r) => r.status === "pass"))
    status = "recommended";
  else if (hasMin && min.every((r) => r.status === "pass")) status = "minimum";
  // 2.1.3: a game whose requirement was never published has nothing to compute.
  // The user's own mark (Sistem sekmesi) is the answer, and it has to reach the
  // same places a computed result does: library dot and "Uyumluluğa göre"
  // sorting, hover/detail chip, statistics, agent answers. Before this it only
  // changed one text, so the row kept showing "?".
  const userVerdict = !hasMin && !hasRec ? g.reqVerdict : undefined;
  if (userVerdict === "meets") status = "recommended";
  else if (userVerdict === "fails") status = "unsupported";
  const failed = min.filter((r) => r.status === "fail"),
    unknown = min.filter((r) => r.status === "unknown");
  const summary =
    userVerdict === "meets"
      ? "Sistem gereksinimi yayımlanmadı; bu oyunun bilgisayarında çalıştığını sen işaretledin."
      : userVerdict === "fails"
        ? "Sistem gereksinimi yayımlanmadı; bu oyunun bilgisayarını karşılamadığını sen işaretledin."
        : userVerdict === "unknown"
          ? "Sistem gereksinimi yayımlanmadı; sen de belirsiz olarak işaretledin."
          : status === "unsupported"
            ? failed.map((r) => `${r.name}: ${r.reason}`).join(" ")
            : status === "recommended" && !hasRec
              ? "Mağaza yalnızca minimum gereksinim yayımlıyor; bilgisayarın bunların hepsini karşılıyor."
              : status === "recommended"
                ? "Önerilen gereksinimlerde kontrol edilen bileşenler yeterli görünüyor."
                : status === "minimum"
                  ? "Minimum gereksinimler karşılanıyor; önerilen düzey doğrulanmadı veya karşılanmıyor."
                  : !hasMin && !hasRec
                    ? "Sistem gereksinimleri belirtilmemiş; karşılaştırma yapılamadı."
                    : !hasMin
                      ? "Minimum gereksinim belirtilmemiş; önerilen düzey tam karşılanmıyor veya doğrulanmadı."
                      : unknown.map((r) => `${r.name}: ${r.reason}`).join(" ");
  const suggestedGroups: string[] = failed.map((r) =>
    r.name === "Disk"
      ? "Disk Yetmiyor"
      : r.name === "RAM"
        ? "RAM Yetmiyor"
        : r.name === "VRAM" || r.name === "GPU"
          ? "GPU Yetmiyor"
          : r.name === "CPU"
            ? "CPU Yetmiyor"
            : "",
  );
  return {
    status,
    minimum: min,
    recommended: rec,
    summary,
    label:
      userVerdict === "meets"
        ? "Karşılıyor (senin kararın)"
        : userVerdict === "fails"
          ? "Karşılamıyor (senin kararın)"
          : userVerdict === "unknown"
            ? "Bilinmiyor (senin kararın)"
            : !hasMin && !hasRec
              ? "Gereksinim belirtilmemiş"
              : status === "recommended" && !hasRec
                ? "Gereksinimleri karşılıyor"
                : compatLabels[status],
    suggestedGroups: [...new Set(suggestedGroups.filter(Boolean))],
    ...(userVerdict ? { userVerdict } : {}),
  };
}
