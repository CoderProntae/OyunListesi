import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FolderPlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { useApp } from "../lib/context";
import { RESEARCH_GROUP, type Chat, type ChatGroup } from "../../shared/types";
// Chat list on the left of the chat panel. The long line on its right edge is
// dragged to widen / hide it. Rename (double-click or F2), delete (Delete asks;
// Shift+Delete or Shift+click on the bin deletes at once), groups with colors,
// and the built-in "Araştırmalar" group that collects every research chat.
const COLORS = [
  "#9d8cff",
  "#7cc4f8",
  "#5fd4a4",
  "#f5c35b",
  "#ff9b6b",
  "#ff6b9b",
  "#c58cff",
  "#9aa3b5",
];
export const LIST_MAX = 480;
export function clampListWidth(w: number) {
  const room = Math.max(0, window.innerWidth - 304 - 348 - 360);
  const max = Math.min(LIST_MAX, room);
  return w < 120 || max < 160 ? 0 : Math.min(max, Math.round(w));
}
export default function ChatSidebar({
  activeId,
  lowerId,
  focus = "top",
}: {
  activeId?: string;
  lowerId?: string;
  focus?: "top" | "bottom";
}) {
  const { data, run, modal } = useApp();
  const saved = data.state.settings.chatListWidth;
  const [width, setWidth] = useState(() => clampListWidth(saved));
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    id: string;
    kind: "chat" | "group";
    x: number;
    y: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const last = useRef(saved || 240);
  const host = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The right-click menu must stay inside the window, wherever it opens.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(menu.x, innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(menu.y, innerHeight - r.height - 8));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [menu]);
  useEffect(() => setWidth(clampListWidth(saved)), [saved]);
  // A smaller window must not leave the list wider than the room (2.0.1 fix).
  useEffect(() => {
    const fit = () => setWidth((w) => (w ? clampListWidth(w) : 0));
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    const ws = host.current?.closest(".workspace") as HTMLElement | null;
    ws?.style.setProperty("--chat-list", `${width}px`);
  }, [width]);
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    addEventListener("pointerdown", off);
    return () => removeEventListener("pointerdown", off);
  }, [menu]);
  const persist = (w: number) => {
    if (w) last.current = w;
    void run("settings", { patch: { chatListWidth: w } });
  };
  const startDrag = (e: React.PointerEvent) => {
    const startX = e.clientX,
      startW = width;
    let moved = false,
      current = startW;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // While dragging the width follows the pointer; animations only on click.
    const ws = host.current?.closest(".workspace");
    host.current?.classList.add("dragging");
    ws?.classList.add("list-dragging");
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      current = clampListWidth(startW + ev.clientX - startX);
      setWidth(current);
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      host.current?.classList.remove("dragging");
      ws?.classList.remove("list-dragging");
      if (!moved) current = startW ? 0 : clampListWidth(last.current || 240);
      setWidth(current);
      persist(current);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const busy = new Set(data.busyChats);
  const groups = data.state.chatGroups || [];
  const chats = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return data.state.chats
      .filter((c) => !q || c.title.toLocaleLowerCase("tr").includes(q))
      .slice()
      .reverse();
  }, [data.state.chats, query]);
  const inGroup = (g: string | null) =>
    chats.filter((c) => (c.automatic ? RESEARCH_GROUP : c.groupId || null) === g);
  // A click shows the chat in the focused pane (one chat: the only pane).
  const pick = (id: string) =>
    lowerId
      ? void run("chatSplit", { action: "pick", chatId: id, slot: focus })
      : void run("activeChat", { id });
  const remove = (chat: Chat, instant: boolean) => {
    if (instant) void run("deleteChat", { id: chat.id });
    else
      modal("confirm", {
        title: "Sohbet silinsin mi?",
        text: `“${chat.title}” silinecek. Oyun kütüphanen değişmez. İpucu: Shift ile silersen bu soru sorulmaz.`,
        danger: true,
        onConfirm: () => run("deleteChat", { id: chat.id }),
      });
  };
  const rename = (chat: Chat, title: string) => {
    setRenaming(null);
    if (title.trim() && title.trim() !== chat.title)
      void run("renameChat", { id: chat.id, title: title.trim() });
  };
  const item = (c: Chat) => {
    const group = c.automatic
      ? groups.find((g) => g.id === RESEARCH_GROUP)
      : groups.find((g) => g.id === c.groupId);
    return (
      <div
        key={c.id}
        role="option"
        aria-selected={c.id === activeId || c.id === lowerId}
        tabIndex={0}
        className={
          "cs-chat " +
          (c.id === activeId ? "active" : "") +
          (c.id === lowerId ? " lower" : "")
        }
        draggable={!c.automatic && renaming !== c.id}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-oyun-chat", c.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => renaming !== c.id && pick(c.id)}
        onDoubleClick={() => setRenaming(c.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ id: c.id, kind: "chat", x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (renaming === c.id) return;
          if (e.key === "F2") setRenaming(c.id);
          if (e.key === "Delete") remove(c, e.shiftKey);
          if (e.key === "Enter") pick(c.id);
        }}
      >
        <span className="cs-dot" style={{ background: group?.color || "transparent" }} />
        {busy.has(c.id) ? (
          <Loader2 size={13} className="spin" />
        ) : c.automatic ? (
          <FlaskConical size={13} />
        ) : (
          <MessageSquare size={13} />
        )}
        {renaming === c.id ? (
          <input
            autoFocus
            defaultValue={c.title}
            aria-label="Sohbet adı"
            maxLength={120}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => rename(c, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename(c, (e.target as HTMLInputElement).value);
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <span className="cs-title" title={c.title}>
            {c.title}
          </span>
        )}
        {lowerId && (c.id === activeId || c.id === lowerId) && (
          <span
            className="cs-slot"
            title={c.id === activeId ? "Üstteki sohbet" : "Alttaki sohbet"}
          >
            {c.id === activeId ? "Üst" : "Alt"}
          </span>
        )}
        <button
          className="cs-icon"
          aria-label="Sohbeti yeniden adlandır"
          title="Yeniden adlandır (F2)"
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(c.id);
          }}
        >
          <Pencil size={12} />
        </button>
        <button
          className="cs-icon danger"
          aria-label="Sohbeti sil"
          title="Sil · Shift ile uyarısız"
          onClick={(e) => {
            e.stopPropagation();
            remove(c, e.shiftKey);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };
  const section = (g: ChatGroup | null, list: Chat[]) => {
    const key = g?.id || "ungrouped";
    if (!g && !list.length && groups.length > 1) return null;
    const research = g?.system === "research";
    return (
      <section
        key={key}
        className={"cs-group " + (dropTarget === key ? "drop" : "")}
        onDragOver={(e) => {
          if (research || !e.dataTransfer.types.includes("application/x-oyun-chat"))
            return;
          e.preventDefault();
          setDropTarget(key);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("application/x-oyun-chat");
          setDropTarget(null);
          if (id && !research)
            void run("moveChats", { ids: [id], groupId: g?.id || null });
        }}
      >
        <header
          onContextMenu={(e) => {
            if (!g) return;
            e.preventDefault();
            setMenu({ id: g.id, kind: "group", x: e.clientX, y: e.clientY });
          }}
        >
          <button
            className="cs-collapse"
            aria-label={(g?.collapsed ? "Aç: " : "Kapat: ") + (g?.name || "Sohbetler")}
            onClick={() =>
              g &&
              run("chatGroup", {
                action: "edit",
                id: g.id,
                patch: { collapsed: !g.collapsed },
              })
            }
          >
            <ChevronDown
              size={12}
              style={{ transform: g?.collapsed ? "rotate(-90deg)" : undefined }}
            />
          </button>
          {g && <span className="cs-swatch" style={{ background: g.color }} />}
          {g && renaming === g.id ? (
            <input
              autoFocus
              defaultValue={g.name}
              aria-label="Grup adı"
              maxLength={60}
              onBlur={(e) => {
                setRenaming(null);
                if (e.target.value.trim())
                  void run("chatGroup", {
                    action: "edit",
                    id: g.id,
                    patch: { name: e.target.value.trim() },
                  });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <strong onDoubleClick={() => g && setRenaming(g.id)}>
              {g?.name || "Sohbetler"}
            </strong>
          )}
          <small>{list.length}</small>
          {g && (
            <button
              className="cs-icon"
              aria-label={`${g.name} grubu seçenekleri`}
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ id: g.id, kind: "group", x: r.left, y: r.bottom });
              }}
            >
              <MoreHorizontal size={13} />
            </button>
          )}
        </header>
        {!g?.collapsed && (
          <div className="cs-items" role="listbox" aria-label={g?.name || "Sohbetler"}>
            {list.map(item)}
            {!list.length && (
              <p className="cs-empty">
                {research
                  ? "Araştırma sohbetleri burada toplanır."
                  : "Sohbeti buraya sürükle."}
              </p>
            )}
          </div>
        )}
      </section>
    );
  };
  const menuGroup =
    menu?.kind === "group" ? groups.find((g) => g.id === menu.id) : undefined;
  const menuChat =
    menu?.kind === "chat" ? data.state.chats.find((c) => c.id === menu.id) : undefined;
  return (
    <div className="chat-sidebar-host" ref={host}>
      <div
        className={"chat-sidebar " + (width ? "" : "closed")}
        style={{ width }}
        aria-hidden={!width}
      >
        {width > 0 && (
          <>
            <div className="cs-head">
              <strong>Sohbetler</strong>
              <button
                className="cs-icon"
                aria-label="Yeni sohbet grubu"
                title="Yeni grup"
                onClick={() =>
                  run("chatGroup", {
                    action: "create",
                    name: "Yeni grup",
                    color: COLORS[groups.length % COLORS.length],
                  })
                }
              >
                <FolderPlus size={14} />
              </button>
              <button
                className="cs-icon"
                aria-label="Yeni sohbet"
                title="Yeni sohbet"
                onClick={() => run("newChat")}
              >
                <Plus size={14} />
              </button>
            </div>
            <label className="cs-search">
              <Search size={12} />
              <input
                placeholder="Sohbetlerde ara"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Sohbetlerde ara"
              />
            </label>
            <div className="cs-list">
              {groups.filter((g) => !g.system).map((g) => section(g, inGroup(g.id)))}
              {section(null, inGroup(null))}
              {groups.filter((g) => g.system).map((g) => section(g, inGroup(g.id)))}
            </div>
          </>
        )}
      </div>
      <div
        className="cs-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Sohbet listesi: sürükleyerek genişlet, tıklayarak aç/kapat"
        title="Sohbet listesi — sürükle ya da tıkla"
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            const w = clampListWidth((width || 160) + 24);
            setWidth(w);
            persist(w);
          }
          if (e.key === "ArrowLeft") {
            const w = clampListWidth(width - 24);
            setWidth(w);
            persist(w);
          }
        }}
        tabIndex={0}
      >
        <i />
      </div>
      {menu && (
        <div
          className="cs-menu"
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          role="menu"
        >
          {menuChat && (
            <>
              <button
                role="menuitem"
                onClick={() => (setRenaming(menuChat.id), setMenu(null))}
              >
                Yeniden adlandır
              </button>
              {menuChat.id !== activeId && menuChat.id !== lowerId && (
                <button
                  role="menuitem"
                  onClick={() => (
                    run("chatSplit", {
                      action: lowerId ? "pick" : "open",
                      chatId: menuChat.id,
                      slot: "bottom",
                    }),
                    setMenu(null)
                  )}
                >
                  Altta aç (iki sohbet)
                </button>
              )}
              {!menuChat.automatic && (
                <>
                  <small>Gruba taşı</small>
                  {groups
                    .filter((g) => !g.system)
                    .map((g) => (
                      <button
                        role="menuitem"
                        key={g.id}
                        onClick={() => (
                          run("moveChats", { ids: [menuChat.id], groupId: g.id }),
                          setMenu(null)
                        )}
                      >
                        <span className="cs-swatch" style={{ background: g.color }} />{" "}
                        {g.name}
                      </button>
                    ))}
                  {menuChat.groupId && (
                    <button
                      role="menuitem"
                      onClick={() => (
                        run("moveChats", { ids: [menuChat.id], groupId: null }),
                        setMenu(null)
                      )}
                    >
                      Gruptan çıkar
                    </button>
                  )}
                </>
              )}
              <button
                role="menuitem"
                className="danger"
                onClick={(e) => (remove(menuChat, e.shiftKey), setMenu(null))}
              >
                Sil
              </button>
            </>
          )}
          {menuGroup && (
            <>
              <button
                role="menuitem"
                onClick={() => (setRenaming(menuGroup.id), setMenu(null))}
              >
                Yeniden adlandır
              </button>
              <small>Renk</small>
              <div className="cs-colors">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={"Renk " + color}
                    className={menuGroup.color === color ? "active" : ""}
                    style={{ background: color }}
                    onClick={() => (
                      run("chatGroup", {
                        action: "edit",
                        id: menuGroup.id,
                        patch: { color },
                      }),
                      setMenu(null)
                    )}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Özel renk"
                  value={menuGroup.color}
                  onChange={(e) =>
                    run("chatGroup", {
                      action: "edit",
                      id: menuGroup.id,
                      patch: { color: e.target.value },
                    })
                  }
                />
              </div>
              {!menuGroup.system && (
                <button
                  role="menuitem"
                  className="danger"
                  onClick={(e) => {
                    setMenu(null);
                    if (e.shiftKey)
                      void run("chatGroup", { action: "delete", id: menuGroup.id });
                    else
                      modal("confirm", {
                        title: "Grup silinsin mi?",
                        text: "Sohbetler silinmez, gruptan çıkar.",
                        danger: true,
                        onConfirm: () =>
                          run("chatGroup", { action: "delete", id: menuGroup.id }),
                      });
                  }}
                >
                  Grubu sil
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
