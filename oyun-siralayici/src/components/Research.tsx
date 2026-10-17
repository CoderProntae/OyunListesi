import { decodeEntities } from "../../shared/format";
import { useMemo, useState } from "react";
import { Bot, Check, ListChecks, Search, SlidersHorizontal, X } from "lucide-react";
import { useApp } from "../lib/context";
import { Modal } from "./UI";
import { compatibility } from "../../shared/compatibility";
import { researchStatus, runsHardwareStage } from "../../shared/research-progress";
import { normalizeName } from "../../shared/domain";
import type { Game } from "../../shared/types";

// 2.0.8: manual research. When the run goes through the hardware stage, the
// user chooses first: "AI'ya bırak" or "Kontrolleri sen seç, AI ayarlasın"
// (Geçti / Geçmedi per requirement row; the agent then writes the
// explanations without questioning or researching). Automatic research never
// asks.
export const componentOrder = [
  "CPU",
  "GPU",
  "RAM",
  "Disk",
  "VRAM",
  "DirectX özellik düzeyi",
  "Vulkan",
  "İşletim sistemi",
];
type Scope = "game" | "selected" | "all";
type Level = "minimum" | "recommended";
type Mark = "pass" | "fail";
const levelLabel: Record<Level, string> = { minimum: "Minimum", recommended: "Önerilen" };
const ACTIVE = ["running", "queued", "waiting_model"];

// Starts a manual research; asks first when a hardware stage would run.
export function useManualResearch() {
  const { data, run, modal } = useApp();
  return (ids: string[], scope: Scope, restart = true) => {
    const s = data.state;
    const games = s.games.filter((g) => ids.includes(g.id));
    const asks = games.some((g) =>
      runsHardwareStage(g, s.hardware, s.settings.autoSummary, restart),
    );
    if (asks) return modal("researchChecks", { ids, scope, restart });
    return send(run, ids, scope, restart, {});
  };
}
function send(
  run: ReturnType<typeof useApp>["run"],
  ids: string[],
  scope: Scope,
  restart: boolean,
  extra: { checks?: "ai" | "user"; decisions?: Record<string, any[]> },
) {
  if (scope === "all")
    return run("researchAll", extra, "Bütün oyunlar yeniden AI araştırmasına alındı.");
  if (scope === "selected")
    return run(
      "researchSelected",
      { ids, ...extra },
      ids.length === 1
        ? "Oyun yeniden AI araştırmasına alındı."
        : `${ids.length} oyun yeniden AI araştırmasına alındı.`,
    );
  return run(
    "researchGame",
    { id: ids[0], restart, ...extra },
    "AI araştırması başlatıldı.",
  );
}
export function ResearchChecksModal({
  ids,
  scope,
  restart = true,
}: {
  ids: string[];
  scope: Scope;
  restart?: boolean;
}) {
  const { data, run, close } = useApp();
  const s = data.state;
  // The games whose run goes through the hardware stage, in list order.
  const games = useMemo(
    () =>
      s.games
        .filter(
          (g) =>
            ids.includes(g.id) &&
            runsHardwareStage(g, s.hardware, s.settings.autoSummary, restart),
        )
        .sort((a, b) => a.order - b.order),
    // The list is fixed when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  // gameId → "level|component" → mark; computed statuses are preselected.
  const [marks, setMarks] = useState<Record<string, Record<string, Mark>>>(() =>
    Object.fromEntries(
      games.map((g) => {
        const comp = compatibility(g, s.hardware);
        const entries: [string, Mark][] = [];
        for (const level of ["minimum", "recommended"] as const)
          for (const row of comp[level])
            if (row.status !== "unknown")
              entries.push([`${level}|${row.name}`, row.status]);
        return [g.id, Object.fromEntries(entries)];
      }),
    ),
  );
  const others = ids.length - games.length;
  const start = async (extra: Parameters<typeof send>[4]) => {
    setBusy(true);
    const r = await send(run, ids, scope, restart, extra);
    setBusy(false);
    if (r !== undefined) close();
  };
  if (!games.length) return null;
  if (step < 0)
    return (
      <Modal
        title="Donanım kontrolü"
        subtitle={
          games.length === 1 && ids.length === 1
            ? `“${games[0].name}” araştırmasında donanım aşaması var.`
            : `${games.length} oyunun araştırmasında donanım aşaması var.`
        }
        onClose={close}
        footer={<button onClick={close}>Vazgeç</button>}
      >
        <div className="choice-cards" data-testid="research-checks-choice">
          <button
            className="choice-card"
            disabled={busy}
            onClick={() => void start({ checks: "ai" })}
          >
            <Bot size={20} />
            <span>
              <strong>AI'ya bırak</strong>
              <small>
                AI, sistem gereksinimlerini bilgisayarınla karşılaştırır; emin olamadığı
                satırları internette araştırır.
              </small>
            </span>
          </button>
          <button className="choice-card" disabled={busy} onClick={() => setStep(0)}>
            <SlidersHorizontal size={20} />
            <span>
              <strong>Kontrolleri sen seç, AI ayarlasın</strong>
              <small>
                Her satırı Geçti ya da Geçmedi olarak işaretlersin. AI bunları
                sorgulamadan ve araştırmadan, açıklamalarıyla kaydeder.
              </small>
            </span>
          </button>
        </div>
        {others > 0 && (
          <p className="tiny muted">
            Seçimdeki diğer {others} oyunda donanım aşaması yok; onlar doğrudan
            araştırılır.
          </p>
        )}
      </Modal>
    );
  const game = games[step];
  const comp = compatibility(game, s.hardware);
  const levels = (["minimum", "recommended"] as const).filter((l) => comp[l].length);
  const names = componentOrder.filter((name) =>
    levels.some((l) => comp[l].some((r) => r.name === name)),
  );
  const keys = levels.flatMap((l) => comp[l].map((r) => `${l}|${r.name}`));
  const own = marks[game.id] || {};
  const ready = keys.every((k) => own[k]);
  const set = (key: string, mark: Mark) =>
    setMarks((m) => ({ ...m, [game.id]: { ...m[game.id], [key]: mark } }));
  const all = (mark: Mark) =>
    setMarks((m) => ({
      ...m,
      [game.id]: Object.fromEntries(keys.map((k) => [k, mark])),
    }));
  const last = step === games.length - 1;
  const decisions = () =>
    Object.fromEntries(
      games.map((g) => [
        g.id,
        Object.entries(marks[g.id] || {}).map(([key, status]) => {
          const [level, component] = key.split("|");
          return { level, component, status };
        }),
      ]),
    );
  return (
    <Modal
      wide
      title="Kontrolleri sen seç"
      subtitle={
        game.name + (games.length > 1 ? ` · Oyun ${step + 1}/${games.length}` : "")
      }
      onClose={close}
      footer={
        <>
          <button onClick={() => setStep(step - 1)} disabled={busy}>
            Geri
          </button>
          <div className="footer-spacer" />
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!ready || busy}
            title={ready ? undefined : "Her satırı Geçti ya da Geçmedi olarak işaretle."}
            onClick={() =>
              last
                ? void start({ checks: "user", decisions: decisions() })
                : setStep(step + 1)
            }
          >
            {last ? "Araştırmayı başlat" : "Sonraki oyun"}
          </button>
        </>
      }
    >
      <div className="checks-head">
        <p className="tiny muted">
          Uygulamanın hesaplayabildiği satırlar önceden işaretli; istediğini değiştir. AI
          kararlarını değiştirmez, yalnızca açıklamasını yazar.
        </p>
        <div>
          <button className="soft" onClick={() => all("pass")}>
            <Check size={13} /> Hepsi Geçti
          </button>
          <button className="soft" onClick={() => all("fail")}>
            <X size={13} /> Hepsi Geçmedi
          </button>
        </div>
      </div>
      <div className="comparison-scroll">
        <table className="comparison-table checks-table" data-testid="checks-table">
          <thead>
            <tr>
              <th scope="col">Bileşen</th>
              <th scope="col">Bilgisayarın</th>
              {levels.map((l) => (
                <th scope="col" key={l}>
                  {levelLabel[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const cells = levels.map((l) => comp[l].find((r) => r.name === name));
              return (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{cells.find(Boolean)!.actual}</td>
                  {cells.map((c, j) => {
                    if (!c)
                      return (
                        <td key={j}>
                          <span className="requirement-value empty">—</span>
                        </td>
                      );
                    const key = `${levels[j]}|${name}`;
                    const value = own[key];
                    return (
                      <td key={j}>
                        <span className="check-required">
                          {decodeEntities(c.required)}
                        </span>
                        <span
                          className="mark-toggle"
                          role="radiogroup"
                          aria-label={`${levelLabel[levels[j]]} ${name}`}
                        >
                          <button
                            role="radio"
                            aria-checked={value === "pass"}
                            className={value === "pass" ? "on pass" : ""}
                            onClick={() => set(key, "pass")}
                          >
                            Geçti
                          </button>
                          <button
                            role="radio"
                            aria-checked={value === "fail"}
                            className={value === "fail" ? "on fail" : ""}
                            onClick={() => set(key, "fail")}
                          >
                            Geçmedi
                          </button>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
// Statistics → "Seçtiğim oyunları yeniden araştır".
export function ResearchPickModal() {
  const { data, close } = useApp();
  const start = useManualResearch();
  const s = data.state;
  const games = useMemo(() => [...s.games].sort((a, b) => a.order - b.order), [s.games]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const q = normalizeName(query);
  const shown = q ? games.filter((g) => normalizeName(g.name).includes(q)) : games;
  const free = (g: Game) => !ACTIVE.includes(g.research?.status || "");
  const selectable = shown.filter(free);
  const allOn = selectable.length > 0 && selectable.every((g) => picked.includes(g.id));
  const label = (g: Game) => {
    const st = researchStatus(g, s.hardware, s.settings.autoSummary);
    return !st
      ? "Araştırılmadı"
      : {
          queued: "Sırada",
          waiting_model: "Model bekliyor",
          running: "Araştırılıyor",
          done: "Tamamlandı",
          incomplete: "Eksik",
          error: "Tamamlanamadı",
          cancelled: "Durduruldu",
        }[st];
  };
  return (
    <Modal
      title="Oyunları yeniden araştır"
      subtitle="Yeniden araştırılacak oyunları işaretle. Kaydedilmiş sonuçlar yeni araştırma bitene kadar korunur."
      onClose={close}
      footer={
        <>
          <div className="footer-spacer" />
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!picked.length}
            onClick={() => void start(picked, "selected", true)}
          >
            Yeniden araştır{picked.length ? ` (${picked.length})` : ""}
          </button>
        </>
      }
    >
      <div className="research-pick">
        <div className="research-pick-head">
          <label className="search-field">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Oyun ara"
              aria-label="Yeniden araştırılacak oyunu ara"
            />
          </label>
          <button
            className="soft"
            disabled={!selectable.length}
            onClick={() =>
              setPicked((p) =>
                allOn
                  ? p.filter((id) => !selectable.some((g) => g.id === id))
                  : [...new Set([...p, ...selectable.map((g) => g.id)])],
              )
            }
          >
            <ListChecks size={13} /> {allOn ? "Seçimi kaldır" : "Tümünü seç"}
          </button>
        </div>
        <div
          className="research-pick-list"
          role="group"
          aria-label="Yeniden araştırılacak oyunlar"
        >
          {shown.map((g) => (
            <label key={g.id} className={"research-pick-row" + (free(g) ? "" : " busy")}>
              <input
                type="checkbox"
                disabled={!free(g)}
                checked={picked.includes(g.id)}
                onChange={() =>
                  setPicked((p) =>
                    p.includes(g.id) ? p.filter((id) => id !== g.id) : [...p, g.id],
                  )
                }
              />
              <span>{g.name}</span>
              <small>{label(g)}</small>
            </label>
          ))}
          {!shown.length && <p className="tiny muted">Oyun bulunamadı.</p>}
        </div>
      </div>
    </Modal>
  );
}
