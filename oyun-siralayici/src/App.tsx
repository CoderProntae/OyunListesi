import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  pointerWithin,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  Gamepad2,
  Globe2,
  LibraryBig,
  ChartNoAxesCombined,
  Settings2,
  Sparkles,
  Plus,
  Search,
  Minus,
  Square,
  X,
  Upload,
  Command,
  ShieldCheck,
  ChevronRight,
  Check,
  AlertCircle,
  Monitor,
  Undo2,
  FolderPlus,
  Loader2,
  Heart,
  PanelRightClose,
  PanelRightOpen,
  CloudOff,
  RefreshCw,
  Info,
  ChevronDown,
} from "lucide-react";
import { Context } from "./lib/context";
import { api, download } from "./lib/api";
import type { Bootstrap, Game } from "../shared/types";
import { parseCSV } from "../shared/domain";
import { cleanError } from "../shared/format";
import LibraryPanel, { GroupBar } from "./components/Library";
import Detail, { Statistics } from "./components/Detail";
import ChatPanel, { PermissionDialog, Wizard } from "./components/Chat";
import { StatusArea, UpdateModal, WhatsNewModal } from "./components/Updates";
import { ResearchChecksModal, ResearchPickModal } from "./components/Research";
import { clampListWidth } from "./components/ChatSidebar";
const Settings = lazy(() => import("./components/Settings"));
import { IconButton, Cover, ConfirmModal, Modal, Spinner } from "./components/UI";
import {
  ImportModal,
  AddModal,
  GroupModal,
  SeriesModal,
  MoveModal,
  BatchModal,
  MatchModal,
  CommandModal,
  MoodModal,
} from "./components/Modals";
export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [bootError, setBootError] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [scope, setScopeValue] = useState("play"),
    [view, setView] = useState("stats"),
    [chatOpen, setChatOpen] = useState(true),
    [modalState, setModal] = useState<{ type: string; props: any } | null>(null),
    [toasts, setToasts] = useState<{ id: number; text: string; error: boolean }[]>([]),
    [mentions, setMentions] = useState<Game[]>([]),
    // 2.0.2: the lower chat of the split view has its own draft and add-ons.
    [lowerMentions, setLowerMentions] = useState<Game[]>([]),
    [lowerDraft, setLowerDraft] = useState(""),
    [chatFocus, setChatFocus] = useState<"top" | "bottom">("top"),
    [draft, setDraft] = useState(""),
    [drag, setDrag] = useState<{ ids: string[]; name: string } | null>(null),
    [fileOver, setFileOver] = useState(false);
  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
  }, []);
  const modal = useCallback(
      (type: string, props: any = {}) => setModal({ type, props }),
      [],
    ),
    close = useCallback(() => setModal(null), []);
  const run = useCallback(
    async (method: string, args: any = {}, success?: string) => {
      try {
        const result = await api.call(method, args);
        if (success) toast(success);
        if (method === "secret")
          setData((d) =>
            d
              ? {
                  ...d,
                  [args.name === "lm" ? "hasLmKey" : "hasBraveKey"]: !!args.value,
                }
              : d,
          );
        return result ?? { ok: true };
      } catch (e: unknown) {
        toast(cleanError(e), true);
        return undefined;
      }
    },
    [toast],
  );
  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .call<Bootstrap>("bootstrap")
        .then((d) => {
          if (live) {
            setData(d);
            setBootError("");
          }
        })
        .catch((e) => {
          if (live) setBootError(e.message || "Uygulama hizmetine bağlanılamadı.");
        });
    void load();
    const off = api.listen((e) => {
      if (!live) return;
      if (e.type === "toast") {
        toast(e.data.text, !!e.data.error);
        return;
      }
      setData((old) => {
        if (!old) return old;
        switch (e.type) {
          case "state":
            return { ...old, state: e.data.state, undoCount: e.data.undoCount };
          case "models":
            return { ...old, models: e.data };
          case "game":
            return {
              ...old,
              state: {
                ...old.state,
                games: old.state.games.map((g) => (g.id === e.data.id ? e.data : g)),
              },
            };
          case "note": {
            // Only the UI receives personal notes; keep the rest of state intact.
            const notes = Object.fromEntries(
              Object.entries(old.state.notes || {}).filter(([id]) => id !== e.data.id),
            );
            return {
              ...old,
              state: {
                ...old.state,
                notes: e.data.note ? { ...notes, [e.data.id]: e.data.note } : notes,
              },
            };
          }
          case "queue":
            return { ...old, queue: e.data };
          case "chat":
            return {
              ...old,
              state: {
                ...old.state,
                chats: old.state.chats.some((c) => c.id === e.data.id)
                  ? old.state.chats.map((c) => (c.id === e.data.id ? e.data : c))
                  : [...old.state.chats, e.data],
              },
            };
          case "busy":
            return { ...old, busyChats: e.data };
          case "permission":
            return {
              ...old,
              permissions: [...old.permissions.filter((p) => p.id !== e.data.id), e.data],
            };
          case "permissionClosed":
            return {
              ...old,
              permissions: old.permissions.filter((p) => p.id !== e.data),
            };
          case "wizard":
            return { ...old, wizard: e.data };
          case "wizardClosed":
            return { ...old, wizard: null };
          case "update":
            return { ...old, update: e.data };
          case "nowPlaying":
            return { ...old, nowPlaying: e.data };
          default:
            return old;
        }
      });
    });
    return () => {
      live = false;
      off();
    };
  }, [toast]);
  useEffect(() => {
    if (!data) return;
    const s = data.state.settings,
      root = document.documentElement;
    root.dataset.theme = s.theme;
    root.dataset.motion = s.animations ? "on" : "off";
    root.dataset.density = s.density;
    root.dataset.material = s.material;
    root.style.setProperty("--accent", s.accent);
    root.style.setProperty("--font-size", s.fontSize + "px");
    root.style.setProperty("--radius", s.radius + "px");
    root.style.setProperty("--speed", String(1 / s.animationSpeed));
    root.style.setProperty(
      "--font",
      s.fontFamily === "system"
        ? '"Segoe UI Variable","Segoe UI",system-ui,sans-serif'
        : s.fontFamily,
    );
    root.style.setProperty("--background-blur", s.blur + "px");
  }, [data?.state.settings]);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.state.games.map((g) => g.id));
    setSelected((s) => s.filter((id) => ids.has(id)));
    if (activeId && !ids.has(activeId)) setActiveId(null);
    if (
      !["all", "play"].includes(scope) &&
      !data.state.groups.some((g) => g.id === scope)
    )
      setScopeValue("play");
    setMentions((m) => m.filter((g) => ids.has(g.id)));
    setLowerMentions((m) => m.filter((g) => ids.has(g.id)));
  }, [data?.state.games, data?.state.groups]);
  // "Yenilikler" once after an upgrade (new libraries start with the version).
  const seen = useRef(false);
  useEffect(() => {
    if (!data || seen.current || !data.version) return;
    seen.current = true;
    if (data.state.settings.lastSeenVersion === data.version) return;
    void api
      .call("settings", { patch: { lastSeenVersion: data.version } })
      .catch(() => {});
    if (!data.state.settings.firstRun) setModal({ type: "whatsNew", props: {} });
  }, [data]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      );
      // Turkish keyboards: the "I" key gives "ı" and "İ" gives "i"; both mean Ctrl+I.
      const letter = (e.key || "").toLocaleLowerCase("tr");
      const ctrl = e.ctrlKey || e.metaKey;
      // While a window is open these shortcuts are ignored: opening another window
      // used to replace it and throw away what was typed (e.g. a pasted list).
      if (ctrl && !modalState && ["k", "i", "ı", "n"].includes(letter)) {
        e.preventDefault();
        modal(letter === "k" ? "command" : letter === "n" ? "add" : "import");
      }
      if (ctrl && !e.shiftKey && letter === "z" && !typing && !modalState) {
        e.preventDefault();
        void run("undo", {}, "İşlem geri alındı");
      }
      if (e.key === "/" && !typing && !modalState) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Oyun ara"]')?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modalState, modal, run]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const setActive = (id: string | null) => {
    setActiveId(id);
    setView("library");
  };
  const setScope = (value: string) => {
    setScopeValue(value);
    setActiveId(null);
    setSelected([]);
    setView("library");
  };
  // Add-ons go to the chat that has the focus (the lower one in split view).
  const lowerOpen = () =>
    !!data?.state.settings.chatSplit?.chatId && chatFocus === "bottom";
  const addMentions = (games: Game[]) => {
    const set = lowerOpen() ? setLowerMentions : setMentions;
    set((m) =>
      [...m, ...games.filter((g) => !m.some((x) => x.id === g.id))].slice(0, 10),
    );
  };
  const mention = (game: Game) => {
    setChatOpen(true);
    addMentions([game]);
  };
  const dragEnd = async (e: DragEndEvent) => {
    const ids = e.active.data.current?.ids as string[] | undefined;
    setDrag(null);
    if (!e.over || !ids?.length || !data) return;
    const target = e.over.data.current;
    if (target?.kind === "group") {
      if (target.groupId === "play") {
        // Every game is already in the Oynama Listesi; dropping here only takes
        // the games out of the collection that is open.
        if (["all", "play"].includes(scope)) toast("Oyunlar zaten Oynama Listesinde.");
        else
          await run(
            "play",
            { ids, fromGroup: scope },
            "Koleksiyondan çıkarıldı; oyunlar Oynama Listesinde kalır",
          );
      } else
        await run(
          "moveGroup",
          { ids, groupId: target.groupId === "all" ? null : target.groupId },
          target.groupId === "all" ? "Özel grup üyelikleri kaldırıldı" : "Gruba taşındı",
        );
      return;
    }
    if (target?.kind === "chat") {
      setChatOpen(true);
      addMentions(data.state.games.filter((g) => ids.includes(g.id)));
      return;
    }
    if (target?.targetId && !ids.includes(target.targetId)) {
      const r = e.active.rect.current.translated;
      const after = r
        ? r.top + r.height / 2 > e.over.rect.top + e.over.rect.height / 2
        : false;
      await run("reorder", { ids, targetId: target.targetId, after });
    }
  };
  const drop = async (e: React.DragEvent) => {
    e.preventDefault();
    setFileOver(false);
    if (!e.dataTransfer.files.length) {
      const text = e.dataTransfer.getData("text/plain");
      if (text) modal("import", { initialText: text });
      return;
    }
    const f = e.dataTransfer.files[0];
    if (f.size > 128_000_000) {
      toast("Dosya 128 MB sınırını aşıyor.", true);
      return;
    }
    const raw = await f.text();
    if (/\.json$/i.test(f.name))
      modal("confirm", {
        title: "JSON yedeği geri yüklensin mi?",
        text: "Bu dosya mevcut kütüphane, ayarlar ve sohbetlerin yerine geçecek. Önce otomatik yedek alınacak.",
        onConfirm: () => run("import", { text: raw }, "Yedek geri yüklendi"),
      });
    else
      modal("import", {
        initialText: /\.csv$/i.test(f.name) ? parseCSV(raw).join("\n") : raw,
      });
  };
  if (!data)
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <Gamepad2 size={32} />
        </div>
        <h1>Oyun Sıralayıcı</h1>
        {bootError ? (
          <>
            <p>{bootError}</p>
            <button onClick={() => location.reload()}>
              <RefreshCw size={15} />
              Yeniden dene
            </button>
          </>
        ) : (
          <>
            <Spinner text="Kendi dünyan hazırlanıyor…" />
            <div className="boot-skeleton">
              <i />
              <i />
              <i />
            </div>
          </>
        )}
      </div>
    );
  const active = data.state.games.find((g) => g.id === activeId),
    s = data.state.settings,
    queue = data.queue;
  const props = {
    data,
    setData,
    run,
    toast,
    modal,
    close,
    selected,
    setSelected,
    active,
    setActive,
    scope,
    setScope,
    chatOpen,
    setChatOpen,
    mention,
  };
  const renderModal = () => {
    if (!modalState) return null;
    const p = modalState.props;
    switch (modalState.type) {
      case "import":
        return <ImportModal initialText={p.initialText} />;
      case "add":
        return <AddModal />;
      case "settings":
        return <Settings initialTab={p.tab} />;
      case "group":
        return <GroupModal group={p.group} />;
      case "series":
        return <SeriesModal series={p.series} ids={p.ids} target={p.target} />;
      case "move":
        return <MoveModal ids={p.ids} />;
      case "batch":
        return <BatchModal ids={p.ids} />;
      case "match":
        return <MatchModal game={p.game} />;
      case "command":
        return <CommandModal />;
      case "mood":
        return <MoodModal />;
      case "researchChecks":
        return <ResearchChecksModal ids={p.ids} scope={p.scope} restart={p.restart} />;
      case "researchPick":
        return <ResearchPickModal />;
      case "confirm":
        return <ConfirmModal {...p} />;
      case "update":
        return <UpdateModal />;
      case "whatsNew":
        return <WhatsNewModal />;
      default:
        return null;
    }
  };
  return (
    <Context.Provider value={props}>
      <MotionConfig
        reducedMotion={s.animations ? "user" : "always"}
        transition={{ duration: s.animations ? 0.22 / s.animationSpeed : 0 }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            return args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
          }}
          onDragStart={(e) => {
            const ids = e.active.data.current?.ids || [];
            setDrag({
              ids,
              name:
                e.active.data.current?.kind === "series"
                  ? data.state.series.find(
                      (x) => x.id === String(e.active.id).split(":")[1],
                    )?.name || "Seri"
                  : data.state.games.find((g) => g.id === ids[0])?.name || "Oyun",
            });
          }}
          onDragEnd={dragEnd}
          onDragCancel={() => setDrag(null)}
        >
          <div
            className={"app-shell " + (chatOpen ? "chat-open" : "")}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setFileOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false);
            }}
            onDrop={drop}
          >
            {s.background && (
              <div
                className="app-background"
                style={{ backgroundImage: `url("${s.background}")` }}
              />
            )}
            <header className="titlebar">
              <div className="brand">
                <span className="brand-mark">
                  <Gamepad2 size={21} />
                </span>
                <strong>
                  oyun<span>sıralayıcı</span>
                </strong>
              </div>
              <button className="command-trigger" onClick={() => modal("command")}>
                <Search size={14} />
                <span>Bir oyun, bir komut…</span>
                <kbd>Ctrl K</kbd>
              </button>
              <div className="title-actions">
                <StatusArea />
                <button
                  className="browser-trigger"
                  onClick={() =>
                    data.desktop
                      ? run("openBrowser")
                      : toast(
                          "Sekmeli uygulama tarayıcısı Windows EXE içinde çalışır. Web önizlemesinde bağlantılar yeni tarayıcı sekmesinde açılır.",
                        )
                  }
                >
                  <Globe2 size={15} />
                  <span>Tarayıcı</span>
                </button>
                {!data.desktop && (
                  <span className="preview-label">TARAYICI ÖNİZLEMESİ</span>
                )}
                <IconButton
                  label="Küçült"
                  onClick={() => run("window", { action: "minimize" })}
                  disabled={!data.desktop}
                >
                  <Minus size={15} />
                </IconButton>
                <IconButton
                  label="Büyüt / geri yükle"
                  onClick={() => run("window", { action: "maximize" })}
                  disabled={!data.desktop}
                >
                  <Square size={11} />
                </IconButton>
                <IconButton
                  label="Uygulamayı kapat"
                  className="window-close"
                  onClick={() => run("window", { action: "close" })}
                  disabled={!data.desktop}
                >
                  <X size={16} />
                </IconButton>
              </div>
            </header>
            <div className="app-body">
              <nav className="nav-rail" aria-label="Ana gezinti">
                <div>
                  <button
                    aria-label="Kütüphane"
                    title="Kütüphane"
                    className={view === "library" ? "active" : ""}
                    onClick={() => {
                      setView("library");
                      setActiveId(null);
                    }}
                  >
                    {view === "library" && (
                      <motion.i layoutId="rail-active" className="rail-active" />
                    )}
                    <LibraryBig size={21} />
                    <span />
                  </button>
                  <button
                    aria-label="İstatistikler"
                    title="İstatistikler"
                    className={view === "stats" ? "active" : ""}
                    onClick={() => setView("stats")}
                  >
                    {view === "stats" && (
                      <motion.i layoutId="rail-active" className="rail-active" />
                    )}
                    <ChartNoAxesCombined size={21} />
                  </button>
                  <button
                    aria-label="Yeni özel grup"
                    title="Yeni özel grup"
                    onClick={() => modal("group")}
                  >
                    <FolderPlus size={20} />
                  </button>
                  <div className="rail-rule" />
                  <button
                    aria-label="Oyun ekle"
                    title="Oyun ekle · Ctrl+N"
                    onClick={() => modal("add")}
                  >
                    <Plus size={22} />
                  </button>
                </div>
                <div>
                  <button
                    aria-label="AI sohbeti"
                    title="AI sohbetini aç / kapat"
                    className={chatOpen ? "subtle-active" : ""}
                    onClick={() => setChatOpen(!chatOpen)}
                  >
                    <Sparkles size={21} />
                  </button>
                  <button
                    aria-label="Ayarlar"
                    title="Ayarlar"
                    onClick={() => modal("settings")}
                  >
                    <Settings2 size={21} />
                  </button>
                  <div className="avatar" title="Yerel profil">
                    OY
                  </div>
                </div>
              </nav>
              <div className="main-shell">
                <div className="page-toolbar">
                  <div className="breadcrumb">
                    <span>Çalışma alanın</span>
                    <ChevronRight size={13} />
                    <strong>
                      {view === "stats"
                        ? "İstatistikler"
                        : scope === "all"
                          ? "Kütüphane"
                          : scope === "play"
                            ? "Oynama Listesi"
                            : data.state.groups.find((g) => g.id === scope)?.name}
                    </strong>
                  </div>
                  <div>
                    <button
                      className="toolbar-undo"
                      disabled={!data.undoCount}
                      onClick={() => run("undo", {}, "İşlem geri alındı")}
                      title="Son işlemi geri al · Ctrl+Z"
                    >
                      <Undo2 size={15} />
                      <span>Geri al</span>
                    </button>
                    <button className="soft" onClick={() => modal("import")}>
                      <Upload size={14} />
                      Liste aktar
                    </button>
                  </div>
                </div>
                <GroupBar />
                {queue.running && (
                  <div className="metadata-progress" role="status">
                    <Loader2 size={13} className="spin" />
                    <span>
                      {queue.timesOnly
                        ? "Oyun süreleri tamamlanıyor"
                        : queue.requirementsOnly
                          ? "Sistem gereksinimleri PCGamingWiki'den alınıyor"
                          : "Bilgiler alınıyor"}{" "}
                      · {queue.done}/{queue.total} ·{" "}
                      {data.state.games.find((g) => g.id === queue.current)?.name}
                    </span>
                    <button onClick={() => run("cancelQueue")}>Durdur</button>
                  </div>
                )}
                <div
                  className={"workspace " + (chatOpen ? "with-chat" : "")}
                  style={
                    {
                      "--chat-list": `${chatOpen ? clampListWidth(s.chatListWidth) : 0}px`,
                    } as any
                  }
                >
                  <LibraryPanel />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      className="center-pane"
                      key={view === "stats" ? "stats" : active?.id || "dashboard"}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                    >
                      {view === "stats" ? (
                        <Statistics />
                      ) : active ? (
                        <Detail game={active} />
                      ) : (
                        <Statistics />
                      )}
                      {/* Narrow windows: the chat is a drawer; a click on the
                          dimmed content closes it (and keeps the covered
                          controls out of reach instead of half-clickable). */}
                      {chatOpen && (
                        <div className="chat-scrim" onClick={() => setChatOpen(false)} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {chatOpen && (
                      <ChatPanel
                        key="chat"
                        top={{ draft, setDraft, mentions, setMentions }}
                        bottom={{
                          draft: lowerDraft,
                          setDraft: setLowerDraft,
                          mentions: lowerMentions,
                          setMentions: setLowerMentions,
                        }}
                        focus={chatFocus}
                        setFocus={setChatFocus}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            {fileOver && (
              <div className="file-drop-overlay">
                <Upload size={38} />
                <h2>Listeni buraya bırak.</h2>
                <p>TXT · CSV · tam JSON yedeği</p>
              </div>
            )}
          </div>
          <DragOverlay
            dropAnimation={
              s.animations ? { duration: 250, easing: "cubic-bezier(.2,.8,.2,1)" } : null
            }
          >
            {drag && (
              <div className="drag-preview glass">
                <Gamepad2 size={23} />
                <span>
                  <strong>{drag.name}</strong>
                  <small>
                    {drag.ids.length > 1
                      ? `${drag.ids.length} oyun birlikte taşınıyor`
                      : "Sıraya, gruba veya sohbete bırak"}
                  </small>
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        <AnimatePresence>
          {modalState && (
            <div key={modalState.type} className="modal-layer">
              <Suspense fallback={null}>{renderModal()}</Suspense>
            </div>
          )}
        </AnimatePresence>
        {data.permissions[0] && (
          <div className="permission-layer">
            <PermissionDialog
              key={data.permissions[0].id}
              request={data.permissions[0]}
            />
          </div>
        )}
        {data.wizard && !data.permissions.length && (
          <div className="permission-layer">
            <Wizard key={data.wizard.id} request={data.wizard} />
          </div>
        )}
        <div className="toast-stack" aria-live="polite">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                className={"toast glass " + (t.error ? "error" : "")}
                role={t.error ? "alert" : "status"}
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30 }}
              >
                {t.error ? <AlertCircle size={17} /> : <Check size={17} />}
                <span>{t.text}</span>
                <button
                  aria-label="Bildirimi kapat"
                  onClick={() => setToasts((v) => v.filter((x) => x.id !== t.id))}
                >
                  <X size={13} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </Context.Provider>
  );
}
