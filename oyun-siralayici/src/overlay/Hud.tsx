import { useEffect, useState } from "react";
import "./hud.css";
import {
  activePreset,
  formatMetric,
  metricDef,
  metricLevel,
  type OverlayData,
  type OverlayPreset,
  type OverlaySettings,
} from "../../shared/overlay";
// The corner overlay. Pure presentation: the same component is the live HUD,
// the preview in the settings and the demo in the browser preview.
function hexA(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
export function useBattery() {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    const nav = navigator as any;
    if (!nav.getBattery) return;
    let battery: any;
    const read = () => setLevel(battery && !battery.charging ? battery.level * 100 : null);
    nav.getBattery().then((b: any) => {
      battery = b;
      read();
      b.addEventListener("levelchange", read);
      b.addEventListener("chargingchange", read);
    });
    return () => {
      battery?.removeEventListener("levelchange", read);
      battery?.removeEventListener("chargingchange", read);
    };
  }, []);
  return level;
}
const INTRO = 3600;
export default function Hud({
  data,
  settings,
  preset: forced,
  battery,
  intro = true,
}: {
  data: OverlayData;
  settings: OverlaySettings;
  preset?: OverlayPreset;
  battery?: number | null;
  intro?: boolean;
}) {
  const p = forced || activePreset(settings);
  // 2.0.1: when a game starts, "Şimdi oynanıyor" slides in from the right,
  // leaves after a few seconds, then the values come in quickly. Timed from
  // the game's start, so a window opened half-way joins at the right moment.
  const started = data.game ? Date.parse(data.game.startedAt) : 0;
  const elapsed = Date.now() - started;
  const showIntro = intro && settings.nowPlayingToast !== false && !!data.game && elapsed >= 0 && elapsed < INTRO;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!showIntro) return;
    const t = setTimeout(() => rerender((n) => n + 1), INTRO - elapsed + 30);
    return () => clearTimeout(t);
  }, [showIntro, started]);
  const c = p.colors;
  const metrics = p.metrics.filter((m) => m.enabled);
  const merged: OverlayData = {
    ...data,
    metrics: { ...data.metrics, battery: battery ?? data.metrics.battery ?? null },
  };
  const alert = data.alerts.at(-1);
  const vars = {
    "--hud-text": c.text,
    "--hud-label": c.label,
    "--hud-accent": c.accent,
    "--hud-warn": c.warn,
    "--hud-danger": c.danger,
    "--hud-bg": hexA(c.background, p.opacity),
    fontSize: `${13 * p.scale}px`,
  } as any;
  if (showIntro)
    return (
      <div
        className="hud-toast"
        data-testid="overlay-toast"
        style={{ ...vars, "--hud-bg": hexA(c.background, Math.max(p.opacity, 0.82)), animationDelay: `-${elapsed}ms` }}
      >
        <span className="hud-toast-icon">▶</span>
        <span>
          <small>ŞİMDİ OYNANIYOR</small>
          <strong>{data.game!.name}</strong>
        </span>
      </div>
    );
  return (
    <div
      className={`hud hud-${p.layout} hud-enter`}
      data-testid="overlay-hud"
      style={vars}
    >
      {alert && (
        <div className={`hud-alert ${alert.kind}`} role="alert">
          {alert.text}
        </div>
      )}
      {p.showTitle && data.game && (
        <div className="hud-title">
          <small>ŞİMDİ OYNANIYOR</small>
          <strong>{data.game.name}</strong>
        </div>
      )}
      <div className="hud-metrics">
        {metrics.map((m, i) => {
          const def = metricDef(m.id);
          const value = merged.metrics[m.id];
          const level = metricLevel(m.id, value, m, data.totals);
          const text = m.id === "fps" && data.fps !== "ok" && data.game ? fpsText(data) : formatMetric(m.id, merged);
          // Why is there no number? The reason travels with the row (the HUD
          // window is click-through, but the preview and the panel show it).
          const why = m.id === "fps" && data.fps !== "ok" && data.fpsMessage ? data.fpsMessage : def.label;
          return (
            <div key={m.id} className={`hud-metric ${level}`} title={why} style={{ "--i": i } as any}>
              <span>{def.short}</span>
              <b>{text}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function fpsText(d: OverlayData) {
  return d.fps === "permission" ? "izin" : d.fps === "starting" ? "…" : "—";
}
