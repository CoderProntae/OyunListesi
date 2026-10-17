import {
  hasRequirementValues,
  parseRequirements,
  repairRequirements,
  requirementsText,
} from "./requirements";
import { researchProgress } from "../shared/research-progress";
import { compatibility, learnKey } from "../shared/compatibility";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import {
  initialState,
  newGame,
  normalizeName,
  inferSeries,
  reorderBlock,
  now,
  uid,
  researchGroup,
  defaultSettings,
  legacySystemPrompt,
  emptyHardware,
  NOTE_MAX_LENGTH,
  HLTB_RESTORE_MIGRATION,
  REQUIREMENTS_REPAIR_MIGRATION,
  STORE_REQUIREMENTS_MIGRATION,
  STORE_ONLY_MIGRATION,
  DLC_DATA_MIGRATION,
  OVERLAY_INTRO_MIGRATION,
  TITLE_SEARCH_MIGRATION,
  PCGW_MIGRATION,
  PCGW_INFO_MIGRATION,
  missingInfo,
} from "../shared/domain";
import {
  gameSchema,
  originSchema,
  chatSchema,
  chatGroupSchema,
  settingsSchema,
  hardwareSchema,
  noteSchema,
  completionTimesSchema,
  sourceSchema,
  requirementsSchema,
} from "./validation";
import {
  RESEARCH_GROUP,
  type AppState,
  type Game,
  type GameNote,
  type Chat,
  type Settings,
  type Hardware,
} from "../shared/types";
const ids = z.array(z.string().max(100)).max(20000);
// Fields of the Turkish tab / patch features removed in 1.0.12. Old values are
// dropped on load. HowLongToBeat times (hltb) are kept: only the research stage
// that searched for them was removed.
const removedField = (field: string) => /^turkish(\.|$)/.test(field);
const timesField = (field: unknown) =>
  typeof field === "string" && /^hltb(\.|$)/.test(field);
// 1.0.15 removed the third requirement level ("optimum"); stores publish only
// minimum and recommended. Its values, AI comparisons and markers are dropped.
const removedLevel = (field: string) => /^optimum(\.|$)/.test(field);
const requirementValues = [
  "os",
  "cpu",
  "gpu",
  "ramGB",
  "vramGB",
  "storageGB",
  "directX",
  "vulkan",
] as const;
const removedStages = new Set(["details", "patch"]);
export class Store extends EventEmitter {
  state: AppState;
  root: string;
  undoStack: Pick<AppState, "games" | "groups" | "series">[] = [];
  private timer: NodeJS.Timeout | null = null;
  private day = "";
  warning = "";
  constructor(root: string) {
    super();
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, "backups"), { recursive: true });
    fs.mkdirSync(path.join(root, "media"), { recursive: true });
    this.state = initialState();
    const p = path.join(root, "library.json");
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        // Before the one-time removal of Turkish data, keep the untouched file
        // as a normal restorable backup. Later backups rotate it out.
        if (
          raw?.notes === undefined &&
          Array.isArray(raw?.games) &&
          raw.games.some((g: any) => g?.turkish !== undefined)
        )
          fs.copyFileSync(
            p,
            path.join(
              root,
              "backups",
              `library-${new Date().toISOString().replace(/[:.]/g, "-")}-yukseltme-oncesi.json`,
            ),
          );
        this.state = this.validate(raw);
        this.migrate(this.state, raw);
      } catch (e) {
        this.warning =
          "Ana veri dosyası okunamadı. Dosya korunuyor; yedeklerden geri yükleyebilirsin.";
        fs.copyFileSync(p, path.join(root, `library-corrupt-${Date.now()}.json`));
        const backups = this.backups();
        for (const b of backups) {
          try {
            const raw = JSON.parse(
              fs.readFileSync(path.join(root, "backups", b.name), "utf8"),
            );
            this.state = this.validate(raw);
            this.migrate(this.state, raw);
            this.warning = "Ana dosya okunamadı; son sağlam yedek yüklendi.";
            break;
          } catch {}
        }
      }
    }
    this.flush();
  }
  validate(raw: any): AppState {
    if (
      !raw ||
      raw.version !== 1 ||
      !Array.isArray(raw.games) ||
      raw.games.length > 20000
    )
      throw new Error("Geçerli uygulama JSON yedeği değil.");
    const base = initialState(),
      seen = new Set<string>(),
      reconcile = new Set<string>();
    const games: Game[] = raw.games.map((g: any, i: number) => {
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(300),
      }).parse(g);
      if (seen.has(g.id)) throw new Error("Yedekte yinelenen oyun kimliği var.");
      seen.add(g.id);
      const n = newGame(g.name, i, g.appId);
      const stage = g.research?.stage;
      // Records written before 1.0.12 carry the removed Turkish data and may have
      // research saved at a removed stage (language+HLTB "details" or "patch").
      const legacy =
        g.turkish !== undefined ||
        g.patchSearchRevision !== undefined ||
        removedStages.has(stage);
      const dropped = (field: unknown) =>
        removedLevel(String(field)) || (legacy && removedField(String(field)));
      if (legacy && g.research) {
        const status = g.research.status;
        if (
          status === "incomplete" ||
          (removedStages.has(stage) && (status === "cancelled" || status === "error"))
        )
          reconcile.add(g.id);
      }
      return gameSchema.parse({
        ...n,
        ...g,
        order: i,
        inPlayList: true,
        research: g.research
          ? {
              ...g.research,
              stage: stage === "hardware" || stage === "summary" ? stage : undefined,
              ...(g.research.status === "running"
                ? {
                    status: "queued",
                    message: "Önceki araştırma yarıda kaldı; sıradan devam edecek.",
                  }
                : {}),
            }
          : g.research,
        minimum: repairRequirements({ raw: "", ...g.minimum }),
        recommended: repairRequirements({ raw: "", ...g.recommended }),
        // An old "optimum" value is not listed here; validation drops it.
        ...(Array.isArray(g.aiCompatibility)
          ? {
              aiCompatibility: g.aiCompatibility.filter(
                (r: any) => r?.level !== "optimum",
              ),
            }
          : {}),
        // Only real arrays are cleaned. A missing list keeps the new-game default;
        // an invalid value still reaches validation and is rejected as before.
        ...(Array.isArray(g.aiEditedFields)
          ? { aiEditedFields: g.aiEditedFields.filter((f: unknown) => !dropped(f)) }
          : {}),
        ...(Array.isArray(g.sources)
          ? {
              // Drop provenance that only described removed fields (HLTB API,
              // patch pages, the removed level); keep store/official and
              // requirement sources.
              sources: g.sources.flatMap((source: any) => {
                if (!Array.isArray(source?.fields) || !source.fields.length)
                  return [source];
                const fields = source.fields.filter((f: unknown) => !dropped(f));
                return fields.length ? [{ ...source, fields }] : [];
              }),
            }
          : {}),
        fetchStatus: ["loading", "queued"].includes(g.fetchStatus)
          ? "idle"
          : g.fetchStatus || "idle",
      });
    });
    const groups = z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().max(100),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
          icon: z.string().max(30),
        }),
      )
      .max(200)
      .parse(raw.groups || []);
    const series = z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().max(150),
          automatic: z.boolean(),
        }),
      )
      .max(5000)
      .parse(raw.series || []);
    const settings = this.cleanSettings({ ...base.settings, ...raw.settings });
    // Fresh research passes retain their previous chats. File-size validation
    // still applies; do not make another pass invalidate a full-size library.
    const chats = z
      .array(chatSchema)
      .parse(raw.chats || [])
      .map((c) => ({
        ...c,
        allowedTools: [],
        messages: c.messages.map((m) => ({
          ...m,
          blocks: m.blocks.map((b) =>
            b.type === "tool"
              ? {
                  ...b,
                  args: b.args ?? null,
                  ...(b.status === "running"
                    ? {
                        status: "denied" as const,
                        error: "Önceki oturum kesildi; araç yeniden çalıştırılmadı.",
                      }
                    : {}),
                }
              : b,
          ),
        })),
      }));
    for (const c of chats) {
      for (let i = 0; i < c.apiHistory.length; i++) {
        const m = c.apiHistory[i];
        if (m.role !== "assistant" || !m.tool_calls?.length) continue;
        let end = i + 1;
        const done = new Set<string>();
        while (c.apiHistory[end]?.role === "tool") {
          done.add(c.apiHistory[end].tool_call_id!);
          end++;
        }
        const pending = m.tool_calls
          .filter((t) => !done.has(t.id))
          .map((t) => ({
            role: "tool" as const,
            tool_call_id: t.id,
            content:
              '{"cancelled":true,"message":"Önceki oturum kesildi; işlem yeniden çalıştırılmadı."}',
          }));
        c.apiHistory.splice(end, 0, ...pending);
        i = end + pending.length - 1;
      }
    }
    if (
      new Set(groups.map((g) => g.id)).size !== groups.length ||
      new Set(series.map((g) => g.id)).size !== series.length ||
      new Set(chats.map((g) => g.id)).size !== chats.length
    )
      throw new Error("Yinelenen grup, seri veya sohbet kimliği.");
    // Files written before 1.0.12 have no notes key. The default "Türkçe Yama
    // Yok" group belonged to the removed feature; drop it only if it is empty.
    const legacyFile = raw.notes === undefined;
    const used = new Set(games.flatMap((g) => g.groupIds));
    const keptGroups = legacyFile
      ? groups.filter(
          (x) =>
            !(x.name === "Türkçe Yama Yok" && x.icon === "language" && !used.has(x.id)),
        )
      : groups;
    for (const g of games) {
      g.groupIds = g.groupIds.filter((id) => keptGroups.some((x) => x.id === id));
      if (g.seriesId && !series.some((x) => x.id === g.seriesId)) g.seriesId = undefined;
    }
    const hardware = this.cleanHardware({ ...emptyHardware, ...raw.hardware });
    // Chat groups (2.0). The built-in "Araştırmalar" group always exists and
    // holds every automatic research chat.
    const parsedGroups = z
      .array(chatGroupSchema)
      .max(100)
      .catch([])
      .parse(raw.chatGroups || [])
      .filter((g, i, all) => all.findIndex((x) => x.id === g.id) === i);
    const chatGroups = [
      parsedGroups.find((g) => g.id === RESEARCH_GROUP) || researchGroup(),
      ...parsedGroups.filter((g) => g.id !== RESEARCH_GROUP && !g.system),
    ].map((g) => (g.id === RESEARCH_GROUP ? { ...g, system: "research" as const } : g));
    // The lower chat of the split view must exist and differ from the upper one.
    const activeChatId = chats.some((c: any) => c.id === raw.activeChatId)
      ? raw.activeChatId
      : null;
    if (
      settings.chatSplit.chatId &&
      (settings.chatSplit.chatId === activeChatId ||
        !chats.some((c) => c.id === settings.chatSplit.chatId))
    )
      settings.chatSplit = { ...settings.chatSplit, chatId: null };
    for (const c of chats)
      c.groupId = c.automatic
        ? RESEARCH_GROUP
        : c.groupId &&
            c.groupId !== RESEARCH_GROUP &&
            chatGroups.some((g) => g.id === c.groupId)
          ? c.groupId
          : undefined;
    // One-time: research that was only waiting for removed stages is re-evaluated
    // from saved results. Nothing is re-queued; explicit stops stay stopped.
    for (const g of games) {
      if (!reconcile.has(g.id) || !g.research) continue;
      const p = researchProgress(g, hardware, settings.autoSummary);
      g.research = {
        ...g.research,
        status: p.complete ? "done" : "incomplete",
        message: p.complete
          ? "Araştırma sonuçları kaydedildi."
          : "Tamamlanan aşamalar korundu. Kalan: " + p.missing.join(", "),
      };
    }
    return {
      version: 1,
      games,
      groups: keptGroups,
      series,
      settings,
      hardware,
      chats,
      activeChatId,
      notes: this.cleanNotes(raw.notes, games),
      chatGroups,
      playtime: this.cleanPlaytime(raw.playtime, games),
      migrations: Array.isArray(raw.migrations)
        ? raw.migrations
            .filter((m: unknown) => typeof m === "string" && m.length <= 60)
            .slice(0, 50)
        : [],
    };
  }
  // One-time data repairs for a loaded/imported library (marked in migrations).
  migrate(state: AppState, raw: any) {
    let restored = 0;
    if (!state.migrations.includes(HLTB_RESTORE_MIGRATION)) {
      // Only files written by 1.0.12 (they have a notes key) lost their times.
      restored += raw?.notes !== undefined ? this.restoreTimes(state) : 0;
      state.migrations = [...state.migrations, HLTB_RESTORE_MIGRATION];
    }
    if (!state.migrations.includes(REQUIREMENTS_REPAIR_MIGRATION)) {
      restored += this.restoreRequirements(state);
      state.migrations = [...state.migrations, REQUIREMENTS_REPAIR_MIGRATION];
    }
    if (!state.migrations.includes(STORE_REQUIREMENTS_MIGRATION)) {
      this.releaseResearchRequirements(state);
      state.migrations = [...state.migrations, STORE_REQUIREMENTS_MIGRATION];
    }
    if (!state.migrations.includes(STORE_ONLY_MIGRATION)) {
      this.storeOnlyRequirements(state);
      state.migrations = [...state.migrations, STORE_ONLY_MIGRATION];
    }
    // 2.0: DLC / episode times, release dates and Metacritic scores now have
    // fallbacks. Store games still missing one of them are refreshed once.
    if (!state.migrations.includes(DLC_DATA_MIGRATION)) {
      for (const g of state.games)
        if (
          (g.appId ||
            (g.origin && !["none", "My Abandonware"].includes(g.origin.store))) &&
          (g.hltb?.status !== "found" || !g.year || g.metacritic === undefined)
        )
          g.storeSync = true;
      state.migrations = [...state.migrations, DLC_DATA_MIGRATION];
    }
    // 2.0.1: the game's name is a short "Şimdi oynanıyor" notice at the start,
    // not a permanent line: built-in looks drop the always-on title.
    if (!state.migrations.includes(OVERLAY_INTRO_MIGRATION)) {
      state.settings.overlay = {
        ...state.settings.overlay,
        presets: state.settings.overlay.presets.map((p) =>
          p.builtin ? { ...p, showTitle: false } : p,
        ),
      };
      state.migrations = [...state.migrations, OVERLAY_INTRO_MIGRATION];
    }
    if (!state.migrations.includes(TITLE_SEARCH_MIGRATION)) {
      for (const g of state.games)
        if (
          g.catalogCheckedAt &&
          g.hltb?.status !== "found" &&
          /[:;,/|–—]|\s-\s/.test(g.name)
        )
          g.storeSync = true;
      state.migrations = [...state.migrations, TITLE_SEARCH_MIGRATION];
    }
    if (!state.migrations.includes(PCGW_MIGRATION)) {
      for (const g of state.games)
        if (
          (g.catalogCheckedAt || g.origin || g.appId) &&
          !hasRequirementValues(g.minimum) &&
          !hasRequirementValues(g.recommended)
        )
          g.storeSync = true;
      state.migrations = [...state.migrations, PCGW_MIGRATION];
    }
    if (!state.migrations.includes(PCGW_INFO_MIGRATION)) {
      for (const g of state.games)
        if ((g.catalogCheckedAt || g.origin || g.appId) && missingInfo({}, g).length)
          g.storeSync = true;
      state.migrations = [...state.migrations, PCGW_INFO_MIGRATION];
    }
    return restored;
  }
  // 1.0.17: requirements come only from the game's store. Values a model wrote
  // in any chat (ordinary chats too) lose their keep mark, a game without a
  // store shows none, and every store game is refreshed once from its store.
  storeOnlyRequirements(state: AppState) {
    const req = (f: string) => /^(minimum|recommended)(\.|$)/.test(f);
    for (const g of state.games) {
      g.aiEditedFields = (g.aiEditedFields || []).filter((f) => !req(f));
      g.sources = g.sources.flatMap((source) => {
        if (source.kind !== "agent" || !source.fields?.some(req)) return [source];
        const fields = source.fields.filter((f) => !req(f));
        return fields.length ? [{ ...source, fields }] : [];
      });
      const origin = g.origin?.store;
      if (origin === "none" || origin === "My Abandonware") {
        g.minimum = { raw: "" };
        g.recommended = { raw: "" };
        g.requirementSource = undefined;
      } else if (g.catalogCheckedAt || g.appId || g.origin) g.storeSync = true;
    }
  }
  // Requirement fields the user had a model write in an ordinary chat (for
  // example "Önerilen Disk kısmına 0.81 GB yaz"). Research chats are marked
  // automatic and are not counted.
  userRequirementEdits(chats: Chat[]) {
    const kept = new Map<string, Set<string>>();
    for (const chat of chats) {
      if (chat.automatic) continue;
      for (const message of chat.messages)
        for (const block of message.blocks) {
          if (block.type !== "tool" || block.name !== "update_game_info") continue;
          if (block.status !== "done") continue;
          const a = block.args as any;
          if (typeof a?.gameId !== "string" || !a.patch || typeof a.patch !== "object")
            continue;
          const set = kept.get(a.gameId) || new Set<string>();
          for (const level of ["minimum", "recommended"] as const) {
            const value = a.patch[level];
            if (!value || typeof value !== "object") continue;
            for (const [key, field] of Object.entries(value)) {
              if (key !== "raw") set.add(`${level}.${key}`);
              else if (typeof field === "string")
                for (const [parsed, v] of Object.entries(parseRequirements(field)))
                  if (parsed !== "raw" && v !== undefined) set.add(`${level}.${parsed}`);
            }
          }
          if (set.size) kept.set(a.gameId, set);
        }
    }
    return kept;
  }
  // 1.0.16: requirements are the store's own text. Fields automatic research
  // wrote (often for a level or component the store does not publish, once even
  // from another game's page) lose their "keep over store refresh" mark, and
  // every game that had store data gets one refresh from its store
  // (Service.syncStoreRequirements). Edits from the user's own chats stay.
  releaseResearchRequirements(state: AppState) {
    const kept = this.userRequirementEdits(state.chats);
    let released = 0;
    for (const g of state.games) {
      const keep = kept.get(g.id) || new Set<string>();
      const release = (f: string) => /^(minimum|recommended)\./.test(f) && !keep.has(f);
      const fields = g.aiEditedFields || [];
      if (
        fields.some(release) ||
        g.sources.some((s) => s.kind === "agent" && s.fields?.some(release))
      ) {
        released++;
        g.aiEditedFields = fields.filter((f) => !release(f));
        g.sources = g.sources.flatMap((source) => {
          if (source.kind !== "agent" || !source.fields?.some(release)) return [source];
          const rest = source.fields.filter((f) => !release(f));
          return rest.length ? [{ ...source, fields: rest }] : [];
        });
      }
      if (g.catalogCheckedAt || g.appId || g.origin) g.storeSync = true;
    }
    return released;
  }
  // 1.0.9–1.0.14 treated a requirement text sent with update_game_info as the
  // whole level: a one-field edit such as recommended "Storage: 0.81 GB"
  // erased CPU/GPU/RAM/VRAM/OS of that level and marked every field as
  // AI-edited, which also stopped a store refresh from refilling them. Such a
  // level has "<level>.raw" among the AI-edited fields. Its empty but marked
  // fields get the newest backed-up value back; values present now always
  // win. Fields no backup can fill are unmarked so a store refresh may fill
  // them. Backups themselves are not modified.
  restoreRequirements(state: AppState) {
    const damaged = new Map<
      string,
      { level: "minimum" | "recommended"; field: string }[]
    >();
    for (const g of state.games) {
      const edited = new Set(g.aiEditedFields || []);
      for (const level of ["minimum", "recommended"] as const) {
        const req = g[level];
        if (!edited.has(level + ".raw") || req.availability === "not_published") continue;
        for (const field of requirementValues) {
          const value = (req as any)[field];
          if (
            (value === undefined || value === "") &&
            edited.has(`${level}.${field}`) &&
            !req.unpublished?.includes(field as any)
          )
            damaged.set(g.id, [...(damaged.get(g.id) || []), { level, field }]);
        }
      }
    }
    if (!damaged.size) return 0;
    const games = new Map(state.games.map((g) => [g.id, g]));
    const found = new Map<string, { value: unknown; marked: boolean }>();
    for (const b of this.backups()) {
      let raw: any;
      try {
        raw = JSON.parse(
          fs.readFileSync(path.join(this.root, "backups", b.name), "utf8"),
        );
      } catch {
        continue;
      }
      if (!Array.isArray(raw?.games)) continue;
      for (const old of raw.games) {
        const g = old && typeof old.id === "string" ? games.get(old.id) : undefined;
        if (!g || !damaged.has(g.id) || (old.appId ?? null) !== (g.appId ?? null))
          continue;
        for (const { level, field } of damaged.get(g.id)!) {
          const key = `${g.id}\u0000${level}.${field}`,
            value = old[level]?.[field];
          if (found.has(key) || value === undefined || value === null || value === "")
            continue;
          if (!(requirementsSchema.shape as any)[field].safeParse(value).success)
            continue;
          found.set(key, {
            value,
            marked:
              Array.isArray(old.aiEditedFields) &&
              old.aiEditedFields.includes(`${level}.${field}`),
          });
        }
      }
    }
    let restored = 0;
    for (const g of state.games) {
      const fields = damaged.get(g.id);
      if (!fields) continue;
      const next: any = {
        minimum: { ...g.minimum },
        recommended: { ...g.recommended },
      };
      const unmark = new Set<string>();
      for (const { level, field } of fields) {
        const hit = found.get(`${g.id}\u0000${level}.${field}`);
        if (hit) next[level][field] = hit.value;
        if (!hit?.marked) unmark.add(`${level}.${field}`);
      }
      for (const level of ["minimum", "recommended"] as const)
        if (
          fields.some(
            (f) => f.level === level && found.has(`${g.id}\u0000${level}.${f.field}`),
          )
        )
          next[level].raw = requirementsText(next[level]);
      Object.assign(
        g,
        gameSchema.parse({
          ...g,
          ...next,
          aiEditedFields: (g.aiEditedFields || []).filter((f) => !unmark.has(f)),
          // Agent sources listed the erased fields as well and kept them locked.
          sources: g.sources.flatMap((source) => {
            if (source.kind !== "agent" || !source.fields?.length) return [source];
            const kept = source.fields.filter((f) => !unmark.has(f));
            return kept.length ? [{ ...source, fields: kept }] : [];
          }),
        }),
      );
      restored++;
    }
    return restored;
  }
  // 1.0.12 wrongly dropped HowLongToBeat data. Bring back the newest backed-up
  // times (with their source and AI-edit markers) for games that have none now.
  // Current values always win; backups themselves are not modified.
  restoreTimes(state: AppState) {
    const missing = new Map(state.games.filter((g) => !g.hltb).map((g) => [g.id, g]));
    let restored = 0;
    for (const b of this.backups()) {
      if (!missing.size) break;
      let raw: any;
      try {
        raw = JSON.parse(
          fs.readFileSync(path.join(this.root, "backups", b.name), "utf8"),
        );
      } catch {
        continue;
      }
      if (!Array.isArray(raw?.games)) continue;
      for (const old of raw.games) {
        const g = old && typeof old.id === "string" ? missing.get(old.id) : undefined;
        if (!g || !old.hltb) continue;
        const hltb = completionTimesSchema.safeParse(old.hltb);
        if (!hltb.success) continue;
        const sources = (Array.isArray(old.sources) ? old.sources : []).flatMap(
          (source: any) => {
            if (!Array.isArray(source?.fields) || !source.fields.some(timesField))
              return [];
            const parsed = sourceSchema.safeParse({
              ...source,
              fields: source.fields.filter((f: unknown) => !removedField(String(f))),
            });
            return parsed.success &&
              !g.sources.some(
                (x) => x.url === parsed.data.url && x.kind === parsed.data.kind,
              )
              ? [parsed.data]
              : [];
          },
        );
        const edited = Array.isArray(old.aiEditedFields)
          ? old.aiEditedFields.filter(timesField)
          : [];
        Object.assign(
          g,
          gameSchema.parse({
            ...g,
            hltb: hltb.data,
            sources: [...g.sources, ...sources].slice(-100),
            ...(edited.length
              ? { aiEditedFields: [...new Set([...(g.aiEditedFields || []), ...edited])] }
              : {}),
          }),
        );
        missing.delete(old.id);
        restored++;
      }
    }
    return restored;
  }
  // Invalid single entries are dropped instead of making the library unreadable.
  // Notes of unknown games (removed earlier) are not carried into a new session.
  cleanNotes(raw: unknown, games: Game[]): Record<string, GameNote> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const known = new Set(games.map((g) => g.id));
    return Object.fromEntries(
      Object.entries(raw).flatMap(([id, value]) => {
        const parsed = noteSchema.safeParse(value);
        return known.has(id) && parsed.success && parsed.data.text.trim()
          ? [[id, parsed.data]]
          : [];
      }),
    );
  }
  cleanSettings(p: any): Settings {
    const s = settingsSchema.parse({ ...defaultSettings, ...p });
    if (s.systemPrompt === legacySystemPrompt)
      s.systemPrompt = defaultSettings.systemPrompt;
    const u = new URL(s.lmUrl);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error(
        "LM Studio temel adresi http(s) olmalı; kullanıcı adı, parola, sorgu veya fragment içermemeli.",
      );
    s.lmUrl = s.lmUrl.replace(/\/$/, "");
    return s;
  }
  cleanHardware(h: any): Hardware {
    return hardwareSchema.parse({ ...emptyHardware, ...h });
  }
  private snapshot() {
    this.undoStack.push(
      structuredClone({
        games: this.state.games,
        groups: this.state.groups,
        series: this.state.series,
      }),
    );
    if (this.undoStack.length > 25) this.undoStack.shift();
  }
  changed(immediate = false, notify = true) {
    if (notify) this.emit("change", this.state);
    if (immediate) this.flush();
    else {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        try {
          this.flush();
        } catch (e: any) {
          this.emit("warning", "Veriler diske yazılamadı: " + e.message);
        }
      }, 300);
    }
  }
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const file = path.join(this.root, "library.json");
    const today = now().slice(0, 10);
    if (this.day !== today && fs.existsSync(file)) {
      this.backup();
      this.day = today;
    }
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, file);
  }
  backup() {
    const name = `library-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(path.join(this.root, "backups", name), JSON.stringify(this.state));
    for (const b of this.backups().slice(12))
      fs.rmSync(path.join(this.root, "backups", b.name));
    return name;
  }
  backups() {
    return fs
      .readdirSync(path.join(this.root, "backups"))
      .filter((n) => /^library-[\w.-]+\.json$/.test(n))
      .sort()
      .reverse()
      .map((name) => ({
        name,
        bytes: fs.statSync(path.join(this.root, "backups", name)).size,
      }));
  }
  restore(name: string) {
    if (!this.backups().some((b) => b.name === name))
      throw new Error("Yedek bulunamadı.");
    const data = fs.readFileSync(path.join(this.root, "backups", name), "utf8");
    return this.importState(JSON.parse(data));
  }
  importState(raw: any) {
    const next = this.validate(raw);
    this.migrate(next, raw);
    // Notes are personal text and not part of undo snapshots. Keep current notes
    // (an older file has none; undo of this import may bring games back) and let
    // notes contained in the file win for their games.
    next.notes = { ...this.state.notes, ...next.notes };
    this.backup();
    this.snapshot();
    this.state = next;
    this.changed(true);
    return { count: next.games.length };
  }
  requireGames(list: string[]) {
    ids.parse(list);
    if (!list.length) throw new Error("En az bir oyun seç.");
    const selected = new Set(list);
    if (selected.size !== list.length) throw new Error("Oyun kimlikleri yinelenmemeli.");
    const games = this.state.games.filter((g) => selected.has(g.id));
    if (games.length !== selected.size) throw new Error("Oyun kimliği bulunamadı.");
    return games;
  }

  add(
    items: {
      name: string;
      appId?: number;
      steamMatchMode?: "manual" | "auto";
      origin?: Game["origin"];
    }[],
    merge = true,
  ) {
    z.array(
      z.object({
        name: z.string().trim().min(1).max(300),
        appId: z.number().int().positive().optional(),
        steamMatchMode: z.enum(["manual", "auto"]).optional(),
        origin: originSchema.optional(),
      }),
    )
      .min(1)
      .max(5000)
      .parse(items);
    for (const item of items)
      if (
        item.origin &&
        item.origin.store !== "none" &&
        !item.origin.id &&
        item.origin.store !== "Steam"
      )
        throw new Error("Seçilen platformdan bir oyun seçilmeli.");
    const byName = new Map(this.state.games.map((g) => [normalizeName(g.name), g]));
    const unique = new Set(
      items.map((g) => normalizeName(g.name)).filter((n) => !byName.has(n)),
    );
    if (this.state.games.length + (merge ? unique.size : items.length) > 20000)
      throw new Error("Bu sürüm en fazla 20.000 oyun saklar.");
    this.snapshot();
    const added: string[] = [],
      merged: string[] = [];
    for (const item of items) {
      const key = normalizeName(item.name),
        existing = byName.get(key);
      if (existing && merge) {
        merged.push(existing.id);
        continue;
      }
      const steamId =
        item.origin?.store === "Steam" && /^\d+$/.test(item.origin.id || "")
          ? Number(item.origin.id)
          : item.appId;
      const g = newGame(item.name, this.state.games.length, steamId);
      g.steamMatchMode = item.steamMatchMode || "manual";
      if (item.origin)
        g.origin =
          item.origin.store === "Steam" && steamId
            ? { ...item.origin, id: String(steamId) }
            : item.origin;
      this.state.games.push(g);
      byName.set(key, g);
      added.push(g.id);
    }
    this.state.series = inferSeries(this.state.games, this.state.series);
    this.changed();
    return { added, merged };
  }

  remove(list: string[]) {
    this.requireGames(list);
    this.snapshot();
    this.state.games = this.state.games
      .filter((g) => !list.includes(g.id))
      .map((g, i) => ({ ...g, order: i }));
    this.changed();
    return { removed: list.length };
  }
  // Several personal edits validated first, then applied as ONE undo step.
  editMany(items: { id: string; patch: any }[]) {
    const games = items.map((i) => this.requireGames([i.id])[0]);
    for (const i of items) this.checkEdit(i.patch);
    this.snapshot();
    items.forEach((i, n) =>
      Object.assign(games[n], gameSchema.parse({ ...games[n], ...i.patch })),
    );
    this.changed();
    return games;
  }
  edit(id: string, patch: any, undo = true) {
    const g = this.requireGames([id])[0];
    this.checkEdit(patch);
    if (undo) this.snapshot();
    Object.assign(g, gameSchema.parse({ ...g, ...patch }));
    this.changed();
    return g;
  }
  private checkEdit(patch: any) {
    const allowed = ["name", "tags", "rating", "status", "inPlayList", "playHours", "reqVerdict"];
    for (const k of Object.keys(patch))
      if (!allowed.includes(k)) throw new Error("Bu oyun alanı düzenlenemez.");
    if (patch.name !== undefined) z.string().trim().min(1).max(300).parse(patch.name);
    if (patch.rating !== undefined)
      z.number().min(0).max(10).nullable().parse(patch.rating);
    if (patch.tags !== undefined) z.array(z.string().max(60)).max(30).parse(patch.tags);
    if (patch.status !== undefined)
      z.enum(["planned", "playing", "finished", "dropped", "watch"]).parse(patch.status);
    if (patch.inPlayList !== undefined) z.boolean().parse(patch.inPlayList);
    // Loading the library puts every game back into the list, so "false" would
    // only look like a success and change nothing.
    if (patch.inPlayList === false)
      throw new Error(
        "Tüm oyunlar tek ana liste olan Oynama Listesinde tutulur; listeden çıkarılamaz. İstersen oyunu silebilir, durumunu değiştirebilir veya bir koleksiyona ekleyebilirsin.",
      );
    if (patch.playHours !== undefined)
      z.number().min(0).max(10000).optional().parse(patch.playHours);
  }
  // 2.0.8: the user's own Geçti/Geçmedi marks from the "Donanım kontrolü"
  // window, or their removal ("AI'ya bırak"). One undo step.
  researchChecks(
    updates: {
      id: string;
      aiCompatibility: Game["aiCompatibility"];
      userChecks?: true;
    }[],
  ) {
    if (!updates.length) return;
    this.snapshot();
    for (const u of updates) {
      const g = this.requireGames([u.id])[0];
      this.metadata(u.id, {
        aiCompatibility: u.aiCompatibility,
        research: {
          ...(g.research || { status: "queued" as const }),
          userChecks: u.userChecks,
        },
      });
    }
  }
  // 2.1.0: a CPU/GPU comparison the AI made once is reused for every game with
  // the same requirement text on this computer, so it is never researched
  // twice. Only rows the hardware data cannot decide are filled; the user's
  // marks and existing answers stay. No own undo step: it follows the save
  // that taught it (or is derived data at start).
  applyLearnedChecks(ids?: string[]) {
    type Entry = NonNullable<Game["aiCompatibility"]>[number];
    const known = new Map<string, Entry>();
    for (const g of this.state.games)
      for (const r of g.aiCompatibility || []) {
        if (r.decidedBy === "user" || r.status === "unknown") continue;
        const key = learnKey(r.contextKey);
        if (key && !known.has(key)) known.set(key, r);
      }
    if (!known.size) return 0;
    const h = this.state.hardware;
    let filled = 0;
    for (const g of this.state.games) {
      if (ids && !ids.includes(g.id)) continue;
      const comparison = compatibility(g, h);
      const add: Entry[] = [];
      for (const level of ["minimum", "recommended"] as const)
        for (const row of comparison[level]) {
          if (!row.aiEditable || row.status !== "unknown" || row.ai || row.user) continue;
          const source = known.get(learnKey(row.contextKey || "") || "");
          if (!source) continue;
          add.push({
            level,
            component: row.name,
            status: source.status,
            reason: source.reason,
            contextKey: row.contextKey!,
            checkedAt: source.checkedAt,
            ...(source.model ? { model: source.model } : {}),
            ...(source.sources?.length ? { sources: source.sources } : {}),
          });
        }
      if (!add.length) continue;
      this.metadata(g.id, {
        aiCompatibility: [
          ...(g.aiCompatibility || []).filter(
            (r) => !add.some((a) => a.level === r.level && a.component === r.component),
          ),
          ...add,
        ],
      });
      filled += add.length;
    }
    return filled;
  }
  metadata(id: string, patch: Partial<Game>, undo = false) {
    const g = this.state.games.find((g) => g.id === id);
    if (!g) return;
    const validated = gameSchema.parse({ ...g, ...patch });
    if (undo) this.snapshot();
    Object.assign(g, validated);
    this.emit("game", g);
    this.changed(false, false);
    return g;
  }
  // UI-only personal note. Intentionally no undo snapshot (undo restores games,
  // groups and series and must never revert typed notes) and no Agent tool.
  setNote(id: string, text: unknown) {
    const game = this.requireGames([z.string().max(100).parse(id)])[0];
    const value = z
      .string()
      .max(
        NOTE_MAX_LENGTH,
        `Not en fazla ${NOTE_MAX_LENGTH.toLocaleString("tr-TR")} karakter olabilir.`,
      )
      .parse(text);
    const note: GameNote | null = value.trim() ? { text: value, updatedAt: now() } : null;
    const rest = Object.fromEntries(
      Object.entries(this.state.notes).filter(([key]) => key !== game.id),
    );
    this.state.notes = note ? { ...rest, [game.id]: note } : rest;
    this.emit("note", { id: game.id, note });
    this.changed(false, false);
    return { id: game.id, note };
  }
  move(list: string[], target: string, after = false) {
    this.requireGames(list);
    this.snapshot();
    this.state.games = reorderBlock(this.state.games, list, target, after);
    this.changed();
  }
  exactOrder(list: string[]) {
    ids.parse(list);
    if (
      new Set(list).size !== this.state.games.length ||
      list.length !== this.state.games.length ||
      list.some((id) => !this.state.games.some((g) => g.id === id))
    )
      throw new Error("Sıralama bütün oyunların kimliğini birer kez içermeli.");
    this.snapshot();
    const map = new Map(this.state.games.map((g) => [g.id, g]));
    this.state.games = list.map((id, order) => ({ ...map.get(id)!, order }));
    this.changed();
  }
  moveStep(id: string, direction: number) {
    const index = this.state.games.findIndex((g) => g.id === id),
      to = index + Math.sign(direction);
    if (index < 0 || to < 0 || to >= this.state.games.length) return;
    this.move([id], this.state.games[to].id, direction > 0);
  }
  group(action: string, args: any) {
    if (action === "create") {
      z.object({
        name: z.string().min(1).max(80),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        icon: z.string().max(30),
      }).parse(args);
      this.snapshot();
      const g = {
        id: uid(),
        name: args.name,
        color: args.color,
        icon: args.icon,
      };
      this.state.groups.push(g);
      this.changed();
      return g;
    }
    const group = this.state.groups.find((g) => g.id === args.id);
    if (!group) throw new Error("Grup bulunamadı.");
    this.snapshot();
    if (action === "delete") {
      this.state.groups = this.state.groups.filter((g) => g.id !== args.id);
      this.state.games.forEach(
        (g) => (g.groupIds = g.groupIds.filter((id) => id !== args.id)),
      );
    } else if (action === "edit") {
      if (args.name) group.name = z.string().min(1).max(80).parse(args.name);
      if (args.color)
        group.color = z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .parse(args.color);
      if (args.icon) group.icon = z.string().max(30).parse(args.icon);
    } else throw new Error("Bilinmeyen grup işlemi.");
    this.changed();
  }
  moveGroup(list: string[], groupId: string | null) {
    const games = this.requireGames(list);
    if (groupId && !this.state.groups.some((g) => g.id === groupId))
      throw new Error("Grup bulunamadı.");
    this.snapshot();
    games.forEach((g) => (g.groupIds = groupId ? [groupId] : []));
    this.changed();
  }
  removeFromGroup(list: string[], groupId: string) {
    const games = this.requireGames(list);
    this.snapshot();
    games.forEach((g) => (g.groupIds = g.groupIds.filter((id) => id !== groupId)));
    this.changed();
  }
  play(list: string[], fromGroup?: string) {
    const games = this.requireGames(list);
    this.snapshot();
    games.forEach((g) => {
      // Every game is always in the Oynama Listesi (the single main list), so this
      // only removes the collection membership. It used to reset the status to
      // "planned" too, silently turning finished games back into planned ones.
      g.inPlayList = true;
      if (fromGroup) g.groupIds = g.groupIds.filter((id) => id !== fromGroup);
    });
    this.changed();
  }
  series(action: string, args: any) {
    const seriesName = (v: unknown) => z.string().trim().min(1).max(100).parse(v);
    if (action === "create") {
      const games = this.requireGames(args.ids);
      if (games.length < 2) throw new Error("Seri için en az iki oyun seç.");
      const name = seriesName(args.name);
      this.snapshot();
      const series = { id: uid(), name, automatic: false };
      this.state.series.push(series);
      this.joinSeries(series.id, games);
      this.changed();
      return series;
    }
    const s = this.state.series.find((s) => s.id === args.id);
    if (!s) throw new Error("Seri bulunamadı.");
    // 2.0.4: name and members edited together ("update"), or games added to
    // an existing series ("add").
    if (action === "update" || action === "add") {
      const name = args.name === undefined ? s.name : seriesName(args.name);
      const games = this.requireGames(
        action === "add"
          ? [
              ...new Set([
                ...this.state.games.filter((g) => g.seriesId === s.id).map((g) => g.id),
                ...(args.ids || []),
              ]),
            ]
          : (args.ids ??
              this.state.games.filter((g) => g.seriesId === s.id).map((g) => g.id)),
      );
      if (games.length < 2)
        throw new Error(
          "Seride en az iki oyun kalmalı. Seriyi kaldırmak için “Seriyi dağıt”ı kullan.",
        );
      this.snapshot();
      s.name = name;
      const keep = new Set(games.map((g) => g.id));
      let membersChanged = false;
      for (const g of this.state.games)
        if (g.seriesId === s.id && !keep.has(g.id)) {
          // Taken out by the user: not put back automatically.
          g.seriesId = undefined;
          g.autoSeries = false;
          membersChanged = true;
        }
      if (games.some((g) => g.seriesId !== s.id)) membersChanged = true;
      // A series whose games the user chose is no longer filled by name.
      if (membersChanged) s.automatic = false;
      this.joinSeries(s.id, games);
      this.changed();
      return s;
    }
    this.snapshot();
    if (action === "rename") s.name = seriesName(args.name);
    else if (action === "gather") {
      // 2.0.6: only on request ("Oyunları yan yana topla"): the members side by
      // side at the first member's place.
      const ordered = [...this.state.games].sort((a, b) => a.order - b.order);
      const first = ordered.findIndex((g) => g.seriesId === s.id);
      const members = ordered.filter((g) => g.seriesId === s.id);
      const others = ordered.filter((g) => g.seriesId !== s.id);
      others.splice(first, 0, ...members);
      this.state.games = others.map((g, order) => ({ ...g, order }));
    } else if (action === "dissolve") {
      this.state.series = this.state.series.filter((s) => s.id !== args.id);
      this.state.games
        .filter((g) => g.seriesId === args.id)
        .forEach((g) => {
          g.seriesId = undefined;
          g.autoSeries = false;
        });
    } else throw new Error("Bilinmeyen seri işlemi.");
    this.changed();
  }
  // Puts the games into the series (a game leaves its previous series). The
  // order of the list never changes (2.0.6): a game the user put between two
  // members stays there; the list shows the series in parts.
  // A previous series left with fewer than two games is removed; its last game
  // stays in the library as a normal game.
  private joinSeries(id: string, games: Game[]) {
    const left = new Set(
      games.map((g) => g.seriesId).filter((x): x is string => !!x && x !== id),
    );
    for (const g of games) {
      g.seriesId = id;
      g.autoSeries = false;
    }
    for (const old of left) {
      const rest = this.state.games.filter((g) => g.seriesId === old);
      if (rest.length >= 2) continue;
      rest.forEach((g) => (g.seriesId = undefined));
      this.state.series = this.state.series.filter((x) => x.id !== old);
    }
  }
  undo() {
    const prev = this.undoStack.pop();
    if (!prev) throw new Error("Geri alınacak işlem yok.");
    Object.assign(this.state, prev);
    this.changed();
    return { ok: true };
  }
  settings(patch: Partial<Settings>) {
    if (
      ((patch.lmModel !== undefined && patch.lmModel !== this.state.settings.lmModel) ||
        (patch.lmUrl !== undefined && patch.lmUrl !== this.state.settings.lmUrl)) &&
      patch.contextTokens === undefined
    )
      patch = { ...patch, contextTokens: 0 };
    this.state.settings = this.cleanSettings({
      ...this.state.settings,
      ...patch,
    });
    this.changed();
    return this.state.settings;
  }
  hardware(patch: Partial<Hardware>) {
    this.state.hardware = this.cleanHardware({
      ...this.state.hardware,
      ...patch,
    });
    this.changed();
  }
  createChat(automatic = false, activate = true) {
    if (!automatic && this.state.chats.filter((c) => !c.automatic).length >= 100)
      throw new Error(
        "En fazla 100 sohbet saklanabilir. Önce eski bir sohbeti dışa aktarıp sil.",
      );
    const c: Chat = {
      id: uid(),
      title: "Yeni sohbet",
      automatic,
      ...(automatic ? { groupId: RESEARCH_GROUP } : {}),
      createdAt: now(),
      messages: [],
      apiHistory: [],
      allowedTools: [],
    };
    this.state.chats.push(c);
    if (activate) this.state.activeChatId = c.id;
    this.changed();
    return c;
  }
  getChat(id: string) {
    const c = this.state.chats.find((c) => c.id === id);
    if (!c) throw new Error("Sohbet bulunamadı.");
    return c;
  }
  cleanPlaytime(raw: any, games: Game[]): AppState["playtime"] {
    const known = new Set(games.map((g) => g.id));
    const out: AppState["playtime"] = {};
    for (const [id, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const r = v as any;
      if (!known.has(id) || !r || !Number.isFinite(r.minutes)) continue;
      out[id] = {
        minutes: Math.max(0, Math.min(10_000_000, Number(r.minutes))),
        sessions: Math.max(0, Math.floor(Number(r.sessions) || 0)),
        lastPlayed:
          typeof r.lastPlayed === "string" ? r.lastPlayed.slice(0, 40) : undefined,
      };
    }
    return out;
  }
  renameChat(id: string, title: string) {
    const c = this.getChat(id);
    c.title = z.string().trim().min(1).max(120).parse(title);
    this.changed();
    return c;
  }
  chatGroup(action: "create" | "edit" | "delete", a: any) {
    if (action === "create") {
      if (this.state.chatGroups.length >= 100)
        throw new Error("En fazla 100 sohbet grubu olabilir.");
      const g = chatGroupSchema.parse({
        id: uid(),
        name: a.name || "Yeni grup",
        color: a.color || "#9d8cff",
      });
      this.state.chatGroups.push(g);
      this.changed();
      return g;
    }
    const g = this.state.chatGroups.find((x) => x.id === a.id);
    if (!g) throw new Error("Sohbet grubu bulunamadı.");
    if (action === "edit") {
      const patch = chatGroupSchema
        .pick({ name: true, color: true, collapsed: true })
        .partial()
        .parse(a.patch || {});
      Object.assign(g, patch);
    } else {
      if (g.system) throw new Error("Araştırmalar grubu silinemez.");
      this.state.chatGroups = this.state.chatGroups.filter((x) => x.id !== g.id);
      for (const c of this.state.chats) if (c.groupId === g.id) c.groupId = undefined;
    }
    this.changed();
    return g;
  }
  moveChats(ids: string[], groupId: string | null) {
    if (groupId === RESEARCH_GROUP)
      throw new Error(
        "Araştırmalar grubunda yalnız otomatik araştırma sohbetleri bulunur.",
      );
    if (groupId && !this.state.chatGroups.some((g) => g.id === groupId))
      throw new Error("Sohbet grubu bulunamadı.");
    for (const id of ids) {
      const c = this.getChat(id);
      if (!c.automatic) c.groupId = groupId || undefined;
    }
    this.changed();
  }
  deleteChats(ids: string[]) {
    const drop = new Set(ids);
    this.state.chats = this.state.chats.filter((c) => !drop.has(c.id));
    const lower = this.state.settings.chatSplit.chatId;
    if (lower && drop.has(lower)) this.setSplit({ chatId: null });
    if (this.state.activeChatId && drop.has(this.state.activeChatId)) {
      // The lower chat moves up instead of the split showing one chat twice.
      const keep = this.state.settings.chatSplit.chatId;
      this.state.activeChatId =
        keep ||
        this.state.chats.filter((c) => !c.automatic).at(-1)?.id ||
        this.state.chats.at(-1)?.id ||
        null;
      if (keep) this.setSplit({ chatId: null });
    }
    this.changed();
  }
  setSplit(patch: Partial<Settings["chatSplit"]>) {
    this.state.settings = this.cleanSettings({
      ...this.state.settings,
      chatSplit: { ...this.state.settings.chatSplit, ...patch },
    });
    this.changed();
    return this.state.settings.chatSplit;
  }
  // 2.0.2 split view: "top" is the active chat, "bottom" the chat under it.
  chatSplit(
    action: "open" | "close" | "swap" | "pick" | "ratio",
    a: any,
  ): Settings["chatSplit"] {
    const split = this.state.settings.chatSplit;
    const top = this.state.activeChatId;
    if (action === "ratio")
      return this.setSplit({ ratio: z.number().min(0.2).max(0.8).parse(a.ratio) });
    if (action === "close") return this.setSplit({ chatId: null });
    if (action === "swap") {
      if (!split.chatId || !top) return split;
      this.state.activeChatId = split.chatId;
      return this.setSplit({ chatId: top });
    }
    if (action === "open") {
      // A given chat, else the newest other chat, else a new one.
      let id: string | undefined = a.chatId ? this.getChat(a.chatId).id : undefined;
      if (!id)
        id = this.state.chats
          .slice()
          .reverse()
          .find((c) => !c.automatic && c.id !== top)?.id;
      if (!id) id = this.createChat(false, false).id;
      if (id === top) {
        if (!split.chatId) return split;
        return this.chatSplit("swap", {});
      }
      if (!top) {
        this.state.activeChatId = id;
        return this.setSplit({ chatId: null });
      }
      return this.setSplit({ chatId: id });
    }
    // pick: show a chat in a pane; a chat already in the other pane swaps.
    const id = this.getChat(a.chatId).id;
    const slot = a.slot === "bottom" && split.chatId ? "bottom" : "top";
    if (slot === "top") {
      if (id === split.chatId) return this.chatSplit("swap", {});
      this.state.activeChatId = id;
      this.changed();
      return split;
    }
    if (id === top) return this.chatSplit("swap", {});
    return this.setSplit({ chatId: id });
  }
  recordPlay(gameId: string, minutes: number, newSession: boolean) {
    if (!this.state.games.some((g) => g.id === gameId)) return;
    const r = this.state.playtime[gameId] || { minutes: 0, sessions: 0 };
    r.minutes = Math.round((r.minutes + minutes) * 100) / 100;
    if (newSession) r.sessions++;
    r.lastPlayed = now();
    this.state.playtime[gameId] = r;
    this.changed(false, false);
  }
  deleteChat(id: string) {
    this.deleteChats([id]);
  }
  exportState() {
    const s = structuredClone(this.state);
    s.chats.forEach((c) => (c.allowedTools = []));
    const known = new Set(s.games.map((g) => g.id));
    s.notes = Object.fromEntries(Object.entries(s.notes).filter(([id]) => known.has(id)));
    return s;
  }
  close() {
    this.flush();
  }
}
