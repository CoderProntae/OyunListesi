// "Oyun tanımlayıcı" (game detector) and in-game overlay: settings, metric
// definitions, presets and the small pure rules shared by the main process,
// the overlay windows and the settings screen.
export type MetricId =
  | "fps"
  | "low1"
  | "frametime"
  | "cpu"
  | "cpuTemp"
  | "gpu"
  | "gpuTemp"
  | "vram"
  | "ram"
  | "gpuPower"
  | "gpuClock"
  | "fan"
  | "session"
  | "clock"
  | "battery";
export interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  // "high": a high value is a problem (temperature); "low": a low value is (FPS).
  direction: "high" | "low" | "none";
  warn?: number;
  danger?: number;
  hint: string;
}
export const METRICS: MetricDef[] = [
  {
    id: "fps",
    label: "FPS",
    short: "FPS",
    direction: "low",
    warn: 45,
    danger: 30,
    hint: "Saniyedeki kare sayısı.",
  },
  {
    id: "low1",
    label: "%1 en düşük FPS",
    short: "%1",
    direction: "low",
    warn: 35,
    danger: 20,
    hint: "Son saniyelerdeki en yavaş karelerin FPS değeri; takılmaları gösterir.",
  },
  {
    id: "frametime",
    label: "Kare süresi",
    short: "MS",
    direction: "high",
    warn: 25,
    danger: 40,
    hint: "Bir karenin milisaniye cinsinden süresi.",
  },
  {
    id: "cpu",
    label: "İşlemci kullanımı",
    short: "CPU",
    direction: "high",
    warn: 85,
    danger: 95,
    hint: "Tüm çekirdeklerin ortalama kullanımı.",
  },
  {
    id: "cpuTemp",
    label: "İşlemci sıcaklığı",
    short: "CPU°",
    direction: "high",
    warn: 80,
    danger: 90,
    hint: "LibreHardwareMonitor açıksa okunur.",
  },
  {
    id: "gpu",
    label: "Ekran kartı kullanımı",
    short: "GPU",
    direction: "none",
    hint: "Oyunda %95–100 olması normaldir.",
  },
  {
    id: "gpuTemp",
    label: "Ekran kartı sıcaklığı",
    short: "GPU°",
    direction: "high",
    warn: 78,
    danger: 86,
    hint: "NVIDIA kartlarda doğrudan okunur.",
  },
  {
    id: "vram",
    label: "Ekran kartı belleği",
    short: "VRAM",
    direction: "high",
    warn: 90,
    danger: 97,
    hint: "Sınırlar doluluk yüzdesidir.",
  },
  {
    id: "ram",
    label: "RAM kullanımı",
    short: "RAM",
    direction: "high",
    warn: 85,
    danger: 95,
    hint: "Sınırlar doluluk yüzdesidir.",
  },
  {
    id: "gpuPower",
    label: "Ekran kartı gücü",
    short: "GÜÇ",
    direction: "none",
    hint: "Watt (NVIDIA).",
  },
  {
    id: "gpuClock",
    label: "Ekran kartı saat hızı",
    short: "MHz",
    direction: "none",
    hint: "Çekirdek saat hızı (NVIDIA).",
  },
  {
    id: "fan",
    label: "Ekran kartı fanı",
    short: "FAN",
    direction: "none",
    hint: "Fan hızı yüzdesi (NVIDIA).",
  },
  {
    id: "session",
    label: "Oturum süresi",
    short: "SÜRE",
    direction: "none",
    hint: "Oyun açıldığından beri geçen süre.",
  },
  {
    id: "clock",
    label: "Saat",
    short: "SAAT",
    direction: "none",
    hint: "Bilgisayarın saati.",
  },
  {
    id: "battery",
    label: "Pil",
    short: "PİL",
    direction: "low",
    warn: 30,
    danger: 15,
    hint: "Dizüstü bilgisayarlarda pil yüzdesi.",
  },
];
export const metricDef = (id: MetricId) => METRICS.find((m) => m.id === id)!;
export interface MetricSetting {
  id: MetricId;
  enabled: boolean;
  warn?: number | null;
  danger?: number | null;
}
export interface OverlayColors {
  text: string;
  label: string;
  background: string;
  accent: string;
  warn: string;
  danger: string;
}
export type OverlayPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";
export interface OverlayPreset {
  id: string;
  name: string;
  builtin?: boolean;
  metrics: MetricSetting[];
  colors: OverlayColors;
  opacity: number;
  scale: number;
  position: OverlayPosition;
  layout: "vertical" | "horizontal";
  showTitle: boolean;
}
export interface OverlayAlarm {
  id: string;
  time: string;
  label: string;
  enabled: boolean;
  lastFired?: string;
}
export interface GameMapping {
  exe: string;
  gameId?: string;
  name: string;
}
export interface OverlaySettings {
  enabled: boolean;
  hotkey: string;
  presetId: string;
  presets: OverlayPreset[];
  closeToTray: boolean;
  startWithWindows: boolean;
  startHidden: boolean;
  sessionLimit: number;
  remindEvery: number;
  alarms: OverlayAlarm[];
  sound: boolean;
  muteGameInBackground: boolean;
  muteOthers: boolean;
  muteExclude: string[];
  fpsMethod: "off" | "rtss" | "nvidia";
  fpsLimit: number;
  backgroundFps: number;
  gameFps: Record<string, number>;
  ignore: string[];
  mappings: GameMapping[];
  autoPlaying: boolean;
  trackPlaytime: boolean;
  lhm: boolean;
  lhmUrl: string;
  // 2.0.1: "Şimdi oynanıyor" slides in when a game starts, then the values.
  nowPlayingToast: boolean;
  // 2.2.0: where the in-game overlay is drawn. "auto" = the injected layer when
  // it can hook the game, the window layer otherwise; "inject" = always try the
  // injected layer; "window" = the click-through window only (2.0.1 behaviour).
  drawMode: "auto" | "inject" | "window";
}
export const DEFAULT_COLORS: OverlayColors = {
  text: "#f4f4f8",
  label: "#a6a8bd",
  background: "#0b0c12",
  accent: "#9d8cff",
  warn: "#f5c35b",
  danger: "#ff6b6b",
};
const metrics = (on: MetricId[]): MetricSetting[] =>
  METRICS.map((m) => ({ id: m.id, enabled: on.includes(m.id) }));
export const BUILTIN_PRESETS: OverlayPreset[] = [
  {
    id: "minimal",
    name: "Sade",
    builtin: true,
    metrics: metrics(["fps"]),
    colors: DEFAULT_COLORS,
    opacity: 0.55,
    scale: 1,
    position: "top-right",
    layout: "horizontal",
    showTitle: false,
  },
  {
    id: "standard",
    name: "Standart",
    builtin: true,
    metrics: metrics(["fps", "cpu", "gpu", "gpuTemp", "ram"]),
    colors: DEFAULT_COLORS,
    opacity: 0.68,
    scale: 1,
    position: "top-right",
    layout: "vertical",
    showTitle: false,
  },
  {
    id: "detailed",
    name: "Ayrıntılı",
    builtin: true,
    metrics: metrics([
      "fps",
      "low1",
      "frametime",
      "cpu",
      "cpuTemp",
      "gpu",
      "gpuTemp",
      "vram",
      "ram",
      "gpuPower",
      "session",
      "clock",
    ]),
    colors: DEFAULT_COLORS,
    opacity: 0.72,
    scale: 0.95,
    position: "top-right",
    layout: "vertical",
    showTitle: false,
  },
];
export const defaultOverlay: OverlaySettings = {
  enabled: true,
  hotkey: "Control+Tab",
  presetId: "standard",
  presets: BUILTIN_PRESETS,
  closeToTray: true,
  startWithWindows: false,
  startHidden: false,
  sessionLimit: 0,
  remindEvery: 15,
  alarms: [],
  sound: true,
  muteGameInBackground: false,
  muteOthers: false,
  muteExclude: ["discord.exe", "spotify.exe"],
  fpsMethod: "off",
  fpsLimit: 0,
  backgroundFps: 0,
  gameFps: {},
  ignore: [],
  mappings: [],
  autoPlaying: true,
  trackPlaytime: true,
  lhm: false,
  lhmUrl: "http://127.0.0.1:8085/data.json",
  nowPlayingToast: true,
  drawMode: "auto",
};
export function activePreset(s: OverlaySettings) {
  return s.presets.find((p) => p.id === s.presetId) || s.presets[0] || BUILTIN_PRESETS[1];
}
export interface OverlayGame {
  name: string;
  exe: string;
  pid: number;
  gameId?: string;
  cover?: string;
  known: boolean;
  startedAt: string;
  foreground: boolean;
  // 2.0.1: the game window is open and not minimized (focus not needed).
  visible?: boolean;
  // Client area in physical screen pixels (where the overlay sits).
  client?: number[];
}
export interface OverlayAlert {
  id: string;
  kind: "limit" | "alarm" | "info";
  text: string;
  until: number;
}
export type FpsState =
  | "off"
  | "starting"
  | "ok"
  | "permission"
  | "unavailable"
  | "waiting";
export interface OverlayData {
  game?: OverlayGame;
  metrics: Partial<Record<MetricId, number | null>>;
  totals: { ramGB?: number; vramGB?: number };
  fps: FpsState;
  fpsMessage?: string;
  sensors: { gpu: "nvidia" | "windows" | "none"; cpuTemp: "lhm" | "none" };
  alerts: OverlayAlert[];
  limits: { method: OverlaySettings["fpsMethod"]; applied?: number; message?: string };
  // 2.2.0: oyun içi katmanın durumu (panelde gösterilir)
  katman?: import("./katman").KatmanStatus;
  now: number;
}
/* 2.1.6: must the overlay windows sit above everything else? Some games raise
   their own window every frame (Unreal Engine 5 fullscreen, e.g. Little
   Nightmares 3), so "directly above the game window" is not enough and the HUD
   and the Ctrl+Tab panel end up behind the game. While the game — or its panel —
   is in front the overlay is topmost; the moment another program comes to the
   front it drops back to the normal band, so it still never covers other
   programs (2.0.1). */
export function overlayTopmost(
  game: OverlayGame | undefined,
  panelOpen: boolean,
): boolean {
  return !!game && (!!game.foreground || panelOpen);
}
export const emptyOverlayData = (): OverlayData => ({
  metrics: {},
  totals: {},
  fps: "off",
  sensors: { gpu: "none", cpuTemp: "none" },
  alerts: [],
  limits: { method: "off" },
  now: Date.now(),
});
export function metricLevel(
  id: MetricId,
  value: number | null | undefined,
  setting?: MetricSetting,
  totals: OverlayData["totals"] = {},
): "normal" | "warn" | "danger" {
  const def = metricDef(id);
  if (value === null || value === undefined || def.direction === "none") return "normal";
  const warn = setting?.warn ?? def.warn,
    danger = setting?.danger ?? def.danger;
  let v = value;
  // Memory thresholds are a fill percentage.
  if (id === "ram" && totals.ramGB) v = (value / totals.ramGB) * 100;
  if (id === "vram" && totals.vramGB) v = (value / totals.vramGB) * 100;
  if (def.direction === "high") {
    if (danger !== undefined && danger !== null && v >= danger) return "danger";
    if (warn !== undefined && warn !== null && v >= warn) return "warn";
  } else {
    if (danger !== undefined && danger !== null && v <= danger) return "danger";
    if (warn !== undefined && warn !== null && v <= warn) return "warn";
  }
  return "normal";
}
export function sessionText(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = Math.floor(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
const one = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
export function formatMetric(id: MetricId, data: OverlayData): string {
  const v = data.metrics[id];
  if (id === "clock")
    return new Date(data.now).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (id === "session") {
    if (!data.game) return "—";
    return sessionText((data.now - Date.parse(data.game.startedAt)) / 60000);
  }
  if (v === null || v === undefined) return "—";
  switch (id) {
    case "fps":
    case "low1":
      return String(Math.round(v));
    case "frametime":
      return one(v) + " ms";
    case "cpu":
    case "gpu":
    case "fan":
    case "battery":
      return Math.round(v) + "%";
    case "cpuTemp":
    case "gpuTemp":
      return Math.round(v) + "°C";
    case "ram":
      return data.totals.ramGB
        ? `${one(v)}/${Math.round(data.totals.ramGB)} GB`
        : one(v) + " GB";
    case "vram":
      return data.totals.vramGB
        ? `${one(v)}/${Math.round(data.totals.vramGB)} GB`
        : one(v) + " GB";
    case "gpuPower":
      return Math.round(v) + " W";
    case "gpuClock":
      return Math.round(v) + " MHz";
  }
  return String(v);
}
// Alarms are "HH:MM" each day; one fires once per day when its minute arrives.
export function dueAlarms(alarms: OverlayAlarm[], now: Date) {
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    day = now.toISOString().slice(0, 10);
  return alarms.filter((a) => a.enabled && a.time === hm && a.lastFired !== day);
}
// Session limit: first warning at the limit, then every "remindEvery" minutes.
export function limitDue(
  sessionMinutes: number,
  limit: number,
  remindEvery: number,
  lastWarnedAtMinute?: number,
) {
  if (!limit || sessionMinutes < limit) return false;
  if (lastWarnedAtMinute === undefined) return true;
  return remindEvery > 0 && sessionMinutes - lastWarnedAtMinute >= remindEvery;
}
// Exe names that are never games, whatever the window looks like.
export const NOT_GAMES = new Set([
  "explorer.exe",
  "searchhost.exe",
  "startmenuexperiencehost.exe",
  "shellexperiencehost.exe",
  "applicationframehost.exe",
  "textinputhost.exe",
  "lockapp.exe",
  "taskmgr.exe",
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "opera.exe",
  "opera_gx.exe",
  "brave.exe",
  "vivaldi.exe",
  "discord.exe",
  "spotify.exe",
  "steam.exe",
  "steamwebhelper.exe",
  "epicgameslauncher.exe",
  "galaxyclient.exe",
  "eadesktop.exe",
  "upc.exe",
  "battle.net.exe",
  "xboxpcapp.exe",
  "lm studio.exe",
  "code.exe",
  "devenv.exe",
  "vlc.exe",
  "mpc-hc64.exe",
  "mpc-be64.exe",
  "potplayermini64.exe",
  "winword.exe",
  "excel.exe",
  "powerpnt.exe",
  "outlook.exe",
  "obs64.exe",
  "msiafterburner.exe",
  "rtss.exe",
  "librehardwaremonitor.exe",
  "oyun siralayici.exe",
  "video.ui.exe",
  "microsoft.media.player.exe",
  "wmplayer.exe",
  "mpv.exe",
  "kodi.exe",
  "plex.exe",
  "zoom.exe",
  "teams.exe",
  "ms-teams.exe",
  "photoshop.exe",
  "msedgewebview2.exe",
  "presentmon.exe",
  "oyun-yardimci.exe",
]);
