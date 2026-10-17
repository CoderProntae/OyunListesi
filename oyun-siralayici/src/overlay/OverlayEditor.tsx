import { useState } from "react";
import "./editor.css";
import {
  BUILTIN_PRESETS,
  activePreset,
  metricDef,
  type OverlayData,
  type OverlayPreset,
  type OverlaySettings,
} from "../../shared/overlay";
import { katmanStatusText } from "../../shared/katman";
import Hud from "./Hud";
import { cleanError } from "../../shared/format";
// Every overlay option. Used in two places: Ayarlar → Oyun katmanı and the
// Ctrl+Tab panel over a game. Each change is saved at once.
export interface OverlayAdapter {
  save: (patch: Partial<OverlaySettings>) => Promise<OverlaySettings>;
  action: (name: string, args?: any) => Promise<any>;
}
const sample: OverlayData = {
  game: {
    name: "Örnek oyun",
    exe: "ornek.exe",
    pid: 1,
    known: true,
    startedAt: new Date(Date.now() - 83 * 60000).toISOString(),
    foreground: true,
  },
  metrics: { fps: 118, low1: 84, frametime: 8.5, cpu: 41, cpuTemp: 71, gpu: 96, gpuTemp: 81, vram: 4.8, ram: 9.2, gpuPower: 112, gpuClock: 1890, fan: 52, battery: 64 },
  totals: { ramGB: 16, vramGB: 6 },
  fps: "ok",
  sensors: { gpu: "nvidia", cpuTemp: "lhm" },
  alerts: [],
  limits: { method: "off" },
  now: Date.now(),
};
const id = () => Math.random().toString(36).slice(2, 10);
const tabs = [
  ["metrics", "Göstergeler"],
  ["look", "Görünüm"],
  ["time", "Süre ve alarm"],
  ["sound", "Ses"],
  ["fps", "FPS sınırı"],
  ["game", "Oyun ve izinler"],
] as const;
export default function OverlayEditor({
  settings,
  data,
  games,
  platform,
  adapter,
  onChange,
  onMessage,
}: {
  settings: OverlaySettings;
  data?: OverlayData;
  games: { id: string; name: string }[];
  platform?: string;
  adapter: OverlayAdapter;
  onChange: (s: OverlaySettings) => void;
  onMessage?: (text: string, error?: boolean) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("metrics");
  const [mapTo, setMapTo] = useState("");
  const s = settings,
    p = activePreset(s);
  const say = (text: string, error = false) => onMessage?.(text, error);
  const save = async (patch: Partial<OverlaySettings>) => {
    try {
      onChange(await adapter.save(patch));
    } catch (e: unknown) {
      say(cleanError(e), true);
    }
  };
  const act = async (name: string, args?: any) => {
    try {
      const r = await adapter.action(name, args);
      if (r?.message) say(r.message, r.ok === false);
      return r;
    } catch (e: unknown) {
      say(cleanError(e), true);
    }
  };
  const savePreset = (patch: Partial<OverlayPreset>) =>
    save({ presets: s.presets.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
  const move = (i: number, d: number) => {
    const list = [...p.metrics];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void savePreset({ metrics: list });
  };
  const game = data?.game;
  const windows = !platform || platform === "win32";
  return (
    <div className="overlay-editor">
      <nav className="oe-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="oe-body">
        <div className="oe-main">
          {tab === "metrics" && (
            <>
              <p className="oe-help">
                “{p.name}” görünümünde gösterilecek değerler. Sınırı geçen değer önce uyarı, sonra tehlike rengine döner; düşünce eski rengine geri döner.
              </p>
              <div className="oe-metrics">
                {p.metrics.map((m, i) => {
                  const def = metricDef(m.id);
                  return (
                    <div key={m.id} className={"oe-metric " + (m.enabled ? "on" : "")}>
                      <label className="oe-check">
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) =>
                            savePreset({ metrics: p.metrics.map((x) => (x.id === m.id ? { ...x, enabled: e.target.checked } : x)) })
                          }
                        />
                        <span>
                          <b>{def.label}</b>
                          <small>{def.hint}</small>
                        </span>
                      </label>
                      {def.direction !== "none" && m.enabled && (
                        <div className="oe-limits">
                          <label>
                            Uyarı {def.direction === "low" ? "≤" : "≥"}
                            <input
                              type="number"
                              value={m.warn ?? def.warn ?? ""}
                              onChange={(e) =>
                                savePreset({
                                  metrics: p.metrics.map((x) => (x.id === m.id ? { ...x, warn: e.target.value === "" ? null : Number(e.target.value) } : x)),
                                })
                              }
                            />
                          </label>
                          <label>
                            Tehlike {def.direction === "low" ? "≤" : "≥"}
                            <input
                              type="number"
                              value={m.danger ?? def.danger ?? ""}
                              onChange={(e) =>
                                savePreset({
                                  metrics: p.metrics.map((x) => (x.id === m.id ? { ...x, danger: e.target.value === "" ? null : Number(e.target.value) } : x)),
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                      <div className="oe-order">
                        <button aria-label={def.label + " yukarı"} onClick={() => move(i, -1)} disabled={!i}>
                          ↑
                        </button>
                        <button aria-label={def.label + " aşağı"} onClick={() => move(i, 1)} disabled={i === p.metrics.length - 1}>
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {tab === "look" && (
            <>
              <div className="oe-presets">
                {s.presets.map((x) => (
                  <button key={x.id} className={x.id === p.id ? "active" : ""} onClick={() => save({ presetId: x.id })}>
                    {x.name}
                  </button>
                ))}
                <button
                  className="ghost"
                  onClick={() => {
                    const copy = { ...p, id: id(), name: p.name + " (kopya)", builtin: false };
                    void save({ presets: [...s.presets, copy], presetId: copy.id });
                  }}
                >
                  + Yeni görünüm
                </button>
              </div>
              <div className="oe-grid">
                <label>
                  Görünüm adı
                  <input
                    key={p.id}
                    defaultValue={p.name}
                    maxLength={40}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== p.name) void savePreset({ name });
                      else e.target.value = p.name;
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                </label>
                <label>
                  Konum
                  <select value={p.position} onChange={(e) => savePreset({ position: e.target.value as any })}>
                    <option value="top-right">Sağ üst</option>
                    <option value="top-left">Sol üst</option>
                    <option value="bottom-right">Sağ alt</option>
                    <option value="bottom-left">Sol alt</option>
                  </select>
                </label>
                <label>
                  Dizilim
                  <select value={p.layout} onChange={(e) => savePreset({ layout: e.target.value as any })}>
                    <option value="vertical">Alt alta</option>
                    <option value="horizontal">Yan yana</option>
                  </select>
                </label>
                <label>
                  Boyut ({Math.round(p.scale * 100)}%)
                  <input type="range" min={0.7} max={1.8} step={0.05} value={p.scale} onChange={(e) => savePreset({ scale: Number(e.target.value) })} />
                </label>
                <label>
                  Arka plan saydamlığı ({Math.round(p.opacity * 100)}%)
                  <input type="range" min={0} max={1} step={0.05} value={p.opacity} onChange={(e) => savePreset({ opacity: Number(e.target.value) })} />
                </label>
                <label className="oe-check">
                  <input type="checkbox" checked={s.nowPlayingToast} onChange={(e) => save({ nowPlayingToast: e.target.checked })} />
                  <span>Oyun açılınca “Şimdi oynanıyor” bildirimi</span>
                </label>
                <label className="oe-check">
                  <input type="checkbox" checked={p.showTitle} onChange={(e) => savePreset({ showTitle: e.target.checked })} />
                  <span>Oyunun adı sürekli görünsün</span>
                </label>
              </div>
              <h4>Renkler</h4>
              <div className="oe-colors">
                {(
                  [
                    ["text", "Değer"],
                    ["label", "Etiket"],
                    ["background", "Arka plan"],
                    ["accent", "Vurgu"],
                    ["warn", "Uyarı"],
                    ["danger", "Tehlike"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input type="color" value={p.colors[key]} onChange={(e) => savePreset({ colors: { ...p.colors, [key]: e.target.value } })} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="oe-row">
                {p.builtin ? (
                  <button
                    onClick={() => {
                      const original = BUILTIN_PRESETS.find((b) => b.id === p.id);
                      if (original) void savePreset(original);
                    }}
                  >
                    Varsayılana döndür
                  </button>
                ) : (
                  <button
                    className="danger"
                    onClick={() => save({ presets: s.presets.filter((x) => x.id !== p.id), presetId: s.presets.find((x) => x.id !== p.id)!.id })}
                  >
                    Bu görünümü sil
                  </button>
                )}
              </div>
            </>
          )}
          {tab === "time" && (
            <>
              <h4>Oyun süresi sınırı</h4>
              <p className="oe-help">Süre dolunca köşede renkli uyarı ve Windows bildirimi çıkar; oyun kapanmaz.</p>
              <div className="oe-row">
                {[0, 30, 60, 90, 120, 180].map((m) => (
                  <button key={m} className={s.sessionLimit === m ? "active" : ""} onClick={() => save({ sessionLimit: m })}>
                    {m ? `${m} dk` : "Kapalı"}
                  </button>
                ))}
                <label className="oe-inline">
                  Özel
                  <input type="number" min={0} max={1440} value={s.sessionLimit} onChange={(e) => save({ sessionLimit: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) })} />
                  dk
                </label>
              </div>
              <label className="oe-inline">
                Süre dolduktan sonra her
                <input type="number" min={0} max={600} value={s.remindEvery} onChange={(e) => save({ remindEvery: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} />
                dakikada bir hatırlat (0 = bir kez)
              </label>
              <h4>Alarmlar</h4>
              {s.alarms.map((a) => (
                <div className="oe-alarm" key={a.id}>
                  <input type="checkbox" aria-label="Alarm açık" checked={a.enabled} onChange={(e) => save({ alarms: s.alarms.map((x) => (x.id === a.id ? { ...x, enabled: e.target.checked } : x)) })} />
                  <input type="time" value={a.time} onChange={(e) => e.target.value && save({ alarms: s.alarms.map((x) => (x.id === a.id ? { ...x, time: e.target.value, lastFired: undefined } : x)) })} />
                  <input placeholder="Not (ör. Yemek)" value={a.label} maxLength={80} onChange={(e) => save({ alarms: s.alarms.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) })} />
                  <button className="danger" onClick={() => save({ alarms: s.alarms.filter((x) => x.id !== a.id) })}>
                    Sil
                  </button>
                </div>
              ))}
              <div className="oe-row">
                <button
                  disabled={s.alarms.length >= 20}
                  onClick={() => {
                    const d = new Date(Date.now() + 60 * 60000);
                    void save({ alarms: [...s.alarms, { id: id(), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, label: "", enabled: true }] });
                  }}
                >
                  + Alarm ekle
                </button>
                <label className="oe-check">
                  <input type="checkbox" checked={s.sound} onChange={(e) => save({ sound: e.target.checked })} />
                  <span>Uyarılarda ses çal</span>
                </label>
                {windows && <button onClick={() => act("testAlert")}>Uyarıyı dene</button>}
              </div>
            </>
          )}
          {tab === "sound" && (
            <>
              <label className="oe-check block">
                <input type="checkbox" checked={s.muteGameInBackground} onChange={(e) => save({ muteGameInBackground: e.target.checked })} />
                <span>
                  <b>Oyun arka plana geçince sesini kapat</b>
                  <small>Alt+Tab ile başka pencereye geçince oyun susar, geri dönünce ses gelir.</small>
                </span>
              </label>
              <label className="oe-check block">
                <input type="checkbox" checked={s.muteOthers} onChange={(e) => save({ muteOthers: e.target.checked })} />
                <span>
                  <b>Oyun öndeyken diğer uygulamaları sessize al</b>
                  <small>Yalnız bu uygulamanın kapattığı sesler geri açılır.</small>
                </span>
              </label>
              <label>
                Hiç susturulmayacak programlar (virgülle)
                <input
                  defaultValue={s.muteExclude.join(", ")}
                  onBlur={(e) => save({ muteExclude: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })}
                />
              </label>
            </>
          )}
          {tab === "fps" && (
            <>
              <div className="oe-choices">
                {(
                  [
                    ["off", "Kapalı", "FPS sınırlanmaz."],
                    ["rtss", "RivaTuner (önerilen)", "RivaTuner Statistics Server yüklüyse sınır anında uygulanır; arka plandaki oyun için ayrı sınır verilebilir."],
                    ["nvidia", "NVIDIA sürücüsü", "Oyunun NVIDIA profiline “Max Frame Rate” yazılır; oyun yeniden açılınca geçerli olur."],
                  ] as const
                ).map(([key, label, hint]) => (
                  <label key={key} className={"oe-choice " + (s.fpsMethod === key ? "active" : "")}>
                    <input type="radio" name="fpsMethod" checked={s.fpsMethod === key} onChange={() => save({ fpsMethod: key })} />
                    <span>
                      <b>{label}</b>
                      <small>{hint}</small>
                    </span>
                  </label>
                ))}
              </div>
              {s.fpsMethod !== "off" && (
                <div className="oe-grid">
                  <label>
                    Genel FPS sınırı (0 = yok)
                    <input type="number" min={0} max={1000} value={s.fpsLimit} onChange={(e) => save({ fpsLimit: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} />
                  </label>
                  {s.fpsMethod === "rtss" && (
                    <label>
                      Arka plandaki oyun (0 = aynı)
                      <input type="number" min={0} max={1000} value={s.backgroundFps} onChange={(e) => save({ backgroundFps: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} />
                    </label>
                  )}
                  {game && (
                    <label>
                      Yalnız “{game.name}” için (boş = genel)
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={s.gameFps[game.exe] ?? ""}
                        onChange={(e) => {
                          const next = { ...s.gameFps };
                          if (e.target.value === "") delete next[game.exe];
                          else next[game.exe] = Math.max(0, Math.min(1000, Number(e.target.value) || 0));
                          void save({ gameFps: next });
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
              {data?.limits?.message && <p className="oe-help">{data.limits.message}</p>}
            </>
          )}
          {tab === "game" && (
            <>
              <div className="oe-row">
                <label>
                  Çizim yöntemi
                  <select
                    aria-label="Çizim yöntemi"
                    value={s.drawMode ?? "auto"}
                    onChange={(e) => save({ drawMode: e.target.value as OverlaySettings["drawMode"] })}
                  >
                    <option value="auto">Otomatik (oyunun içine çiz, olmazsa pencere)</option>
                    <option value="inject">Her zaman oyunun içinde</option>
                    <option value="window">Pencere katmanı (eski davranış)</option>
                  </select>
                </label>
              </div>
              <p className="oe-help">{katmanStatusText(data?.katman)}</p>
              <div className="oe-game">
                {game ? (
                  <>
                    <small>{game.known ? "TANINAN OYUN" : "TAM EKRAN PROGRAM"}</small>
                    <strong>{game.name}</strong>
                    <span>{game.exe}</span>
                    <div className="oe-row">
                      <select aria-label="Kütüphanedeki oyun" value={mapTo} onChange={(e) => setMapTo(e.target.value)}>
                        <option value="">Kütüphanedeki oyunla eşleştir…</option>
                        {games.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <button disabled={!mapTo} onClick={() => act("mapCurrent", { gameId: mapTo })}>
                        Eşleştir
                      </button>
                      <button className="danger" onClick={() => act("ignoreCurrent")}>
                        Bu bir oyun değil
                      </button>
                    </div>
                  </>
                ) : (
                  <span>Şu an açık bir oyun yok. Oyun öndeyken burada adı görünür.</span>
                )}
              </div>
              {data?.fps === "permission" && (
                <div className="oe-warning">
                  <p>{data.fpsMessage}</p>
                  <button className="primary" onClick={() => act("fpsPermission")}>
                    FPS iznini ver (bir kerelik)
                  </button>
                </div>
              )}
              {data?.fps === "unavailable" && data.fpsMessage && <p className="oe-help">FPS: {data.fpsMessage}</p>}
              <h4>Genel</h4>
              <label className="oe-check block">
                <input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
                <span>
                  <b>Oyun tanımlayıcı ve gösterge açık</b>
                  <small>Kapalıyken oyun aranmaz, köşede hiçbir şey görünmez.</small>
                </span>
              </label>
              <label className="oe-check block">
                <input type="checkbox" checked={s.closeToTray} onChange={(e) => save({ closeToTray: e.target.checked })} />
                <span>
                  <b>Kapatınca görev çubuğu simgesinde çalışmaya devam et</b>
                  <small>Gösterge için gereklidir. Tamamen kapatmak: simgeye sağ tık → Çıkış.</small>
                </span>
              </label>
              <label className="oe-check block">
                <input type="checkbox" checked={s.startWithWindows} onChange={(e) => save({ startWithWindows: e.target.checked })} />
                <span>
                  <b>Windows açılınca başlat</b>
                </span>
              </label>
              {s.startWithWindows && (
                <label className="oe-check block">
                  <input type="checkbox" checked={s.startHidden} onChange={(e) => save({ startHidden: e.target.checked })} />
                  <span>
                    <b>Pencereyi açmadan, simge olarak başlat</b>
                  </span>
                </label>
              )}
              <label className="oe-check block">
                <input type="checkbox" checked={s.autoPlaying} onChange={(e) => save({ autoPlaying: e.target.checked })} />
                <span>
                  <b>Açılan oyunun durumunu “Oynanıyor” yap</b>
                  <small>Yalnız “Oynanacak” durumundaki kütüphane oyunları için.</small>
                </span>
              </label>
              <label className="oe-check block">
                <input type="checkbox" checked={s.trackPlaytime} onChange={(e) => save({ trackPlaytime: e.target.checked })} />
                <span>
                  <b>Bu bilgisayardaki oynama süresini kaydet</b>
                </span>
              </label>
              <label>
                Panel kısayolu
                <input
                  defaultValue={s.hotkey}
                  onBlur={(e) => {
                    const key = e.target.value.trim().replace(/\bCtrl\b/gi, "Control");
                    // An Electron shortcut: one or more modifiers + one key.
                    if (/^((Control|Alt|Shift|Super|CommandOrControl)\+)+([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Tab|Space|Plus|Insert|Home|End|PageUp|PageDown)$/i.test(key)) {
                      if (key !== s.hotkey) void save({ hotkey: key });
                    } else {
                      e.target.value = s.hotkey;
                      say("Kısayol geçersiz. Örnek: Control+Tab, Control+Shift+O, Alt+F10.", true);
                    }
                  }}
                />
              </label>
              <h4>Sıcaklık</h4>
              <label className="oe-check block">
                <input type="checkbox" checked={s.lhm} onChange={(e) => save({ lhm: e.target.checked })} />
                <span>
                  <b>LibreHardwareMonitor'dan işlemci sıcaklığını oku</b>
                  <small>Windows işlemci sıcaklığını uygulamalara vermez. Ücretsiz LibreHardwareMonitor açıkken Options → Remote Web Server → Run seçilirse okunur. NVIDIA ekran kartı sıcaklığı bunsuz da görünür.</small>
                </span>
              </label>
              {s.ignore.length > 0 && (
                <>
                  <h4>Oyun sayılmayan programlar</h4>
                  <div className="oe-row">
                    {s.ignore.map((exe) => (
                      <button key={exe} onClick={() => save({ ignore: s.ignore.filter((x) => x !== exe) })} title="Listeden çıkar">
                        {exe} ×
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <aside className="oe-preview">
          <small>ÖNİZLEME</small>
          <div className="oe-stage">
            <Hud data={data?.game ? data : { ...sample, now: Date.now() }} settings={s} intro={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}
