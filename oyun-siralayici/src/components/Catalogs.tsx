import { effectiveStoreCheck, hasCompletionHours } from "../../shared/catalog-state";
import { isStoreProductLink } from "../../shared/links";
import { ArrowUpRight, Clock3, Globe2, RefreshCw, Link2, Database } from "lucide-react";
import type { Game, StoreCheck } from "../../shared/types";
import { useApp } from "../lib/context";
import { date, external } from "../lib/api";
export function StoreCards({ game }: { game: Game }) {
  const { run, modal } = useApp();
  const busy = ["loading", "queued"].includes(game.fetchStatus);
  const labels: Record<StoreCheck["status"], string> = {
    found: "Var",
    not_found: "Bulunamadı",
    unavailable: "Kontrol edilemedi",
    review: "Eşleşme belirsiz",
  };
  const providers = ["Steam", "GOG", "Epic Games", "Xbox"] as const;
  return (
    <section className="detail-section catalog-section">
      <div className="section-title">
        <h3>Mağazalar</h3>
        <button
          className="text-link"
          disabled={busy}
          onClick={() => run("refresh", { ids: [game.id], force: true })}
        >
          <RefreshCw size={13} />
          {busy ? "Kontrol ediliyor…" : "Tümünü yenile"}
        </button>
      </div>
      <p className="muted">
        {game.origin?.store === "none"
          ? "Bu oyun platform seçilmeden eklendi; mağazalara bakılmaz. Bir mağazadaki sürümünü istersen oyunu silip Oyun ekle’den o platformla ekleyebilir veya Steam oyununu seçebilirsin."
          : "Bulunan ürünler doğrudan açılır. Steam’de bulunmayan oyunlar da kütüphanende kalır."}
      </p>
      <div className="catalog-cards">
        {providers.map((name) => {
          const check = effectiveStoreCheck(game, name),
            store = game.stores.find((s) => s.name === name);
          const candidateURL = check
            ? check.status === "found"
              ? check.url || store?.url
              : undefined
            : store?.url;
          const usableURL =
            candidateURL && isStoreProductLink(name, candidateURL)
              ? candidateURL
              : undefined;
          const state = check
            ? labels[check.status]
            : store
              ? "Kayıtlı"
              : busy
                ? "Kontrol ediliyor"
                : game.origin?.store === "none"
                  ? "Platform yok"
                  : "Henüz bakılmadı";
          return (
            <article className="catalog-card" key={name} data-testid={"catalog-" + name}>
              <div className="catalog-card-heading">
                <span
                  className={
                    "store-mark " +
                    (name === "GOG" ? "gog" : name === "Steam" ? "steam" : "epic")
                  }
                >
                  {name === "Epic Games"
                    ? "EPIC"
                    : name === "Steam"
                      ? "S"
                      : name === "Xbox"
                        ? "X"
                        : "gog"}
                </span>
                <div>
                  <h4>{name}</h4>
                  <small>{check?.source || store?.source || "Ürün kataloğu"}</small>
                </div>
                <span className={"badge " + (check?.status === "found" ? "good" : "")}>
                  {state}
                </span>
              </div>
              <div className="catalog-card-content">
                <span className="catalog-price">
                  {usableURL
                    ? store?.price || "Fiyat bilgisi alınmadı"
                    : check?.status === "not_found"
                      ? "Bu adla ürün kaydı yok"
                      : check?.status === "unavailable"
                        ? "Bağlantı kurulamadı; yok demek değil"
                        : "Ürün bilgisi bekleniyor"}
                </span>
                {usableURL && (
                  <button className="soft" onClick={() => external(usableURL)}>
                    Ürün sayfası
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
              {(check || store?.checkedAt) && (
                <div className="catalog-dates">
                  Kontrol: {date(check?.checkedAt || store?.checkedAt)}
                  {store?.price && (
                    <>
                      {" "}
                      · Fiyat verisi:{" "}
                      {date(
                        store.priceUpdatedAt || check?.priceUpdatedAt || store.checkedAt,
                      )}
                    </>
                  )}
                </div>
              )}
              {check?.message ||
              check?.candidates?.length ||
              (name === "Steam" && game.candidates?.length) ? (
                <details className="catalog-details">
                  <summary>Kaynak / eşleşme ayrıntısı</summary>
                  {check?.message && <p>{check.message}</p>}
                  {check?.candidates?.map((c, i) => (
                    <button className="text-link" key={i} onClick={() => external(c.url)}>
                      {c.name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                  {name === "Steam" &&
                    game.candidates?.map((c) => (
                      <button
                        className="text-link"
                        key={c.appId}
                        onClick={() => run("match", { id: game.id, appId: c.appId })}
                      >
                        {c.name} · Bu oyunla eşleştir
                      </button>
                    ))}
                </details>
              ) : null}
              {name === "Steam" && (
                <div className="catalog-secondary">
                  <button className="text-link" onClick={() => modal("match", { game })}>
                    <Link2 size={12} />
                    Eşleşmeyi düzenle
                  </button>
                  {game.appId && (
                    <button
                      className="text-link"
                      onClick={() => external(`https://steamdb.info/app/${game.appId}/`)}
                    >
                      <Database size={12} />
                      SteamDB
                      <ArrowUpRight size={12} />
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {game.stores
        .filter(
          (s) => !providers.includes(s.name as any) && isStoreProductLink(s.name, s.url),
        )
        .map((s, i) => (
          <button className="store-link" key={i} onClick={() => external(s.url)}>
            <Globe2 size={18} />
            <span>
              <strong>{s.name}</strong>
              <small>
                {s.name === "My Abandonware"
                  ? "Oyunun eklendiği arşiv sayfası"
                  : "Kayıtlı bağlantı"}
              </small>
            </span>
            <b>{s.name === "My Abandonware" ? "" : s.price || "Fiyat bilinmiyor"}</b>
            <ArrowUpRight size={15} />
          </button>
        ))}
      <p className="tiny muted">
        Fiyatlar Türkiye bölgesi için kaynaktaki para birimiyle gösterilir; ödeme sayfası
        belirleyicidir. Epic verisi ücretsiz EGData topluluk API’sinden gelir. SteamDB
        yalnızca tarayıcıda açılır; otomatik veri toplanmaz. Xbox kaydı Game Pass üyeliği
        anlamına gelmez; PC / konsol platformunu ürün sayfasında kontrol et.
      </p>
    </section>
  );
}
export function PlayTimes({ game }: { game: Game }) {
  const { run } = useApp(),
    value = game.hltb;
  return (
    <section className="detail-section playtime-section">
      <div className="section-title">
        <h3>
          <Clock3 size={16} /> Ne kadar sürer?
        </h3>
        <span>HowLongToBeat</span>
      </div>
      <div className="playtime-grid">
        {(
          [
            ["Ana hikâye", value?.main],
            ["Hikâye + yan içerik", value?.mainExtra],
            ["%100 tamamlama", value?.completionist],
          ] as const
        ).map(([label, hours]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>
              {hours !== undefined
                ? hours.toLocaleString("tr-TR", { maximumFractionDigits: 1 })
                : "—"}
              {hours !== undefined && <em>saat</em>}
            </strong>
          </div>
        ))}
      </div>
      {value?.status === "found" && hasCompletionHours(value) ? (
        <p className="tiny muted">
          {value.via || "HowLongToBeat"} · {date(value.checkedAt)}. Topluluk süreleri;
          kişisel oynama süren değildir.
          {value.sourceUpdatedAt && (
            <> Kaynak güncellemesi: {date(value.sourceUpdatedAt)}.</>
          )}
          {value.allStyles !== undefined && (
            <>
              {" "}
              Tüm tarzlar:{" "}
              {value.allStyles.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}{" "}
              saat.
            </>
          )}
        </p>
      ) : (
        <p className="tiny muted">
          {value?.status === "not_found"
            ? "Eşleşen kayıtta süre verisi yok."
            : value
              ? "Süre verisi şu anda alınamadı. Kayıtlı eski süre varsa yukarıda korunur."
              : "Süreler henüz alınmadı. Yenileme sırasında uygulama veriyi getirir."}
        </p>
      )}
      <div className="button-row">
        <button
          className="text-link"
          disabled={["loading", "queued"].includes(game.fetchStatus)}
          onClick={() => run("refresh", { ids: [game.id], force: true })}
        >
          <RefreshCw size={13} />
          Süreleri yenile
        </button>
        {value?.url && (
          <button className="text-link" onClick={() => external(value.url!)}>
            HLTB oyun sayfası
            <ArrowUpRight size={13} />
          </button>
        )}
        {value?.sourceUrl && value.sourceUrl !== value.url && (
          <button className="text-link" onClick={() => external(value.sourceUrl!)}>
            Verinin alındığı sayfa
            <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {value?.message && (
        <details className="catalog-details">
          <summary>Bağlantı ayrıntısı</summary>
          <p>{value.message}</p>
          <small>Son deneme: {date(value.attemptedAt || value.checkedAt)}</small>
        </details>
      )}
    </section>
  );
}
