import { researchProgress, runsHardwareStage } from "../shared/research-progress";
import { hasRequirements } from "../shared/analysis";
import { validationMessage } from "../shared/validation-text";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { Updater } from "./updater";
import { APP_VERSION } from "../shared/version";
import { overlaySchema } from "./validation";
import { Store } from "./store";
import { Providers, MetadataQueue } from "./providers";
import { Agent } from "./agent";
import { LMClient } from "./lm";
import { detectHardware } from "./hardware";
import { hasRequirementValues } from "./requirements";
import {
  compatibility,
  compatibilityKey,
  componentCompatibilityKey,
} from "../shared/compatibility";
import { csvExport, now } from "../shared/domain";
import type { Bootstrap, AppEvent, NowPlaying } from "../shared/types";
export const methods = [
  "bootstrap",
  "add",
  "remove",
  "edit",
  "note",
  "batchStatus",
  "reorder",
  "exactOrder",
  "moveStep",
  "group",
  "moveGroup",
  "removeFromGroup",
  "play",
  "series",
  "undo",
  "settings",
  "hardware",
  "detectHardware",
  "searchGames",
  "refresh",
  "cancelQueue",
  "match",
  "summary",
  "researchGame",
  "researchAll",
  "researchSelected",
  "stopResearch",
  "compatibility",
  "testLM",
  "secret",
  "newChat",
  "deleteChat",
  "activeChat",
  "send",
  "retryTool",
  "stopChat",
  "permission",
  "wizard",
  "revokeGrants",
  "backups",
  "backup",
  "restore",
  "export",
  "import",
  "clearCache",
  "stats",
  "openExternal",
  "openBrowser",
  "window",
  "openDataFolder",
  "renameChat",
  "chatSplit",
  "chatGroup",
  "moveChats",
  "deleteChats",
  "update",
  "overlaySettings",
  "overlayAction",
] as const;
export type Method = (typeof methods)[number];
export class Service extends EventEmitter {
  store: Store;
  providers: Providers;
  queue: MetadataQueue;
  agent: Agent;
  lm: LMClient;
  private secrets: Record<string, string> = {};
  private stateTimer: NodeJS.Timeout | null = null;
  onSettings: () => void = () => {};
  saveSecrets: (values: Record<string, string>) => void = () => {};
  openBrowser: () => Promise<void> = async () => {};
  openExternal: (url: string) => Promise<void> = async () => {};
  windowAction: (action: string) => void = () => {};
  openFolder: () => void = () => {};
  updater: Updater;
  // Set by the desktop app (Windows overlay); absent in the browser preview.
  overlay?: { action(name: string, args: any): Promise<any>; settingsChanged(): void };
  nowPlaying: NowPlaying | null = null;
  constructor(
    root: string,
    public desktop = false,
    secrets: Record<string, string> = {},
  ) {
    super();
    this.secrets = secrets;
    this.store = new Store(root);
    this.providers = new Providers(this.store, (n) => this.secrets[n] || "");
    this.queue = new MetadataQueue(this.providers, this.store);
    this.lm = new LMClient(
      () => this.store.state.settings,
      () => this.secrets.lm || "",
    );
    this.agent = new Agent(this.store, this.providers, this.queue, this.lm, (e) =>
      this.event(e),
    );
    this.updater = new Updater(APP_VERSION, { channel: process.env.OYUN_UPDATE_CHANNEL });
    this.updater.on("state", (state) => this.event({ type: "update", data: state }));
    if (desktop && process.env.OYUN_UPDATE_CHANNEL !== "off")
      this.updater.schedule(() => this.store.state.settings.updateCheck);
    this.agent.onManualTurnFinished = (chatId, outcome) => {
      this.finishManualResearch(chatId, outcome);
      // After the turn has fully left the agent (its slot is free again).
      setTimeout(() => void this.drainResearch(), 0);
    };
    this.store.on("game", (game) => this.event({ type: "game", data: game }));
    // Personal notes go only to the app window; the Agent never receives them.
    this.store.on("note", (data) => this.event({ type: "note", data }));
    this.store.on("warning", (text) =>
      this.event({ type: "toast", data: { text, error: true } }),
    );
    this.store.on("change", () => {
      if (this.stateTimer) return;
      this.stateTimer = setTimeout(() => {
        this.stateTimer = null;
        this.event({
          type: "state",
          data: {
            state: this.store.state,
            undoCount: this.store.undoStack.length,
          },
        });
      }, 90);
    });
    this.queue.onChange = () => this.event({ type: "queue", data: this.queue.state });
    this.queue.onItemDone = async (id, signal) => {
      if (signal.aborted) return;
      // After the one-time store refresh (1.0.16) a game whose comparison was
      // complete but now has new, uncompared rows is researched again.
      const before = this.syncing.get(id);
      this.syncing.delete(id);
      const after = this.store.state.games.find((g) => g.id === id);
      if (
        before !== undefined &&
        after &&
        this.store.state.settings.autoResearch &&
        compatibilityKey(after, this.store.state.hardware) !== before &&
        !this.progress(id).completed.hardware
      ) {
        this.queueResearch([id], true);
        return;
      }
      if (this.store.state.settings.autoResearch) this.queueResearch([id]);
      else if (
        this.store.state.settings.autoSummary &&
        this.store.state.settings.lmModel &&
        this.agent.models.length &&
        !this.agent.busy.size
      ) {
        try {
          await this.agent.summary(id, signal);
        } catch {
          /* no invented summary */
        }
      }
    };
    // 2.1.0: answers the AI already gave for the same requirement fill other
    // games before anything is judged unfinished.
    this.store.applyLearnedChecks();
    this.settleResearch();
    this.resumeSavedResearch();
    this.fillMissingTimes();
    this.syncStoreRequirements();
    this.retryWikiRequirements();
  }
  // 2.0.8: a stopped, failed or incomplete research whose results are all
  // saved is done; a leftover "your marks" flag of a finished run is dropped.
  private settleResearch() {
    let changed = false;
    for (const g of this.store.state.games) {
      const r = g.research;
      if (!r || ["queued", "waiting_model", "running"].includes(r.status)) continue;
      const complete = researchProgress(
        g,
        this.store.state.hardware,
        this.store.state.settings.autoSummary,
      ).complete;
      if (r.status !== "done" && complete) {
        g.research = {
          ...r,
          status: "done",
          userChecks: undefined,
          message: "Araştırma sonuçları kaydedildi.",
        };
        changed = true;
      } else if (r.userChecks) {
        g.research = { ...r, userChecks: undefined };
        changed = true;
      }
    }
    if (changed) this.store.changed();
  }
  // 2.0.5: games whose PCGamingWiki lookup could not reach the wiki try again
  // at start (only the wiki is asked; the first failure stops the rest). A
  // game that gets requirements and had research is compared again.
  private retryWikiRequirements() {
    queueMicrotask(() => {
      if (this.closing) return;
      const games = this.store.state.games.filter(
        (g) =>
          g.pcgw?.status === "unavailable" &&
          !g.storeSync &&
          !hasRequirementValues(g.minimum) &&
          !hasRequirementValues(g.recommended),
      );
      if (!games.length) return;
      for (const g of games)
        if (g.research)
          this.syncing.set(g.id, compatibilityKey(g, this.store.state.hardware));
      this.queue.resetCounters();
      this.queue.addRequirements(games.map((g) => g.id));
    });
  }
  // Games marked by the 1.0.16 update get their requirements again from their
  // store, once, in the background (metadata strip shows progress). Offline:
  // the mark stays and the next start tries again.
  // Requirement/hardware fingerprint before the refresh: only a game whose
  // requirements really changed and now has uncompared rows is researched
  // again (a game that already had research only).
  private syncing = new Map<string, string>();
  private syncStoreRequirements() {
    queueMicrotask(() => {
      if (this.closing) return;
      const games = this.store.state.games.filter((g) => g.storeSync);
      if (!games.length) return;
      for (const g of games)
        if (g.research)
          this.syncing.set(g.id, compatibilityKey(g, this.store.state.hardware));
      this.queue.resetCounters();
      this.queue.add(
        games.map((g) => g.id),
        true,
      );
    });
  }
  // Durations dropped or skipped by 1.0.12 are refilled in the background with
  // a times-only lookup. Store results, fetch status and AI research stay as
  // they are; the metadata strip shows progress and can stop it.
  private fillMissingTimes() {
    queueMicrotask(() => {
      if (this.closing) return;
      const ids = this.store.state.games
        .filter((g) => g.catalogCheckedAt && !g.hltb)
        .map((g) => g.id);
      if (!ids.length) return;
      this.queue.resetCounters();
      this.queue.addTimes(ids);
    });
  }
  event(e: AppEvent) {
    if (e.type === "nowPlaying") this.nowPlaying = e.data;
    this.emit("event", e);
    if (e.type === "busy") queueMicrotask(() => void this.drainResearch());
  }
  bootstrap(): Bootstrap {
    return {
      version: APP_VERSION,
      update: this.updater.state,
      nowPlaying: this.nowPlaying,
      state: this.store.state,
      models: this.agent.models,
      queue: this.queue.state,
      permissions: [...this.agent.permissions.values()].map((p) => p.request),
      wizard: this.agent.wizard,
      busyChats: [...this.agent.busy.keys()],
      undoCount: this.store.undoStack.length,
      dataPath: this.store.root,
      desktop: this.desktop,
      hasLmKey: !!this.secrets.lm,
      hasBraveKey: !!this.secrets.brave,
    };
  }
  private closing = false;
  private researchQueue = new Map<string, boolean>();
  private researchTasks = new Map<
    string,
    { controller: AbortController; task: Promise<void>; requeue: boolean }
  >();
  private probeController?: AbortController;
  private draining = false;
  private researchBlocked = false;
  private researchProbed = false;
  private foregroundPending = false;
  private manualResearch = new Map<
    string,
    {
      gameId: string;
      before: ReturnType<typeof researchProgress>;
      continueAfter: boolean;
      allowAdvance: boolean;
    }
  >();
  private progress(id: string) {
    return researchProgress(
      this.store.requireGames([id])[0],
      this.store.state.hardware,
      this.store.state.settings.autoSummary,
    );
  }
  private finishResearch(id: string) {
    const g = this.store.requireGames([id])[0],
      p = this.progress(id);
    this.store.metadata(id, {
      research: {
        ...g.research,
        userChecks: undefined,
        status: p.complete ? "done" : "incomplete",
        checkedAt: new Date().toISOString(),
        message: p.complete
          ? p.stages.length
            ? "Araştırma sonuçları kaydedildi."
            : hasRequirements(g.minimum) || hasRequirements(g.recommended)
              ? "Donanım karşılaştırması donanım verisiyle yapıldı; AI araştırması gerekmedi."
              : g.reqVerdict
                ? "Sistem gereksinimi yayımlanmadı; durumu sen işaretledin, karşılaştırılacak bir şey yok."
                : "Sistem gereksinimi bulunamadığı için (mağazada da PCGamingWiki'de de yok) karşılaştırılacak bir şey yok."
          : "Tamamlanan aşamalar korundu. Kalan: " + p.missing.join(", "),
      },
    });
  }
  private finishManualResearch(
    chatId: string,
    outcome: { cancelled: boolean; error: boolean },
  ) {
    const context = this.manualResearch.get(chatId);
    this.manualResearch.delete(chatId);
    if (this.closing || !context) return;
    const g = this.store.state.games.find((g) => g.id === context.gameId);
    if (!g || g.research?.chatId !== chatId) return;
    this.researchQueue.delete(g.id);
    if ((outcome.cancelled || outcome.error) && this.progress(g.id).complete)
      this.finishResearch(g.id);
    else if (outcome.cancelled || outcome.error) {
      this.store.metadata(g.id, {
        research: {
          ...g.research,
          userChecks: undefined,
          status: outcome.cancelled ? "cancelled" : "error",
          message: outcome.cancelled
            ? "Araştırma durduruldu. Kaydedilen sonuçlar korundu; kaldığı yerden devam edilebilir."
            : "Sohbet tamamlanamadı. Kaydedilen sonuçlar korundu.",
        },
      });
    } else {
      const current = this.progress(g.id);
      const advanced = context.before.pending.some((stage) => current.completed[stage]);
      this.finishResearch(g.id);
      // A follow-up in the linked research chat can finish the interrupted stage.
      // Continue the remaining stages only after success, never after stop/error.
      if (
        !current.complete &&
        context.allowAdvance &&
        (context.continueAfter || advanced)
      ) {
        this.researchBlocked = false;
        this.queueResearch([g.id], true);
      }
    }
    queueMicrotask(() => void this.drainResearch());
  }
  private resumeSavedResearch() {
    // Capture loaded IDs now: newly added games must finish metadata first.
    const pending = this.store.state.games
      .filter(
        (g) => g.research && ["queued", "waiting_model"].includes(g.research.status),
      )
      .map((g) => g.id);
    queueMicrotask(() => {
      if (this.closing) return;
      const existing = new Set(this.store.state.games.map((g) => g.id));
      this.queueResearch(
        pending.filter((id) => existing.has(id)),
        true,
      );
    });
  }
  // 2.0.8: the choice in the "Donanım kontrolü" window of a manual research,
  // for the games whose run goes through the hardware stage.
  // ai: the AI compares; marks the user set earlier are removed.
  // user: the user's Geçti/Geçmedi marks are saved now (they win over any
  // computed status); the agent then only writes the explanations.
  private prepareChecks(
    ids: string[],
    checks: unknown,
    decisions: unknown,
    restart: boolean,
  ) {
    if (checks !== "ai" && checks !== "user") return;
    const s = this.store,
      h = s.state.hardware,
      summary = s.state.settings.autoSummary;
    const games = s
      .requireGames(ids)
      .filter((g) => runsHardwareStage(g, h, summary, restart));
    if (!games.length) return;
    const marks = z
      .record(
        z.string(),
        z
          .array(
            z
              .object({
                level: z.enum(["minimum", "recommended"]),
                component: z.string().min(1).max(60),
                status: z.enum(["pass", "fail"]),
              })
              .strict(),
          )
          .max(40),
      )
      .optional()
      .parse(decisions);
    const at = now();
    const updates = games.map((g) => {
      const kept = (g.aiCompatibility || []).filter((r) => r.decidedBy !== "user");
      if (checks === "ai") return { g, aiCompatibility: kept, userChecks: undefined };
      const rows = compatibility(g, h);
      const list = marks?.[g.id] || [];
      const named = (level: "minimum" | "recommended") => rows[level].map((r) => r.name);
      const missing = (["minimum", "recommended"] as const).flatMap((level) =>
        named(level).filter(
          (name) => !list.some((d) => d.level === level && d.component === name),
        ),
      );
      if (missing.length || list.some((d) => !named(d.level).includes(d.component)))
        throw new Error(`“${g.name}”: her satırı Geçti ya da Geçmedi olarak işaretle.`);
      const entries = list.map((d) => ({
        level: d.level,
        component: d.component,
        status: d.status,
        reason: d.status === "pass" ? "Senin kararın: Geçti." : "Senin kararın: Geçmedi.",
        contextKey: componentCompatibilityKey(g, h, d.level, d.component),
        checkedAt: at,
        decidedBy: "user" as const,
      }));
      return {
        g,
        aiCompatibility: [
          ...kept.filter(
            (r) =>
              !entries.some((e) => e.level === r.level && e.component === r.component),
          ),
          ...entries,
        ],
        userChecks: true as const,
      };
    });
    s.researchChecks(
      updates.map(({ g, aiCompatibility, userChecks }) => ({
        id: g.id,
        aiCompatibility,
        userChecks,
      })),
    );
  }
  private researchAgain(ids: string[]) {
    if (!ids.length) return;
    const games = this.store.requireGames(ids);
    // Saved results and research histories stay; a backup precedes the full pass.
    this.store.flush();
    this.store.backup();
    for (const g of games) {
      g.research = {
        ...g.research,
        status: "queued",
        freshContext: true,
        stage: undefined,
        message: "Yeniden araştırılacak.",
      };
    }
    this.store.changed();
    this.researchBlocked = false;
    this.researchProbed = false;
    this.queueResearch(ids, true);
  }
  private queueResearch(ids: string[], manual = false) {
    if (!manual && !this.store.state.settings.autoResearch) return;
    const byId = new Map(this.store.state.games.map((g) => [g.id, g]));
    let changed = false;
    for (const id of ids) {
      const g = byId.get(id);
      if (!g) continue;
      if (
        !manual &&
        g.research &&
        !["queued", "waiting_model"].includes(g.research.status)
      )
        continue;
      if (g.research?.status === "running") continue;
      this.researchQueue.set(id, manual);
      g.research = {
        freshContext: !g.research,
        ...g.research,
        status: "queued",
        message: undefined,
      };
      changed = true;
    }
    // A whole-library pass publishes one state update, not thousands of IPC events.
    if (changed) this.store.changed();
    void this.drainResearch();
  }
  private waitingResearch(message: string) {
    let changed = false;
    for (const g of this.store.state.games) {
      if (!this.researchQueue.has(g.id)) continue;
      g.research = { ...g.research, status: "waiting_model", message };
      changed = true;
    }
    if (changed) this.store.changed();
  }
  private resumeResearch() {
    this.researchBlocked = false;
    this.researchProbed = false;
    this.queueResearch(
      this.store.state.games
        .filter(
          (g) =>
            g.research &&
            ["queued", "waiting_model", "error"].includes(g.research.status),
        )
        .map((g) => g.id),
      true,
    );
  }
  // 1.0.17: background research runs up to the agent's capacity (two at once
  // when "Aynı anda 2 istek" is on); a chat always gets a slot (makeRoom).
  // 2.1.0: a queued game whose research needs no model call — nothing left
  // for the AI (every row computed or answered) and no summary to write — is
  // finished at once, also when no model is selected.
  private finishWithoutModel() {
    for (const id of [...this.researchQueue.keys()]) {
      const g = this.store.state.games.find((x) => x.id === id);
      if (!g || this.researchTasks.has(id)) continue;
      this.store.applyLearnedChecks([id]);
      const p = this.progress(id);
      const fresh = g.research?.freshContext === true || !g.research;
      if (p.stages.length && (fresh || g.research?.userChecks || !p.complete)) continue;
      this.researchQueue.delete(id);
      this.finishResearch(id);
    }
  }
  private async drainResearch() {
    if (this.draining) return;
    this.draining = true;
    try {
      this.finishWithoutModel();
      while (
        !this.closing &&
        !this.foregroundPending &&
        this.researchQueue.size &&
        this.researchTasks.size + this.agent.manualCount < this.agent.capacity()
      ) {
        if (!this.store.state.settings.lmModel) {
          this.waitingResearch("AI araştırması için Ayarlar’dan bir model seç.");
          return;
        }
        if (this.researchBlocked) {
          this.waitingResearch(
            "Model bağlantısı bekleniyor. Ayarlar’dan bağlantıyı test et.",
          );
          return;
        }
        if (!this.researchProbed) {
          this.researchProbed = true;
          const probe = new AbortController();
          this.probeController = probe;
          try {
            this.agent.models = await this.lm.models(probe.signal);
            probe.signal.throwIfAborted();
            this.event({ type: "models", data: this.agent.models });
          } catch (e) {
            if (probe.signal.aborted) this.researchProbed = false;
            else {
              this.researchBlocked = true;
              this.waitingResearch(
                "Model bağlantısı kurulamadı: " + (e as Error).message,
              );
            }
            return;
          } finally {
            this.probeController = undefined;
          }
          continue;
        }
        if (!this.agent.models.some((m) => m.id === this.store.state.settings.lmModel)) {
          this.researchBlocked = true;
          this.waitingResearch(
            "Seçili model sunucuda bulunamadı. Modeli yükleyip bağlantıyı test et.",
          );
          return;
        }
        // A game already being researched (here or in its chat) is not started twice.
        const taken = new Set([
          ...this.researchTasks.keys(),
          ...[...this.manualResearch.values()].map((m) => m.gameId),
        ]);
        const id = [...this.researchQueue.keys()].find((id) => !taken.has(id));
        if (!id) return;
        this.researchQueue.delete(id);
        if (!this.store.state.games.some((g) => g.id === id)) continue;
        this.startResearch(id);
      }
    } finally {
      this.draining = false;
    }
  }
  private startResearch(id: string) {
    const controller = new AbortController();
    const job = { controller, task: Promise.resolve(), requeue: false };
    job.task = (async () => {
      try {
        this.store.applyLearnedChecks([id]);
        await this.agent.research(id, controller.signal);
        if (this.closing) return;
        if (this.store.state.games.some((g) => g.id === id)) this.finishResearch(id);
      } catch (e) {
        if (this.closing) return;
        const g = this.store.state.games.find((g) => g.id === id);
        if (!g) return;
        if (!job.requeue && this.progress(id).complete) {
          this.finishResearch(id);
          if (!controller.signal.aborted) this.researchBlocked = true;
        } else if (controller.signal.aborted) {
          if (job.requeue) this.researchQueue.set(id, true);
          this.store.metadata(id, {
            research: {
              ...g.research,
              status: job.requeue ? "queued" : "cancelled",
              message: job.requeue
                ? "Sohbetten sonra devam edecek."
                : "Araştırma durduruldu.",
            },
          });
        } else {
          this.researchBlocked = true;
          this.store.metadata(id, {
            research: { ...g.research, status: "error", message: (e as Error).message },
          });
        }
      }
    })();
    this.researchTasks.set(id, job);
    void job.task.finally(() => {
      this.researchTasks.delete(id);
      if (!this.closing && !this.researchBlocked && !controller.signal.aborted)
        queueMicrotask(() => void this.drainResearch());
    });
  }
  // A chat never waits for background research: when every slot is taken, the
  // most recently started research pauses and continues after the chat.
  private async pauseResearch(job?: {
    controller: AbortController;
    task: Promise<void>;
    requeue: boolean;
  }) {
    if (!job) return;
    job.requeue = true;
    job.controller.abort();
    await job.task;
  }
  private async makeRoom(chatId?: string) {
    const own = [...this.researchTasks.entries()].find(
      ([id]) =>
        this.store.state.games.find((g) => g.id === id)?.research?.chatId === chatId,
    );
    if (chatId && own) await this.pauseResearch(own[1]);
    if (this.agent.manualCount + this.researchTasks.size >= this.agent.capacity())
      await this.pauseResearch([...this.researchTasks.values()].at(-1));
  }
  // 2.1.3: without an id every research stops (Statistics → "Araştırmayı
  // durdur", undo, restore, import, automatic research off). With an id only
  // that game stops: the game page's "Durdur" must not cancel the other games
  // waiting in the queue, and the queue keeps moving after the freed slot.
  private async stopResearch(id?: string) {
    // Also a saved "queued"/"waiting_model" that is not in this session's queue:
    // the button on the page must never be a dead end.
    const queued = this.store.state.games.filter(
      (g) =>
        (!id || g.id === id) &&
        (this.researchQueue.has(g.id) ||
          ["queued", "waiting_model"].includes(g.research?.status || "")),
    );
    for (const g of queued) {
      g.research = researchProgress(
        g,
        this.store.state.hardware,
        this.store.state.settings.autoSummary,
      ).complete
        ? {
            ...g.research,
            status: "done",
            userChecks: undefined,
            message: "Araştırma sonuçları kaydedildi.",
          }
        : {
            ...g.research,
            status: "cancelled",
            userChecks: undefined,
            message: "Araştırma durduruldu.",
          };
      this.researchQueue.delete(g.id);
    }
    if (queued.length) this.store.changed();
    if (!id) {
      this.researchQueue.clear();
      this.probeController?.abort();
    }
    const jobs = [...this.researchTasks.entries()]
      .filter(([gameId]) => !id || gameId === id)
      .map(([, job]) => job);
    for (const job of jobs) {
      job.requeue = false;
      job.controller.abort();
    }
    const chats = [...this.manualResearch.entries()]
      .filter(([, context]) => !id || context.gameId === id)
      .map(([chatId]) => chatId);
    for (const chatId of chats) this.agent.cancel(chatId);
    await Promise.all([
      ...chats.map((chatId) => this.agent.waitForManualTurn(chatId)),
      ...jobs.map((job) => job.task),
    ]);
    // An aborted task never drains by itself; hand the freed slot to the next
    // queued game instead of letting it wait for an unrelated event.
    if (id && !this.closing) queueMicrotask(() => void this.drainResearch());
  }

  private idle() {
    if (this.agent.busy.size) throw new Error("Bu işlem için önce çalışan ajanı durdur.");
  }
  // Every error that leaves the app is one Turkish sentence: Zod's own text is
  // an English JSON dump ("code": "too_small", …) and it used to land in the
  // toast as-is when a number in Ayarlar was out of range (2.1.4).
  async call(method: string, a: any = {}) {
    try {
      return await this.dispatch(method, a);
    } catch (e) {
      throw new Error(validationMessage(e), { cause: e });
    }
  }
  private async dispatch(method: string, a: any = {}) {
    if (!methods.includes(method as Method))
      throw new Error("Bilinmeyen uygulama işlemi.");
    if (a === null || typeof a !== "object") throw new Error("Geçersiz işlem girdisi.");
    const s = this.store;
    switch (method) {
      case "bootstrap":
        return this.bootstrap();
      case "add": {
        const r = s.add(a.items, a.merge !== false);
        this.queue.resetCounters();
        this.queue.add(r.added);
        return r;
      }
      case "remove":
        return s.remove(a.ids);
      case "edit":
        return s.edit(a.id, a.patch);
      case "note":
        return s.setNote(a.id, a.text);
      case "batchStatus": {
        const games = s.requireGames(a.ids);
        z.enum(["planned", "playing", "finished", "dropped", "watch"]).parse(a.status);
        for (let i = 0; i < games.length; i++)
          s.edit(games[i].id, { status: a.status }, i === 0);
        return { count: games.length };
      }
      case "reorder":
        return s.move(a.ids, a.targetId, !!a.after);
      case "exactOrder":
        return s.exactOrder(a.ids);
      case "moveStep":
        return s.moveStep(a.id, z.number().min(-1).max(1).parse(a.direction));
      case "group":
        return s.group(a.action, a);
      case "moveGroup":
        return s.moveGroup(a.ids, a.groupId);
      case "removeFromGroup":
        return s.removeFromGroup(a.ids, a.groupId);
      case "play":
        return s.play(a.ids, a.fromGroup);
      case "series":
        return s.series(a.action, a);
      case "undo": {
        this.queue.cancel();
        await this.stopResearch();
        this.idle();
        const r = s.undo();
        for (const g of s.state.games)
          if (g.research?.status === "running")
            s.metadata(g.id, {
              research: {
                ...g.research,
                status: "cancelled",
                message: "Geri alma sonrası araştırma durduruldu.",
              },
            });
        return r;
      }
      case "settings": {
        const changedEndpoint =
          a.patch.lmUrl !== undefined && a.patch.lmUrl !== s.state.settings.lmUrl;
        if (
          this.agent.busy.size &&
          (changedEndpoint ||
            (a.patch.lmModel !== undefined &&
              a.patch.lmModel !== s.state.settings.lmModel))
        )
          throw new Error("Model veya sunucu değiştirmeden önce ajanı durdur.");
        const result = s.settings(a.patch);
        if (changedEndpoint) {
          this.agent.models = [];
          this.event({ type: "models", data: [] });
        }
        this.onSettings();
        if (a.patch.autoResearch === false) await this.stopResearch();
        else if (
          a.patch.lmModel !== undefined ||
          changedEndpoint ||
          a.patch.autoResearch === true
        ) {
          this.resumeResearch();
          if (a.patch.autoResearch === true)
            this.queueResearch(s.state.games.filter((g) => !g.research).map((g) => g.id));
        }
        return result;
      }
      case "hardware":
        return s.hardware({ ...a.patch, manual: true });
      case "detectHardware": {
        const result = await detectHardware();
        s.hardware(result);
        return result;
      }
      case "searchGames": {
        const query = z.string().max(200).parse(a.query);
        if (a.platform === undefined) return this.providers.searchGames(query);
        return this.providers.searchPlatform(
          z
            .enum(["Steam", "GOG", "Epic Games", "Xbox", "My Abandonware"])
            .parse(a.platform),
          query,
        );
      }
      case "refresh":
        s.requireGames(a.ids);
        this.queue.resetCounters();
        this.queue.add(a.ids, !!a.force);
        return { queued: a.ids.length };
      case "cancelQueue":
        this.queue.cancel();
        await this.stopResearch();
        return { ok: true };
      case "match": {
        const id = z.number().int().positive().parse(a.appId);
        s.requireGames([a.id]);
        s.metadata(a.id, {
          appId: id,
          origin: { store: "Steam", id: String(id) },
          steamMatchMode: "manual",
          ...(a.name ? { name: z.string().min(1).max(300).parse(a.name) } : {}),
          research: undefined,
          candidates: undefined,
          updatedAt: undefined,
        });
        this.queue.resetCounters();
        this.queue.add([a.id], true);
        return { ok: true };
      }
      case "researchAll": {
        await this.stopResearch();
        const ids = s.state.games.map((g) => g.id);
        this.prepareChecks(ids, a.checks, a.decisions, true);
        this.researchAgain(ids);
        return { queued: ids.length };
      }
      // 2.0.8: Statistics → "Seçtiğim oyunları yeniden araştır".
      case "researchSelected": {
        const ids = z.array(z.string().min(1).max(100)).min(1).max(20000).parse(a.ids);
        if (s.requireGames(ids).some((g) => g.research?.status === "running"))
          throw new Error(
            "Seçtiğin oyunlardan biri şu an araştırılıyor. Bitmesini bekle ya da araştırmayı durdur.",
          );
        this.prepareChecks(ids, a.checks, a.decisions, true);
        this.researchAgain(ids);
        return { queued: ids.length };
      }
      case "researchGame": {
        const first = s.requireGames([a.id])[0];
        if (this.agent.busy.size && this.agent.busy.has(first.research?.chatId || ""))
          throw new Error("Önce çalışan araştırmayı durdur veya bitmesini bekle.");
        const restart =
          a.restart === true || !first.research || first.research.status === "done";
        this.prepareChecks([first.id], a.checks, a.decisions, restart);
        const g = s.requireGames([a.id])[0];
        if (restart)
          g.research = {
            ...g.research,
            status: "queued",
            freshContext: true,
            stage: undefined,
          };
        else if (
          this.progress(g.id).complete &&
          !g.research?.freshContext &&
          !g.research?.userChecks
        ) {
          this.finishResearch(g.id);
          return { queued: false, complete: true };
        }
        this.researchBlocked = false;
        this.researchProbed = false;
        this.queueResearch([a.id], true);
        return { queued: true };
      }
      case "stopResearch":
        await this.stopResearch(
          a.id === undefined ? undefined : z.string().min(1).max(100).parse(a.id),
        );
        return { ok: true };
      case "summary":
        return this.agent.summary(a.id);
      case "compatibility":
        return compatibility(s.requireGames([a.id])[0], s.state.hardware);
      case "testLM": {
        const models = await this.lm.models();
        this.agent.models = models;
        this.event({ type: "models", data: models });
        this.resumeResearch();
        return {
          models,
          notice: !this.desktop
            ? "Tarayıcı önizlemesinin localhost adresi bu sunucudur, senin bilgisayarın değil. Gerçek LM Studio bağlantısı masaüstü EXE’de çalışır."
            : models.length
              ? "Sunucuya bağlanıldı. Bir model seç."
              : "Sunucuya bağlanıldı; listelenen model yok.",
        };
      }
      case "secret": {
        const name = z.enum(["lm", "brave"]).parse(a.name);
        this.secrets[name] = z.string().max(2000).parse(a.value);
        this.saveSecrets(this.secrets);
        return { saved: true };
      }
      case "newChat": {
        // In the split view a new chat opens in the pane that has the focus.
        if (a.slot === "bottom" && s.state.activeChatId) {
          const c = s.createChat(false, false);
          s.setSplit({ chatId: c.id });
          return c;
        }
        return s.createChat();
      }
      case "chatSplit":
        return s.chatSplit(
          z.enum(["open", "close", "swap", "pick", "ratio"]).parse(a.action),
          a,
        );
      case "deleteChat":
        this.agent.cancel(a.id);
        return s.deleteChat(a.id);
      case "deleteChats": {
        const ids = z.array(z.string().max(100)).min(1).max(500).parse(a.ids);
        for (const id of ids) this.agent.cancel(id);
        return s.deleteChats(ids);
      }
      case "renameChat":
        return s.renameChat(z.string().max(100).parse(a.id), z.string().parse(a.title));
      case "chatGroup":
        return s.chatGroup(z.enum(["create", "edit", "delete"]).parse(a.action), a);
      case "moveChats":
        return s.moveChats(
          z.array(z.string().max(100)).min(1).max(500).parse(a.ids),
          a.groupId ? z.string().max(100).parse(a.groupId) : null,
        );
      case "update": {
        const action = z
          .enum(["state", "check", "download", "cancel", "install"])
          .parse(a.action);
        if (action === "check") return this.updater.check();
        if (action === "download") return this.updater.start();
        if (action === "cancel") return this.updater.cancel();
        if (action === "install") return this.updater.install();
        return this.updater.state;
      }
      case "overlaySettings": {
        const result = s.settings({
          overlay: overlaySchema.parse({
            ...s.state.settings.overlay,
            ...(a.patch || {}),
          }),
        });
        this.overlay?.settingsChanged();
        this.onSettings();
        return result.overlay;
      }
      case "overlayAction":
        if (!this.overlay)
          throw new Error("Oyun katmanı yalnız Windows masaüstü uygulamasında çalışır.");
        return this.overlay.action(z.string().max(60).parse(a.name), a.args || {});
      case "activeChat":
        s.getChat(a.id);
        s.state.activeChatId = a.id;
        s.changed();
        return { ok: true };
      case "send": {
        this.foregroundPending = true;
        try {
          const chatId = z.string().parse(a.chatId),
            text = z.string().parse(a.text);
          await this.makeRoom(chatId);
          this.agent.assertRoom(chatId);
          const mentions = z
            .array(z.string())
            .max(10)
            .parse(a.mentions || []);
          const g = s.state.games.find((g) => g.research?.chatId === chatId);
          const previous = g?.research ? structuredClone(g.research) : undefined;
          if (g) {
            this.manualResearch.set(chatId, {
              gameId: g.id,
              before: this.progress(g.id),
              allowAdvance:
                !/devam\s*etme|sürdürme|durdur|\bdur\s*$|don.t\s+continue|do\s+not\s+continue|\bstop\b/iu.test(
                  text,
                ),
              continueAfter:
                ["queued", "running"].includes(g.research!.status) ||
                /devam|sürdür|tamamla|continue|resume/i.test(text),
            });
            s.metadata(g.id, {
              research: {
                ...g.research,
                status: "running",
                freshContext: false,
                message:
                  "Araştırma sohbetten devam ediyor. Kaydedilen aşamalar korunuyor.",
              },
            });
          }
          try {
            return await this.agent.send(chatId, text, mentions);
          } catch (e) {
            this.manualResearch.delete(chatId);
            if (g) s.metadata(g.id, { research: previous });
            throw e;
          }
        } finally {
          this.foregroundPending = false;
          queueMicrotask(() => void this.drainResearch());
        }
      }
      case "retryTool":
        this.foregroundPending = true;
        try {
          await this.makeRoom(a.chatId);
          return await this.agent.retry(a.chatId, a.name, a.args);
        } finally {
          this.foregroundPending = false;
          queueMicrotask(() => void this.drainResearch());
        }
      case "stopChat":
        if (
          s.state.chats.find((c) => c.id === a.chatId)?.automatic &&
          this.researchTasks.size
        ) {
          await this.stopResearch();
          return { ok: true };
        }
        this.agent.cancel(a.chatId);
        await this.agent.waitForManualTurn(a.chatId);
        return { ok: true };
      case "permission":
        return this.agent.answerPermission(a.id, a.decision);
      case "wizard":
        return this.agent.answerWizard(a.id, a.answer);
      case "revokeGrants":
        s.getChat(a.chatId).allowedTools = [];
        s.changed();
        return { ok: true };
      case "backups":
        return s.backups();
      case "backup":
        s.flush();
        return { name: s.backup() };
      case "restore": {
        await this.stopResearch();
        this.idle();
        this.queue.cancel();
        const result = s.restore(a.name);
        this.agent.models = [];
        this.event({ type: "models", data: [] });
        this.onSettings();
        this.resumeSavedResearch();
        this.fillMissingTimes();
        return result;
      }
      case "export": {
        const format = z.enum(["json", "csv", "text"]).parse(a.format);
        return {
          text:
            format === "json"
              ? JSON.stringify(s.exportState(), null, 2)
              : format === "csv"
                ? csvExport(s.state.games)
                : s.state.games.map((g, i) => `${i + 1}. ${g.name}`).join("\n"),
          filename: `Oyun-Siralayici-${new Date().toISOString().slice(0, 10)}.${format === "text" ? "txt" : format}`,
          mime:
            format === "json"
              ? "application/json"
              : format === "csv"
                ? "text/csv"
                : "text/plain",
        };
      }
      case "import": {
        await this.stopResearch();
        this.idle();
        const text = z.string().max(128_000_000).parse(a.text);
        const parsed = JSON.parse(text);
        s.validate(parsed);
        this.queue.cancel();
        const result = s.importState(parsed);
        this.agent.models = [];
        this.event({ type: "models", data: [] });
        this.onSettings();
        this.resumeSavedResearch();
        this.fillMissingTimes();
        return result;
      }
      case "clearCache": {
        this.queue.cancel();
        for (const f of fs.readdirSync(path.join(s.root, "media")))
          if (/^[a-f0-9]{64}\.img$/.test(f))
            fs.rmSync(path.join(s.root, "media", f), { force: true });
        s.state.games.forEach((g) => {
          g.cover = undefined;
          g.hero = undefined;
          g.updatedAt = undefined;
        });
        s.changed();
        return { ok: true };
      }
      case "stats": {
        const games = s.state.games;
        const counts = (values: string[]) =>
          values.reduce<Record<string, number>>(
            (acc, k) => ((acc[k] = (acc[k] || 0) + 1), acc),
            {},
          );
        return {
          total: games.length,
          status: counts(games.map((g) => g.status)),
          genres: counts(games.flatMap((g) => g.genres)),
          compatibility: counts(
            games.map((g) => compatibility(g, s.state.hardware).status),
          ),
        };
      }
      case "openBrowser":
        await this.openBrowser();
        return { ok: true, desktop: this.desktop };
      case "openExternal": {
        const u = new URL(z.string().max(3000).parse(a.url));
        if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
          throw new Error("Yalnızca güvenli web bağlantıları açılabilir.");
        await this.openExternal(u.toString());
        return { ok: true };
      }
      case "window":
        this.windowAction(z.enum(["minimize", "maximize", "close"]).parse(a.action));
        return;
      case "openDataFolder":
        this.openFolder();
        return;
    }
  }
  close() {
    this.closing = true;
    this.updater.stop();
    this.researchQueue.clear();
    for (const job of this.researchTasks.values()) job.controller.abort();
    this.probeController?.abort();
    this.agent.close();
    this.queue.cancel();
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.store.close();
  }
}
