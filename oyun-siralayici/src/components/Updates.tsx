import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Gamepad2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "../lib/context";
import { Modal } from "./UI";
import { Markdown } from "./Chat";
import { RELEASE_NOTES } from "../../shared/release-notes";
import { compareVersions, type UpdateState } from "../../shared/update";
import oldMain from "../assets/compare/old-main.jpg";
import newMain from "../assets/compare/new-main.jpg";
import oldSystem from "../assets/compare/old-system.jpg";
import newSystem from "../assets/compare/new-system.jpg";
import oldSettings from "../assets/compare/old-settings.jpg";
import newSettings from "../assets/compare/new-settings.jpg";
// Top-right status: "Şimdi oynanıyor", the green update tick, the download
// percentage and "Güncelleme indirildi". Plus the update and "Yenilikler" dialogs.
const mb = (n?: number) =>
  n ? (n / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " MB" : "";
const rate = (n?: number) =>
  n
    ? (n / 1048576).toLocaleString("tr-TR", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }) + " MB/sn"
    : "";
// An update is known to exist (so a failure must stay visible).
const pending = (u?: UpdateState) =>
  !!u?.latest && compareVersions(u.latest, u.current) > 0;
export function StatusArea() {
  const { data, modal, run, setActive, toast } = useApp();
  const u: UpdateState | undefined = data.update;
  const playing = data.nowPlaying;
  // "Şimdi oynanıyor" slides in, stays a few seconds, then shrinks to an icon
  // (hover shows the name again).
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    setCompact(false);
    if (!playing) return;
    const t = setTimeout(() => setCompact(true), 6000);
    return () => clearTimeout(t);
  }, [playing?.startedAt, playing?.name]);
  return (
    <div className="status-area">
      {playing && (
        <button
          key={playing.startedAt}
          className={
            "now-playing " +
            (playing.foreground ? "" : "dim ") +
            (compact ? "compact" : "")
          }
          title={playing.foreground ? "Oyun açık ve önde" : "Oyun arka planda"}
          onClick={() => playing.gameId && setActive(playing.gameId)}
        >
          <Gamepad2 size={14} />
          <span>
            <small>Şimdi oynanıyor</small>
            <b>{playing.name}</b>
          </span>
        </button>
      )}
      {u?.status === "available" && (
        <button
          className="update-tick"
          onClick={() => modal("update")}
          title={`Sürüm ${u.latest} hazır`}
          aria-label={`Yeni sürüm ${u.latest}`}
        >
          <Check size={15} strokeWidth={3} />
          <span>{u.latest}</span>
        </button>
      )}
      {u?.status === "downloading" && u.phase !== "verify" && (
        <button
          className="update-progress"
          onClick={() => modal("update")}
          aria-label="Güncelleme indiriliyor"
          title={rate(u.speed) ? `İndiriliyor · ${rate(u.speed)}` : "İndiriliyor"}
        >
          <svg viewBox="0 0 36 36" width="22" height="22">
            <circle cx="18" cy="18" r="15" />
            <circle
              cx="18"
              cy="18"
              r="15"
              strokeDasharray={`${Math.round((u.progress || 0) * 94)} 94`}
            />
          </svg>
          <span>%{Math.floor((u.progress || 0) * 100)}</span>
        </button>
      )}
      {u?.status === "downloading" && u.phase === "verify" && (
        <button
          className="update-progress"
          onClick={() => modal("update")}
          aria-label="Güncelleme doğrulanıyor"
        >
          <Loader2 size={14} className="spin" />
          <span>Doğrulanıyor…</span>
        </button>
      )}
      {u?.status === "error" && pending(u) && (
        <button
          className="update-error"
          onClick={() => modal("update")}
          title={u.error}
          aria-label="Güncelleme sorunu"
        >
          <TriangleAlert size={14} />
          Güncelleme sorunu
        </button>
      )}
      {u?.status === "ready" && (
        <button
          className="update-ready"
          onClick={async () => {
            try {
              await run("update", { action: "install" });
            } catch (e: any) {
              toast(e.message, true);
            }
          }}
          title={
            (u.note ? u.note + " " : "") +
            "Yeni sürüm açılır, bu pencere kapanır, eski EXE silinir."
          }
        >
          <RotateCcw size={14} />
          Güncelleme indirildi
        </button>
      )}
      {u?.status === "installing" && (
        <button
          className={u.note ? "update-error" : "update-ready"}
          onClick={() => modal("update")}
          title={u.note || "Yeni sürüm açılınca bu pencere kendiliğinden kapanır."}
        >
          {u.note ? <TriangleAlert size={14} /> : <Loader2 size={14} className="spin" />}
          {u.note ? "Yeni sürüm açılmadı" : "Yeni sürüm açılıyor…"}
        </button>
      )}
    </div>
  );
}
export function UpdateModal() {
  const { data, run, close } = useApp();
  const u: UpdateState = data.update;
  return (
    <Modal
      title={u.latest ? `Sürüm ${u.latest}` : "Güncellemeler"}
      subtitle={u.date ? `Yayın tarihi: ${u.date}` : `Şu anki sürüm: ${u.current}`}
      onClose={close}
      footer={
        <>
          <span className="tiny muted">İndirilen dosya SHA-256 ile doğrulanır.</span>
          <div className="footer-spacer" />
          <button onClick={close}>Kapat</button>
          {u.status === "available" && (
            <button
              className="primary"
              onClick={() => run("update", { action: "download" })}
            >
              <Download size={14} />
              İndir {mb(u.size) && `(${mb(u.size)})`}
            </button>
          )}
          {u.status === "downloading" && (
            <button onClick={() => run("update", { action: "cancel" })}>
              İndirmeyi durdur
            </button>
          )}
          {u.status === "ready" && (
            <button
              className="primary"
              onClick={() => run("update", { action: "install" })}
            >
              <RotateCcw size={14} />
              Yeniden başlat ve güncelle
            </button>
          )}
          {u.status === "error" && (
            <button
              className="primary"
              onClick={() => run("update", { action: pending(u) ? "download" : "check" })}
            >
              <RefreshCw size={14} />
              Yeniden dene
            </button>
          )}
        </>
      }
    >
      {u.status === "downloading" && (
        <div
          className="update-bar"
          role="progressbar"
          aria-valuenow={Math.round((u.progress || 0) * 100)}
        >
          <i style={{ width: `${(u.progress || 0) * 100}%` }} />
          <span>
            {u.phase === "verify"
              ? "Doğrulanıyor…"
              : `%${Math.floor((u.progress || 0) * 100)} · ${mb(u.received)} / ${mb(u.size)}${rate(u.speed) ? " · " + rate(u.speed) : ""}`}
          </span>
        </div>
      )}
      {u.status === "ready" && <p className="update-note">Yeni EXE hazır: {u.file}</p>}
      {(u.status === "ready" || u.status === "installing") && u.note && (
        <p className="update-note">{u.note}</p>
      )}
      {u.status === "installing" && !u.note && (
        <p className="update-note">
          Yeni sürüm açılıyor; açılınca bu pencere kendiliğinden kapanır.
        </p>
      )}
      {u.error && (
        <p className="update-note error">
          <TriangleAlert size={14} /> {u.error}
        </p>
      )}
      <div className="markdown release-notes">
        <Markdown text={u.notes || "Bu sürüm için not yok."} />
      </div>
    </Modal>
  );
}
const SHOTS = [
  ["Ana ekran", oldMain, newMain],
  ["Sistem gereksinimleri", oldSystem, newSystem],
  ["Ayarlar", oldSettings, newSettings],
] as const;
// Before/after: drag the line (or use the arrow keys) to compare 1.x and 2.0.
export function Compare({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const set = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      className="compare"
      ref={box}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX)}
    >
      <img src={after} alt={`${label} — 2.0`} draggable={false} />
      <div className="compare-before" style={{ width: `${pos}%` }}>
        <img src={before} alt={`${label} — eski sürüm`} draggable={false} />
      </div>
      <div
        className="compare-handle"
        style={{ left: `${pos}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Eski / yeni karşılaştırma"
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
        }}
      />
      <span className="compare-tag left">Eski</span>
      <span className="compare-tag right">2.0</span>
    </div>
  );
}
export function WhatsNewModal() {
  const { data, close } = useApp();
  const [shot, setShot] = useState(0);
  return (
    <Modal
      wide
      title={`Yenilikler · ${data.version}`}
      subtitle="Çizgiyi sürükleyerek eski ve yeni görünümü karşılaştır."
      onClose={close}
      footer={
        <>
          <div className="footer-spacer" />
          <button className="primary" onClick={close}>
            <Sparkles size={14} />
            Başlayalım
          </button>
        </>
      }
    >
      <div className="whats-new">
        <div className="whats-new-shots">
          <div className="segmented">
            {SHOTS.map(([label], i) => (
              <button
                key={label}
                className={shot === i ? "active" : ""}
                onClick={() => setShot(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <Compare
            key={shot}
            label={SHOTS[shot][0]}
            before={SHOTS[shot][1]}
            after={SHOTS[shot][2]}
          />
        </div>
        <div className="markdown release-notes">
          <Markdown text={RELEASE_NOTES} />
        </div>
      </div>
    </Modal>
  );
}
export function UpdatesSettings() {
  const { data, run, modal } = useApp();
  const u: UpdateState = data.update;
  const [auto, setAuto] = useState(data.state.settings.updateCheck);
  useEffect(
    () => setAuto(data.state.settings.updateCheck),
    [data.state.settings.updateCheck],
  );
  const text: Record<string, string> = {
    idle: "Henüz denetlenmedi.",
    checking: "Denetleniyor…",
    current: "Uygulama güncel.",
    available: `Sürüm ${u.latest} hazır.`,
    downloading:
      u.phase === "verify"
        ? "Doğrulanıyor…"
        : `İndiriliyor: %${Math.floor((u.progress || 0) * 100)}${rate(u.speed) ? " · " + rate(u.speed) : ""}`,
    ready: "Güncelleme indirildi; sağ üstteki düğmeyle yeniden başlat.",
    installing: u.note || "Yeni sürüm açılıyor…",
    error: u.error || "Denetlenemedi.",
  };
  return (
    <>
      <h3>Güncellemeler</h3>
      <div className="simple-row">
        <span>
          <b>Şu anki sürüm: {u.current}</b>
          <small className="muted"> · {text[u.status]}</small>
        </span>
        <button
          onClick={() => run("update", { action: "check" })}
          disabled={u.status === "checking" || u.status === "downloading"}
        >
          <RefreshCw size={14} />
          Şimdi denetle
        </button>
      </div>
      {["available", "ready", "downloading"].includes(u.status) && (
        <button className="primary" onClick={() => modal("update")}>
          Sürüm notları ve indirme
        </button>
      )}
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked);
            void run("settings", { patch: { updateCheck: e.target.checked } });
          }}
        />
        <span>
          <b>Yeni sürümü kendiliğinden denetle</b>
          <small className="muted">
            Açılışta ve 6 saatte bir. Yeni sürüm sağ üstte yeşil tikle görünür; indirme
            sana sorulur.
          </small>
        </span>
      </label>
      <p className="tiny muted">
        Yeni EXE masaüstüne iner ve SHA-256 ile doğrulanır. “Güncelleme indirildi”ye
        basınca uygulama kapanır, yeni sürüm açılır ve eski EXE silinir. Verilerin
        (kütüphane, sohbetler, ayarlar) Windows kullanıcı klasöründe durur; EXE değişince
        kaybolmaz.
      </p>
      <button onClick={() => modal("whatsNew")}>
        <Sparkles size={14} />
        Yenilikleri ve eski / yeni karşılaştırmasını göster
      </button>
      <h4>Bu sürümün notları</h4>
      <div className="markdown release-notes">
        <Markdown text={RELEASE_NOTES} />
      </div>
    </>
  );
}
