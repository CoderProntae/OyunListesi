import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  GripVertical,
  MoreHorizontal,
  LibraryBig,
  ArrowDownWideNarrow,
  ListPlus,
  Trash2,
  FolderPlus,
  RefreshCw,
  Layers,
  Check,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  X,
  ArrowUpDown,
  FolderMinus,
} from "lucide-react";
import { useApp } from "../lib/context";
import { Cover, CompatDot, IconButton } from "./UI";
import { compatibility } from "../../shared/compatibility";
import { plainText, platformLabel } from "../../shared/format";
import { normalizeName } from "../../shared/domain";
import { statusLabels, compatLabels, type Game, type Group } from "../../shared/types";
export function GroupBar() {
  const { data, scope, setScope, modal } = useApp();
  const [expanded, setExpanded] = useState(false),
    lastCount = useRef(data.state.groups.length);
  useEffect(() => {
    if (lastCount.current < data.state.groups.length) setExpanded(true);
    lastCount.current = data.state.groups.length;
  }, [data.state.groups.length]);
  useDndMonitor({ onDragStart: () => setExpanded(true) });
  return (
    <div className="group-bar">
      <GroupChip
        group={{
          id: "play",
          name: "Oynama Listesi",
          color: "#80d9be",
          icon: "play",
        }}
        count={data.state.games.length}
      />
      <span className="group-divider" />
      <button
        className="collection-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Koleksiyonlar <span>{data.state.groups.length}</span>
        <ChevronDown size={13} />
      </button>
      {data.state.groups
        .filter((g) => expanded || g.id === scope)
        .map((g) => (
          <GroupChip
            key={g.id}
            group={g}
            count={data.state.games.filter((x) => x.groupIds.includes(g.id)).length}
          />
        ))}
      <button
        className="group-new"
        title="Özel grup oluştur"
        onClick={() => modal("group")}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
function GroupChip({ group, count }: { group: Group; count: number }) {
  const { scope, setScope, modal } = useApp();
  const { setNodeRef, isOver } = useDroppable({
    id: "group:" + group.id,
    data: { kind: "group", groupId: group.id },
  });
  return (
    <button
      ref={setNodeRef}
      className={`group-chip ${scope === group.id ? "active" : ""} ${isOver ? "drop-over" : ""}`}
      style={{ "--group-color": group.color } as any}
      onClick={() => setScope(group.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!["all", "play"].includes(group.id)) modal("group", { group });
      }}
      title={
        ["all", "play"].includes(group.id)
          ? group.name
          : group.name + " · Düzenlemek için sağ tıkla"
      }
    >
      <i />
      {!["all", "play"].includes(group.id) && (
        <b className="group-symbol">
          {(
            {
              gpu: "▣",
              cpu: "◈",
              disk: "▤",
              language: "文",
              clock: "◷",
              folder: "▱",
              heart: "♡",
              friends: "♧",
            } as Record<string, string>
          )[group.icon] || "▱"}
        </b>
      )}
      <span className="group-name">{group.name}</span>
      <span className="group-count">{count}</span>
    </button>
  );
}
type Row = {
  id: string;
  game?: Game;
  seriesId?: string;
  name?: string;
  // Series header of a later part (other games between): "(devam)".
  continued?: boolean;
  // Series members in the visible list (the header shows part/total if split).
  total?: number;
  ids: string[];
  firstId: string;
};
export default function LibraryPanel() {
  const { data, selected, setSelected, setActive, active, scope, modal, run, mention } =
    useApp();
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("manual"),
    [filters, setFilters] = useState(false),
    [status, setStatus] = useState(""),
    [genre, setGenre] = useState(""),
    [year, setYear] = useState(""),
    [platform, setPlatform] = useState(""),
    [hover, setHover] = useState<{ game: Game; x: number; y: number } | null>(null);
  const hoverClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverHandler = (value: any) => {
    if (hoverClose.current) clearTimeout(hoverClose.current);
    if (value) setHover(value);
    else hoverClose.current = setTimeout(() => setHover(null), 220);
  };
  const scroll = useRef<HTMLDivElement>(null),
    anchor = useRef<string | null>(null);
  // The preview belongs to the row under the pointer. When the list changes under
  // a resting pointer (typing a search, filters, opening a game) no mouseleave
  // fires, so the card would stay on screen for a row that is gone.
  useEffect(() => {
    if (hoverClose.current) clearTimeout(hoverClose.current);
    setHover(null);
  }, [scope, query, status, genre, year, platform, sort, active?.id]);
  const settings = data.state.settings;
  const comps = useMemo(
    () =>
      new Map(data.state.games.map((g) => [g.id, compatibility(g, data.state.hardware)])),
    [data.state.games, data.state.hardware],
  );
  const visible = useMemo(() => {
    const items = data.state.games.filter(
      (g) =>
        (scope === "all" || scope === "play" || g.groupIds.includes(scope)) &&
        (!query || normalizeName(g.name).includes(normalizeName(query))) &&
        (!status || g.status === status) &&
        (!genre || g.genres.includes(genre)) &&
        (!year || String(g.year) === year) &&
        (!platform || g.platforms.includes(platform)),
    );
    if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    if (sort === "year") items.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sort === "compat") {
      const order = { recommended: 0, minimum: 1, unknown: 2, unsupported: 3 };
      items.sort(
        (a, b) => order[comps.get(a.id)!.status] - order[comps.get(b.id)!.status],
      );
    }
    return items;
  }, [data.state.games, scope, query, status, genre, year, platform, sort, comps]);
  // 2.0.6: the list order is never changed for a series. Games the user put
  // between two members split the series into parts: each part has a header
  // (later ones say "devam"), collapsing folds every part, and dragging a
  // header moves only its own part.
  const rows = useMemo(() => {
    const result: Row[] = [];
    const total = new Map<string, number>();
    for (const g of visible)
      if (g.seriesId) total.set(g.seriesId, (total.get(g.seriesId) || 0) + 1);
    const started = new Set<string>();
    let i = 0;
    while (i < visible.length) {
      const game = visible[i];
      const series =
        game.seriesId && (total.get(game.seriesId) || 0) >= 2
          ? data.state.series.find((s) => s.id === game.seriesId)
          : undefined;
      if (series) {
        let end = i + 1;
        while (end < visible.length && visible[end].seriesId === series.id) end++;
        const group = visible.slice(i, end);
        result.push({
          id: `series:${series.id}:${game.id}`,
          seriesId: series.id,
          name: series.name,
          continued: started.has(series.id),
          total: total.get(series.id),
          ids: group.map((g) => g.id),
          firstId: game.id,
        });
        started.add(series.id);
        if (!settings.collapsedSeries.includes(series.id))
          result.push(
            ...group.map((g) => ({
              id: g.id,
              game: g,
              ids: [g.id],
              firstId: g.id,
            })),
          );
        i = end;
        continue;
      }
      result.push({ id: game.id, game, ids: [game.id], firstId: game.id });
      i++;
    }
    return result;
  }, [visible, data.state.series, settings.collapsedSeries]);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: (i) =>
      rows[i]?.seriesId ? 40 : settings.density === "compact" ? 56 : 68,
    overscan: 6,
    getItemKey: (i) => rows[i].id,
  });
  const click = (e: React.MouseEvent, g: Game) => {
    (e.currentTarget.closest(".virtual-list") as HTMLElement | null)?.focus();
    if (e.shiftKey && anchor.current) {
      const a = visible.findIndex((x) => x.id === anchor.current),
        b = visible.findIndex((x) => x.id === g.id);
      setSelected(
        visible.slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1).map((g) => g.id),
      );
    } else if (e.ctrlKey || e.metaKey)
      setSelected(
        selected.includes(g.id)
          ? selected.filter((id) => id !== g.id)
          : [...selected, g.id],
      );
    else setSelected([g.id]);
    anchor.current = g.id;
    setActive(g.id);
  };
  const remove = () =>
    modal("confirm", {
      title: "Seçilen oyunlar silinsin mi?",
      text: `${selected.length} oyun kütüphaneden kaldırılacak. Silmeyi Geri al ile geri alabilirsin.`,
      danger: true,
      onConfirm: () =>
        run("remove", { ids: selected }, "Oyunlar silindi · Ctrl+Z ile geri al"),
    });
  return (
    <section className="library-panel">
      <div className="library-heading">
        <div>
          <span className="eyebrow">KÜTÜPHANEN</span>
          <h2>
            {scope === "play"
              ? `Sonraki Oyun: ${[...data.state.games].sort((a, b) => a.order - b.order).find((g) => g.status !== "finished")?.name || "Liste tamamlandı"}`
              : data.state.groups.find((g) => g.id === scope)?.name || "Oynama Listesi"}
            <span>{visible.length}</span>
          </h2>
        </div>
      </div>
      <div className="library-controls">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Oyun ara"
            placeholder="Oyunlarında ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
        <div className="sort-bar">
          <ArrowDownWideNarrow size={13} />
          <select
            aria-label="Sıralama"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="manual">Benim sıralamam</option>
            <option value="name">Ada göre</option>
            <option value="year">Çıkış yılına göre</option>
            <option value="compat">Uyumluluğa göre</option>
          </select>
          <button
            className={filters ? "active" : ""}
            onClick={() => setFilters(!filters)}
            title="Filtreler"
          >
            <SlidersHorizontal size={14} />
            {[status, genre, year, platform].filter(Boolean).length || ""}
          </button>
        </div>
        {filters && (
          <div className="filter-grid">
            <select
              aria-label="Durum filtresi"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tüm durumlar</option>
              {Object.entries(statusLabels).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Tür filtresi"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="">Tüm türler</option>
              {[...new Set(data.state.games.flatMap((g) => g.genres))]
                .sort((a, b) => a.localeCompare(b, "tr"))
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
            <select
              aria-label="Yıl filtresi"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">Tüm yıllar</option>
              {[...new Set(data.state.games.map((g) => g.year).filter(Boolean))]
                .sort()
                .reverse()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
            <select
              aria-label="Platform filtresi"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">Tüm platformlar</option>
              {[...new Set(data.state.games.flatMap((g) => g.platforms))]
                .sort((a, b) => platformLabel(a).localeCompare(platformLabel(b), "tr"))
                .map((v) => (
                  <option key={v} value={v}>
                    {platformLabel(v)}
                  </option>
                ))}
            </select>
            <button
              onClick={() => {
                setStatus("");
                setGenre("");
                setYear("");
                setPlatform("");
              }}
            >
              Sıfırla
            </button>
          </div>
        )}
      </div>
      <div className="list-column-label">
        <span>
          OYUN / SERİ
          <button
            className="column-action"
            title="Kendi serini oluştur: ad ver, oyunları işaretle"
            onClick={() => modal("series", { ids: selected })}
          >
            <Layers size={11} />
            Yeni seri
          </button>
        </span>
        <span>SİSTEM</span>
      </div>
      <div
        className="virtual-list"
        ref={scroll}
        tabIndex={0}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Oyun listesi"
        onScroll={() => {
          if (hover) hoverHandler(null);
        }}
        onKeyDown={(e) => {
          if (
            e.target !== e.currentTarget &&
            ["INPUT", "SELECT", "BUTTON"].includes((e.target as HTMLElement).tagName)
          )
            return;
          if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            setSelected(visible.map((g) => g.id));
          }
          if (e.key === "Delete" && selected.length) remove();
          if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key) && active) {
            e.preventDefault();
            void run("moveStep", {
              id: active.id,
              direction: e.key === "ArrowUp" ? -1 : 1,
            });
          }
        }}
      >
        <SortableContext
          items={rows.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            style={{
              height: virtual.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtual.getVirtualItems().map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtual.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <LibraryRow
                  row={rows[item.index]}
                  disabled={sort !== "manual"}
                  onSelect={click}
                  onHover={hoverHandler}
                  compatibility={
                    rows[item.index].game
                      ? comps.get(rows[item.index].game!.id)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </SortableContext>
        {visible.length === 0 && (
          <div className="empty-list">
            <div className="empty-mini">
              <LibraryBig size={28} />
            </div>
            <h3>
              {data.state.games.length
                ? "Biraz daha geniş bakalım."
                : "İlk oyunla başla."}
            </h3>
            <p>
              {data.state.games.length
                ? "Bu filtrelere uyan oyun bulunamadı."
                : "Koleksiyonunu tek seferde ekle; sıradaki maceranı birlikte bulalım."}
            </p>
            <button className="soft" onClick={() => modal("import")}>
              <ListPlus size={15} />
              Listeyi içe aktar
            </button>
          </div>
        )}
      </div>
      {selected.length > 1 ? (
        <div className="selection-bar">
          <span>
            <Check size={14} />
            {selected.length} seçili
          </span>
          <div>
            {!["all", "play"].includes(scope) && (
              <IconButton
                label="Koleksiyondan çıkar"
                onClick={() =>
                  run(
                    "play",
                    { ids: selected, fromGroup: scope },
                    "Koleksiyondan çıkarıldı; oyunlar Oynama Listesinde kalır",
                  )
                }
              >
                <FolderMinus size={16} />
              </IconButton>
            )}
            <IconButton
              label="Gruba taşı"
              onClick={() => modal("move", { ids: selected })}
            >
              <FolderPlus size={16} />
            </IconButton>
            <IconButton
              label="Seri oluştur / seriye ekle"
              onClick={() => modal("series", { ids: selected })}
            >
              <Layers size={16} />
            </IconButton>
            <IconButton
              label="Toplu işlemler"
              onClick={() => modal("batch", { ids: selected })}
            >
              <MoreHorizontal size={16} />
            </IconButton>
            <IconButton label="Seçilileri sil" onClick={remove}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
      ) : null}
      {hover &&
        hover.game.id !== active?.id &&
        visible.some((g) => g.id === hover.game.id) && (
          <div
            className="game-hover glass"
            style={{
              left: Math.max(8, Math.min(hover.x, window.innerWidth - 330)),
              top: Math.max(8, Math.min(hover.y, window.innerHeight - 300)),
            }}
            onMouseEnter={() => hoverHandler(hover)}
            onMouseLeave={() => hoverHandler(null)}
          >
            <Cover
              name={hover.game.name}
              cover={hover.game.cover}
              className="hover-cover"
            />
            <div>
              <h3>{hover.game.name}</h3>
              <p className="muted">
                {hover.game.year || "Yıl bilinmiyor"} ·{" "}
                {hover.game.genres.slice(0, 2).join(" / ") || "Tür araştırılmadı"}
              </p>
              <p className="hover-summary">
                {hover.game.aiSummary
                  ? plainText(hover.game.aiSummary)
                  : "AI özeti henüz üretilmedi. Ayrıntılardan yerel modelinle oluşturabilirsin."}
              </p>
              <button
                className="text-link"
                onClick={() => {
                  setActive(hover.game.id);
                  setHover(null);
                }}
              >
                Ayrıntıları aç
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}
    </section>
  );
}
function LibraryRow({ row, disabled, onSelect, onHover, compatibility: comp }: any) {
  const { data, selected, active, run, modal } = useApp();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: row.id,
      disabled,
      data: {
        kind: row.seriesId ? "series" : "game",
        ids: row.seriesId
          ? row.ids
          : selected.includes(row.id) && selected.length > 1
            ? selected
            : row.ids,
        targetId: row.firstId,
      },
    });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A row can disappear (search, filter) while its preview timer is pending.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const collapsed = data.state.settings.collapsedSeries;
  if (row.seriesId) {
    const split = row.ids.length !== row.total;
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={
          "series-row " +
          (row.continued ? "continued " : "") +
          (isDragging ? "dragging" : "")
        }
      >
        <button
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={split ? "Serinin bu bölümünü taşı" : "Seriyi taşı"}
        >
          <GripVertical size={13} />
        </button>
        <button
          className="series-toggle"
          onClick={() =>
            run("settings", {
              patch: {
                collapsedSeries: collapsed.includes(row.seriesId)
                  ? collapsed.filter((id) => id !== row.seriesId)
                  : [...collapsed, row.seriesId],
              },
            })
          }
        >
          {collapsed.includes(row.seriesId) ? (
            <ChevronRight size={13} />
          ) : (
            <ChevronDown size={13} />
          )}
          {row.continued && <CornerDownRight size={12} aria-hidden />}
          <span>{row.continued ? `${row.name} (devam)` : row.name}</span>
          <small
            title={
              split
                ? `Serinin ${row.total} oyunundan ${row.ids.length} tanesi burada`
                : undefined
            }
          >
            {split ? `${row.ids.length}/${row.total}` : row.ids.length}
          </small>
        </button>
        <IconButton
          label="Seriyi düzenle"
          onClick={() =>
            modal("series", {
              series: data.state.series.find((s) => s.id === row.seriesId),
            })
          }
        >
          <MoreHorizontal size={13} />
        </IconButton>
      </div>
    );
  }
  const g: Game = row.game;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="option"
      aria-selected={selected.includes(g.id)}
      className={`game-row ${selected.includes(g.id) ? "selected" : ""} ${active?.id === g.id ? "current" : ""} ${isDragging ? "dragging" : ""} ${isOver ? "insertion-gap" : ""}`}
      onClick={(e) => {
        if (timer.current) clearTimeout(timer.current);
        onHover(null);
        onSelect(e, g);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        modal("batch", { ids: selected.includes(g.id) ? selected : [g.id] });
      }}
      onMouseEnter={(e) => {
        if (active?.id === g.id) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(
          () => onHover({ game: g, x: r.right + 10, y: r.top }),
          750,
        );
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        onHover(null);
      }}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`${g.name} taşı`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>
      <span className="row-number">{String(g.order + 1).padStart(2, "0")}</span>
      <Cover name={g.name} cover={g.cover} />
      <div className="game-row-text">
        <strong title={g.name}>{g.name}</strong>
        <span>
          {g.fetchStatus === "loading" || g.fetchStatus === "queued" ? (
            <>
              <Loader2 size={10} className="spin" />
              Bilgiler toplanıyor
            </>
          ) : g.fetchStatus === "review" ? (
            <>
              <AlertCircle size={10} />
              Eşleşmeyi kontrol et
            </>
          ) : (
            <>
              {g.year || "—"}
              <i /> {g.genres[0] || statusLabels[g.status]}
            </>
          )}
        </span>
      </div>
      <CompatDot status={comp.status} title={comp.summary} label={comp.label} />
    </div>
  );
}
