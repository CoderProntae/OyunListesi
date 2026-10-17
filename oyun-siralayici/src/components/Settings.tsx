import { useEffect, useRef, useState } from "react";
import {
  Palette,
  Monitor,
  BrainCircuit,
  Database,
  Globe2,
  ShieldCheck,
  SlidersHorizontal,
  Check,
  RefreshCw,
  Upload,
  Download,
  FolderOpen,
  Trash2,
  Info,
  ImagePlus,
  Link2,
  Loader2,
  HardDrive,
  Keyboard,
  ArrowUpRight,
  Gamepad2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "../lib/context";
import OverlayEditor from "../overlay/OverlayEditor";
import { UpdatesSettings } from "./Updates";
import { api, download, external, date } from "../lib/api";
import { Modal, Toggle, Spinner } from "./UI";
import type { Settings as SettingsType, Hardware } from "../../shared/types";
import { backupLabel, formatNumber } from "../../shared/format";
const themes = [
  ["dark", "Gece", "#b6a1ff"],
  ["light", "Gün ışığı", "#7c5ddd"],
  ["system", "Sistem", "#9da3af"],
  ["neon", "Neon", "#d0ff7b"],
  ["ocean", "Okyanus", "#69ccf0"],
  ["forest", "Orman", "#87d7ad"],
  ["sunset", "Gün batımı", "#ffa785"],
  ["amoled", "AMOLED", "#bcb5ff"],
];
declare const __APP_VERSION__: string;
export default function Settings({ initialTab = "appearance" }: { initialTab?: string }) {
  const { data, setData, run, toast, close, modal } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(initialTab),
    [s, setS] = useState<SettingsType>({ ...data.state.settings }),
    [h, setH] = useState<Hardware>({ ...data.state.hardware }),
    // Fields this window actually touched. Everything else is left alone: some
    // settings save themselves at once (Oyun katmanı, Güncellemeler →
    // kendiliğinden denetle) and writing this window's opening copy back over
    // them silently reverted them (2.1.4).
    [dirty, setDirty] = useState<Record<string, true>>({}),
    [hwDirty, setHwDirty] = useState(false),
    [lmKey, setLmKey] = useState(""),
    [braveKey, setBraveKey] = useState(""),
    [busy, setBusy] = useState(""),
    [backups, setBackups] = useState<any[]>([]),
    [connection, setConnection] = useState(""),
    [overlay, setOverlay] = useState(data.state.settings.overlay);
  const update = (key: keyof SettingsType, value: any, live = false) => {
    setS((old) => ({
      ...old,
      ...(["lmModel", "lmUrl"].includes(key) ? { contextTokens: 0 } : {}),
      [key]: value,
    }));
    setDirty((old) => ({ ...old, [key]: true }));
    if (live) void run("settings", { patch: { [key]: value } });
  };
  const hw = (key: keyof Hardware, value: any) => {
    setH((old) => ({ ...old, [key]: value, manual: true }));
    setHwDirty(true);
  };
  useEffect(() => {
    if (tab === "data")
      void api
        .call("backups")
        .then(setBackups)
        .catch((e) => toast(e.message, true));
  }, [tab]);
  const changedSettings = () => {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(dirty))
      if (key !== "overlay") patch[key] = (s as unknown as Record<string, unknown>)[key];
    return patch;
  };
  const save = async () => {
    setBusy("save");
    try {
      const patch = changedSettings();
      if (Object.keys(patch).length) await api.call("settings", { patch });
      // The hardware profile is saved whatever tab is open now: editing it and
      // then switching to another tab used to throw the values away silently.
      if (hwDirty) await api.call("hardware", { patch: h });
      if (lmKey) await api.call("secret", { name: "lm", value: lmKey });
      if (braveKey) await api.call("secret", { name: "brave", value: braveKey });
      toast("Ayarlar kaydedildi");
      close();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy("");
    }
  };
  const test = async () => {
    setBusy("test");
    setConnection("");
    try {
      const patch = changedSettings();
      if (Object.keys(patch).length) await api.call("settings", { patch });
      if (lmKey) await api.call("secret", { name: "lm", value: lmKey });
      const r = await api.call("testLM");
      setData((old) => (old ? { ...old, models: r.models } : old));
      setConnection(r.notice);
      if (!s.lmModel && r.models.length) {
        const model = r.models.find((m: any) => m.loaded !== false) || r.models[0];
        update("lmModel", model.id);
        await api.call("settings", { patch: { lmModel: model.id } });
      }
    } catch (e: any) {
      setConnection(e.message);
      toast(e.message, true);
    } finally {
      setBusy("");
    }
  };
  const detect = async () => {
    setBusy("hardware");
    const r = await run("detectHardware");
    if (r) setH(r);
    setBusy("");
  };
  const selectedModel = data.models.find((m) => m.id === s.lmModel);
  const effortOptions = selectedModel?.reasoning || [];
  return (
    <Modal
      wide
      title="Ayarlar"
      subtitle="Görünüm, donanım ve yerel yapay zekânın kontrol merkezi."
      onClose={close}
      footer={
        <>
          <span className="tiny muted">
            <ShieldCheck size={12} />
            Ayarlar bu cihazda saklanır · Sürüm {__APP_VERSION__}
          </span>
          <div className="footer-spacer" />
          <button onClick={close}>Kapat</button>
          <button className="primary" disabled={!!busy} onClick={save}>
            {busy === "save" ? (
              <Spinner text="Kaydediliyor…" />
            ) : (
              <>
                <Check size={15} />
                Ayarları kaydet
              </>
            )}
          </button>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {[
            ["appearance", "Görünüm", Palette],
            ["lm", "LM Studio", BrainCircuit],
            ["agent", "Ajan & güvenlik", ShieldCheck],
            ["hardware", "Donanım", Monitor],
            ["search", "Web araştırması", Globe2],
            ["data", "Veriler & yedekler", Database],
            ["overlay", "Oyun katmanı", Gamepad2],
            ["updates", "Güncellemeler", RefreshCw],
            ["shortcuts", "Kısayollar", Keyboard],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {tab === id && (
                <motion.i layoutId="settings-nav-active" className="nav-active" />
              )}
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content" key={tab}>
          {tab === "appearance" && (
            <>
              <h3>Günün rengine göre.</h3>
              <p className="muted">Görünüm değişiklikleri anında uygulanır.</p>
              <div className="theme-grid">
                {themes.map(([id, label, color]) => (
                  <button
                    key={id}
                    className={s.theme === id ? "active" : ""}
                    onClick={() => {
                      setS((old) => ({
                        ...old,
                        theme: id as any,
                        accent: color,
                      }));
                      void run("settings", {
                        patch: { theme: id, accent: color },
                      });
                    }}
                  >
                    <span
                      style={{
                        background:
                          id === "light"
                            ? "#e8e8f2"
                            : id === "amoled"
                              ? "#000"
                              : id === "forest"
                                ? "#14261e"
                                : id === "ocean"
                                  ? "#14202d"
                                  : "#191a24",
                        borderColor: color,
                      }}
                    >
                      <i style={{ background: color }} />
                      <i style={{ background: color }} />
                    </span>
                    {label}
                    {s.theme === id && <Check size={12} />}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label>
                  Vurgu rengi
                  <div className="color-input">
                    <input
                      aria-label="Vurgu rengi"
                      type="color"
                      value={s.accent}
                      onChange={(e) => update("accent", e.target.value, true)}
                    />
                    <span>{s.accent}</span>
                  </div>
                </label>
                <label>
                  Yazı tipi
                  <select
                    value={s.fontFamily}
                    onChange={(e) => update("fontFamily", e.target.value, true)}
                  >
                    <option value="system">Sistem · Segoe UI</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="monospace">Eş aralıklı</option>
                  </select>
                </label>
                <label>
                  Yazı boyutu · {s.fontSize}px
                  <input
                    type="range"
                    min={11}
                    max={22}
                    value={s.fontSize}
                    onChange={(e) => update("fontSize", +e.target.value, true)}
                  />
                </label>
                <label>
                  Köşe yuvarlaklığı · {s.radius}px
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={s.radius}
                    onChange={(e) => update("radius", +e.target.value, true)}
                  />
                </label>
                <label>
                  Liste yoğunluğu
                  <select
                    value={s.density}
                    onChange={(e) => update("density", e.target.value, true)}
                  >
                    <option value="comfortable">Ferah</option>
                    <option value="compact">Kompakt</option>
                  </select>
                </label>
                <label>
                  Animasyon hızı · {s.animationSpeed}×
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.25}
                    value={s.animationSpeed}
                    onChange={(e) => update("animationSpeed", +e.target.value, true)}
                  />
                </label>
              </div>
              <Toggle
                label="Akıcı animasyonlar"
                description="İşletim sisteminin azaltılmış hareket tercihi de dikkate alınır."
                checked={s.animations}
                onChange={(v) => update("animations", v, true)}
              />
              <h4>Cam & arka plan</h4>
              <div className="form-grid">
                <label>
                  Pencere opaklığı · %{Math.round(s.opacity * 100)}
                  <input
                    type="range"
                    min={0.7}
                    max={1}
                    step={0.01}
                    value={s.opacity}
                    disabled={!data.desktop}
                    onChange={(e) => update("opacity", +e.target.value, true)}
                  />
                </label>
                <label>
                  Windows cam malzemesi
                  <select
                    value={s.material}
                    disabled={!data.desktop}
                    onChange={(e) => update("material", e.target.value, true)}
                  >
                    <option value="none">Kapalı</option>
                    <option value="mica">Mica</option>
                    <option value="acrylic">Acrylic</option>
                  </select>
                </label>
                <label>
                  Arka plan bulanıklığı · {s.blur}px
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={s.blur}
                    onChange={(e) => update("blur", +e.target.value, true)}
                  />
                </label>
                <label className="upload-label">
                  Arka plan görseli
                  {/* Own Turkish button: Chromium's file box says "Choose File". */}
                  <span className="file-button">
                    <ImagePlus size={14} />
                    Görsel seç · PNG/JPG/WebP, en fazla 5 MB
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const input = e.currentTarget;
                        const f = input.files?.[0];
                        input.value = "";
                        if (!f) return;
                        if (f.size > 5_000_000) {
                          toast("Görsel en fazla 5 MB olabilir.", true);
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () =>
                          update("background", reader.result as string, true);
                        reader.readAsDataURL(f);
                      }}
                    />
                  </span>
                </label>
              </div>
              {s.background && (
                <button onClick={() => update("background", "", true)}>
                  <Trash2 size={14} />
                  Arka planı kaldır
                </button>
              )}
              <p className="tiny muted">
                Mica/Acrylic destekleyen Windows sürümlerinde uygulanır. Tarayıcı
                önizlemesinde yerel cam ve pencere opaklığı devre dışıdır. Desteksiz
                sistemlerde opak arka plana dönülür.
              </p>
            </>
          )}
          {tab === "lm" && (
            <>
              <h3>Yerel modelinle tanışalım.</h3>
              <p className="muted">
                LM Studio’da Developer → Local Server bölümünden sunucuyu başlat.
                Varsayılan port 1234.
              </p>
              {!data.desktop && (
                <div className="notice-box">
                  <Info size={16} />
                  <p>
                    Bu tarayıcı önizlemesi senin bilgisayarında çalışmıyor.{" "}
                    <b>localhost</b> burada uzak önizleme sunucusudur. Kendi LM Studio’nu
                    Windows EXE’de bağla.
                  </p>
                </div>
              )}
              <Toggle
                label="Oyun eklendiğinde otomatik AI araştırması"
                description="Seçili model gereksinimleri ve belirsiz donanım karşılaştırmalarını webde araştırır. Model bağlı değilse işlem bekler. Sonuçlar geri alınabilir."
                checked={s.autoResearch}
                onChange={(v) => update("autoResearch", v)}
              />
              <Toggle
                label="Bilgi toplama sırasında AI özeti oluştur"
                description="Otomatik araştırmada kısa Türkçe özet de kaydedilir. Otomatik araştırma kapalıysa özet, mevcut mağaza açıklamasından üretilir."
                checked={s.autoSummary}
                onChange={(v) => update("autoSummary", v)}
              />
              <label>
                OpenAI uyumlu temel adres
                <input
                  value={s.lmUrl}
                  onChange={(e) => update("lmUrl", e.target.value)}
                  placeholder="http://127.0.0.1:1234/v1"
                />
              </label>
              <label>
                API anahtarı (isteğe bağlı)
                <input
                  type="password"
                  value={lmKey}
                  onChange={(e) => setLmKey(e.target.value)}
                  autoComplete="off"
                  placeholder={
                    data.hasLmKey
                      ? "Kayıtlı anahtar var · değiştirmek için yaz"
                      : "Yerel sunucu istemiyorsa boş bırak"
                  }
                />
              </label>
              {data.hasLmKey && (
                <button
                  className="text-link"
                  onClick={() =>
                    run("secret", { name: "lm", value: "" }, "API anahtarı silindi")
                  }
                >
                  Kayıtlı anahtarı sil
                </button>
              )}
              <div className="button-row">
                <button className="soft" disabled={!!busy} onClick={test}>
                  {busy === "test" ? (
                    <Spinner text="Bağlanıyor…" />
                  ) : (
                    <>
                      <RefreshCw size={15} />
                      Bağlantıyı test et & modelleri al
                    </>
                  )}
                </button>
              </div>
              {connection && <div className="connection-result">{connection}</div>}
              <label>
                Model
                <select
                  value={s.lmModel}
                  onChange={(e) => update("lmModel", e.target.value)}
                >
                  <option value="">Model seç</option>
                  {data.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{" "}
                      {m.loaded === true
                        ? "· Yüklü"
                        : m.loaded === false
                          ? "· Yüklenmemiş"
                          : ""}
                    </option>
                  ))}
                  {s.lmModel && !data.models.some((m) => m.id === s.lmModel) && (
                    <option value={s.lmModel}>{s.lmModel} · bağlantı doğrulanmadı</option>
                  )}
                </select>
              </label>
              <label>
                Ya da model kimliğini elle yaz
                <input
                  value={s.lmModel}
                  onChange={(e) => update("lmModel", e.target.value)}
                  placeholder="Sunucudaki tam model kimliği"
                />
              </label>
              {selectedModel && (
                <div className="model-info">
                  <span>
                    Sunucudan okunan yüklü bağlam:{" "}
                    {selectedModel.context?.toLocaleString("tr-TR") || "Bilinmiyor"}
                  </span>
                  <span>
                    Araç eğitimi:{" "}
                    {selectedModel.tools === true
                      ? "Var"
                      : selectedModel.tools === false
                        ? "Yok"
                        : "Bilinmiyor"}
                  </span>
                </div>
              )}
              <div className="form-grid">
                <label>
                  Sıcaklık · {s.temperature}
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={s.temperature}
                    onChange={(e) => update("temperature", +e.target.value)}
                  />
                </label>
                <label>
                  Maksimum çıktı tokenı (yanıt üst sınırı)
                  <input
                    type="number"
                    min={128}
                    max={1048576}
                    step={1}
                    value={s.maxTokens}
                    onChange={(e) => update("maxTokens", +e.target.value)}
                  />
                </label>
              </div>
              <p className="tiny muted">
                Ajan isteğine gönderilen çıktı üst sınırı: {s.maxTokens} token. 16 binin
                katı olması gerekmez; 16128 veya 20000 aynen kullanılabilir. Bu bir üst
                sınırdır, her yanıtta bu kadar token üretilmez.
              </p>
              <label>
                Yüklü bağlam (token; 0 = LM Studio’dan otomatik)
                <input
                  type="number"
                  min={0}
                  max={1048576}
                  step={1}
                  value={s.contextTokens}
                  onChange={(e) => update("contextTokens", Number(e.target.value))}
                />
              </label>
              <p className="tiny muted">
                Bağlam, modelin konuşma ve yanıt için kullanabildiği toplam alandır; çıktı
                sınırı ise tek yanıtın en fazla uzunluğudur. Buraya bağlam değeri yazmak
                modeli yeniden yüklemez; bu bilgi çıktı ayarını düşürmek için kullanılmaz.
                Tek istekte konuşma ve araç sonuçları kısaltılmaz. Gerçek kapasiteyi model
                sunucusu uygular; sığmazsa hata gösterilir, gizlice 128 tokena düşürülmez.
                Modeli yeniden yüklediğinde bağlantıyı tekrar test et.
              </p>
              <Toggle
                label="Aynı anda 2 istek"
                description="Araştırma ve sohbetler aynı anda iki istek gönderebilir. LM Studio’da “Max Concurrent Predictions” en az 2 ve “Unified KV Cache” açık olmalı. İki istek birlikte çalışırken her biri yüklü bağlamın yarısına sığacak şekilde sıkıştırılır (örneğin 27000 → 13500); tek istekte hiçbir şey kısaltılmaz."
                checked={s.parallelRequests}
                onChange={(v) => update("parallelRequests", v)}
              />
            </>
          )}
          {tab === "agent" && (
            <>
              <h3>Yetenekler ve izinler.</h3>
              <p className="tiny muted">
                Sabit araç/tur kotası yok. Ajan işini bitirene, gerçek sunucu hatası
                oluşana veya Durdur’a basana kadar devam eder. Konuşma her sohbete
                özeldir; oyun kütüphanesi, donanım ve genel ayarlar ortaktır.
              </p>
              <label>
                Araç çağırma modu
                <select
                  value={s.toolMode}
                  onChange={(e) => update("toolMode", e.target.value)}
                >
                  <option value="auto">Otomatik · native, gerekirse JSON</option>
                  <option value="native">Native function calling</option>
                  <option value="json">Yapılandırılmış JSON yedek modu</option>
                </select>
              </label>
              <p className="tiny muted">
                Native araç biçimini desteklemeyen modeller için JSON aktarımı. Çalışma
                modu her iki biçimde de aynıdır.
              </p>
              <label>
                Düşünme düzeyi
                <select
                  value={s.reasoning}
                  disabled={!effortOptions.length}
                  onChange={(e) => update("reasoning", e.target.value)}
                >
                  <option value="default">Model varsayılanı</option>
                  {effortOptions.map((o) => (
                    <option key={o} value={o}>
                      {(
                        {
                          off: "Kapalı",
                          on: "Açık",
                          low: "Düşük",
                          medium: "Orta",
                          high: "Yüksek",
                        } as any
                      )[o] || o}
                    </option>
                  ))}
                </select>
              </label>
              <p className="tiny muted">
                {effortOptions.length
                  ? "Bu seçenekler LM Studio’nun model yeteneklerinden okundu. Özel düşünme düzeyi seçilirse /api/v1/chat ve JSON araç modu kullanılır; OpenAI endpoint’ine desteklenmeyen reasoning_effort gönderilmez."
                  : "Seçili modelin desteklediği düşünme seçenekleri sunucudan doğrulanmadı. Kontrol bu yüzden kapalı; önce bağlantıyı test et. Model adına bakarak destek varsayılmaz."}
              </p>
              <Toggle
                label="Düşünme çıktısını göster"
                description="Model sağlıyorsa, yanıtın üstünde ayrı ve kapatılabilir bir bölüm."
                checked={s.showThinking}
                onChange={(v) => update("showThinking", v, true)}
              />
              <Toggle
                label="İşlem öncesi onay iste"
                description="Kapalı: ajan ekleme, düzenleme, silme ve sıralamayı doğrudan yapar. Açık: eski onaylı çalışma modu."
                checked={s.requireApproval}
                onChange={(v) => update("requireApproval", v)}
              />
              {s.requireApproval && (
                <Toggle
                  label="Okuma araçları için de izin iste"
                  description="Onaylı modda liste okuma, web arama ve sayfa getirmeyi de onaya bağla."
                  checked={s.askReadTools}
                  onChange={(v) => update("askReadTools", v)}
                />
              )}
              <p className="tiny muted">
                {s.requireApproval
                  ? "İşlemler seçtiğin onay tercihine göre yürütülür."
                  : "Otonom çalışma açık. Alıntı, kaynak bağlantısı ve önce sayfa açma şartı yok. Durdur, geri al ve yedekleme kullanılabilir."}
              </p>
              <label>
                Ek sistem yönergen
                <textarea
                  rows={7}
                  value={s.systemPrompt}
                  maxLength={16000}
                  onChange={(e) => update("systemPrompt", e.target.value)}
                />
              </label>
              <small className="muted">
                Uygulama ayrıca araç kullanımını ve seçtiğin çalışma modunu açıklayan kısa
                bir yönerge ekler.
              </small>
            </>
          )}
          {tab === "hardware" && (
            <>
              <div className="section-title">
                <h3>Bilgisayarının profili</h3>
                <button disabled={!!busy} onClick={detect}>
                  {busy === "hardware" ? (
                    <Spinner text="Algılanıyor…" />
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      Yeniden algıla
                    </>
                  )}
                </button>
              </div>
              <p className="muted">{h.note}</p>
              <small className="muted">
                Son algılama: {date(h.detectedAt)} ·{" "}
                {h.manual ? "Elle düzenlenmiş" : "Sistem profili"}
              </small>
              <div className="form-grid">
                {[
                  ["os", "İşletim sistemi"],
                  ["osVersion", "OS sürümü"],
                  ["architecture", "Mimari"],
                  ["cpu", "İşlemci modeli"],
                  ["gpu", "Ekran kartı modeli"],
                ].map(([k, t]) => (
                  <label key={k}>
                    {t}
                    <input
                      value={String(h[k as keyof Hardware] || "")}
                      onChange={(e) => hw(k as keyof Hardware, e.target.value)}
                    />
                  </label>
                ))}
                {[
                  ["cores", "Fiziksel çekirdek"],
                  ["threads", "İş parçacığı"],
                  ["clockGHz", "CPU hızı (GHz)"],
                  ["vramGB", "VRAM (GB)"],
                  ["ramGB", "RAM (GB)"],
                  ["diskFreeGB", "Boş disk alanı (GB)"],
                  ["directX", "GPU DirectX özellik düzeyi"],
                ].map(([k, t]) => (
                  <label key={k}>
                    {t}
                    <input
                      type="number"
                      min={0}
                      step={k === "clockGHz" ? 0.1 : k === "directX" ? 0.1 : 1}
                      value={(h as any)[k] ?? ""}
                      onChange={(e) =>
                        hw(
                          k as keyof Hardware,
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              {h.gpuOptions.length > 1 && (
                <label>
                  Algılanan GPU’lardan seç
                  <select
                    value={h.gpu}
                    onChange={(e) => {
                      const card = h.gpuOptions.find((g) => g.name === e.target.value);
                      if (card) {
                        setH({
                          ...h,
                          gpu: card.name,
                          vramGB: card.vramGB,
                          vramCertain: false,
                          manual: true,
                        });
                        setHwDirty(true);
                      }
                    }}
                  >
                    {h.gpuOptions.map((g) => (
                      <option key={g.name}>{g.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {h.disks.length > 0 && (
                <label>
                  Oyunların kurulacağı disk
                  <select
                    value={h.diskName}
                    onChange={(e) => {
                      const d = h.disks.find((d) => d.name === e.target.value);
                      if (d) {
                        setH({
                          ...h,
                          diskName: d.name,
                          diskFreeGB: d.freeGB,
                          manual: true,
                        });
                        setHwDirty(true);
                      }
                    }}
                  >
                    {h.disks.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} · {formatNumber(d.freeGB, 1)} GB boş
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Toggle
                label="VRAM değerini doğruladım"
                description="WMI’nin paylaşılan bellek raporları hatalı olabilir. Emin değilsen kapalı bırak."
                checked={h.vramCertain}
                onChange={(v) => hw("vramCertain", v)}
              />
              <div className="form-grid">
                <label>
                  Yüklü DirectX (bilgi amaçlı)
                  <input
                    value={h.directXInstalled}
                    onChange={(e) => hw("directXInstalled", e.target.value)}
                  />
                </label>
                <label>
                  Vulkan bilgisi
                  <input
                    value={h.vulkan}
                    onChange={(e) => hw("vulkan", e.target.value)}
                  />
                </label>
              </div>
              <div className="notice-box">
                <Info size={17} />
                <p>
                  Yüklü DirectX sürümü GPU’nun özellik düzeyi değildir. GPU’yu elle
                  değiştirirsen DirectX alanını da kontrol et. CPU/GPU tablosu küçük ve
                  yaklaşık olduğundan bilinmeyen/çok yakın modeller sarı kalır. Kaydedince
                  bütün oyunlar yeniden değerlendirilir.
                </p>
              </div>
            </>
          )}
          {tab === "search" && (
            <>
              <h3>Kaynakları nerede arayalım?</h3>
              <label>
                Arama sağlayıcısı
                <select
                  value={s.searchProvider}
                  onChange={(e) => update("searchProvider", e.target.value)}
                >
                  <option value="auto">Anahtarsız · DuckDuckGo / Bing RSS</option>
                  <option value="searxng">SearXNG</option>
                  <option value="brave">Brave Search API</option>
                </select>
              </label>
              <p className="muted">
                Anahtarsız sağlayıcılar CAPTCHA veya hız sınırı uygulayabilir. Sonuç
                uydurulmaz; hata ve yeniden dene gösterilir.
              </p>
              {s.searchProvider === "searxng" && (
                <label>
                  Herkese açık SearXNG temel adresi
                  <input
                    value={s.searxUrl}
                    onChange={(e) => update("searxUrl", e.target.value)}
                    placeholder="https://search.example.org"
                  />
                  <small>
                    JSON araması açık olmalı. Web aracı güvenliği nedeniyle localhost/özel
                    IP ve özel portlara izin verilmez.
                  </small>
                </label>
              )}
              {s.searchProvider === "brave" && (
                <label>
                  Brave API anahtarı
                  <input
                    type="password"
                    value={braveKey}
                    onChange={(e) => setBraveKey(e.target.value)}
                    placeholder={
                      data.hasBraveKey ? "Kayıtlı anahtar var" : "Anahtarını yaz"
                    }
                  />
                </label>
              )}
              {data.hasBraveKey && (
                <button
                  onClick={() =>
                    run("secret", { name: "brave", value: "" }, "Brave anahtarı silindi")
                  }
                >
                  Brave anahtarını sil
                </button>
              )}
              <div className="notice-box">
                <ShieldCheck size={18} />
                <p>
                  Sayfa getirme yalnızca herkese açık HTTP(S), 80/443, sınırlı boyut ve
                  süre kullanır. DNS/IP kontrolü ve yönlendirme kontrolü yapılır. Sayfa
                  scriptleri çalıştırılmaz. İndirilebilir dosyalar otomatik açılmaz.
                </p>
              </div>
            </>
          )}
          {tab === "data" && (
            <>
              <h3>Verin, senin elinde.</h3>
              <label>
                Veri klasörü<code className="data-path">{data.dataPath}</code>
              </label>
              <div className="button-row">
                <button disabled={!data.desktop} onClick={() => run("openDataFolder")}>
                  <FolderOpen size={15} />
                  Klasörü aç
                </button>
                <button
                  onClick={async () => {
                    await run("backup", {}, "Yedek oluşturuldu");
                    setBackups(await api.call("backups"));
                  }}
                >
                  <Database size={15} />
                  Şimdi yedekle
                </button>
              </div>
              <label>
                Önbellek süresi (saat)
                <input
                  type="number"
                  min={1}
                  max={8760}
                  value={s.cacheHours}
                  onChange={(e) => update("cacheHours", +e.target.value)}
                />
              </label>
              <h4>Dışa aktar</h4>
              <div className="button-row">
                {[
                  ["json", "Tam JSON yedeği"],
                  ["csv", "CSV tablosu"],
                  ["text", "Numaralı liste"],
                ].map(([format, label]) => (
                  <button
                    key={format}
                    onClick={async () => {
                      const r = await run("export", { format });
                      if (r) download(r.text, r.filename, r.mime);
                    }}
                  >
                    <Download size={14} />
                    {label}
                  </button>
                ))}
              </div>
              <p className="tiny muted">
                Tam JSON: oyunlar, sıra, gruplar, seriler, ayarlar, sohbetler ve oyun
                notların. API anahtarları dahil değildir. Kapak dosyaları ayrı media
                klasöründedir. CSV/metin içe aktarımı oyun adlarını alır; tam geri yükleme
                için JSON kullan.
              </p>
              <div className="upload-label">
                <span>Tam JSON yedeğini geri yükle</span>
                {/* Own Turkish button: the browser's file box showed English text
                    ("Choose File") on English Windows. */}
                <button type="button" onClick={() => fileInput.current?.click()}>
                  <Upload size={14} />
                  JSON yedek dosyası seç
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const f = input.files?.[0];
                    // Allow choosing the same file again after "Vazgeç".
                    input.value = "";
                    if (!f) return;
                    if (f.size > 128_000_000) {
                      toast("Yedek 128 MB sınırını aşıyor.", true);
                      return;
                    }
                    const text = await f.text();
                    modal("confirm", {
                      title: "Tam yedek geri yüklensin mi?",
                      text: "Mevcut oyunlar, ayarlar ve sohbetler yedekteki içerikle değiştirilecek. Önce mevcut durumun otomatik yedeği alınır. İçe aktarılan sistem yönergelerini kontrol et.",
                      onConfirm: () => run("import", { text }, "Yedek geri yüklendi"),
                    });
                  }}
                />
              </div>
              <h4>Otomatik yedekler</h4>
              <p className="tiny muted">
                Günlük ilk kayıtta ve içe aktarma öncesinde yedek alınır. Son 12 yedek
                korunur. Yeniden başlatmada bozuk ana dosya korunur ve sağlam yedek
                aranır.
              </p>
              <div className="backup-list">
                {backups.map((b) => {
                  const label = backupLabel(b.name);
                  return (
                    <div key={b.name} className="backup-row" title={b.name}>
                      <span>
                        {label.title}
                        <small>
                          {label.note ? label.note + " · " : ""}
                          {formatNumber(b.bytes / 1024, 1)} KB
                        </small>
                      </span>
                      <button
                        onClick={() =>
                          modal("confirm", {
                            title: "Yedek geri yüklensin mi?",
                            text:
                              label.title +
                              " tarihli yedeğin içeriği mevcut kitaplık, ayar ve sohbetlerin yerine geçecek. Önce güncel durum yedeklenecek.",
                            onConfirm: () =>
                              run("restore", { name: b.name }, "Yedek geri yüklendi"),
                          })
                        }
                      >
                        Geri yükle
                      </button>
                    </div>
                  );
                })}
                {!backups.length && <p className="muted">Henüz yedek yok.</p>}
              </div>
              <button
                className="danger subtle"
                onClick={() =>
                  modal("confirm", {
                    title: "Kapak önbelleği temizlensin mi?",
                    text: "Yerel kapak görselleri kaldırılır. Oyunlar, etiketler ve gruplar korunur; yenilemeyle görseller tekrar indirilebilir.",
                    danger: true,
                    onConfirm: () => run("clearCache", {}, "Kapak önbelleği temizlendi"),
                  })
                }
              >
                <Trash2 size={14} />
                Kapak önbelleğini temizle
              </button>
            </>
          )}
          {tab === "overlay" && (
            <>
              <h3>Oyun tanımlayıcı ve oyun içi gösterge</h3>
              <p className="tiny muted">
                Oyun öndeyken sağ üstte “Şimdi oynanıyor” ve seçtiğin değerler görünür;
                oyundayken {data.state.settings.overlay.hotkey.replace("Control", "Ctrl")}{" "}
                bu ayarları oyunun üstünde açar. Değişiklikler hemen kaydedilir.
              </p>
              <OverlayEditor
                settings={overlay}
                games={data.state.games.map((g) => ({ id: g.id, name: g.name }))}
                platform={data.desktop ? undefined : "web"}
                adapter={{
                  save: (patch) => api.call("overlaySettings", { patch }),
                  action: (name, args) => api.call("overlayAction", { name, args }),
                }}
                onChange={(o) => {
                  setOverlay(o);
                  setData((old) =>
                    old
                      ? {
                          ...old,
                          state: {
                            ...old.state,
                            settings: { ...old.state.settings, overlay: o },
                          },
                        }
                      : old,
                  );
                }}
                onMessage={(text, error) => toast(text, error)}
              />
            </>
          )}
          {tab === "updates" && <UpdatesSettings />}
          {tab === "shortcuts" && (
            <>
              <h3>Bir tuş kadar yakın.</h3>
              {[
                ["Ctrl + K", "Komut paleti"],
                ["Ctrl + I", "Toplu liste içe aktar"],
                ["Ctrl + N", "Tek oyun ekle"],
                ["Ctrl + Z", "Son kütüphane işlemini geri al"],
                ["Ctrl + A", "Odaklı listede görünen oyunları seç"],
                ["Ctrl / Shift + tık", "Çoklu / aralıklı seçim"],
                ["Alt + ↑ / ↓", "Seçili oyunu sırada taşı"],
                ["Delete", "Seçili oyunları silme onayı"],
                ["Enter", "Sohbette mesaj gönder"],
                ["Shift + Enter", "Sohbette yeni satır"],
                ["Escape", "Açık pencereyi kapat"],
                ["Ctrl + Tab (oyundayken)", "Oyun katmanı ayarları"],
                [
                  "F2 / Delete / Shift + Delete",
                  "Sohbet listesinde yeniden adlandır / sil / uyarısız sil",
                ],
              ].map(([key, label]) => (
                <div className="simple-row" key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
              <p className="muted tiny">
                Kendi serini listenin üstündeki “Yeni seri” ile veya oyuna sağ tıklayıp
                “Seri oluştur / seriye ekle” ile oluştur. Seri başlığını sürükleyerek
                seriyi, oyunun tutamacını sürükleyerek tek oyunu taşı. Üst grup çiplerine
                bırakınca grup değişir; sohbet paneline bırakınca bağlam eki olur. Özel
                gruba sağ tıklayarak adını/rengini/simgesini düzenle.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
