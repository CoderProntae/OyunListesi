import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./overlay.css";
import Hud, { useBattery } from "./Hud";
import OverlayEditor, { type OverlayAdapter } from "./OverlayEditor";
import {
  defaultOverlay,
  emptyOverlayData,
  type OverlayData,
  type OverlaySettings,
} from "../../shared/overlay";
// Entry of the two overlay windows: #hud (corner values, click-through) and
// #panel (Ctrl+Tab settings over the game). Without the desktop bridge (browser
// preview) it runs a demo with sample values.
declare global {
  interface Window {
    overlay?: {
      call: (method: string, args?: unknown) => Promise<any>;
      onData: (cb: (d: OverlayData) => void) => () => void;
    };
  }
}
const bridge = window.overlay;
const mode = location.hash.replace("#", "") || "hud";
function demoData(): OverlayData {
  const t = Date.now() / 1000;
  return {
    ...emptyOverlayData(),
    game: {
      name: "Life is Strange - Episode 2",
      exe: "lifeisstrange.exe",
      pid: 1,
      known: true,
      startedAt: new Date(Date.now() - 47 * 60000).toISOString(),
      foreground: true,
    },
    metrics: {
      fps: 117 + 6 * Math.sin(t),
      low1: 88,
      frametime: 8.6,
      cpu: 38 + 5 * Math.sin(t / 2),
      cpuTemp: 69,
      gpu: 95,
      gpuTemp: 79 + 3 * Math.sin(t / 3),
      vram: 4.7,
      ram: 9.4,
      gpuPower: 109,
      gpuClock: 1875,
      fan: 51,
    },
    totals: { ramGB: 16, vramGB: 6 },
    fps: "ok",
    sensors: { gpu: "nvidia", cpuTemp: "lhm" },
    now: Date.now(),
  };
}
function beep() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((freq, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* no audio device */
  }
}
function useOverlay() {
  const [settings, setSettings] = useState<OverlaySettings>(defaultOverlay);
  const [data, setData] = useState<OverlayData>(bridge ? emptyOverlayData() : demoData());
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [platform, setPlatform] = useState<string>("win32");
  const heard = useRef(new Set<string>());
  useEffect(() => {
    if (!bridge) {
      const t = setInterval(() => setData(demoData()), 1000);
      return () => clearInterval(t);
    }
    void bridge.call("state").then((r) => {
      setSettings(r.settings);
      setData(r.data);
      setGames(r.games);
      setPlatform(r.platform);
    });
    const refresh = setInterval(() => {
      void bridge.call("state").then((r) => setSettings(r.settings));
    }, 5000);
    const off = bridge.onData((d) => setData(d));
    return () => {
      off();
      clearInterval(refresh);
    };
  }, []);
  useEffect(() => {
    for (const a of data.alerts)
      if (!heard.current.has(a.id)) {
        heard.current.add(a.id);
        if (settings.sound && mode === "hud") beep();
      }
  }, [data.alerts, settings.sound]);
  return { settings, setSettings, data, games, platform };
}
function HudWindow() {
  const { settings, data } = useOverlay();
  const battery = useBattery();
  const root = useRef<HTMLDivElement>(null);
  const last = useRef("");
  // The window takes the size of its content (also when the notice turns into
  // the values inside the HUD); asked only when the size really changes.
  useEffect(() => {
    const el = root.current;
    if (!el || !bridge) return;
    const send = () => {
      const child = el.firstElementChild as HTMLElement | null;
      if (!child) return;
      const size = { width: child.offsetWidth + 2, height: child.offsetHeight + 2 };
      const key = `${size.width}x${size.height}`;
      if (key === last.current) return;
      last.current = key;
      void bridge.call("resize", size);
    };
    const observer = new ResizeObserver(send);
    observer.observe(el);
    send();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="hud-root" ref={root}>
      <Hud data={data} settings={settings} battery={battery} />
    </div>
  );
}
function PanelWindow() {
  const { settings, setSettings, data, games, platform } = useOverlay();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const close = () => void bridge?.call("close");
  // Each time the panel is shown again it plays its opening animation.
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    const shown = () => document.visibilityState === "visible" && setOpened((n) => n + 1);
    document.addEventListener("visibilitychange", shown);
    return () => document.removeEventListener("visibilitychange", shown);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const adapter: OverlayAdapter = bridge
    ? {
        save: (patch) => bridge.call("settings", { patch }),
        action: (name, args) => bridge.call("action", { name, args }),
      }
    : {
        save: async (patch) => ({ ...settings, ...patch }),
        action: async () => ({ ok: true, message: "Önizleme: işlem yalnız Windows uygulamasında çalışır." }),
      };
  return (
    <div className="panel-root">
      <section className="panel" data-testid="overlay-panel" key={opened}>
        <header>
          <div>
            <small>OYUN KATMANI</small>
            <h1>{data.game ? data.game.name : "Oyun tanımlayıcı"}</h1>
          </div>
          <kbd>{settings.hotkey.replace("Control", "Ctrl")}</kbd>
          <button className="panel-close" onClick={close} aria-label="Kapat">
            ×
          </button>
        </header>
        {message && <div className={"panel-message " + (message.error ? "error" : "")}>{message.text}</div>}
        <OverlayEditor
          settings={settings}
          data={data}
          games={games}
          platform={platform}
          adapter={adapter}
          onChange={setSettings}
          onMessage={(text, error = false) => {
            setMessage({ text, error });
            setTimeout(() => setMessage(null), 6000);
          }}
        />
      </section>
    </div>
  );
}
createRoot(document.getElementById("overlay-root")!).render(
  <StrictMode>{mode === "panel" ? <PanelWindow /> : <HudWindow />}</StrictMode>,
);
