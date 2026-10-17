import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Plus,
  Upload,
  FileText,
  Check,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  Search,
  Gamepad2,
  Layers,
  Trash2,
  RefreshCw,
  FolderInput,
  ListPlus,
  Sparkles,
  Command,
  Palette,
  Monitor,
  Download,
  Undo2,
  Shuffle,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../lib/context";
import { api, download } from "../lib/api";
import { Modal, Spinner, Toggle, Cover } from "./UI";
import {
  parseImport,
  parseCSV,
  normalizeName,
  suggestedSeriesName,
} from "../../shared/domain";
import {
  statusLabels,
  type Game,
  type Group,
  type Series,
  type OriginStore,
  type PlatformHit,
} from "../../shared/types";
function SteamPicker({
  initial,
  onChoose,
  onCancel,
}: {
  initial: string;
  onChoose: (r: { appId: number; name: string }) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(initial),
    [results, setResults] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setResults([]);
    setNotice("");
    if (query.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .call<PlatformHit[]>("searchGames", { query: query.trim(), platform: "Steam" })
        .then((r) => {
          if (live) {
            setResults(r);
            setNotice(
              r.length
                ? ""
                : "Bu aramada Steam sonucu bulunamadı. Arama adını değiştirebilir veya Steam seçmeden ekleyebilirsin.",
            );
          }
        })
        .catch((e) => {
          if (live) setNotice(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <section className="steam-picker">
      <div className="section-title">
        <h3>Steam oyununu kendin seç</h3>
        {onCancel && <button onClick={onCancel}>Geri</button>}
      </div>
      <input
        autoFocus
        aria-label="Steam oyun ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Steam’de farklı bir adla ara…"
      />
      {loading && <Spinner text="Steam aranıyor…" />}
      {notice && <p className="muted">{notice}</p>}
      <div className="steam-picker-results">
        {results.map((r) => (
          <button key={r.id} onClick={() => onChoose({ appId: r.appId!, name: r.name })}>
            <span>
              <strong>{r.name}</strong>
              <small>
                Steam #{r.appId}
                {r.detail ? " · " + r.detail : ""}
              </small>
            </span>
            <Check size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function ImportModal({ initialText = "" }: { initialText?: string }) {
  const { data, run, toast, close } = useApp();
  const [text, setText] = useState(initialText),
    [steamRow, setSteamRow] = useState<number | null>(null),
    [start, setStart] = useState(1),
    [end, setEnd] = useState(0),
    [merge, setMerge] = useState(true),
    [edits, setEdits] = useState<
      Record<number, { name?: string; selected?: boolean; appId?: number }>
    >({}),
    [busy, setBusy] = useState(false);
  const parent = useRef<HTMLDivElement>(null),
    gutter = useRef<HTMLPreElement>(null);
  const lineCount = text.split(/\r?\n/).length;
  const rows = useMemo(() => {
    const seen = new Set(data.state.games.map((g) => normalizeName(g.name)));
    return parseImport(text, start, end || lineCount, data.state.games).map((row) => {
      const r = { ...row, ...edits[row.line] };
      const key = normalizeName(r.name);
      r.duplicate = !!key && seen.has(key);
      if (r.selected && key) seen.add(key);
      return r;
    });
  }, [text, start, end, data.state.games, edits]);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 42,
    overscan: 5,
  });
  const selected = rows.filter((r) => r.selected && r.name.trim()),
    duplicates = selected.filter((r) => r.duplicate).length;
  const read = async (file?: File) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast("Metin dosyası en fazla 5 MB olabilir.", true);
      return;
    }
    let value = await file.text();
    if (/\.csv$/i.test(file.name)) value = parseCSV(value).join("\n");
    if (/\.json$/i.test(file.name)) {
      toast(
        "Tam JSON yedeğini Ayarlar → Veriler & yedekler bölümünden geri yükle.",
        true,
      );
      return;
    }
    setText(value);
    setEdits({});
    setStart(1);
    setEnd(0);
  };
  return (
    <Modal
      wide
      title="Listen büyük olabilir. Başlamak kolay."
      subtitle="Metni yapıştır, satır aralığını seç, adları kontrol et. Son söz her zaman sende."
      onClose={close}
      footer={
        <>
          <span className="import-summary">
            <strong>{selected.length}</strong> seçili
            {duplicates > 0 && <small>{duplicates} yinelenen</small>}
          </span>
          <div className="footer-spacer" />
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!selected.length || busy || selected.length > 5000}
            onClick={async () => {
              setBusy(true);
              const r = await run("add", {
                items: selected.map((r) => ({
                  name: r.name.trim(),
                  appId: r.appId,
                  steamMatchMode: "manual",
                })),
                merge,
              });
              setBusy(false);
              if (r) {
                toast(
                  `${r.added.length} oyun eklendi${r.merged.length ? `, ${r.merged.length} yinelenen birleştirildi` : ""}. Bilgiler arka planda toplanıyor.`,
                );
                close();
              }
            }}
          >
            {busy ? (
              <Spinner text="Ekleniyor…" />
            ) : (
              <>
                <Check size={16} />
                Onayla ve içe aktar
              </>
            )}
          </button>
        </>
      }
    >
      {steamRow !== null && (
        <SteamPicker
          key={steamRow}
          initial={rows.find((r) => r.line === steamRow)?.name || ""}
          onCancel={() => setSteamRow(null)}
          onChoose={(r) => {
            setEdits((e) => ({
              ...e,
              [steamRow]: {
                ...e[steamRow],
                name: r.name,
                appId: r.appId,
                selected: true,
              },
            }));
            setSteamRow(null);
          }}
        />
      )}
      <div className="import-layout" hidden={steamRow !== null}>
        <div className="import-source">
          <div className="section-title">
            <h3>
              01 <span>Kaynak metin</span>
            </h3>
            <label className="file-button">
              <Upload size={14} />
              Dosya seç
              <input
                type="file"
                accept=".txt,.csv,.md"
                onChange={(e) => read(e.target.files?.[0])}
              />
            </label>
          </div>
          <div
            className="numbered-input"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void read(e.dataTransfer.files[0]);
            }}
          >
            <pre ref={gutter} aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
            </pre>
            <textarea
              aria-label="İçe aktarılacak oyun listesi"
              autoFocus
              data-autofocus
              spellCheck={false}
              placeholder={
                "1. Portal\n2) Portal 2\n3 - Half-Life\nStardew Valley\n\nListeni buraya yapıştır…"
              }
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setEdits({});
              }}
              onScroll={(e) => {
                if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
              }}
            />
          </div>
          <div className="range-row">
            <label>
              İlk satır
              <input
                aria-label="İlk satır"
                type="number"
                min={1}
                max={lineCount}
                value={start}
                onChange={(e) => setStart(Math.max(1, +e.target.value))}
              />
            </label>
            <ArrowRight size={15} />
            <label>
              Son satır
              <input
                aria-label="Son satır"
                type="number"
                min={start}
                max={lineCount}
                value={end || lineCount}
                onChange={(e) => setEnd(Math.max(start, +e.target.value))}
              />
            </label>
            <span>{lineCount} toplam satır</span>
          </div>
          <p className="tiny muted">
            1. / 1) / 1 - biçimleri temizlenir. Boş ve noktalama satırlarını kontrol et.
            Orijinal satır numaraları korunur.
          </p>
        </div>
        <div className="import-preview">
          <div className="section-title">
            <h3>
              02 <span>Kontrol et & düzenle</span>
            </h3>
            <span className="badge">Canlı önizleme</span>
          </div>
          <div className="preview-table-head">
            <span>SATIR</span>
            <span>OYUN ADI</span>
            <span>SEÇ</span>
          </div>
          <div ref={parent} className="import-virtual">
            <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
              {virtual.getVirtualItems().map((v) => {
                const r = rows[v.index];
                return (
                  <div
                    key={r.line}
                    className={"import-row " + (!r.name ? "empty" : "")}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: 42,
                      transform: `translateY(${v.start}px)`,
                    }}
                  >
                    <span>{r.line}</span>
                    <input
                      aria-label={`Satır ${r.line} oyun adı`}
                      value={r.name}
                      placeholder="Boş satır"
                      onChange={(e) =>
                        setEdits({
                          ...edits,
                          [r.line]: {
                            ...edits[r.line],
                            name: e.target.value,
                            appId: undefined,
                            selected: !!e.target.value.trim(),
                          },
                        })
                      }
                    />
                    <button
                      className={"steam-row-pick " + (r.appId ? "chosen" : "")}
                      aria-label={`Satır ${r.line} Steam seç`}
                      title={
                        r.appId
                          ? `Steam #${r.appId}`
                          : "Steam’de farklı bir adla ara ve seç"
                      }
                      onClick={() => setSteamRow(r.line)}
                    >
                      {r.appId ? "✓ Steam" : "Steam seç"}
                    </button>
                    {r.duplicate && (
                      <AlertCircle
                        size={13}
                        className="warning-icon"
                        aria-label="Yinelenen oyun"
                      />
                    )}
                    <input
                      aria-label={`Satır ${r.line} seç`}
                      type="checkbox"
                      checked={r.selected && !!r.name.trim()}
                      disabled={!r.name.trim()}
                      onChange={(e) =>
                        setEdits({
                          ...edits,
                          [r.line]: {
                            ...edits[r.line],
                            selected: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            {!text && (
              <div className="import-empty">
                <FileText size={32} />
                <p>Oyun adları burada görünecek.</p>
                <small>Önizlemedeki her adı değiştirebilirsin.</small>
              </div>
            )}
          </div>
          <Toggle
            label="Yinelenen oyunları birleştir"
            description="Aynı normalize ada sahip mevcut kaydı korur; yeni kopya oluşturmaz."
            checked={merge}
            onChange={setMerge}
          />
          {selected.length > 5000 && (
            <p className="error-text">
              Bir seferde en fazla 5000 oyun eklenebilir. Satır aralığını daralt.
            </p>
          )}
        </div>
      </div>
      <div className="notice-box compact">
        <ShieldCheck size={16} />
        <p>
          Onaydan sonra Steam, GOG ve Epic kataloglarını kontrol edeceğiz. Belirsiz
          eşleşmeler sana sorulur. Kuyruğu istediğin an durdurabilirsin.
        </p>
      </div>
    </Modal>
  );
}
// Oyun ekle: 1. platform, 2. that platform's own game list. The game's data
// and system requirements come from the chosen platform; "Platform yok" adds
// only the name (no store data, requirements not specified).
const platformTabs: { id: OriginStore; label: string }[] = [
  { id: "Steam", label: "Steam" },
  { id: "GOG", label: "GOG" },
  { id: "Epic Games", label: "Epic Games" },
  { id: "Xbox", label: "Xbox" },
  { id: "My Abandonware", label: "My Abandonware" },
  { id: "none", label: "Platform yok" },
];
export function AddModal() {
  const { run, toast, close } = useApp();
  const [platform, setPlatform] = useState<OriginStore>("Steam"),
    [name, setName] = useState(""),
    [picked, setPicked] = useState<PlatformHit | undefined>(),
    [results, setResults] = useState<PlatformHit[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const label = platformTabs.find((t) => t.id === platform)!.label;
  useEffect(() => {
    let live = true;
    setNotice("");
    if (platform === "none" || name.trim().length < 2 || picked) {
      setResults([]);
      setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      setBusy(true);
      api
        .call<PlatformHit[]>("searchGames", { query: name.trim(), platform })
        .then((r) => {
          if (!live) return;
          setResults(r);
          setNotice(
            r.length
              ? ""
              : `${label} içinde bu adla oyun bulunamadı. Adı değiştirebilir, başka bir platform seçebilir ya da “Platform yok” ile yalnız adını ekleyebilirsin.`,
          );
        })
        .catch((e) => {
          if (live) setNotice(`${label} aranamadı: ${e.message}`);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, platform, picked, label]);
  const canAdd = platform === "none" ? !!name.trim() : !!picked;
  return (
    <Modal
      title="Bir oyun, yeni bir dünya."
      subtitle="Önce oyunun bulunduğu platformu seç, sonra oyunu ara ve listeden seç."
      onClose={close}
      footer={
        <>
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!canAdd}
            onClick={async () => {
              const origin =
                platform === "none"
                  ? { store: "none" as const }
                  : { store: picked!.store, id: picked!.id, url: picked!.url };
              const r = await run("add", {
                items: [
                  {
                    name: (picked?.name || name).trim(),
                    origin,
                    steamMatchMode: "manual",
                  },
                ],
                merge: true,
              });
              if (r) {
                toast(
                  r.added.length
                    ? platform === "none"
                      ? "Oyun eklendi."
                      : `Oyun eklendi; bilgiler ${label} sayfasından alınıyor.`
                    : "Bu oyun zaten kütüphanende.",
                );
                close();
              }
            }}
          >
            <Plus size={16} />
            Kütüphaneye ekle
          </button>
        </>
      }
    >
      <div className="add-step">
        <span>1</span>
        Platform
      </div>
      <div className="platform-tabs" role="tablist" aria-label="Oyunun platformu">
        {platformTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={platform === t.id}
            className={platform === t.id ? "active" : ""}
            onClick={() => {
              setPlatform(t.id);
              setPicked(undefined);
              setResults([]);
              setNotice("");
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="add-step">
        <span>2</span>
        Oyun
      </div>
      <label>
        Oyun adı
        <input
          autoFocus
          placeholder={
            platform === "none" ? "Örneğin: Ev yapımı oyunum" : `${label}’de ara…`
          }
          value={name}
          maxLength={300}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(undefined);
          }}
        />
      </label>
      {busy && <Spinner text={`${label} içinde aranıyor…`} />}
      {picked && (
        <div className="connection-result">
          <Check size={15} />
          {picked.name} · {label} seçildi.
        </div>
      )}
      <div
        className="autocomplete-results"
        role="listbox"
        aria-label={`${label} sonuçları`}
      >
        {results.map((r) => (
          <button
            key={r.id}
            role="option"
            aria-selected={false}
            onClick={() => {
              setName(r.name);
              setPicked(r);
              setResults([]);
              setBusy(false);
            }}
          >
            <Gamepad2 size={18} />
            <span>
              <strong>{r.name}</strong>
              <small>{r.detail || label}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
      {notice && !picked && <p className="tiny muted">{notice}</p>}
      <p className="tiny muted">
        {platform === "none"
          ? "Platform seçmeden eklenen oyunda mağaza bilgisi olmaz; sistem gereksinimleri “belirtilmemiş” görünür. Süreler (HowLongToBeat) oyun adıyla aranır."
          : platform === "My Abandonware"
            ? "Eski oyunların arşivi. Yıl, tür, yapımcı, açıklama ve ekran görüntüleri alınır; bu sayfalarda sistem gereksinimi yayımlanmaz."
            : `Oyunun bilgileri ve sistem gereksinimleri ${label} sayfasından alınır; mağazada olmayan bir gereksinim eklenmez.`}
      </p>
    </Modal>
  );
}
export function GroupModal({ group }: { group?: Group }) {
  const { run, close, modal } = useApp();
  const [name, setName] = useState(group?.name || ""),
    [color, setColor] = useState(group?.color || "#b6a1ff"),
    [icon, setIcon] = useState(group?.icon || "folder");
  return (
    <Modal
      title={
        group ? "Koleksiyonuna kendi rengini ver." : "Bir neden, yeni bir koleksiyon."
      }
      subtitle="Oynama Listesi ayrı kalır; bu gruplar nedenlerini düzenler."
      onClose={close}
      footer={
        <>
          {group && (
            <button
              className="danger subtle"
              onClick={() =>
                modal("confirm", {
                  title: "Grup dağıtılsın mı?",
                  text: "Grup kaldırılır; içindeki oyunlar silinmez.",
                  onConfirm: () =>
                    run("group", { action: "delete", id: group.id }, "Grup kaldırıldı"),
                })
              }
            >
              <Trash2 size={14} />
              Grubu dağıt
            </button>
          )}
          <div className="footer-spacer" />
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={async () => {
              await api.call("group", {
                action: group ? "edit" : "create",
                id: group?.id,
                name: name.trim(),
                color,
                icon,
              });
              close();
            }}
          >
            <Check size={15} />
            Kaydet
          </button>
        </>
      }
    >
      <label>
        Grup adı
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örneğin: Birlikte oynayalım"
        />
      </label>
      <div className="form-grid">
        <label>
          Grup rengi
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          Simge
          <select value={icon} onChange={(e) => setIcon(e.target.value)}>
            {[
              ["folder", "Klasör"],
              ["gpu", "Ekran kartı"],
              ["cpu", "İşlemci"],
              ["disk", "Disk"],
              ["language", "Dil"],
              ["clock", "Zaman"],
              ["heart", "Favori"],
              ["friends", "Birlikte"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="group-preview" style={{ "--group-color": color } as any}>
        <i />
        {name || "Yeni koleksiyon"}
      </div>
    </Modal>
  );
}
// 2.0.4: a series is created or edited by name and by ticking its games in a
// searchable list; it can also be opened from one game (right click / ⋯), and
// games can be added to an existing series from the same window.
export function SeriesModal({
  series,
  ids = [],
  target: preset,
}: {
  series?: Series;
  ids?: string[];
  target?: string;
}) {
  const { run, close, modal, data } = useApp();
  const games = useMemo(
    () => [...data.state.games].sort((a, b) => a.order - b.order),
    [data.state.games],
  );
  const membersOf = (id?: string) =>
    id ? games.filter((g) => g.seriesId === id).map((g) => g.id) : [];
  const initial = ids.filter((id) => games.some((g) => g.id === id));
  const suggestion = () =>
    suggestedSeriesName(games.filter((g) => initial.includes(g.id)).map((g) => g.name));
  const start = series || data.state.series.find((s) => s.id === preset);
  const [targetId, setTargetId] = useState(start?.id || "");
  const [name, setName] = useState(start?.name || suggestion());
  const [picked, setPicked] = useState<string[]>(
    series
      ? membersOf(series.id)
      : start
        ? [...new Set([...membersOf(start.id), ...initial])]
        : initial,
  );
  const [query, setQuery] = useState("");
  const target = data.state.series.find((s) => s.id === targetId);
  const q = normalizeName(query);
  const shown = q ? games.filter((g) => normalizeName(g.name).includes(q)) : games;
  const choose = (id: string) => {
    const s = data.state.series.find((x) => x.id === id);
    setTargetId(s?.id || "");
    setName(s ? s.name : suggestion());
    setPicked(s ? [...new Set([...membersOf(s.id), ...initial])] : initial);
  };
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const ready = !!name.trim() && picked.length >= 2;
  const names = games.filter((g) => picked.includes(g.id)).map((g) => g.name);
  // 2.0.6: the order is never changed by the series itself; other games
  // between its members split it. Gathering them is a choice.
  const at = series
    ? games.flatMap((g, i) => (g.seriesId === series.id ? [i] : []))
    : [];
  const split = at.length > 1 && at[at.length - 1] - at[0] + 1 !== at.length;
  return (
    <Modal
      title={series ? "Seriyi düzenle" : target ? "Seriye ekle" : "Seri oluştur"}
      subtitle={
        series || target
          ? "Seri adını değiştir, oyun ekle veya çıkar."
          : "Seriye bir ad ver ve içindeki oyunları işaretle."
      }
      onClose={close}
      footer={
        <>
          {series && (
            <button
              className="danger subtle"
              onClick={() =>
                modal("confirm", {
                  title: "Seri dağıtılsın mı?",
                  text: "Oyunlar silinmez. Bu oyunların otomatik seri üyeliği kapatılır.",
                  onConfirm: () =>
                    run(
                      "series",
                      { action: "dissolve", id: series.id },
                      "Seri dağıtıldı",
                    ),
                })
              }
            >
              Seriyi dağıt
            </button>
          )}
          {series && split && (
            <button
              title="Aradaki oyunlar serinin arkasına geçer. Ctrl+Z ile geri alınır."
              onClick={async () => {
                const r = await run(
                  "series",
                  { action: "gather", id: series.id },
                  "Serinin oyunları yan yana toplandı",
                );
                if (r !== undefined) close();
              }}
            >
              Oyunları yan yana topla
            </button>
          )}
          <div className="footer-spacer" />
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!ready}
            title={
              ready
                ? undefined
                : !name.trim()
                  ? "Seri adı yaz."
                  : "Seri için en az iki oyun işaretle."
            }
            onClick={async () => {
              const r = await run(
                "series",
                target
                  ? { action: "update", id: target.id, name: name.trim(), ids: picked }
                  : { action: "create", name: name.trim(), ids: picked },
                target ? "Seri güncellendi" : "Seri oluşturuldu",
              );
              if (r !== undefined) close();
            }}
          >
            {target ? "Kaydet" : "Seriyi oluştur"}
          </button>
        </>
      }
    >
      {!series && data.state.series.length > 0 && (
        <label>
          Nereye?
          <select value={targetId} onChange={(e) => choose(e.target.value)}>
            <option value="">Yeni seri oluştur</option>
            {data.state.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} serisine ekle
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Seri adı
        <input
          value={name}
          maxLength={100}
          autoFocus={!series}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örneğin: Half-Life"
        />
      </label>
      <div className="series-picker">
        <div className="series-picker-head">
          <span>
            Serideki oyunlar <b>{picked.length}</b>
          </span>
          <label className="series-search">
            <Search size={13} />
            <input
              aria-label="Seriye eklenecek oyunu ara"
              placeholder="Oyun ara…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="series-picker-list" role="group" aria-label="Seri için oyunlar">
          {shown.map((g) => {
            const on = picked.includes(g.id);
            const other =
              g.seriesId && g.seriesId !== target?.id
                ? data.state.series.find((s) => s.id === g.seriesId)
                : undefined;
            return (
              <label key={g.id} className={"series-pick" + (on ? " on" : "")}>
                <input type="checkbox" checked={on} onChange={() => toggle(g.id)} />
                <span title={g.name}>{g.name}</span>
                {other && (
                  <small title="İşaretlersen bu seriye taşınır.">
                    {other.name} serisinde
                  </small>
                )}
                {g.year && <small>{g.year}</small>}
              </label>
            );
          })}
          {!shown.length && <p className="muted">Bu adla oyun bulunamadı.</p>}
        </div>
      </div>
      <p className="muted series-chosen">
        {picked.length < 2 ? "Seri için en az iki oyun işaretle." : names.join(" · ")}
      </p>
    </Modal>
  );
}
export function MoveModal({ ids }: { ids: string[] }) {
  const { data, run, close, scope } = useApp();
  return (
    <Modal
      title="Nereye taşıyalım?"
      subtitle={`${ids.length} oyun · Eski özel grup üyeliği değişir; oyun silinmez.`}
      onClose={close}
    >
      <div className="move-options">
        <button
          onClick={async () => {
            await run(
              "play",
              {
                ids,
                fromGroup: !["all", "play"].includes(scope) ? scope : undefined,
              },
              "Oynama Listesine eklendi",
            );
            close();
          }}
        >
          <ListPlus size={18} />
          <span>
            <strong>Oynama Listesi</strong>
            <small>Oynamayı seçtiğin ayrı liste</small>
          </span>
          <ArrowRight size={15} />
        </button>
        {data.state.groups.map((g) => (
          <button
            key={g.id}
            onClick={async () => {
              await run("moveGroup", { ids, groupId: g.id }, g.name + " grubuna taşındı");
              close();
            }}
          >
            <i style={{ background: g.color }} />
            <strong>{g.name}</strong>
            <ArrowRight size={15} />
          </button>
        ))}
        <button
          onClick={async () => {
            await run(
              "moveGroup",
              { ids, groupId: null },
              "Özel grup üyelikleri kaldırıldı",
            );
            close();
          }}
        >
          <Layers size={16} />
          Grupsuz bırak
        </button>
      </div>
    </Modal>
  );
}
export function BatchModal({ ids }: { ids: string[] }) {
  const { data, run, modal, close, scope } = useApp();
  const [status, setStatus] = useState("planned");
  const games = data.state.games.filter((g) => ids.includes(g.id));
  return (
    <Modal
      title={games.length === 1 ? games[0].name : `${games.length} oyun, tek işlem.`}
      subtitle="Seçili oyunlar üzerinde toplu işlemler."
      onClose={close}
    >
      <div className="batch-actions">
        <button onClick={() => modal("move", { ids })}>
          <FolderInput size={18} />
          <span>Gruba taşı / Oynama Listesine ekle</span>
          <ChevronRight size={15} />
        </button>
        <button
          onClick={async () => {
            await run("refresh", { ids, force: true }, "Veri yenileme kuyruğa alındı");
            close();
          }}
        >
          <RefreshCw size={18} />
          <span>Bilgileri yeniden topla</span>
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() =>
            modal("series", {
              ids,
              // Games already in one series open with that series chosen.
              target: data.state.series.find(
                (s) => games.length > 0 && games.every((g) => g.seriesId === s.id),
              )?.id,
            })
          }
        >
          <Layers size={18} />
          <span>Seri oluştur / seriye ekle</span>
          <ChevronRight size={15} />
        </button>
        {!["all", "play"].includes(scope) && (
          <button
            onClick={async () => {
              await run(
                "removeFromGroup",
                { ids, groupId: scope },
                "Grup üyeliği kaldırıldı",
              );
              close();
            }}
          >
            <FolderInput size={18} />
            <span>Yalnızca bu gruptan çıkar</span>
          </button>
        )}
        <div className="batch-status">
          <label>
            Durum değiştir
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(statusLabels).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={async () => {
              await run("batchStatus", { ids, status }, "Durumlar güncellendi");
              close();
            }}
          >
            Uygula
          </button>
        </div>
        <button
          className="danger subtle"
          onClick={() =>
            modal("confirm", {
              title: "Oyunlar silinsin mi?",
              text: `${games
                .map((g) => g.name)
                .slice(0, 8)
                .join(
                  ", ",
                )}${games.length > 8 ? " ve diğerleri" : ""} kütüphaneden silinecek. Ctrl+Z ile geri alabilirsin.`,
              danger: true,
              onConfirm: () => run("remove", { ids }, "Silindi · Ctrl+Z ile geri al"),
            })
          }
        >
          <Trash2 size={17} />
          Kütüphaneden sil
        </button>
      </div>
    </Modal>
  );
}
export function MatchModal({ game: g }: { game: Game }) {
  const { run, close } = useApp();
  const [id, setId] = useState(String(g.appId || ""));
  return (
    <Modal
      title="Steam oyununu seç"
      subtitle={g.name + " için mağazada ara ve doğru oyunu seç."}
      onClose={close}
      footer={
        <>
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            disabled={!/^\d+$/.test(id) || Number(id) < 1}
            onClick={async () => {
              await run(
                "match",
                { id: g.id, appId: Number(id) },
                "Steam eşleşmesi yenileniyor",
              );
              close();
            }}
          >
            Eşleştir ve yenile
          </button>
        </>
      }
    >
      <SteamPicker
        initial={g.name}
        onChoose={async (r) => {
          const ok = await run(
            "match",
            { id: g.id, appId: r.appId, name: r.name },
            "Steam eşleşmesi yenileniyor",
          );
          if (ok) close();
        }}
      />
      <label>
        Steam uygulama kimliği
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Mağaza adresindeki /app/ sonrasındaki sayı"
        />
      </label>
      <p className="muted">
        Bu eşleşme kapağı, açıklamayı ve gereksinimleri değiştirir. Yanlış oyunun
        kimliğini kullanmadığından emin ol.
      </p>
    </Modal>
  );
}
export function CommandModal() {
  const { data, run, modal, close, setActive, setSelected, setChatOpen, toast } =
    useApp();
  const [q, setQ] = useState("");
  const actions = [
    {
      name: "Oyun listesini içe aktar",
      icon: Upload,
      fn: () => modal("import"),
    },
    { name: "Tek oyun ekle", icon: Plus, fn: () => modal("add") },
    {
      name: "Görünümü kişiselleştir",
      icon: Palette,
      fn: () => modal("settings"),
    },
    {
      name: "Donanımı algıla / düzenle",
      icon: Monitor,
      fn: () => modal("settings", { tab: "hardware" }),
    },
    {
      name: "LM Studio bağlantısı",
      icon: Sparkles,
      fn: () => modal("settings", { tab: "lm" }),
    },
    {
      name: "Son işlemi geri al",
      icon: Undo2,
      fn: () => {
        void run("undo", {}, "İşlem geri alındı");
        close();
      },
    },
    {
      name: "Tam JSON yedeğini indir",
      icon: Download,
      fn: async () => {
        const r = await run("export", { format: "json" });
        if (r) download(r.text, r.filename, r.mime);
        close();
      },
    },
    {
      name: "Rastgele oyun seç",
      icon: Shuffle,
      fn: () => {
        const g = data.state.games[Math.floor(Math.random() * data.state.games.length)];
        if (g) {
          setActive(g.id);
          setSelected([g.id]);
        } else toast("Önce kütüphanene bir oyun ekle.");
        close();
      },
    },
  ].filter((a) => normalizeName(a.name).includes(normalizeName(q)));
  const games = q
    ? data.state.games
        .filter((g) => normalizeName(g.name).includes(normalizeName(q)))
        .slice(0, 8)
    : [];
  return (
    <Modal title="Ne yapmak istersin?" onClose={close}>
      <label className="search-box command-search">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Bir komut veya oyun ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <kbd>Esc</kbd>
      </label>
      <div className="command-actions">
        {actions.map((a) => (
          <button key={a.name} onClick={a.fn}>
            <a.icon size={17} />
            <span>{a.name}</span>
            <ArrowUpRight size={13} />
          </button>
        ))}
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setActive(g.id);
              setSelected([g.id]);
              close();
            }}
          >
            <Gamepad2 size={17} />
            <span>{g.name}</span>
            <small>Oyun</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}
export function MoodModal() {
  const { data, run, close, setChatOpen } = useApp();
  const [mood, setMood] = useState("Rahatlamak istiyorum"),
    [time, setTime] = useState("30–60 dakika"),
    [other, setOther] = useState("");
  return (
    <Modal
      title="Bugün nasıl bir macera?"
      subtitle="Tercihlerin yerel ajana gönderilir. Öneriler kütüphanenden, gerçek verilere dayanmalı."
      onClose={close}
      footer={
        <>
          <button onClick={close}>Vazgeç</button>
          <button
            className="primary"
            onClick={async () => {
              let chat = data.state.chats.find((c) => c.id === data.state.activeChatId);
              if (!chat) chat = await run("newChat");
              if (chat) {
                const r = await run("send", {
                  chatId: chat.id,
                  text: `Bugün ${mood.toLocaleLowerCase("tr")}. Zamanım: ${time}. ${other} Kütüphanemden oyun öner. Oynanış süresi ve uyumluluk bilinmiyorsa tahmini kesin bilgi gibi verme. Gerekirse ask_user_questions ile soru sor; iznim olmadan listeyi değiştirme.`,
                });
                if (r) {
                  setChatOpen(true);
                  close();
                }
              }
            }}
          >
            <Sparkles size={15} />
            Birlikte seçelim
          </button>
        </>
      }
    >
      <label>
        Ruh halin
        <select value={mood} onChange={(e) => setMood(e.target.value)}>
          {[
            "Rahatlamak istiyorum",
            "Hikâyeye dalmak istiyorum",
            "Meydan okuma istiyorum",
            "Arkadaşlarımla oynamak istiyorum",
            "Keşfetmek istiyorum",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Ne kadar zamanın var?
        <select value={time} onChange={(e) => setTime(e.target.value)}>
          {["15–30 dakika", "30–60 dakika", "1–2 saat", "Uzun bir akşam"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Farklı bir cevabım var
        <textarea
          rows={3}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Aklındaki başka bir tercih…"
        />
      </label>
    </Modal>
  );
}
