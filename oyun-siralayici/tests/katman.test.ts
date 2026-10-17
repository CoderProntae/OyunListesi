// 2.2.0 oyun içi katman: görünüm verisi, panel satırları ve oyun içinden gelen
// düzenleme komutlarının uygulanması (saf işlevler, Electron gerektirmez).
import { describe, expect, it } from "vitest";
import { activePreset, defaultOverlay, emptyOverlayData, type OverlaySettings } from "../shared/overlay";
import {
  applyKatmanEdit,
  hotkeyToVk,
  katmanPayload,
  katmanStatusText,
  KCMD,
  KROW,
  panelRows,
  type KatmanStatus,
} from "../shared/katman";

const settings = (): OverlaySettings => ({
  ...defaultOverlay,
  presets: defaultOverlay.presets.map((p) => ({ ...p, metrics: p.metrics.map((m) => ({ ...m })), colors: { ...p.colors } })),
});

describe("2.2.0 katman: kısayol çözümleme", () => {
  it("Control+Tab → Ctrl + VK_TAB", () => {
    expect(hotkeyToVk("Control+Tab")).toEqual({ vk: 9, mods: 1 });
  });
  it("Control+Shift+O → Ctrl+Shift + 'O'", () => {
    expect(hotkeyToVk("Control+Shift+KeyO")).toEqual({ vk: 79, mods: 5 });
  });
});

describe("2.2.0 katman: panel satırları", () => {
  it("dört sekme ve beklenen satırlar", () => {
    const rows = panelRows(settings());
    const ids = rows.map((r) => r.id).filter(Boolean);
    expect(ids).toContain("position");
    expect(ids).toContain("drawMode");
    expect(ids).toContain("sessionLimit");
    expect(ids).toContain("fpsLimit");
    expect(rows.filter((r) => r.kind === KROW.LIST).length).toBe(activePreset(settings()).metrics.length);
  });
  it("gösterge listesi açık/kapalı durumunu taşır", () => {
    const s = settings();
    const rows = panelRows(s);
    const fps = rows.find((r) => r.id === "metric:fps");
    expect(fps?.value).toBe("açık");
  });
});

describe("2.2.0 katman: oyun içi düzenlemelerin uygulanması", () => {
  it("konum değişir", () => {
    const next = applyKatmanEdit(settings(), { kind: KCMD.SET, id: "position", num: 2, val: 0, text: "" });
    expect(activePreset(next!).position).toBe("top-left");
  });
  it("ölçek sınırlar içinde kalır", () => {
    const next = applyKatmanEdit(settings(), { kind: KCMD.SET, id: "scale", num: 0, val: 9, text: "" });
    expect(activePreset(next!).scale).toBe(2);
  });
  it("gösterge kapatılıp açılır", () => {
    const s = settings();
    const off = applyKatmanEdit(s, { kind: KCMD.ACTION, id: "metric:fps", num: 0, val: 0, text: "select" });
    expect(activePreset(off!).metrics.find((m) => m.id === "fps")?.enabled).toBe(false);
  });
  it("gösterge sıralanır", () => {
    const s = settings();
    const first = s.presets.find((p) => p.id === s.presetId)!.metrics[0].id;
    const second = s.presets.find((p) => p.id === s.presetId)!.metrics[1].id;
    const moved = applyKatmanEdit(s, { kind: KCMD.ACTION, id: `metric:${second}`, num: 1, val: 0, text: "up" });
    const list = activePreset(moved!).metrics;
    expect(list[0].id).toBe(second);
    expect(list[1].id).toBe(first);
  });
  it("çizim yöntemi değişir", () => {
    const next = applyKatmanEdit(settings(), { kind: KCMD.SET, id: "drawMode", num: 2, val: 0, text: "" });
    expect(next?.drawMode).toBe("window");
  });
  it("bilinmeyen komut hiçbir şey değiştirmez", () => {
    expect(applyKatmanEdit(settings(), { kind: KCMD.SET, id: "yok", num: 1, val: 1, text: "" })).toBeNull();
  });
});

describe("2.2.0 katman: görünüm verisi", () => {
  it("yalnız açık göstergeler gider", () => {
    const s = settings();
    const p = s.presets.find((x) => x.id === s.presetId)!;
    p.metrics.forEach((m, i) => (m.enabled = i < 2));
    const payload = katmanPayload({
      data: { ...emptyOverlayData(), metrics: { fps: 120, cpu: 30 } },
      settings: s,
      panelOpen: false,
      panelTab: 0,
      pid: 4242,
      hwnd: "0x1",
      area: [0, 0, 1920, 1080],
      scale: 1,
    });
    expect(payload.metrics).toHaveLength(2);
    expect(payload.mode).toBe(1);
    expect(payload.pid).toBe(4242);
  });
  it("panel açıkken mod 2 ve satırlar dolu", () => {
    const payload = katmanPayload({
      data: emptyOverlayData(),
      settings: settings(),
      panelOpen: true,
      panelTab: 1,
      pid: 1,
      hwnd: "0x2",
      area: [0, 0, 800, 600],
      scale: 1.25,
    });
    expect(payload.mode).toBe(2);
    expect(payload.rows.length).toBeGreaterThan(5);
    expect(payload.scale).toBeCloseTo(1.25, 2);
  });
  it("pencere yönteminde mod 0", () => {
    const s = settings();
    s.drawMode = "window";
    const payload = katmanPayload({ data: emptyOverlayData(), settings: s, panelOpen: false, panelTab: 0, pid: 1, hwnd: "", area: [0, 0, 0, 0], scale: 1 });
    expect(payload.mode).toBe(0);
  });
});

describe("2.2.0 katman: durum metni", () => {
  it("kurulu değil", () => {
    expect(katmanStatusText(null)).toContain("kurulu değil");
  });
  it("çiziyor", () => {
    expect(katmanStatusText({ state: 3, api: 3, bits: 64, pid: 1, frames: 10, drawn: 9, verts: 100, fps: 60, ms: 1, message: "" })).toContain("D3D12");
  });
  it("hata", () => {
    expect(katmanStatusText({ state: 4, api: 0, bits: 0, pid: 0, frames: 0, drawn: 0, verts: 0, fps: 0, ms: 0, message: "koruma" })).toContain("koruma");
  });
});

describe("2.2.1 katman: FPS kaynağı", () => {
  const st = (fps: number): KatmanStatus => ({
    state: 3,
    api: 3,
    bits: 64,
    pid: 1,
    frames: 100,
    drawn: 100,
    verts: 1000,
    fps,
    ms: 1,
    message: "",
  });
  const pay = (data: ReturnType<typeof emptyOverlayData>, status: KatmanStatus | null) =>
    katmanPayload({
      data,
      settings: settings(),
      status,
      panelOpen: false,
      panelTab: 0,
      pid: 1,
      hwnd: "0x1",
      area: [0, 0, 1920, 1080],
      scale: 1,
    });
  const fpsOf = (p: ReturnType<typeof pay>) => p.metrics.find((m) => m.label === "FPS")?.value;

  it("kancanın ölçtüğü FPS kullanılır (oyun içi ölçüm öncelikli)", () => {
    expect(fpsOf(pay({ ...emptyOverlayData(), fps: "ok", metrics: { fps: 60 } }, st(143.6)))).toBe("144");
  });
  it("kanca ölçemediyse izin durumu yazılır", () => {
    expect(fpsOf(pay({ ...emptyOverlayData(), fps: "permission" }, st(0)))).toBe("izin");
  });
  it("ölçüm başlıyorsa üç nokta", () => {
    expect(fpsOf(pay({ ...emptyOverlayData(), fps: "starting" }, st(0)))).toBe("…");
  });
  it("hiç ölçüm yoksa tire (eski '-' değil)", () => {
    expect(fpsOf(pay({ ...emptyOverlayData(), fps: "unavailable" }, st(0)))).toBe("—");
  });
  it("durum yoksa uygulama verisi kullanılır", () => {
    expect(fpsOf(pay({ ...emptyOverlayData(), fps: "ok", metrics: { fps: 61 } }, null))).toBe("61");
  });
});
