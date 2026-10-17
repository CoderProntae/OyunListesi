import type { Game, Hardware } from "./types";
import { assessGame } from "./analysis";

// Automatic research has two stages: hardware comparison and (optionally) the
// short summary. The research stages for official language + HowLongToBeat and
// for Turkish patches were removed in 1.0.12 and are not counted anywhere.
// HowLongToBeat times themselves are fetched by the catalog refresh (1.0.13),
// not by research, so research completion never waits for them.
export const allResearchStages = ["hardware", "summary"] as const;
export type ResearchStage = (typeof allResearchStages)[number];
// Completion is derived from the actual saved results, not model prose, a stale
// status flag or an unchecked stage counter. Re-evaluate on every continuation.
export function researchProgress(game: Game, hardware: Hardware, autoSummary: boolean) {
  const assessment = assessGame(game, hardware);
  const completed: Record<ResearchStage, boolean> = {
    hardware: assessment.complete,
    summary: !!game.aiSummary?.trim(),
  };
  // 2.0.4: the hardware stage exists only when system requirements are saved
  // (from the store or, 2.0.5, PCGamingWiki). Without them there is nothing to
  // compare, so no stage runs. 2.1.0: and only when the hardware data leaves a
  // CPU/GPU/OS row the app cannot decide itself; everything else is computed.
  const stages = allResearchStages.filter((stage) =>
    stage === "summary"
      ? autoSummary
      : assessment.requirements === "available" && assessment.aiRows > 0,
  );
  const pending = stages.filter((stage) => !completed[stage]);
  const missing = [...assessment.pending];
  if (autoSummary && !completed.summary) missing.push("oyun özeti");
  return { completed, stages, pending, missing, complete: pending.length === 0 };
}
// 2.0.8: a stopped, failed or incomplete research whose results are all
// saved (comparisons and, when on, the Turkish summary) counts as done.
export function researchStatus(game: Game, hardware: Hardware, autoSummary: boolean) {
  const status = game.research?.status;
  if (
    status &&
    ["cancelled", "error", "incomplete"].includes(status) &&
    researchProgress(game, hardware, autoSummary).complete
  )
    return "done" as const;
  return status;
}
// Whether a research run that starts now goes through the hardware stage
// (restart: every stage; continue: only the unfinished ones).
export function runsHardwareStage(
  game: Game,
  hardware: Hardware,
  autoSummary: boolean,
  restart: boolean,
) {
  const p = researchProgress(game, hardware, autoSummary);
  return (restart ? p.stages : p.pending).includes("hardware");
}
