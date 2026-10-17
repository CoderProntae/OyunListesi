import type { OverlaySettings } from "./overlay";
import type { UpdateState } from "./update";
export type GameStatus = "planned" | "playing" | "finished" | "dropped" | "watch";
export type CompatStatus = "recommended" | "minimum" | "unknown" | "unsupported";
export interface Source {
  quote?: string;
  fields?: string[];
  title: string;
  url: string;
  checkedAt: string;
  kind?: "official" | "community" | "search" | "manual" | "agent";
}
export interface Requirements {
  availability?: "published" | "partial" | "not_published";
  unpublished?: ("os" | "cpu" | "gpu" | "ramGB" | "storageGB")[];
  raw: string;
  os?: string;
  cpu?: string;
  gpu?: string;
  ramGB?: number;
  vramGB?: number;
  storageGB?: number;
  directX?: number;
  vulkan?: string;
}
export interface CompletionTimes {
  status: "found" | "not_found" | "unavailable";
  main?: number;
  mainExtra?: number;
  completionist?: number;
  allStyles?: number;
  url?: string;
  sourceUrl?: string;
  via?: string;
  checkedAt: string;
  attemptedAt?: string;
  sourceUpdatedAt?: string;
  message?: string;
  // HowLongToBeat's own name and release date of the matched entry.
  title?: string;
  releaseDate?: string;
}
// Where a game was added from (Oyun ekle → 1. Platform). "none" = no platform:
// the game has no store data, so its system requirements are not specified.
export type OriginStore =
  | "Steam"
  | "GOG"
  | "Epic Games"
  | "Xbox"
  | "My Abandonware"
  | "none";
export interface PlatformHit {
  store: OriginStore;
  id: string;
  name: string;
  url?: string;
  image?: string;
  detail?: string;
  appId?: number;
}
export interface StoreCheck {
  store: "Steam" | "GOG" | "Epic Games" | "Xbox";
  status: "found" | "not_found" | "unavailable" | "review";
  checkedAt: string;
  source: string;
  url?: string;
  matchedTitle?: string;
  message?: string;
  priceUpdatedAt?: string;
  candidates?: { name: string; url: string }[];
}
export interface Game {
  // 2.1.2: the user's own verdict when no requirement could be fetched.
  reqVerdict?: "meets" | "fails" | "unknown";
  origin?: { store: OriginStore; id?: string; url?: string };
  // The store whose page gave the saved system requirements (shown under the
  // Sistem table). Missing when no store has the game.
  requirementSource?: { store: string; url?: string; checkedAt: string };
  // 2.0.5: the last PCGamingWiki lookup, made when the store publishes no
  // system requirements ("found": its Windows block is the saved one).
  pcgw?: {
    status: "found" | "not_found" | "unavailable";
    checkedAt: string;
    title?: string;
    url?: string;
    message?: string;
  };
  // Set once by the 1.0.16 update: requirements written earlier by automatic AI
  // research are replaced by the store's own text at the next refresh.
  storeSync?: boolean;
  // Steam app type ("game", "dlc" …) and, for a DLC, the game it belongs to.
  appType?: string;
  baseGame?: { appId?: number; name: string };
  // Full release date (YYYY-MM-DD) when a source gives one.
  releaseDate?: string;
  steamMatchMode?: "manual" | "auto";
  catalogVersion?: number;
  research?: {
    stage?: "hardware" | "summary";
    freshContext?: boolean;
    // 2.0.8: the hardware stage applies the user's own Geçti/Geçmedi marks
    // (saved as decidedBy "user" rows); the agent only writes explanations.
    userChecks?: boolean;
    status:
      | "queued"
      | "waiting_model"
      | "running"
      | "done"
      | "incomplete"
      | "error"
      | "cancelled";
    message?: string;
    chatId?: string;
    checkedAt?: string;
  };
  aiCompatibility?: {
    level: "minimum" | "recommended";
    component: string;
    status: "pass" | "fail" | "unknown";
    reason: string;
    contextKey: string;
    checkedAt: string;
    model?: string;
    sources?: Source[];
    // 2.0.8: marked by the user (any row, also computed ones).
    decidedBy?: "user";
  }[];
  aiEditedFields?: string[];
  aiEditedAt?: string;
  id: string;
  name: string;
  createdAt: string;
  order: number;
  seriesId?: string;
  autoSeries?: boolean;
  groupIds: string[];
  inPlayList: boolean;
  status: GameStatus;
  tags: string[];
  rating: number | null;
  appId?: number;
  cover?: string;
  hero?: string;
  year?: number;
  genres: string[];
  platforms: string[];
  developers: string[];
  publishers: string[];
  description?: string;
  aiSummary?: string;
  aiSummaryAt?: string;
  aiSummaryModel?: string;
  metacritic?: number;
  // Metacritic lists the game but publishes no critic score (2.0.4).
  metacriticNoScore?: { url: string; title: string; checkedAt: string };
  steamScore?: number;
  steamReviewCount?: number;
  price?: string;
  playHours?: number;
  minimum: Requirements;
  recommended: Requirements;
  screenshots: string[];
  trailer?: string;
  stores: {
    name: string;
    url: string;
    verified: boolean;
    price?: string;
    source?: string;
    checkedAt?: string;
    priceUpdatedAt?: string;
  }[];
  storeChecks?: StoreCheck[];
  hltb?: CompletionTimes;
  catalogCheckedAt?: string;
  sources: Source[];
  updatedAt?: string;
  fetchStatus: "idle" | "queued" | "loading" | "done" | "review" | "error";
  fetchError?: string;
  candidates?: SearchGame[];
}
// Personal note written only in the Not tab. Deliberately stored outside Game:
// agent tools return game records, so a note inside Game could leak into a
// prompt. No tool, prompt, research stage or browser page reads or writes it.
export interface GameNote {
  text: string;
  updatedAt: string;
}
export interface Group {
  id: string;
  name: string;
  color: string;
  icon: string;
}
export interface Series {
  id: string;
  name: string;
  automatic: boolean;
}
export interface SearchGame {
  appId: number;
  name: string;
  image?: string;
  price?: string;
}
export interface Hardware {
  os: string;
  osVersion: string;
  architecture: string;
  cpu: string;
  cores: number | null;
  threads: number | null;
  clockGHz: number | null;
  gpu: string;
  vramGB: number | null;
  vramCertain: boolean;
  ramGB: number | null;
  diskFreeGB: number | null;
  diskName: string;
  directX: number | null;
  directXInstalled: string;
  vulkan: string;
  gpuOptions: { name: string; vramGB: number | null }[];
  disks: { name: string; freeGB: number; sizeGB: number }[];
  detectedAt?: string;
  manual: boolean;
  note: string;
}
export interface ComponentCheck {
  contextKey?: string;
  aiEditable?: boolean;
  aiBlockReason?: string;
  name: string;
  actual: string;
  required: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
  estimated?: boolean;
  ai?: boolean;
  // 2.0.8: the status is the user's own mark.
  user?: boolean;
  // 2.1.0: computed from the hardware data (PassMark/TechPowerUp); "near" =
  // within 10 % of the requirement ("yaklaşık eşit"), counted as met.
  db?: boolean;
  near?: boolean;
}
export interface Compatibility {
  status: CompatStatus;
  minimum: ComponentCheck[];
  recommended: ComponentCheck[];
  summary: string;
  label: string;
  suggestedGroups: string[];
  // 2.1.3: set when the result is the user's own mark for a game that has no
  // published requirement (nothing to compute). Drives the same dot, label,
  // sorting and statistics as a computed result.
  userVerdict?: "meets" | "fails" | "unknown";
}
export interface ModelInfo {
  id: string;
  name: string;
  loaded: boolean | null;
  context: number | null;
  tools: boolean | null;
  reasoning: string[];
  defaultReasoning?: string;
}
export interface Settings {
  theme: "dark" | "light" | "system" | "neon" | "ocean" | "forest" | "sunset" | "amoled";
  accent: string;
  fontSize: number;
  fontFamily: string;
  density: "comfortable" | "compact";
  radius: number;
  animations: boolean;
  animationSpeed: number;
  opacity: number;
  material: "none" | "mica" | "acrylic";
  background?: string;
  blur: number;
  lmUrl: string;
  lmModel: string;
  temperature: number;
  maxTokens: number;
  contextTokens: number;
  parallelRequests: boolean;
  systemPrompt: string;
  toolMode: "auto" | "native" | "json";
  reasoning: string;
  showThinking: boolean;
  requireApproval: boolean;
  askReadTools: boolean;
  autoSummary: boolean;
  autoResearch: boolean;
  searchProvider: "auto" | "searxng" | "brave";
  searxUrl: string;
  cacheHours: number;
  collapsedSeries: string[];
  firstRun: boolean;
  chatListWidth: number;
  // 2.0.2: a second chat under the first one (null = one chat).
  chatSplit: { chatId: string | null; ratio: number };
  updateCheck: boolean;
  lastSeenVersion: string;
  overlay: OverlaySettings;
}
export interface ToolBlock {
  id: string;
  type: "tool";
  name: string;
  args: any;
  status: "running" | "done" | "error" | "denied";
  startedAt: number;
  duration?: number;
  result?: any;
  error?: string;
}
export type ChatBlock =
  | { id: string; type: "text" | "thinking" | "notice"; text: string }
  | ToolBlock;
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ChatBlock[];
  createdAt: string;
  error?: boolean;
}
export interface ChatGroup {
  id: string;
  name: string;
  color: string;
  collapsed?: boolean;
  // The built-in "Araştırmalar" group: every automatic research chat is in it.
  system?: "research";
}
export const RESEARCH_GROUP = "research";
export interface PlayRecord {
  minutes: number;
  sessions: number;
  lastPlayed?: string;
}
export interface Chat {
  automatic?: boolean;
  groupId?: string;
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  apiHistory: any[];
  allowedTools: string[];
}
export interface AppState {
  version: 1;
  games: Game[];
  groups: Group[];
  series: Series[];
  settings: Settings;
  hardware: Hardware;
  chats: Chat[];
  activeChatId: string | null;
  notes: Record<string, GameNote>;
  chatGroups: ChatGroup[];
  // Time measured by the game detector on this PC, by game id.
  playtime: Record<string, PlayRecord>;
  // One-time data migrations already applied to this library.
  migrations: string[];
}
export interface QueueState {
  running: boolean;
  total: number;
  done: number;
  current?: string;
  errors: number;
  cancelled: boolean;
  timesOnly?: boolean;
  requirementsOnly?: boolean;
}
export interface Permission {
  id: string;
  chatId: string;
  tool: string;
  description: string;
  args: any;
  mutation: boolean;
}
export interface Question {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  multiple: boolean;
}
export interface WizardRequest {
  id: string;
  chatId: string;
  questions: Question[];
}
export interface NowPlaying {
  name: string;
  gameId?: string;
  exe: string;
  startedAt: string;
  foreground: boolean;
  known: boolean;
}
export interface Bootstrap {
  version: string;
  update: UpdateState;
  nowPlaying: NowPlaying | null;
  state: AppState;
  models: ModelInfo[];
  queue: QueueState;
  permissions: Permission[];
  wizard: WizardRequest | null;
  busyChats: string[];
  undoCount: number;
  dataPath: string;
  desktop: boolean;
  hasLmKey: boolean;
  hasBraveKey: boolean;
}
export interface AppEvent {
  type:
    | "state"
    | "models"
    | "game"
    | "note"
    | "queue"
    | "chat"
    | "permission"
    | "permissionClosed"
    | "wizard"
    | "wizardClosed"
    | "busy"
    | "update"
    | "nowPlaying"
    | "toast";
  data: any;
}
export const statusLabels: Record<GameStatus, string> = {
  planned: "Oynanacak",
  playing: "Oynanıyor",
  finished: "Bitti",
  dropped: "Bırakıldı",
  watch: "İzlenecek",
};
export const compatLabels: Record<CompatStatus, string> = {
  recommended: "Önerileni karşılıyor",
  minimum: "Minimumu karşılıyor",
  unknown: "Doğrulama gerekiyor",
  unsupported: "Gereksinim eksik",
};
