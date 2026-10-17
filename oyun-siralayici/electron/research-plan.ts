import {
  allResearchStages,
  researchProgress,
  type ResearchStage,
} from "../shared/research-progress";
import type { Game, Hardware } from "../shared/types";

// With a game: only the stages that apply to it (no hardware stage when
// neither the store nor PCGamingWiki gave system requirements).
export function researchStages(
  autoSummary: boolean,
  game?: Game,
  hardware?: Hardware,
): ResearchStage[] {
  if (game && hardware) return researchProgress(game, hardware, autoSummary).stages;
  return allResearchStages.filter((stage) => autoSummary || stage !== "summary");
}
// The hardware argument remains for caller compatibility; no device values or
// game-record dump is embedded. Current data comes from tools, not stale prompts.
export function researchStage(game: Game, _hardware: Hardware, stage: ResearchStage) {
  const intro = `Oyun: ${game.name}; gameId: ${game.id}. `;
  const stages: Record<ResearchStage, { title: string; prompt: string }> = {
    hardware: {
      title: "Donanım karşılaştırması",
      prompt:
        "AŞAMA: DONANIM. Kayıtlı sistem gereksinimlerini bilgisayarla karşılaştır: check_compatibility ile durumu al, belirsiz CPU/GPU/işletim sistemi satırlarını gerekirse araştırıp record_compatibility ile kaydet. Gereksinim ekleme, değiştirme veya silme.",
    },
    summary: {
      title: "Oyun özeti",
      prompt: "AŞAMA: ÖZET. Oyunu anlatan kısa Türkçe özeti aiSummary alanına kaydet.",
    },
  };
  const selected = stages[stage] ?? stages.hardware;
  return { title: selected.title, prompt: intro + selected.prompt };
}
// 2.0.8: "Kontrolleri sen seç, AI ayarlasın": the marks are already saved;
// the agent records each with the same status and a short explanation.
export function userChecksStage(
  game: Game,
  rows: {
    level: "minimum" | "recommended";
    component: string;
    status: "pass" | "fail" | "unknown";
  }[],
) {
  const level = { minimum: "Minimum", recommended: "Önerilen" };
  const list = rows
    .map(
      (r) =>
        `${level[r.level]} ${r.component}: ${r.status === "pass" ? "Geçti (pass)" : "Geçmedi (fail)"}`,
    )
    .join("; ");
  return {
    title: "Donanım (senin kararların)",
    prompt:
      `Oyun: ${game.name}; gameId: ${game.id}. AŞAMA: DONANIM (KULLANICI KARARI). Kullanıcı satırları kendisi işaretledi: ${list}. ` +
      "Her satırı record_compatibility ile bu durumla kaydet (contextKey: check_compatibility), reason alanına kısa Türkçe açıklama yaz. Kararı sorgulama, değiştirme; araştırma yapma.",
  };
}
