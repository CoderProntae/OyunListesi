import type { Game, Hardware, Requirements } from "./types";
import { compatibility } from "./compatibility";
// Stores publish two levels. There is no third level (1.0.15 removed it).
export const requirementLevels = ["minimum", "recommended"] as const;
const valueFields = [
  "os",
  "cpu",
  "gpu",
  "ramGB",
  "vramGB",
  "storageGB",
  "directX",
  "vulkan",
] as const;
const labels: Record<string, string> = {
  minimum: "Minimum",
  recommended: "Önerilen",
};
export function hasRequirements(r?: Requirements) {
  return (
    !!r &&
    valueFields.some(
      (k) => r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "",
    )
  );
}
// Requirements are the store's own text (1.0.16): nothing is "missing" because
// a store does not publish a level or a component. The only open work is a
// comparison the app cannot compute itself (unknown CPU/GPU/OS rows).
export function assessGame(g: Game, h: Hardware) {
  const comparison = compatibility(g, h);
  const unresolved: {
    level: string;
    component: string;
    reason: string;
    editable: boolean;
  }[] = [];
  const uncertain: string[] = [];
  // 2.1.0: rows the hardware data could not decide — the only work there is
  // for the AI (with or without a saved AI answer).
  let aiRows = 0;
  for (const level of requirementLevels)
    for (const row of comparison[level]) {
      if (row.aiEditable) aiRows++;
      if (row.status !== "unknown") continue;
      if (row.aiEditable)
        unresolved.push({
          level,
          component: row.name,
          reason: row.aiBlockReason || row.reason,
          editable: true,
        });
      else uncertain.push(`${labels[level]} ${row.name}: ${row.reason}`);
    }
  const any = requirementLevels.some((level) => hasRequirements(g[level]));
  const pending = unresolved.map(
    (r) => `${labels[r.level]} ${r.component} karşılaştırması`,
  );
  const complete = pending.length === 0;
  const result = !any
    ? comparison.userVerdict === "meets"
      ? "Sistem gereksinimi yayımlanmadı; bu oyunun bilgisayarında çalıştığını sen işaretledin."
      : comparison.userVerdict === "fails"
        ? "Sistem gereksinimi yayımlanmadı; bu oyunun bilgisayarını karşılamadığını sen işaretledin."
        : "Sistem gereksinimleri belirtilmemiş; karşılaştırma yapılmadı."
    : comparison.status === "unsupported"
      ? "Kayıtlı minimum gereksinimlerden en az biri karşılanmıyor."
      : comparison.status === "recommended"
        ? comparison.recommended.length
          ? "Kontrol edilen önerilen donanım gereksinimleri yeterli görünüyor."
          : "Mağazanın yayımladığı donanım gereksinimleri yeterli görünüyor."
        : comparison.status === "minimum"
          ? "Kontrol edilen minimum donanım gereksinimleri yeterli görünüyor."
          : "Oyunun açılabildiği doğrulanmadı; karşılaştırma belirsiz.";
  return {
    complete,
    status: !any ? "none" : complete ? "complete" : "incomplete",
    requirements: any ? ("available" as const) : ("none" as const),
    aiRows,
    unresolved,
    uncertain,
    pending,
    comparisonStatus: comparison.status,
    summary: `${!any ? "" : complete ? "Kayıt kontrolü tamamlandı. " : "Karşılaştırma bekleyen: " + pending.join(", ") + ". "}${result}${any ? " Bu bir donanım karşılaştırmasıdır; oyunun açılışı test edilmedi." : ""}`,
  };
}
