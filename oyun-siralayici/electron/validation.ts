import { METRICS, defaultOverlay, type MetricId } from "../shared/overlay";
import { z } from "zod";
import { NOTE_MAX_LENGTH } from "../shared/domain";
const short = z.string().max(300),
  id = z.string().min(1).max(100),
  url = z
    .string()
    .max(3000)
    .refine((v) => {
      try {
        const u = new URL(v);
        return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Bağlantı http(s) olmalı.");
const strings = z.array(short).max(200);
const num = z.number().finite().nonnegative();
const stamp = z.string().max(50);
export const sourceSchema = z.object({
  quote: z.string().max(2000).optional(),
  fields: z.array(z.string().max(60)).max(40).optional(),
  title: short,
  url,
  checkedAt: stamp,
  kind: z.enum(["official", "community", "search", "manual", "agent"]).optional(),
});
export const requirementsSchema = z.object({
  availability: z.enum(["published", "partial", "not_published"]).optional(),
  unpublished: z
    .array(z.enum(["os", "cpu", "gpu", "ramGB", "storageGB"]))
    .max(5)
    .optional(),
  raw: z.string().max(30000).default(""),
  os: short.optional(),
  cpu: z.string().max(2000).optional(),
  gpu: z.string().max(2000).optional(),
  ramGB: num.optional(),
  vramGB: num.optional(),
  storageGB: num.optional(),
  directX: num.optional(),
  vulkan: short.optional(),
});
export const completionTimesSchema = z.object({
  status: z.enum(["found", "not_found", "unavailable"]),
  main: num.optional(),
  mainExtra: num.optional(),
  completionist: num.optional(),
  allStyles: num.optional(),
  url: url.optional(),
  sourceUrl: url.optional(),
  via: short.optional(),
  checkedAt: stamp,
  attemptedAt: stamp.optional(),
  sourceUpdatedAt: stamp.optional(),
  message: z.string().max(5000).optional(),
  title: z.string().max(300).optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const originStores = [
  "Steam",
  "GOG",
  "Epic Games",
  "Xbox",
  "My Abandonware",
  "none",
] as const;
export const originSchema = z
  .object({
    store: z.enum(originStores),
    id: z.string().max(300).optional(),
    url: url.optional(),
  })
  .strict();
export const gameSchema = z.object({
  reqVerdict: z.enum(["meets", "fails", "unknown"]).optional(),
  origin: originSchema.optional(),
  requirementSource: z
    .object({ store: short, url: url.optional(), checkedAt: stamp })
    .optional(),
  pcgw: z
    .object({
      status: z.enum(["found", "not_found", "unavailable"]),
      checkedAt: stamp,
      title: short.optional(),
      url: url.optional(),
      message: z.string().max(500).optional(),
    })
    .optional(),
  storeSync: z.boolean().optional(),
  appType: z.string().max(40).optional(),
  baseGame: z
    .object({
      appId: z.number().int().positive().optional(),
      name: z.string().max(300),
    })
    .optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  steamMatchMode: z.enum(["manual", "auto"]).optional(),
  catalogVersion: z.number().int().optional(),
  research: z
    .object({
      stage: z.enum(["hardware", "summary"]).optional(),
      freshContext: z.boolean().optional(),
      userChecks: z.boolean().optional(),
      status: z.enum([
        "queued",
        "waiting_model",
        "running",
        "done",
        "incomplete",
        "error",
        "cancelled",
      ]),
      message: z.string().max(5000).optional(),
      chatId: id.optional(),
      checkedAt: stamp.optional(),
    })
    .optional(),
  aiCompatibility: z
    .array(
      z.object({
        level: z.enum(["minimum", "recommended"]),
        component: short,
        status: z.enum(["pass", "fail", "unknown"]),
        reason: z.string().max(3000),
        contextKey: z.string().max(40000),
        checkedAt: stamp,
        model: short.optional(),
        sources: z.array(sourceSchema).max(20).optional(),
        decidedBy: z.literal("user").optional(),
      }),
    )
    .max(40)
    .optional(),
  catalogCheckedAt: stamp.optional(),
  hltb: completionTimesSchema.optional(),
  storeChecks: z
    .array(
      z.object({
        store: z.enum(["Steam", "GOG", "Epic Games", "Xbox"]),
        status: z.enum(["found", "not_found", "unavailable", "review"]),
        checkedAt: stamp,
        source: short,
        url: url.optional(),
        matchedTitle: short.optional(),
        message: z.string().max(5000).optional(),
        priceUpdatedAt: stamp.optional(),
        candidates: z
          .array(z.object({ name: short, url }))
          .max(30)
          .optional(),
      }),
    )
    .max(4)
    .optional(),
  aiEditedFields: z.array(z.string().max(60)).max(200).optional(),
  aiEditedAt: stamp.optional(),
  id,
  name: z.string().trim().min(1).max(300),
  createdAt: stamp,
  order: z.number().int().nonnegative(),
  seriesId: id.optional(),
  autoSeries: z.boolean().optional(),
  groupIds: z.array(id).max(200),
  inPlayList: z.boolean(),
  status: z.enum(["planned", "playing", "finished", "dropped", "watch"]),
  tags: z.array(z.string().max(60)).max(50),
  rating: z.number().min(0).max(10).nullable(),
  appId: z.number().int().positive().max(100000000).optional(),
  cover: z
    .string()
    .regex(/^[a-f0-9]{64}\.img$/)
    .optional(),
  hero: z
    .string()
    .regex(/^[a-f0-9]{64}\.img$/)
    .optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  genres: strings,
  platforms: strings,
  developers: strings,
  publishers: strings,
  description: z.string().max(30000).optional(),
  aiSummary: z.string().max(5000).optional(),
  aiSummaryAt: stamp.optional(),
  aiSummaryModel: short.optional(),
  metacritic: z.number().min(0).max(100).optional(),
  metacriticNoScore: z.object({ url, title: short, checkedAt: stamp }).optional(),
  steamScore: z.number().min(0).max(100).optional(),
  steamReviewCount: num.optional(),
  price: short.optional(),
  playHours: num.max(10000).optional(),
  minimum: requirementsSchema,
  recommended: requirementsSchema,
  screenshots: z.array(url).max(30),
  trailer: url.optional(),
  stores: z
    .array(
      z.object({
        name: short,
        url,
        verified: z.boolean(),
        price: short.optional(),
        source: short.optional(),
        checkedAt: stamp.optional(),
        priceUpdatedAt: stamp.optional(),
      }),
    )
    .max(30),
  sources: z.array(sourceSchema).max(100),
  updatedAt: stamp.optional(),
  fetchStatus: z.enum(["idle", "queued", "loading", "done", "review", "error"]),
  fetchError: z.string().max(5000).optional(),
  candidates: z
    .array(
      z.object({
        appId: z.number().int().positive(),
        name: short,
        image: url.optional(),
        price: short.optional(),
      }),
    )
    .max(30)
    .optional(),
});
export const chatGroupSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  collapsed: z.boolean().optional(),
  system: z.literal("research").optional(),
});
export const chatSchema = z.object({
  automatic: z.boolean().optional(),
  groupId: z.string().max(100).optional(),
  id,
  title: z.string().max(500),
  createdAt: stamp,
  messages: z.array(
    z.object({
      id,
      role: z.enum(["user", "assistant"]),
      createdAt: stamp,
      error: z.boolean().optional(),
      blocks: z.array(
        z.union([
          z.object({
            id,
            type: z.enum(["text", "thinking", "notice"]),
            text: z.string().max(1000000),
          }),
          z.object({
            id,
            type: z.literal("tool"),
            name: z.string().max(100),
            args: z.unknown(),
            status: z.enum(["running", "done", "error", "denied"]),
            startedAt: num,
            duration: num.optional(),
            result: z.unknown().optional(),
            error: z.string().max(10000).optional(),
          }),
        ]),
      ),
    }),
  ),
  apiHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant", "tool"]),
      content: z.string().max(1000000).nullable(),
      kind: z.literal("tool_result").optional(),
      tool_call_id: z.string().max(300).optional(),
      tool_calls: z
        .array(
          z.object({
            id: z.string().max(300),
            type: z.literal("function"),
            function: z.object({
              name: z.string().max(100),
              arguments: z.string().max(50000),
            }),
          }),
        )
        .optional(),
    }),
  ),
  allowedTools: z.array(z.string().max(100)).max(100).default([]),
});
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const metricIds = METRICS.map((m) => m.id) as [MetricId, ...MetricId[]];
const presetSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  builtin: z.boolean().optional(),
  metrics: z
    .array(
      z.object({
        id: z.enum(metricIds),
        enabled: z.boolean(),
        warn: z.number().min(-100000).max(100000).nullable().optional(),
        danger: z.number().min(-100000).max(100000).nullable().optional(),
      }),
    )
    .max(40),
  colors: z.object({
    text: color,
    label: color,
    background: color,
    accent: color,
    warn: color,
    danger: color,
  }),
  opacity: z.number().min(0).max(1),
  scale: z.number().min(0.6).max(2),
  position: z.enum(["top-right", "top-left", "bottom-right", "bottom-left"]),
  layout: z.enum(["vertical", "horizontal"]),
  showTitle: z.boolean(),
});
const exeName = z.string().trim().toLowerCase().min(1).max(260);
export const overlaySchema = z
  .object({
    enabled: z.boolean().default(defaultOverlay.enabled),
    hotkey: z.string().max(60).default(defaultOverlay.hotkey),
    presetId: z.string().max(60).default(defaultOverlay.presetId),
    presets: z.array(presetSchema).min(1).max(30).default(defaultOverlay.presets),
    closeToTray: z.boolean().default(true),
    startWithWindows: z.boolean().default(false),
    startHidden: z.boolean().default(false),
    sessionLimit: z.number().int().min(0).max(1440).default(0),
    remindEvery: z.number().int().min(0).max(600).default(15),
    alarms: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          label: z.string().max(80),
          enabled: z.boolean(),
          lastFired: z.string().max(20).optional(),
        }),
      )
      .max(20)
      .default([]),
    sound: z.boolean().default(true),
    muteGameInBackground: z.boolean().default(false),
    muteOthers: z.boolean().default(false),
    muteExclude: z.array(exeName).max(50).default(defaultOverlay.muteExclude),
    fpsMethod: z.enum(["off", "rtss", "nvidia"]).default("off"),
    fpsLimit: z.number().int().min(0).max(1000).default(0),
    backgroundFps: z.number().int().min(0).max(1000).default(0),
    gameFps: z.record(z.string().max(260), z.number().int().min(0).max(1000)).default({}),
    ignore: z.array(exeName).max(500).default([]),
    mappings: z
      .array(
        z.object({
          exe: exeName,
          gameId: z.string().max(100).optional(),
          name: z.string().max(300),
        }),
      )
      .max(500)
      .default([]),
    autoPlaying: z.boolean().default(true),
    trackPlaytime: z.boolean().default(true),
    lhm: z.boolean().default(false),
    lhmUrl: z.string().max(300).default(defaultOverlay.lhmUrl),
    nowPlayingToast: z.boolean().default(true),
    drawMode: z.enum(["auto", "inject", "window"]).default("auto"),
  })
  .default(defaultOverlay);
export const settingsSchema = z.object({
  theme: z.enum([
    "dark",
    "light",
    "system",
    "neon",
    "ocean",
    "forest",
    "sunset",
    "amoled",
  ]),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  fontSize: z.number().min(11).max(22),
  fontFamily: z.enum(["system", "Arial", "Georgia", "monospace"]),
  density: z.enum(["comfortable", "compact"]),
  radius: z.number().min(0).max(32),
  animations: z.boolean(),
  animationSpeed: z.number().min(0.25).max(2),
  opacity: z.number().min(0.7).max(1),
  material: z.enum(["none", "mica", "acrylic"]),
  background: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z
      .string()
      .max(7000000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/)
      .optional(),
  ),
  blur: z.number().min(0).max(40),
  lmUrl: z.string().max(500),
  lmModel: z.string().max(500),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(1048576),
  contextTokens: z.number().int().min(0).max(1048576).default(0),
  parallelRequests: z.boolean().default(true),
  systemPrompt: z.string().max(16000),
  toolMode: z.enum(["auto", "native", "json"]),
  reasoning: z.enum(["default", "off", "on", "low", "medium", "high"]),
  showThinking: z.boolean(),
  requireApproval: z.boolean().default(false),
  askReadTools: z.boolean(),
  autoSummary: z.boolean(),
  autoResearch: z.boolean().default(true),
  searchProvider: z.enum(["auto", "searxng", "brave"]),
  searxUrl: z.string().max(500),
  cacheHours: z.number().min(1).max(8760),
  collapsedSeries: z.array(id).max(5000),
  firstRun: z.boolean(),
  chatListWidth: z.number().min(0).max(560).default(0),
  chatSplit: z
    .object({
      chatId: z.string().max(100).nullable().default(null),
      ratio: z.number().min(0.2).max(0.8).default(0.5),
    })
    .default({ chatId: null, ratio: 0.5 }),
  updateCheck: z.boolean().default(true),
  lastSeenVersion: z.string().max(40).default(""),
  overlay: overlaySchema,
});
export const hardwareSchema = z.object({
  os: z.string().max(2000),
  osVersion: z.string().max(2000),
  architecture: z.string().max(100),
  cpu: z.string().max(2000),
  cores: num.max(100000).nullable(),
  threads: num.max(100000).nullable(),
  clockGHz: num.max(1000).nullable(),
  gpu: z.string().max(2000),
  vramGB: num.max(1000000).nullable(),
  vramCertain: z.boolean(),
  ramGB: num.max(1000000).nullable(),
  diskFreeGB: num.max(1000000).nullable(),
  diskName: z.string().max(2000),
  directX: num.max(100).nullable(),
  directXInstalled: z.string().max(2000),
  vulkan: z.string().max(2000),
  gpuOptions: z.array(z.object({ name: short, vramGB: num.nullable() })).max(50),
  disks: z.array(z.object({ name: short, freeGB: num, sizeGB: num })).max(100),
  detectedAt: stamp.optional(),
  manual: z.boolean(),
  note: z.string().max(2000),
});
// UI-only personal note (see shared/types GameNote). Not part of gameSchema.
export const noteSchema = z.object({
  text: z.string().max(NOTE_MAX_LENGTH),
  updatedAt: stamp,
});
