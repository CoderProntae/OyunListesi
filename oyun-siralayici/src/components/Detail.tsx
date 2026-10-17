import { assessGame } from "../../shared/analysis";
import { isStoreProductLink } from "../../shared/links";
import { StoreCards, PlayTimes } from "./Catalogs";
import { Markdown } from "./Chat";
import { NOTE_MAX_LENGTH } from "../../shared/domain";
import { decodeEntities, formatNumber, platformLabel } from "../../shared/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Loader2,
  ArrowUpRight,
  Plus,
  Gamepad2,
  Layers,
  ArrowRight,
  Clock3,
  Check,
  Globe2,
  Monitor,
  RefreshCw,
  MoreHorizontal,
  FolderInput,
  Star,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Info,
  Database,
  NotebookPen,
  Play,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Link2,
  Shuffle,
  Upload,
  Command,
  CheckCircle2,
  Activity,
  HardDrive,
  LockKeyhole,
  LibraryBig,
  Cpu,
} from "lucide-react";
import { useApp } from "../lib/context";
import { formatDateTR } from "../../shared/titles";
import { componentOrder, useManualResearch } from "./Research";
import { researchProgress, researchStatus } from "../../shared/research-progress";
const playedText = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`
    : `${Math.max(1, Math.round(m))} dk`;
import { Cover, CompatDot, IconButton, Spinner } from "./UI";
import { api, date, external, media } from "../lib/api";
import { compatibility } from "../../shared/compatibility";
import { hardwareDataInfo } from "../../shared/hardware-match";
import {
  statusLabels,
  compatLabels,
  type Game,
  type ComponentCheck,
} from "../../shared/types";
export function Statistics() {
  const { data, setActive, modal, setSelected, run } = useApp();
  const research = useManualResearch();
  const games = data.state.games;
  const genres = Object.entries(
    games
      .flatMap((g) => g.genres)
      .reduce<Record<string, number>>((o, g) => ((o[g] = (o[g] || 0) + 1), o), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const comp = games.map((g) => compatibility(g, data.state.hardware).status);
  return (
    <main className="dashboard content-scroll">
      <span className="eyebrow">KOLEKSİYON RAPORUN</span>
      <h1>İstatistikler</h1>
      <div className="button-row stats-actions">
        <button onClick={() => modal("import")}>
          <Upload size={15} />
          Liste aktar
        </button>
        <button onClick={() => modal("mood")}>
          <Sparkles size={15} />
          Ne oynasam?
        </button>
        <button
          disabled={!games.length}
          onClick={() => {
            const unfinished = games.filter((g) => g.status !== "finished");
            const pool = unfinished.length ? unfinished : games;
            const g = pool[Math.floor(Math.random() * pool.length)];
            setActive(g.id);
            setSelected([g.id]);
          }}
        >
          Rastgele oyun
        </button>
      </div>
      <div className="research-strip" role="status" aria-label="Toplu AI araştırması">
        <span>AI araştırması</span>
        <small>
          {games.filter((g) => g.research?.status === "running").length} çalışıyor ·{" "}
          {
            games.filter(
              (g) =>
                g.research && ["queued", "waiting_model"].includes(g.research.status),
            ).length
          }{" "}
          sırada / model bekliyor
        </small>
        <div className="research-strip-actions">
          <button
            disabled={
              !games.length ||
              games.some(
                (g) =>
                  g.research &&
                  ["running", "queued", "waiting_model"].includes(g.research.status),
              )
            }
            onClick={() =>
              void research(
                games.map((g) => g.id),
                "all",
              )
            }
          >
            Tüm oyunları yeniden araştır
          </button>
          {/* 2.0.8: completed research is no longer on the game page; a
              finished game is researched again from here. */}
          <button disabled={!games.length} onClick={() => modal("researchPick")}>
            Seçtiğim oyunları yeniden araştır
          </button>
          {games.some(
            (g) =>
              g.research &&
              ["running", "queued", "waiting_model"].includes(g.research.status),
          ) && <button onClick={() => run("stopResearch")}>Araştırmayı durdur</button>}
        </div>
      </div>
      <p className="muted">Yalnızca kütüphanendeki mevcut verilerden hesaplanır.</p>
      <div className="stats-row">
        <div>
          <span>Toplam oyun</span>
          <strong>{games.length}</strong>
        </div>
        <div>
          <span>Tamamlama oranı</span>
          <strong>
            %
            {games.length
              ? Math.round(
                  (100 * games.filter((g) => g.status === "finished").length) /
                    games.length,
                )
              : 0}
          </strong>
        </div>
        <div>
          <span>Kayıtlı oynama</span>
          <strong>
            {formatNumber(
              games.reduce((a, g) => a + (g.playHours || 0), 0),
              1,
              false,
            )}
            <small>saat</small>
          </strong>
        </div>
      </div>
      <section className="detail-section">
        <h3>Oyun türlerin</h3>
        {genres.length ? (
          genres.map(([name, count]) => (
            <div className="chart-row" key={name}>
              <span>{name}</span>
              <div>
                <i style={{ width: `${(count / genres[0][1]) * 100}%` }} />
              </div>
              <b>{count}</b>
            </div>
          ))
        ) : (
          <p className="muted">
            Tür grafiği, oyun bilgileri toplandığında burada oluşacak.
          </p>
        )}
      </section>
      <section className="detail-section">
        <h3>Donanım eşleşmesi</h3>
        <div className="compat-stats">
          {Object.entries(compatLabels).map(([k, label]) => (
            <div key={k}>
              <CompatDot status={k as any} />
              <span>{label}</span>
              <b>{comp.filter((x) => x === k).length}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h3>Durum dağılımı</h3>
        {Object.entries(statusLabels).map(([k, label]) => (
          <div className="simple-row" key={k}>
            <span>{label}</span>
            <b>{games.filter((x) => x.status === k).length}</b>
          </div>
        ))}
      </section>
    </main>
  );
}
export default function Detail({ game: g }: { game: Game }) {
  const { data, run, modal, mention, toast, setChatOpen } = useApp();
  const [tab, setTab] = useState("overview"),
    [summaryBusy, setSummaryBusy] = useState(false);
  const comp = useMemo(
    () => compatibility(g, data.state.hardware),
    [g, data.state.hardware],
  );
  // No store requirements: nothing to verify, so no "Doğrulama gerekiyor".
  const noRequirements = !comp.minimum.length && !comp.recommended.length;
  const safeScreenshot = (s: string) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" &&
        /(^|\.)(steamstatic\.com|steamcdn-a\.akamaihd\.net|steamusercontent\.com|gog-statics\.com|cdn1\.epicgames\.com|cdn2\.unrealengine\.com|store-images\.s-microsoft\.com|myabandonware\.com)$/.test(
          u.hostname,
        )
        ? s
        : undefined;
    } catch {
      return undefined;
    }
  };
  const summary = async () => {
    setSummaryBusy(true);
    await run("summary", { id: g.id }, "Türkçe AI özeti kaydedildi");
    setSummaryBusy(false);
  };
  return (
    <main className="game-detail content-scroll">
      <div
        className="detail-hero"
        style={
          media(g.hero || g.cover)
            ? {
                backgroundImage: `linear-gradient(0deg,var(--bg) 0%,transparent 100%),url("${media(g.hero || g.cover)}")`,
              }
            : undefined
        }
      >
        <div className="hero-noise" />
        <div className="hero-nav">
          <span>
            <Gamepad2 size={13} />
            KÜTÜPHANENDEN
          </span>
          <div>
            <IconButton
              label="Verileri yenile"
              onClick={() =>
                run("refresh", { ids: [g.id], force: true }, "Yenileme kuyruğuna eklendi")
              }
            >
              <RefreshCw size={16} />
            </IconButton>
            <IconButton
              label="Oyun işlemleri"
              onClick={() => modal("batch", { ids: [g.id] })}
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </div>
        </div>
        <div className="hero-heading">
          <Cover name={g.name} cover={g.cover} className="detail-cover" />
          <div>
            <div className="hero-tags">
              <span title={g.releaseDate ? "Çıkış tarihi" : undefined}>
                {formatDateTR(g.releaseDate) || g.year || "Yıl bilinmiyor"}
              </span>
              {g.genres.slice(0, 3).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            {/* Long names get a smaller font and at most three lines, so the title
                never runs under the refresh / more buttons; full name in the tooltip. */}
            <h1 title={g.name} className={g.name.length > 48 ? "long-title" : undefined}>
              {g.name}
            </h1>
            <p>{g.developers.join(" · ") || "Geliştirici bilgisi henüz alınmadı"}</p>
            {data.state.playtime?.[g.id]?.minutes ? (
              <p
                className="played-here"
                title="Oyun tanımlayıcının bu bilgisayarda ölçtüğü süre"
              >
                Bu bilgisayarda {playedText(data.state.playtime[g.id].minutes)} oynandı ·{" "}
                {data.state.playtime[g.id].sessions} oturum
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-actions">
          <button onClick={() => modal("move", { ids: [g.id] })}>
            <FolderInput size={15} />
            Gruba taşı
          </button>
          <IconButton label="AI sohbetine ekle" onClick={() => mention(g)}>
            <Sparkles size={17} />
          </IconButton>
          <select
            aria-label="Oyun durumu"
            value={g.status}
            onChange={(e) => run("edit", { id: g.id, patch: { status: e.target.value } })}
          >
            {Object.entries(statusLabels).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {g.fetchStatus === "review" && !!g.candidates?.length && (
          <details className="match-review">
            <summary>
              <AlertCircle size={15} />
              Steam eşleşmesi bekliyor <ChevronDown size={13} />
            </summary>
            <div className="match-review-body">
              <strong>Eşleşmeyi sen doğrula</strong>
              <p>{g.fetchError}</p>
              <div className="candidate-list">
                {g.candidates?.map((c) => (
                  <button
                    key={c.appId}
                    onClick={() =>
                      run("match", { id: g.id, appId: c.appId }, "Eşleştirme onaylandı")
                    }
                  >
                    <span>{c.name}</span>
                    <small>Steam #{c.appId}</small>
                    <Check size={14} />
                  </button>
                ))}
              </div>
              {!g.candidates?.length && (
                <button onClick={() => modal("match", { game: g })}>
                  Steam kimliğiyle eşleştir
                </button>
              )}
            </div>
          </details>
        )}
        {g.fetchStatus === "error" && (
          <div className="notice-box error">
            <AlertCircle size={18} />
            <div>
              <strong>Bilgiler alınamadı</strong>
              <p>{g.fetchError}</p>
              <button onClick={() => run("refresh", { ids: [g.id], force: true })}>
                Yeniden dene
              </button>
            </div>
          </div>
        )}
        {["loading", "queued"].includes(g.fetchStatus) && (
          <div className="fetch-banner">
            <Spinner text="Kaynaklar araştırılıyor. Kütüphaneni kullanmaya devam edebilirsin." />
          </div>
        )}
        <ResearchBar game={g} />
        <div className="detail-tabs" role="tablist" aria-label="Oyun ayrıntıları">
          {[
            ["overview", "Genel bakış"],
            ["stores", "Mağazalar"],
            ["system", "Sistem"],
            ["note", "Not"],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "system" && <span className={"tiny-dot " + comp.status} />}
              {tab === id && <motion.i layoutId="detail-tab-line" className="tab-line" />}
            </button>
          ))}
        </div>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "overview" && (
            <>
              <div className="ai-summary">
                <div className="summary-heading">
                  <span>
                    <Sparkles size={15} />
                    BİRKAÇ CÜMLEDE
                  </span>
                  <span className="badge">Yerel AI özeti</span>
                </div>
                {g.aiSummary ? (
                  // Models often answer in Markdown; show it formatted, never as raw ## / **.
                  <div className="markdown ai-summary-text">
                    <Markdown text={g.aiSummary} />
                  </div>
                ) : (
                  <p>Seçtiğin yerel modelle kısa bir Türkçe özet oluştur.</p>
                )}
                {g.aiSummary && (
                  <small>
                    {g.aiSummaryModel} · {date(g.aiSummaryAt)} · AI üretimi; resmi
                    açıklamayı kontrol et.
                  </small>
                )}
                <button className="text-link" disabled={summaryBusy} onClick={summary}>
                  {summaryBusy ? (
                    <Spinner text="Özetleniyor…" />
                  ) : (
                    <>
                      <Sparkles size={13} />
                      {g.aiSummary ? "Özeti yeniden oluştur" : "Türkçe özet oluştur"}
                    </>
                  )}
                </button>
              </div>
              <div className="info-grid">
                <button onClick={() => setTab("system")}>
                  <CompatDot status={comp.status} title={comp.label} label={comp.label} large />
                  <span>
                    <small>SİSTEM UYUMU</small>
                    <strong>{comp.label}</strong>
                  </span>
                  <ChevronRight size={15} />
                </button>
              </div>
              <section className="detail-section">
                <div className="section-title">
                  <h3>Oyun hakkında</h3>
                  <span>
                    {g.aiEditedFields?.includes("description") ||
                    g.sources.some(
                      (s) => s.kind === "agent" && s.fields?.includes("description"),
                    )
                      ? "AI tarafından kaydedildi"
                      : g.origin?.store === "My Abandonware"
                        ? "My Abandonware açıklaması"
                        : g.sources.some((s) => s.kind === "official")
                          ? "Mağaza açıklaması"
                          : g.storeChecks?.some(
                                (s) => s.store === "Epic Games" && s.status === "found",
                              )
                            ? "EGData katalog açıklaması"
                            : "Kayıtlı bilgi"}
                  </span>
                </div>
                <p className="description">
                  {g.description ||
                    "Açıklama henüz alınmadı. Mağazalar sekmesinden kaynak durumunu görebilir veya bilgileri yenileyebilirsin."}
                </p>
                <div className="metadata-grid">
                  <div>
                    <small>GELİŞTİRİCİ</small>
                    <span>{g.developers.join(", ") || "Bilinmiyor"}</span>
                  </div>
                  <div>
                    <small>YAYINCI</small>
                    <span>{g.publishers.join(", ") || "Bilinmiyor"}</span>
                  </div>
                  <div>
                    <small>PLATFORMLAR</small>
                    <span>
                      {g.platforms.map(platformLabel).join(" / ") || "Bilinmiyor"}
                    </span>
                  </div>
                  <div>
                    <small>STEAM / METACRITIC</small>
                    <span>
                      {g.steamScore !== undefined ? "%" + g.steamScore : "—"} /{" "}
                      {g.metacritic ??
                        (g.metacriticNoScore ? (
                          <button
                            className="text-link no-score"
                            title="Metacritic bu oyunu listeliyor ama eleştirmen puanı yok (yeterli inceleme yok). Sayfayı açmak için tıkla."
                            onClick={() => external(g.metacriticNoScore!.url)}
                          >
                            puan yok
                          </button>
                        ) : (
                          "—"
                        ))}
                    </span>
                  </div>
                </div>
                {g.steamReviewCount && (
                  <small className="muted">
                    Steam değerlendirmesi {g.steamReviewCount.toLocaleString("tr-TR")}{" "}
                    yorumdan hesaplandı.
                  </small>
                )}
              </section>
              <PlayTimes game={g} />
              <section className="detail-section">
                <div className="section-title">
                  <h3>Oynanış & benzer dünyalar</h3>
                  <button
                    className="text-link"
                    onClick={() => {
                      mention(g);
                      toast("Oyunu sohbete ekledim. Benzer oyunlar isteyebilirsin.");
                    }}
                  >
                    AI ile keşfet
                    <Sparkles size={13} />
                  </button>
                </div>
                <div className="research-links">
                  {g.trailer && (
                    <button onClick={() => external(g.trailer!)}>
                      Fragmanı aç
                      <Play size={14} />
                    </button>
                  )}
                </div>
                {g.screenshots.length > 0 && (
                  <div className="screenshots">
                    {g.screenshots.slice(0, 6).map((src, i) => (
                      <button
                        key={i}
                        onClick={() => external(src)}
                        aria-label={`Ekran görüntüsü ${i + 1}`}
                      >
                        <img
                          src={safeScreenshot(src)}
                          loading="lazy"
                          alt={`${g.name} ekran görüntüsü ${i + 1}`}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="similar-list">
                  {data.state.games
                    .filter(
                      (x) => x.id !== g.id && x.genres.some((t) => g.genres.includes(t)),
                    )
                    .slice(0, 4)
                    .map((x) => (
                      <Similar key={x.id} game={x} />
                    ))}
                </div>
              </section>
            </>
          )}
          {tab === "stores" && (
            <>
              <div className="button-row">
                <button onClick={() => modal("match", { game: g })}>
                  Steam oyununu seç
                </button>
                <button onClick={() => run("refresh", { ids: [g.id], force: true })}>
                  Mağazaları yenile
                </button>
              </div>
              <StoreCards game={g} />
            </>
          )}
          {tab === "system" && (
            <>
              {(!noRequirements || comp.userVerdict) && (
                <>
                  <div
                    className={"compat-summary " + comp.status}
                    data-testid="compat-summary"
                  >
                    <CompatDot status={comp.status} title={comp.label} label={comp.label} large />
                    <div>
                      <strong>{comp.label}</strong>
                      <p>{comp.summary}</p>
                    </div>
                  </div>
                  <p className="tiny muted">
                    Yaklaşık donanım karşılaştırmasıdır; FPS garantisi değildir.
                  </p>
                  <div className="tiny muted" role="status" data-testid="analysis-status">
                    {assessGame(g, data.state.hardware).summary}
                  </div>
                </>
              )}
              <RequirementTable game={g} comp={comp} />
              {noRequirements && (
                <div className="req-verdict" data-testid="req-verdict">
                  <p className="tiny muted">
                    Bu oyun için kayıtlı sistem gereksinimi yok, bu yüzden karşılaştırma
                    yapılamıyor. Durumu kendin işaretleyebilirsin; kararın oyunun durum
                    noktasını, sıralamasını ve istatistiklerini de değiştirir. Donanım
                    karşılaştırması üretmez.
                  </p>
                  <div className="button-row" role="group" aria-label="Gereksinim kararı">
                    {(
                      [
                        ["meets", "Karşılıyor"],
                        ["fails", "Karşılamıyor"],
                        ["unknown", "Bilinmiyor"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        className={g.reqVerdict === v ? "primary" : ""}
                        data-testid={"verdict-" + v}
                        onClick={() =>
                          run(
                            "edit",
                            { id: g.id, patch: { reqVerdict: v } },
                            "Kararın kaydedildi",
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {comp.suggestedGroups.length > 0 && (
                <div className="suggested-groups">
                  <h4>Önerilen neden grubu</h4>
                  {comp.suggestedGroups.map((name) => (
                    <button
                      key={name}
                      onClick={async () => {
                        let group = data.state.groups.find((x) => x.name === name);
                        if (!group)
                          group = await run("group", {
                            action: "create",
                            name,
                            color: "#e5ae88",
                            icon: "alert",
                          });
                        if (group)
                          await run(
                            "moveGroup",
                            { ids: [g.id], groupId: group.id },
                            "Neden grubuna taşındı",
                          );
                      }}
                    >
                      {name}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "note" && <NotePanel key={g.id} game={g} />}
        </motion.div>
        <div className="detail-bottom">
          <Database size={12} />
          Yerel önbellek<span>·</span>
          {date(g.updatedAt)}
        </div>
      </div>
    </main>
  );
}
const noteTime = (s: string) =>
  new Date(s).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
// The personal note is UI-only: it is saved with the dedicated "note" call and is
// never placed in game records, chat context, agent tools or research prompts.
function NotePanel({ game }: { game: Game }) {
  const { data } = useApp();
  const stored = data.state.notes?.[game.id];
  const [text, setText] = useState(stored?.text || ""),
    [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved"),
    [error, setError] = useState("");
  const latest = useRef(stored?.text || ""),
    saved = useRef(stored?.text || ""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    queue = useRef<Promise<void>>(Promise.resolve()),
    mounted = useRef(true);
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Saves run one after another, so an older text can never overwrite a newer one.
    queue.current = queue.current.then(async () => {
      const value = latest.current;
      if (value === saved.current) {
        if (mounted.current) setStatus("saved");
        return;
      }
      if (mounted.current) setStatus("saving");
      try {
        await api.call("note", { id: game.id, text: value });
        saved.current = value;
        if (mounted.current) {
          setError("");
          setStatus(latest.current === value ? "saved" : "dirty");
        }
      } catch (e: any) {
        if (mounted.current) {
          setError(e?.message || "Not kaydedilemedi.");
          setStatus("error");
        }
      }
    });
    return queue.current;
  }, [game.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flush();
    };
  }, [flush]);
  useEffect(() => {
    // Restore/import while the tab is open: adopt the new saved text only when
    // the user has no unsaved typing.
    const incoming = stored?.text || "";
    if (incoming !== saved.current && latest.current === saved.current) {
      saved.current = incoming;
      latest.current = incoming;
      setText(incoming);
      setStatus("saved");
    }
  }, [stored?.text]);
  const change = (value: string) => {
    latest.current = value;
    setText(value);
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };
  return (
    <section className="detail-section note-section" aria-label="Kişisel not">
      <div className="section-title">
        <h3>
          <NotebookPen size={16} /> Notun
        </h3>
        <span className={"note-status " + status} role="status" aria-live="polite">
          {status === "saving"
            ? "Kaydediliyor…"
            : status === "dirty"
              ? "Yazılıyor…"
              : status === "error"
                ? "Kaydedilemedi"
                : stored
                  ? "Kaydedildi · " + noteTime(stored.updatedAt)
                  : "Henüz not yok"}
        </span>
      </div>
      <textarea
        aria-label="Oyun notu"
        className="note-input"
        rows={9}
        maxLength={NOTE_MAX_LENGTH}
        value={text}
        placeholder="Bu oyunla ilgili notunu yaz…"
        onChange={(e) => change(e.target.value)}
        onBlur={() => void flush()}
      />
      {status === "error" && (
        <div className="notice-box error note-error">
          <AlertCircle size={16} />
          <div>
            <p>{error}</p>
            <button onClick={() => void flush()}>Tekrar dene</button>
          </div>
        </div>
      )}
      <div className="note-footer">
        <small>
          <LockKeyhole size={13} />
          Yalnızca bu bilgisayardaki uygulama verisinde saklanır. AI ajanı bu notu göremez
          ve değiştiremez; sohbete veya araştırmaya gönderilmez.
        </small>
        <small className="note-count">
          {text.length.toLocaleString("tr-TR")} /{" "}
          {NOTE_MAX_LENGTH.toLocaleString("tr-TR")}
        </small>
      </div>
    </section>
  );
}
// Only what the store publishes (1.0.16): a level without values has no
// column, a component no level lists has no row, and a game without store
// requirements shows one plain sentence instead of an empty table.
function RequirementTable({
  game: g,
  comp,
}: {
  game: Game;
  comp: ReturnType<typeof compatibility>;
}) {
  const levels = (
    [
      ["Minimum", comp.minimum],
      ["Önerilen", comp.recommended],
    ] as const
  ).filter(([, rows]) => rows.length > 0);
  const names = componentOrder.filter((name) =>
    levels.some(([, rows]) => rows.some((r) => r.name === name)),
  );
  const source = g.requirementSource;
  const wiki = source?.store === "PCGamingWiki";
  // 2.1.0: the CPU/GPU explanations are shown, not only as a tooltip.
  const notes = levels.flatMap(([label, rows]) =>
    rows
      .filter((r) => (r.name === "CPU" || r.name === "GPU") && r.reason)
      .map((row) => ({ label, row })),
  );
  const usesData = levels.some(([, rows]) => rows.some((r) => r.db));
  // 2.0.5: what PCGamingWiki said when the store had nothing.
  const wikiNote =
    g.pcgw?.status === "not_found"
      ? g.pcgw.message || "PCGamingWiki'de de bulunamadı."
      : g.pcgw?.status === "unavailable"
        ? "PCGamingWiki'ye ulaşılamadı; bir sonraki yenilemede yeniden denenecek."
        : "";
  if (!names.length)
    return (
      <div className="notice-box requirement-none" data-testid="requirements-none">
        <Info size={18} />
        <div>
          <strong>Sistem gereksinimleri belirtilmemiş.</strong>
          <p>
            {g.origin?.store === "none"
              ? "Oyun platform seçilmeden eklendi; mağaza bilgisi yok."
              : g.origin?.store === "My Abandonware"
                ? "My Abandonware sayfaları sistem gereksinimi yayımlamıyor."
                : source && !wiki
                  ? `${source.store} sayfasında bu oyun için sistem gereksinimi yok.`
                  : "Oyun bir mağazada bulunamadı ya da mağaza gereksinim yayımlamamış."}
            {wikiNote && " " + wikiNote}
          </p>
        </div>
      </div>
    );
  return (
    <>
      <div className="comparison-scroll">
        <table className="comparison-table" data-testid="requirements-table">
          <thead>
            <tr>
              <th scope="col" role="columnheader">
                Bileşen
              </th>
              <th scope="col" role="columnheader">
                Bilgisayarın
              </th>
              {levels.map(([label]) => (
                <th scope="col" role="columnheader" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const cells = levels.map(([, rows]) => rows.find((r) => r.name === name));
              const actual = cells.find(Boolean)!.actual;
              return (
                <tr key={name}>
                  <th scope="row" role="rowheader">
                    {name}
                  </th>
                  <td>{actual}</td>
                  {cells.map((c, j) =>
                    c ? (
                      <td key={j} title={c.reason}>
                        <span
                          className={"requirement-value " + (c.near ? "near" : c.status)}
                        >
                          {c.near
                            ? "≈ "
                            : c.status === "pass"
                              ? "✓ "
                              : c.status === "fail"
                                ? "✕ "
                                : "· "}
                          {decodeEntities(c.required)}
                          {c.user ? (
                            <small className="ai-cell-label"> Senin kararın</small>
                          ) : (
                            c.ai && <small className="ai-cell-label"> AI</small>
                          )}
                        </span>
                      </td>
                    ) : (
                      <td key={j} title="Kaynak bu düzeyde bu bileşeni belirtmiyor.">
                        <span className="requirement-value empty">—</span>
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <ul className="requirement-notes" data-testid="requirement-notes">
          {notes.map(({ label, row }) => (
            <li key={label + row.name} className={row.near ? "near" : row.status}>
              <strong>
                {label} · {row.name}
                {row.near ? " · yaklaşık eşit" : ""}
              </strong>{" "}
              {row.reason}
              {row.user ? " (Senin kararın)" : row.ai ? " (AI)" : ""}
            </li>
          ))}
        </ul>
      )}
      {usesData && (
        <p className="tiny muted requirement-data" data-testid="requirement-data">
          İşlemci ve ekran kartı karşılaştırması: PassMark puanları ve TechPowerUp
          özellikleri
          {hardwareDataInfo.date ? ` (veri: ${formatDateTR(hardwareDataInfo.date)})` : ""}
          .
        </p>
      )}
      {source && (
        <p className="tiny muted requirement-source" data-testid="requirement-source">
          Gereksinimler: {source.store}
          {wiki && (
            <>
              {g.pcgw?.title && g.pcgw.title !== g.name ? ` (${g.pcgw.title})` : ""}
              {" · mağaza yayımlamadığı için buradan alındı"}
            </>
          )}
          {source.url && (
            <>
              {" · "}
              <button className="text-link" onClick={() => external(source.url!)}>
                {wiki ? "PCGamingWiki sayfası" : "Mağaza sayfası"}
                <ArrowUpRight size={12} />
              </button>
            </>
          )}
        </p>
      )}
    </>
  );
}
// 2.0.8: the game page shows research only while it matters — not started,
// running, waiting, or stopped with results still missing. A research whose
// results are all saved (also a stopped one) is done and not shown; it is run
// again from Statistics → "Seçtiğim oyunları yeniden araştır".
function ResearchBar({ game: g }: { game: Game }) {
  const { data, run, setChatOpen } = useApp();
  const start = useManualResearch();
  const s = data.state;
  const progress = researchProgress(g, s.hardware, s.settings.autoSummary);
  const status = researchStatus(g, s.hardware, s.settings.autoSummary);
  if (status === "done" || !progress.stages.length || (!status && progress.complete))
    return null;
  // 2.1.3: "waiting for a model" is still in the queue — the run starts by
  // itself as soon as a model is there, so the page has to offer Durdur, not
  // another Araştır.
  const active =
    status === "running" || status === "queued" || status === "waiting_model";
  const stopped = status && ["cancelled", "incomplete", "error"].includes(status);
  const label = status
    ? {
        queued: "AI araştırması sırada",
        waiting_model: "AI araştırması bekliyor",
        running: "AI araştırılıyor…",
        done: "",
        incomplete: "AI araştırması eksik kaldı",
        error: "AI araştırması tamamlanamadı",
        cancelled: "AI araştırması durduruldu",
      }[status]
    : "AI araştırması";
  const note =
    g.research?.message ||
    (progress.missing.length ? "Eksik: " + progress.missing.join(", ") : "");
  const chat = g.research?.chatId && s.chats.some((c) => c.id === g.research!.chatId);
  return (
    <div
      className={"research-bar " + (status || "idle")}
      role="status"
      data-testid="research-bar"
    >
      {active ? (
        <Loader2 size={14} className="spin" aria-hidden />
      ) : (
        <Sparkles size={14} aria-hidden />
      )}
      <span className="research-bar-label">{label}</span>
      {note && <small title={note}>{note}</small>}
      <div className="research-bar-actions">
        {active ? (
          <button
            title="Yalnızca bu oyunun araştırmasını durdurur; sıradaki diğer oyunlar devam eder."
            onClick={() => run("stopResearch", { id: g.id }, "Araştırma durduruldu")}
          >
            Durdur
          </button>
        ) : (
          <>
            <button
              className="primary"
              onClick={() => void start([g.id], "game", !stopped)}
            >
              {stopped ? "Araştırmaya devam et" : "Araştır"}
            </button>
            {stopped && (
              <button onClick={() => void start([g.id], "game", true)}>
                Baştan araştır
              </button>
            )}
          </>
        )}
        {chat && (
          <button
            onClick={() => {
              void run("activeChat", { id: g.research!.chatId });
              setChatOpen(true);
            }}
          >
            Araştırma geçmişi
          </button>
        )}
      </div>
    </div>
  );
}
function Similar({ game }: { game: Game }) {
  const { setActive, setSelected } = useApp();
  return (
    <button
      onClick={() => {
        setActive(game.id);
        setSelected([game.id]);
      }}
    >
      <Cover name={game.name} cover={game.cover} />
      <span>{game.name}</span>
    </button>
  );
}
function Requirements({
  title,
  rows,
  raw,
}: {
  title: string;
  rows: ComponentCheck[];
  raw: string;
}) {
  return (
    <section className="requirement-card">
      <h3>{title}</h3>
      <span className="tiny muted">BİLGİSAYARIN → GEREKSİNİM</span>
      {rows.map((r, i) => (
        <div className="requirement-row" key={i} title={r.reason}>
          <div>
            <span className={"check-indicator " + r.status}>
              {r.status === "pass" ? (
                <Check size={12} />
              ) : r.status === "fail" ? (
                <AlertCircle size={12} />
              ) : (
                <Info size={12} />
              )}
            </span>
            <strong>{r.name}</strong>
            {r.estimated && <small>≈</small>}
          </div>
          <p>{r.actual}</p>
          <small>{r.required}</small>
        </div>
      ))}
      <details>
        <summary>Gereksinim metni</summary>
        <p>{raw || "Gereksinim metni henüz yok."}</p>
      </details>
    </section>
  );
}
