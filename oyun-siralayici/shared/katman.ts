// Oyun içi katman (2.2.0): paylaşımlı belleğe gidecek görünüm verisi ve
// Ctrl+Tab panelinin satır modeli. TÜM metinler ve iş kuralları burada kalır;
// oyunun içindeki DLL yalnız çizer ve düzenlemeleri komut olarak geri gönderir.
// Satır türleri native/katman/ipc.h ile birebir aynıdır.
import {
  activePreset,
  formatMetric,
  metricDef,
  metricLevel,
  type OverlayData,
  type OverlaySettings,
} from "./overlay";

export const KROW = {
  HEADER: 0,
  LABEL: 1,
  TOGGLE: 2,
  SELECT: 3,
  SLIDER: 4,
  NUMBER: 5,
  TEXT: 6,
  BUTTON: 7,
  LIST: 8,
  HINT: 9,
  COLOR: 10,
} as const;

export const KFLAG = { DISABLED: 1, DIRTY: 2, SELECTED: 4, DANGER: 8, WARN: 16, FOCUSED: 32 } as const;

export const KCMD = { NONE: 0, SET: 1, ACTION: 2, PANEL: 3, READY: 4, LOST: 5, ERROR: 6, FPS: 7, QUIT: 8 } as const;

export interface KatmanRow {
  kind: number;
  flags?: number;
  num?: number;
  val?: number;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  label?: string;
  value?: string;
  hint?: string;
  options?: string[];
}

export interface KatmanStatus {
  state: number; // 0 yok, 1 yüklendi, 2 kanca, 3 çiziyor, 4 hata, 5 kapalı
  api: number; // 0 ?, 1 D3D9, 2 D3D11, 3 D3D12, 4 OpenGL, 5 Vulkan
  bits: number;
  pid: number;
  frames: number;
  drawn: number;
  verts: number;
  fps: number;
  ms: number;
  message: string;
}

export const KATMAN_API_NAMES = ["bilinmiyor", "D3D9", "D3D11", "D3D12", "OpenGL", "Vulkan"];

export function katmanStatusText(s?: KatmanStatus | null): string {
  if (!s || !s.state) return "Oyun içi katman kurulu değil.";
  if (s.state === 4) return `Oyun içi katman hatası: ${s.message || "bilinmeyen"}`;
  if (s.state === 5) return "Oyun içi katman kapatıldı.";
  if (s.state < 2) return "Oyun içi katman yüklendi, kanca bekleniyor…";
  const api = KATMAN_API_NAMES[s.api] ?? "?";
  return `Oyunun içine çiziliyor (${api}, ${s.bits} bit)${s.drawn ? `, ${s.drawn} kare` : ""}.`;
}

/* ---------------- kısayol → sanal tuş ---------------- */
const VK_NAMES: Record<string, number> = {
  TAB: 9,
  ESCAPE: 27,
  SPACE: 32,
  BACKSPACE: 8,
  RETURN: 13,
};
for (let i = 0; i < 26; i++) VK_NAMES[String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i < 10; i++) VK_NAMES[`DIGIT${i}`] = 48 + i;
for (let i = 1; i <= 12; i++) VK_NAMES[`F${i}`] = 111 + i;

export function hotkeyToVk(hotkey: string): { vk: number; mods: number } {
  let mods = 0;
  let vk = 0;
  for (const part of hotkey.split("+")) {
    const p = part.trim().toUpperCase();
    if (p === "CONTROL" || p === "CTRL" || p === "CMDORCTRL") mods |= 1;
    else if (p === "ALT") mods |= 2;
    else if (p === "SHIFT") mods |= 4;
    else {
      // Electron hızlandırıcı adları: "KeyO", "Digit3", "F5", "Tab", tek harf…
      const bare = p.startsWith("KEY") ? p.slice(3) : p.startsWith("DIGIT") ? p.slice(5) : p;
      vk = VK_NAMES[bare] ?? VK_NAMES[p] ?? (bare.length === 1 ? bare.charCodeAt(0) : 0);
    }
  }
  return { vk: vk || 9, mods: mods || 1 };
}

/* ---------------- görünüm verisi (osd) ---------------- */
export interface KatmanPayloadInput {
  data: OverlayData;
  settings: OverlaySettings;
  status?: KatmanStatus | null;
  panelOpen: boolean;
  panelTab: number;
  pid: number;
  hwnd: string;
  area: [number, number, number, number];
  scale: number; // DPI ölçeği
}

export function katmanPayload(inp: KatmanPayloadInput) {
  const { data, settings } = inp;
  const preset = activePreset(settings);
  const metrics = preset.metrics
    .filter((m) => m.enabled)
    .map((m) => {
      let value = formatMetric(m.id, data);
      const level = metricLevel(m.id, data.metrics[m.id], m, data.totals);
      const def = metricDef(m.id);
      if (m.id === "fps") {
        // Oyun içi katman karenin içinde FPS'i kendisi ölçer: en doğru kaynak o.
        const hookFps = inp.status?.fps ?? 0;
        if (hookFps > 0.5) value = String(Math.round(hookFps));
        else if (data.fps === "permission") value = "izin";
        else if (data.fps === "starting") value = "…";
        else if (data.fps !== "ok") value = "—";
      }
      return {
        label: def.short,
        value,
        unit: "",
        level: level === "danger" ? 2 : level === "warn" ? 1 : 0,
        icon: 0,
      };
    });
  const alerts: { text: string; level: number }[] = [];
  if (data.fpsMessage && data.fps !== "ok") alerts.push({ text: data.fpsMessage, level: 1 });
  for (const a of data.alerts) alerts.push({ text: a.text, level: a.kind === "info" ? 1 : 2 });
  const hk = hotkeyToVk(settings.hotkey);
  const mode = settings.drawMode === "window" ? 0 : inp.panelOpen ? 2 : 1;
  return {
    pid: inp.pid,
    hwnd: inp.hwnd,
    mode,
    scale: Math.round(preset.scale * inp.scale * 100) / 100,
    margin: 14,
    position: preset.position === "top-right" ? 0 : preset.position === "bottom-right" ? 1 : preset.position === "top-left" ? 2 : 3,
    opacity: Math.round(preset.opacity * 100),
    showTitle: preset.showTitle,
    showNotice: settings.nowPlayingToast,
    toastMs: 4200,
    hotkeyVk: hk.vk,
    hotkeyMods: hk.mods,
    closeVk: 27,
    gameName: data.game?.name ?? "",
    noticeText: data.game?.name ?? "",
    fpsMessage: data.fpsMessage ?? "",
    area: inp.area,
    metrics,
    alerts,
    tabs: PANEL_TABS,
    panelOpen: inp.panelOpen,
    panelTab: inp.panelTab,
    rows: inp.panelOpen ? panelRows(settings, inp.status) : [],
  };
}

/* ---------------- panel ---------------- */
export const PANEL_TABS = ["Görünüm", "Göstergeler", "Süre ve alarm", "Oyun ve izinler"];

export function panelRows(settings: OverlaySettings, status?: KatmanStatus | null): KatmanRow[] {
  const p = activePreset(settings);
  const rows: KatmanRow[] = [];
  const head = (label: string) => rows.push({ kind: KROW.HEADER, label });
  const hint = (text: string) => rows.push({ kind: KROW.HINT, label: text, hint: text });

  // 0 — Görünüm
  head("KÖŞE GÖSTERGESİ");
  rows.push({
    kind: KROW.SELECT,
    id: "position",
    label: "Konum",
    num: p.position === "top-right" ? 0 : p.position === "bottom-right" ? 1 : p.position === "top-left" ? 2 : 3,
    options: ["Sağ üst", "Sağ alt", "Sol üst", "Sol alt"],
    value: p.position === "top-right" ? "Sağ üst" : p.position === "bottom-right" ? "Sağ alt" : p.position === "top-left" ? "Sol üst" : "Sol alt",
  });
  rows.push({
    kind: KROW.SELECT,
    id: "layout",
    label: "Düzen",
    num: p.layout === "vertical" ? 0 : 1,
    options: ["Alt alta", "Yan yana"],
    value: p.layout === "vertical" ? "Alt alta" : "Yan yana",
  });
  rows.push({ kind: KROW.SLIDER, id: "scale", label: "Boyut", val: p.scale, min: 0.7, max: 2, step: 0.05, value: `%${Math.round(p.scale * 100)}` });
  rows.push({ kind: KROW.SLIDER, id: "opacity", label: "Arka plan saydamlığı", val: Math.round(p.opacity * 100), min: 10, max: 100, step: 1, value: `%${Math.round(p.opacity * 100)}` });
  rows.push({ kind: KROW.TOGGLE, id: "showTitle", label: "Oyunun adı sürekli görünsün", num: p.showTitle ? 1 : 0 });
  rows.push({ kind: KROW.TOGGLE, id: "nowPlayingToast", label: "Oyun başlayınca bildirim", num: settings.nowPlayingToast ? 1 : 0 });
  head("RENKLER");
  rows.push({ kind: KROW.COLOR, id: "color.accent", label: "Vurgu", num: hexToArgb(p.colors.accent) });
  rows.push({ kind: KROW.COLOR, id: "color.warn", label: "Uyarı", num: hexToArgb(p.colors.warn) });
  rows.push({ kind: KROW.COLOR, id: "color.danger", label: "Tehlike", num: hexToArgb(p.colors.danger) });
  hint("Renkler bu sürümde oyun içinde salt okunur; uygulamadan değiştirilir.");

  // 1 — Göstergeler
  head("KÖŞEDE GÖRÜNEN DEĞERLER");
  p.metrics.forEach((m, i) => {
    const def = metricDef(m.id);
    rows.push({
      kind: KROW.LIST,
      id: `metric:${m.id}`,
      label: def.label,
      value: m.enabled ? "açık" : "kapalı",
      num: i,
      flags: m.enabled ? KFLAG.SELECTED : 0,
    });
  });
  hint("Satıra bas: aç/kapat.  ↑ ↓ ile sırala.");

  // 2 — Süre ve alarm
  head("OTURUM");
  rows.push({
    kind: KROW.SELECT,
    id: "sessionLimit",
    label: "Oturum sınırı",
    num: [0, 30, 60, 90, 120].indexOf(settings.sessionLimit) >= 0 ? [0, 30, 60, 90, 120].indexOf(settings.sessionLimit) : 0,
    options: ["Kapalı", "30 dk", "60 dk", "90 dk", "120 dk"],
    value: settings.sessionLimit ? `${settings.sessionLimit} dk` : "Kapalı",
  });
  rows.push({ kind: KROW.SLIDER, id: "remindEvery", label: "Hatırlatma aralığı", val: settings.remindEvery, min: 5, max: 60, step: 5, value: `${settings.remindEvery} dk` });
  rows.push({ kind: KROW.TOGGLE, id: "sound", label: "Alarm sesi", num: settings.sound ? 1 : 0 });
  rows.push({ kind: KROW.TOGGLE, id: "trackPlaytime", label: "Oynama süresini say", num: settings.trackPlaytime ? 1 : 0 });

  // 3 — Oyun ve izinler
  head("OYUN İÇİ KATMAN");
  rows.push({
    kind: KROW.SELECT,
    id: "drawMode",
    label: "Çizim yöntemi",
    num: settings.drawMode === "auto" ? 0 : settings.drawMode === "inject" ? 1 : 2,
    options: ["Otomatik", "Her zaman oyunun içinde", "Pencere katmanı"],
    value: settings.drawMode === "auto" ? "Otomatik" : settings.drawMode === "inject" ? "Her zaman oyunun içinde" : "Pencere katmanı",
  });
  hint(katmanStatusText(status));
  head("KISAYOL VE FPS");
  rows.push({ kind: KROW.LABEL, id: "hotkey", label: "Panel kısayolu", value: settings.hotkey });
  rows.push({
    kind: KROW.SELECT,
    id: "fpsMethod",
    label: "FPS sınırı yöntemi",
    num: settings.fpsMethod === "off" ? 0 : settings.fpsMethod === "rtss" ? 1 : 2,
    options: ["Kapalı", "RivaTuner", "NVIDIA"],
    value: settings.fpsMethod === "off" ? "Kapalı" : settings.fpsMethod === "rtss" ? "RivaTuner" : "NVIDIA",
  });
  rows.push({ kind: KROW.SLIDER, id: "fpsLimit", label: "FPS sınırı", val: settings.fpsLimit, min: 0, max: 300, step: 5, value: settings.fpsLimit ? `${settings.fpsLimit}` : "Kapalı" });
  rows.push({ kind: KROW.SLIDER, id: "backgroundFps", label: "Arka planda FPS", val: settings.backgroundFps, min: 0, max: 120, step: 5, value: settings.backgroundFps ? `${settings.backgroundFps}` : "Kapalı" });
  rows.push({ kind: KROW.TOGGLE, id: "enabled", label: "Oyun tanımlayıcı ve gösterge açık", num: settings.enabled ? 1 : 0 });
  rows.push({ kind: KROW.TOGGLE, id: "autoPlaying", label: "Kütüphanede 'Oynanıyor' yap", num: settings.autoPlaying ? 1 : 0 });
  return rows;
}

function hexToArgb(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0xff808080;
  const v = parseInt(m[1], 16);
  return (0xff << 24 | v) >>> 0;
}

/* ---------------- panel düzenlemeleri ---------------- */
export interface KatmanCmd {
  kind: number;
  id: string;
  num: number;
  val: number;
  text: string;
}

export function applyKatmanEdit(settings: OverlaySettings, cmd: KatmanCmd): OverlaySettings | null {
  if (cmd.kind !== KCMD.SET && cmd.kind !== KCMD.ACTION) return null;
  const s: OverlaySettings = { ...settings, presets: settings.presets.map((p) => ({ ...p, metrics: p.metrics.map((m) => ({ ...m })), colors: { ...p.colors } })) };
  const p = s.presets.find((x) => x.id === s.presetId) ?? s.presets[0];
  const set = (patch: Partial<OverlaySettings>) => Object.assign(s, patch);
  switch (cmd.id) {
    case "position":
      p.position = (["top-right", "bottom-right", "top-left", "bottom-left"] as const)[cmd.num] ?? "top-right";
      return s;
    case "layout":
      p.layout = cmd.num === 1 ? "horizontal" : "vertical";
      return s;
    case "scale":
      p.scale = Math.min(2, Math.max(0.7, cmd.val || p.scale));
      return s;
    case "opacity":
      p.opacity = Math.min(1, Math.max(0.1, Math.round(cmd.val) / 100));
      return s;
    case "showTitle":
      p.showTitle = cmd.num === 1;
      return s;
    case "nowPlayingToast":
      set({ nowPlayingToast: cmd.num === 1 });
      return s;
    case "sound":
      set({ sound: cmd.num === 1 });
      return s;
    case "trackPlaytime":
      set({ trackPlaytime: cmd.num === 1 });
      return s;
    case "autoPlaying":
      set({ autoPlaying: cmd.num === 1 });
      return s;
    case "enabled":
      set({ enabled: cmd.num === 1 });
      return s;
    case "sessionLimit":
      set({ sessionLimit: [0, 30, 60, 90, 120][cmd.num] ?? 0 });
      return s;
    case "remindEvery":
      set({ remindEvery: Math.min(60, Math.max(5, Math.round(cmd.val))) });
      return s;
    case "fpsMethod":
      set({ fpsMethod: (["off", "rtss", "nvidia"] as const)[cmd.num] ?? "off" });
      return s;
    case "fpsLimit":
      set({ fpsLimit: Math.min(300, Math.max(0, Math.round(cmd.val))) });
      return s;
    case "backgroundFps":
      set({ backgroundFps: Math.min(120, Math.max(0, Math.round(cmd.val))) });
      return s;
    case "drawMode":
      set({ drawMode: (["auto", "inject", "window"] as const)[cmd.num] ?? "auto" });
      return s;
    default:
      break;
  }
  if (cmd.id.startsWith("metric:")) {
    const id = cmd.id.slice(7);
    const list = p.metrics;
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return null;
    if (cmd.kind === KCMD.SET || cmd.text === "select") {
      list[i].enabled = !list[i].enabled;
      return s;
    }
    if (cmd.text === "up" && i > 0) {
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
      return s;
    }
    if (cmd.text === "down" && i < list.length - 1) {
      [list[i + 1], list[i]] = [list[i], list[i + 1]];
      return s;
    }
  }
  return null;
}
