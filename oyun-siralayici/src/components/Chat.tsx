import { readableAgentError } from "../../electron/context";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { cleanError, formatNumber } from "../../shared/format";
import remarkGfm from "remark-gfm";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  Plus,
  History,
  X,
  ArrowUp,
  Square,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  Copy,
  BrainCircuit,
  Gamepad2,
  Wrench,
  Trash2,
  Settings2,
  MessageSquare,
  AtSign,
  Link2,
  LockKeyhole,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  Rows2,
} from "lucide-react";
import { useApp } from "../lib/context";
import ChatSidebar, { clampListWidth } from "./ChatSidebar";
import { api, external, date } from "../lib/api";
import { IconButton, Modal, Spinner, Cover } from "./UI";
import { normalizeName } from "../../shared/domain";
import type {
  Chat,
  Game,
  ChatBlock,
  ToolBlock,
  Permission,
  WizardRequest,
} from "../../shared/types";
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children }) => (
          <button className="markdown-link" onClick={() => href && external(href)}>
            {children}
          </button>
        ),
        img: ({ alt }) => (
          <span className="muted">[Görsel: {alt || "uzak görsel gizlendi"}]</span>
        ),
        pre: ({ children }) => (
          <div className="code-block">
            <pre>{children}</pre>
          </div>
        ),
        table: ({ children }) => (
          <div className="markdown-table">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
export interface PaneState {
  draft: string;
  setDraft: (s: string) => void;
  mentions: Game[];
  setMentions: (g: Game[]) => void;
}
const PROMPTS = [
  [
    "Bugün ne oynasam?",
    "Ruh halime ve boş zamanıma göre bir oyun bulmama yardım et. Önce soru sihirbazıyla tercihlerimi sor.",
    "Birlikte karar verelim",
  ],
  [
    "Bilgisayarım kaldırır mı?",
    "Listemdeki oyunları sistemimle karşılaştır. Belirsiz sonuçları açıkla; henüz değişiklik yapma.",
    "Kaynaklarla karşılaştıralım",
  ],
  [
    "Benzer ne oynarım?",
    "Seçtiğim oyuna benzeyen ve bilgisayarımın kaldırabileceği oyunları kütüphanemden öner. Listeyi değiştirme.",
    "Kütüphanenden seçelim",
  ],
] as const;
// The chat panel: list on the left, one chat — or two, one under the other
// (2.0.2). With two chats both panes switch to a quieter, simpler look.
export default function ChatPanel({
  top,
  bottom,
  focus,
  setFocus,
}: {
  top: PaneState;
  bottom: PaneState;
  focus: "top" | "bottom";
  setFocus: (f: "top" | "bottom") => void;
}) {
  const { data, run, setChatOpen } = useApp();
  const { setNodeRef, isOver } = useDroppable({
    id: "chat-drop",
    data: { kind: "chat" },
  });
  const split = data.state.settings.chatSplit || { chatId: null, ratio: 0.5 };
  const upper = data.state.chats.find((c) => c.id === data.state.activeChatId);
  const lower = split.chatId
    ? data.state.chats.find((c) => c.id === split.chatId)
    : undefined;
  const splitOn = !!lower && !!upper;
  const [ratio, setRatio] = useState(split.ratio);
  useEffect(() => setRatio(split.ratio), [split.ratio]);
  const panes = useRef<HTMLDivElement>(null);
  const active = splitOn ? focus : "top";
  const resize = (e: React.PointerEvent) => {
    const box = panes.current!.getBoundingClientRect();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    let current = ratio;
    const move = (ev: PointerEvent) => {
      current = Math.min(0.8, Math.max(0.2, (ev.clientY - box.top) / box.height));
      setRatio(current);
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      void run("chatSplit", { action: "ratio", ratio: Math.round(current * 100) / 100 });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  return (
    <motion.aside
      ref={setNodeRef}
      className={"chat-panel " + (isOver ? "chat-drop-over" : "")}
      initial={{ opacity: 0, x: 36 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 36 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <ChatSidebar
        activeId={upper?.id}
        lowerId={splitOn ? lower?.id : undefined}
        focus={active}
      />
      <div className={"chat-main" + (splitOn ? " split" : "")}>
        <header className="chat-header">
          <div className="ai-mark">
            <Sparkles size={19} />
          </div>
          <div>
            <h2>
              Oyun arkadaşın<span>AI</span>
            </h2>
          </div>
          <div className="chat-header-actions">
            <IconButton
              label="Yeni sohbet"
              onClick={() =>
                run("newChat", splitOn && active === "bottom" ? { slot: "bottom" } : {})
              }
            >
              <Plus size={17} />
            </IconButton>
            <IconButton
              label={splitOn ? "Tek sohbete dön" : "İki sohbeti alt alta aç"}
              className={splitOn ? "active" : ""}
              onClick={() => {
                if (splitOn) void run("chatSplit", { action: "close" });
                else {
                  setFocus("bottom");
                  void run("chatSplit", { action: "open" });
                }
              }}
            >
              <Rows2 size={16} />
            </IconButton>
            <IconButton
              label="Sohbet listesi"
              onClick={() =>
                run("settings", {
                  patch: {
                    chatListWidth: data.state.settings.chatListWidth
                      ? 0
                      : clampListWidth(240) || 240,
                  },
                })
              }
            >
              <History size={16} />
            </IconButton>
            <IconButton label="Sohbeti gizle" onClick={() => setChatOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>
        </header>
        {!splitOn && <ModelPicker />}
        <div className="chat-panes" ref={panes}>
          <ChatPane
            slot="top"
            chat={upper}
            state={top}
            compact={splitOn}
            focused={splitOn && active === "top"}
            onFocus={() => setFocus("top")}
            onClose={
              splitOn
                ? () => {
                    setFocus("top");
                    void run("chatSplit", { action: "swap" }).then(() =>
                      run("chatSplit", { action: "close" }),
                    );
                  }
                : undefined
            }
            grow={splitOn ? ratio : 1}
          />
          {splitOn && (
            <div
              className="split-handle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Sohbetlerin yüksekliği: sürükle, çift tıkla eşitle"
              onPointerDown={resize}
              onDoubleClick={() => run("chatSplit", { action: "ratio", ratio: 0.5 })}
            >
              <i />
            </div>
          )}
          {splitOn && (
            <ChatPane
              slot="bottom"
              chat={lower}
              state={bottom}
              compact
              focused={active === "bottom"}
              onFocus={() => setFocus("bottom")}
              onClose={() => {
                setFocus("top");
                void run("chatSplit", { action: "close" });
              }}
              grow={1 - ratio}
            />
          )}
        </div>
        {isOver && (
          <div className="chat-drop-overlay">
            <Plus size={32} />
            <strong>Oyunu sohbete ekle</strong>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
function ModelPicker() {
  const { data, modal } = useApp();
  return (
    <div className="chat-model">
      <button onClick={() => modal("settings", { tab: "lm" })}>
        <span>{data.state.settings.lmModel || "Bir yerel model bağla"}</span>
        <ChevronDown size={12} />
      </button>
    </div>
  );
}
function ChatPane({
  slot,
  chat,
  state,
  compact,
  focused,
  onFocus,
  onClose,
  grow,
}: {
  slot: "top" | "bottom";
  chat?: Chat;
  state: PaneState;
  compact: boolean;
  focused: boolean;
  onFocus: () => void;
  onClose?: () => void;
  grow: number;
}) {
  const { data, run, toast } = useApp();
  const { draft, setDraft, mentions, setMentions } = state;
  const [sending, setSending] = useState(false);
  const feed = useRef<HTMLDivElement>(null),
    bottomRef = useRef(true),
    input = useRef<HTMLTextAreaElement>(null);
  const busy = !!chat && data.busyChats.includes(chat.id);
  const latest = chat?.messages.at(-1);
  useEffect(() => {
    if (bottomRef.current && chat?.messages.length)
      feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "instant" });
  }, [chat, latest]);
  useEffect(() => {
    bottomRef.current = true;
  }, [chat?.id]);
  const at = draft.match(/@([^@\n]{0,80})$/);
  const suggestions = at
    ? data.state.games
        .filter(
          (g) =>
            normalizeName(g.name).includes(normalizeName(at[1])) &&
            !mentions.some((m) => m.id === g.id),
        )
        .slice(0, 5)
    : [];
  const send = async () => {
    if (!draft.trim() || busy || sending) return;
    setSending(true);
    try {
      let id = chat?.id;
      if (!id) {
        const c = await api.call("newChat", slot === "bottom" ? { slot } : {});
        id = c.id;
      }
      await api.call("send", {
        chatId: id,
        text: draft,
        mentions: mentions.map((g) => g.id),
      });
      setDraft("");
      setMentions([]);
      bottomRef.current = true;
    } catch (e: unknown) {
      toast(cleanError(e), true);
    } finally {
      setSending(false);
    }
  };
  return (
    <section
      className={
        `chat-pane ${slot}` + (compact ? " compact" : "") + (focused ? " focused" : "")
      }
      style={{ flexGrow: grow }}
      onFocusCapture={onFocus}
      onPointerDownCapture={onFocus}
      aria-label={
        compact ? (slot === "top" ? "Üstteki sohbet" : "Alttaki sohbet") : undefined
      }
    >
      {compact && (
        <div className="pane-head">
          <span className={"pane-dot" + (busy ? " busy" : "")} />
          <strong title={chat?.title}>{chat?.title || "Yeni sohbet"}</strong>
          {busy && <small>çalışıyor</small>}
          {onClose && (
            <button
              className="cs-icon"
              aria-label={
                slot === "top" ? "Üstteki sohbeti kapat" : "Alttaki sohbeti kapat"
              }
              title="Bu bölmeyi kapat"
              onClick={onClose}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <div
        className="chat-feed"
        ref={feed}
        onScroll={() => {
          const el = feed.current!;
          bottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {!chat?.messages.length ? (
          compact ? (
            <p className="pane-empty">Bu sohbet boş. Aşağıya yazarak başla.</p>
          ) : (
            <div className="chat-welcome">
              <div className="chat-orb">
                <Sparkles size={29} strokeWidth={1.4} />
              </div>
              <span className="eyebrow">SADECE SANA GÖRE</span>
              <h3>Birlikte ne oynasak?</h3>
              <p>Oyunlarını tanıyan, seçimlerini kolaylaştıran yerel yardımcın.</p>
              <div className="prompt-cards">
                {PROMPTS.map(([label, prompt, hint], i) => (
                  <button
                    key={label}
                    onClick={() => {
                      setDraft(prompt);
                      input.current?.focus();
                    }}
                  >
                    <span>
                      {i === 0 ? (
                        <Sparkles size={15} />
                      ) : i === 1 ? (
                        <Wrench size={15} />
                      ) : (
                        <Gamepad2 size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              <div className="chat-tip">
                <AtSign size={14} />
                <span>
                  Bir oyunu buraya sürükle veya <b>@</b> ile ekle.
                </span>
              </div>
              {!data.desktop && (
                <p className="preview-disclaimer">
                  Tarayıcı önizlemesi, bilgisayarındaki LM Studio’ya erişemez. Yerel
                  bağlantıyı Windows uygulamasında kullan.
                </p>
              )}
            </div>
          )
        ) : (
          chat.messages.map((m) => (
            <div key={m.id} className={"chat-message " + m.role}>
              <div className="message-label">
                {m.role === "assistant" ? (
                  <>
                    <Sparkles size={12} />
                    Oyun arkadaşın
                  </>
                ) : (
                  <>
                    SEN
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                )}
              </div>
              {groupBlocks(m.blocks).map((b) =>
                Array.isArray(b) ? (
                  <ToolGroup key={b[0].id} blocks={b} chatId={chat.id} />
                ) : b.type === "tool" ? (
                  <ToolCard key={b.id} block={b} chatId={chat.id} />
                ) : b.type === "thinking" ? (
                  data.state.settings.showThinking ? (
                    <details className="thinking-block" key={b.id}>
                      <summary>
                        <BrainCircuit size={13} />
                        Düşünme çıktısı
                        <ChevronDown size={12} />
                      </summary>
                      <div className="markdown">
                        <Markdown text={b.text} />
                      </div>
                    </details>
                  ) : null
                ) : b.type === "notice" ? (
                  <div className="chat-notice" key={b.id}>
                    <InfoSmall />
                    <div>
                      <span>
                        {readableAgentError(
                          b.text,
                          !!m.error && m.blocks.at(-1)?.id === b.id,
                        )}
                      </span>
                      {readableAgentError(
                        b.text,
                        !!m.error && m.blocks.at(-1)?.id === b.id,
                      ) !== b.text && (
                        <details className="error-details">
                          <summary>Teknik ayrıntı</summary>
                          <pre>{b.text}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="markdown" key={b.id}>
                    <Markdown text={b.text} />
                  </div>
                ),
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="agent-working">
            <span />
            <span />
            <span />
            <small>
              {data.permissions.length
                ? "İznini bekliyor"
                : data.wizard
                  ? "Cevabını bekliyor"
                  : "Üzerinde çalışıyor"}
            </small>
          </div>
        )}
      </div>
      <div className="chat-composer-area">
        {chat?.allowedTools.length ? (
          <button
            className="grant-notice"
            onClick={() =>
              run("revokeGrants", { chatId: chat.id }, "Sohbet izinleri sıfırlandı")
            }
          >
            <ShieldCheck size={12} />
            {chat.allowedTools.length} araç için sohbet izni · sıfırla
          </button>
        ) : null}
        {mentions.length > 0 && (
          <div className="mention-chips">
            {mentions.map((g) => (
              <span key={g.id}>
                @{g.name}
                <button
                  aria-label={`${g.name} ekini kaldır`}
                  onClick={() => setMentions(mentions.filter((m) => m.id !== g.id))}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="mention-menu">
            {suggestions.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setMentions([...mentions, g].slice(0, 10));
                  setDraft(draft.replace(/@[^@\n]{0,80}$/, ""));
                  input.current?.focus();
                }}
              >
                <Cover name={g.name} cover={g.cover} />
                {g.name}
              </button>
            ))}
          </div>
        )}
        <div className="chat-composer">
          <textarea
            ref={input}
            aria-label={slot === "bottom" ? "Alttaki sohbete mesaj" : "Ajana mesaj"}
            placeholder={compact ? "Mesaj yaz…" : "Birlikte bir sonraki oyunu bulalım…"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={compact ? 1 : 2}
            maxLength={15000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div>
            <span>
              <AtSign size={13} />
              Oyun ekle<span>·</span>
              <kbd>↵</kbd>Gönder
            </span>
            {busy ? (
              <button
                className="send-button stop"
                aria-label={slot === "bottom" ? "Alttaki ajanı durdur" : "Ajanı durdur"}
                onClick={() => run("stopChat", { chatId: chat!.id })}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                aria-label={slot === "bottom" ? "Alttaki sohbete gönder" : "Mesaj gönder"}
                disabled={!draft.trim() || sending}
                onClick={send}
              >
                {sending ? <Loader2 size={17} className="spin" /> : <ArrowUp size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function InfoSmall() {
  return <AlertCircle size={13} />;
}
function ToolCard({ block: b, chatId }: { block: ToolBlock; chatId: string }) {
  const { run, data, toast } = useApp();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("result");
  const names: Record<string, string> = {
    web_search: "Web’de araştırıyor",
    fetch_page: "Kaynağı okuyor",
    list_games: "Oyun listesi",
    get_list_state: "Kütüphane düzeni",
    get_game_info: "Oyun bilgileri",
    get_hardware: "Bilgisayar donanımı",
    add_game: "Oyun ekleme",
    edit_game: "Oyun kaydını düzenleme",
    edit_games: "Toplu oyun düzenleme",
    update_game_info: "Oyun bilgilerini kaydetme",
    refresh_game_info: "Mağaza ve süre bilgilerini yenileme",
    remove_game: "Oyun silme",
    reorder: "Liste sıralama",
    move_to_group: "Gruba taşıma",
    create_group: "Grup oluşturma",
    edit_group: "Grup düzenleme",
    delete_group: "Grup silme",
    create_series: "Seri oluşturma",
    rename_series: "Seri adını değiştirme",
    dissolve_series: "Seriyi dağıtma",
    record_compatibility: "Donanım karşılaştırmasını kaydetme",
    add_to_play_list: "Oynama Listesine ekleme",
    check_compatibility: "Donanım kontrolü",
    generate_short_description: "Türkçe özet",
    recommend_similar: "Benzer oyunlar",
    ask_user_questions: "Tercihlerini öğreniyor",
  };
  const serialized =
    JSON.stringify(tab === "input" ? b.args : b.result, null, 2) ||
    b.error ||
    "Sonuç bekleniyor…";
  return (
    <div className={"tool-card " + b.status}>
      <button className="tool-head" onClick={() => setOpen(!open)}>
        {b.status === "running" ? (
          <Loader2 className="spin" size={15} />
        ) : b.status === "done" ? (
          <Check size={15} />
        ) : b.status === "denied" ? (
          <ShieldCheck size={15} />
        ) : (
          <AlertCircle size={15} />
        )}
        <span>{names[b.name] || b.name}</span>
        <small>
          {b.status === "running"
            ? "Çalışıyor"
            : b.status === "denied"
              ? "İzin verilmedi"
              : b.status === "error"
                ? "Hata"
                : b.duration !== undefined
                  ? formatNumber(b.duration / 1000, 1) + " sn"
                  : "Tamamlandı"}
        </small>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-tabs">
            <button
              className={tab === "result" ? "active" : ""}
              onClick={() => setTab("result")}
            >
              Sonuç
            </button>
            <button
              className={tab === "input" ? "active" : ""}
              onClick={() => setTab("input")}
            >
              Girdi
            </button>
            <code>{b.name}</code>
          </div>
          <pre>{serialized}</pre>
          {b.error && <p className="error-text">{b.error}</p>}
          <div className="tool-links">
            <ResultLinks value={b.result} />
          </div>
          <div className="tool-bottom">
            <small>#{b.id.slice(0, 8)}</small>
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(serialized)
                  .then(() => toast("Panoya kopyalandı"))
                  .catch(() => toast("Pano erişimi yok", true));
              }}
            >
              <Copy size={12} />
              Kopyala
            </button>
            {b.status !== "running" && (
              <button
                disabled={
                  data.busyChats.includes(chatId) ||
                  data.busyChats.length >=
                    (data.state.settings.parallelRequests === false ? 1 : 2)
                }
                onClick={() => run("retryTool", { chatId, name: b.name, args: b.args })}
              >
                <RotateCcw size={12} />
                Yeniden dene
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function ResultLinks({ value }: { value: any }) {
  const links = new Map<string, string>();
  const host = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url.slice(0, 40);
    }
  };
  const visit = (o: any, depth = 0) => {
    if (!o || depth > 5 || links.size >= 10) return;
    if (Array.isArray(o)) o.forEach((v) => visit(v, depth + 1));
    else if (typeof o === "object") {
      if (typeof o.url === "string" && /^https?:\/\//.test(o.url))
        links.set(o.url, o.title || o.name || host(o.url));
      Object.values(o).forEach((v) => visit(v, depth + 1));
    }
  };
  visit(value);
  return (
    <>
      {[...links].map(([url, title]) => (
        <button key={url} onClick={() => external(url)}>
          <Link2 size={11} />
          {title}
        </button>
      ))}
    </>
  );
}
export function PermissionDialog({ request: p }: { request: Permission }) {
  const { run } = useApp();
  const decide = (decision: string) => run("permission", { id: p.id, decision });
  return (
    <Modal
      title={
        p.mutation
          ? "Bu değişikliğe izin veriyor musun?"
          : "Bu okuma aracına izin veriyor musun?"
      }
      subtitle="Kontrol sende. Reddedersen bu araç çalıştırılmaz."
      onClose={() => decide("deny")}
      footer={
        <>
          <button onClick={() => decide("deny")}>İzin verme</button>
          <button className="soft" onClick={() => decide("always")}>
            Bu araç için sohbet boyunca
          </button>
          <button className="primary" onClick={() => decide("allow")}>
            <Check size={15} />
            Bir kez izin ver
          </button>
        </>
      }
    >
      <div className="permission-visual">
        <ShieldCheck size={25} />
        <span>{p.mutation ? "KÜTÜPHANE DEĞİŞİKLİĞİ" : "VERİ OKUMA"}</span>
        <code>{p.tool}</code>
      </div>
      <p className="permission-description">{p.description}</p>
      {p.tool === "update_game_info" &&
        (p.args.sources?.length || 0) + (p.args.evidence?.length || 0) > 0 && (
          <div className="approval-evidence">
            <strong>Eklenen kaynaklar</strong>
            {[...(p.args.sources || []), ...(p.args.evidence || [])].map(
              (e: any, i: number) => (
                <div key={i}>
                  <button className="text-link" onClick={() => external(e.url)}>
                    {e.url}
                  </button>
                  {e.quote && <blockquote>{e.quote}</blockquote>}
                  <small>{e.fields?.join(" · ")}</small>
                </div>
              ),
            )}
          </div>
        )}
      <details>
        <summary>Tam araç girdisini göster</summary>
        <pre>{JSON.stringify(p.args, null, 2)}</pre>
      </details>
      <p className="tiny muted">
        “Sohbet boyunca” yalnızca <strong>{p.tool}</strong> aracını bu sohbet için
        onaylar. İzni sohbet panelinden sıfırlayabilirsin.
      </p>
    </Modal>
  );
}
export function Wizard({ request: w }: { request: WizardRequest }) {
  const { run } = useApp();
  const [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<
      Record<string, { selected: string[]; custom: string; skipped?: boolean }>
    >({});
  const q = w.questions[index],
    answer = answers[q.id] || { selected: [], custom: "" };
  const set = (v: any) => setAnswers({ ...answers, [q.id]: { ...answer, ...v } });
  const finish = (values: any, cancelled = false) =>
    run("wizard", {
      id: w.id,
      answer: {
        cancelled,
        answers: w.questions
          .filter((x) => values[x.id])
          .map((x) => ({
            id: x.id,
            question: x.question,
            ...values[x.id],
            selectedLabels: x.options
              .filter((o) => values[x.id].selected.includes(o.id))
              .map((o) => o.label),
          })),
      },
    });
  const next = (skip = false) => {
    const values = { ...answers, [q.id]: { ...answer, skipped: skip } };
    setAnswers(values);
    if (index === w.questions.length - 1) void finish(values);
    else setIndex(index + 1);
  };
  return (
    <Modal
      title="Biraz seni tanıyalım."
      subtitle="Oyun arkadaşın seçimlerini bekliyor."
      onClose={() => finish(answers, true)}
      footer={
        <>
          <button onClick={() => finish(answers, true)}>İptal</button>
          <div className="footer-spacer" />
          {index > 0 && (
            <button onClick={() => setIndex(index - 1)}>
              <ArrowLeft size={14} />
              Geri
            </button>
          )}
          <button onClick={() => next(true)}>Atla</button>
          <button
            className="primary"
            disabled={!answer.selected.length && !answer.custom.trim()}
            onClick={() => next()}
          >
            {index === w.questions.length - 1 ? "Yanıtları gönder" : "Devam"}
            <ArrowRight size={15} />
          </button>
        </>
      }
    >
      <div className="wizard-progress">
        <span>
          <Sparkles size={14} />
          SANA ÖZEL BİR SEÇİM
        </span>
        <b>
          {index + 1}
          <small> / {w.questions.length}</small>
        </b>
      </div>
      <div className="wizard-track">
        {w.questions.map((_, i) => (
          <i key={i} className={i <= index ? "active" : ""} />
        ))}
      </div>
      <h3 className="wizard-question">{q.question}</h3>
      <p className="muted tiny">
        {q.multiple ? "Birden fazla seçim yapabilirsin." : "Sana en yakın seçeneği seç."}
      </p>
      <div className="wizard-options">
        {q.options.map((o) => (
          <button
            key={o.id}
            className={answer.selected.includes(o.id) ? "selected" : ""}
            onClick={() =>
              set({
                selected: q.multiple
                  ? answer.selected.includes(o.id)
                    ? answer.selected.filter((id) => id !== o.id)
                    : [...answer.selected, o.id]
                  : [o.id],
              })
            }
          >
            <span className={q.multiple ? "square" : ""}>
              {answer.selected.includes(o.id) && <Check size={12} />}
            </span>
            {o.label}
          </button>
        ))}
      </div>
      <label className="custom-answer">
        <span>Farklı bir cevabım var</span>
        <textarea
          rows={2}
          placeholder="Aklındakini kendi cümlelerinle anlat…"
          value={answer.custom}
          maxLength={1500}
          onChange={(e) => set({ custom: e.target.value })}
        />
      </label>
    </Modal>
  );
}

function groupBlocks(blocks: ChatBlock[]): (ChatBlock | ToolBlock[])[] {
  const groups: (ChatBlock | ToolBlock[])[] = [];
  for (const b of blocks) {
    const last = groups.at(-1);
    if (b.type === "tool" && Array.isArray(last)) last.push(b);
    else if (b.type === "tool") groups.push([b]);
    else groups.push(b);
  }
  return groups.map((g) => (Array.isArray(g) && g.length === 1 ? g[0] : g));
}
function ToolGroup({ blocks, chatId }: { blocks: ToolBlock[]; chatId: string }) {
  const active = blocks.some((b) => b.status !== "done");
  return (
    <details className="tool-group" open={active || undefined}>
      <summary>
        <Wrench size={13} />
        <span>{blocks.length} araç adımı</span>
        <small>
          {active
            ? "İşlem ayrıntıları"
            : `${formatNumber(blocks.reduce((n, b) => n + (b.duration || 0), 0) / 1000, 1)} sn · tamamlandı`}
        </small>
        <ChevronDown size={12} />
      </summary>
      <div>
        {blocks.map((b) => (
          <ToolCard key={b.id} block={b} chatId={chatId} />
        ))}
      </div>
    </details>
  );
}
