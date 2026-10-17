# 1.0.13 — “Ne kadar sürer?” geri geldi

16 Ekim 2026.

## İstenen

> “ne kadar sürer kısmını neden sildin? Sana onu sil demedim, sadece araştırma aşamalarından sil dedim. derhal sorunsuz geri ekle.”

1. HowLongToBeat süreleri ve **Ne kadar sürer?** bölümü 1.0.11’deki gibi geri gelecek.
2. Kaldırılan şey yalnızca otomatik araştırmanın süre aşaması olarak kalacak.
3. “Sorunsuz”: 1.0.12 kullanırken silinen süreler kullanıcı bir şey yapmadan geri gelecek; hata bandı veya yeniden araştırma olmayacak.
4. Depolama: kaynak ZIP’i çalışma alanında tutmak yerine, mümkünse geçici dosya yükleme sitesine yüklemek.

## Ne yanlış yapılmıştı?

1.0.12’de istenen “son araştırma aşamasını (resmi dil + How Long To Beat) kaldırmak” idi. Bu istek, HowLongToBeat özelliğini **tamamen** kaldırmak olarak uygulandı. Kaldırılanlar şunlardı: arayüzdeki bölüm, `Game.hltb` alanı, mağaza yenilemesindeki süre istekleri, ajanın `update_game_info.hltb` alanı ve `refresh_game_info` içindeki HLTB. Ayrıca 1.0.12’nin bir defalık yükseltme geçişi kayıtlı süreleri `library.json` dosyasından sildi. Bu bir yorum hatasıydı. Doğru kapsam yalnızca araştırma aşamasıydı.

## Geri gelenler (1.0.11 ile aynı davranış)

| Alan | Geri gelen |
|---|---|
| Arayüz | **Genel bakış → Ne kadar sürer?**: Ana hikâye, Hikâye + yan içerik, %100 tamamlama; kaynak/tarih satırı (varsa tüm tarzlar ve kaynak güncelleme tarihi); **Süreleri yenile**, **HLTB oyun sayfası**, **Verinin alındığı sayfa**. Bölüm 1.0.11’deki yerinde (Oyun hakkında ile Oynanış & benzer dünyalar arasında) |
| Veri | `Game.hltb` (`CompletionTimes`), şeması, HowLongToBeat kaynak kaydı (`fields: ["hltb"]`), `hltb…` AI düzenleme işaretleri |
| Ağ | Mağaza yenilemesinde süre okuma: GOG ürün sayfasındaki HLTB bölümü → Codepotatoes topluluk API’si (`/steam/{appId}` veya ad araması) → HLTB oyun sayfası (adres bilinmiyorsa arama sağlayıcısıyla bulunur) |
| Ajan | `refresh_game_info` süreleri de yeniler; `update_game_info.hltb` kısmi düzeltme yapar (diğer saatler korunur, `found` için en az bir sayısal süre gerekir). Araç sayısı yine **25**; araç kartı etiketi “Mağaza ve süre bilgilerini yenileme” |

`electron/catalogs.ts`, 1.0.11’e göre yalnızca Türkçe dil kaydı okuma bloğunun çıkarılmasıyla farklıdır. `PlayTimes` bileşeni 1.0.11 ile birebir aynıdır.

## Kaldırılmış olarak kalanlar (1.0.12’den)

- **DİL VE SÜRE** ve **TÜRKÇE YAMA** araştırma aşamaları. Otomatik araştırma yalnızca **Donanım → Özet** (özet ayarı açıksa) aşamalarıdır. Araştırmanın tamamlanması sürelere bağlı değildir; süre bulunamaması araştırmayı “eksik” yapmaz.
- Türkçe sekmesi, resmi Türkçe dil alanları, Steam dil tablosu / GOG dil kaydı okuma, Türkçe yama araması/kaydı, Türkçe filtresi/rozeti, toplu “Türkçe yama araştırması” düğmesi.
- **Not** sekmesi aynen durur ve ajan ona erişemez.

## 1.0.12’nin sildiği sürelerin onarımı

1. **Yedekten geri yükleme (bir defa, internet gerekmez).** 1.0.12’nin yazdığı bir dosya (`notes` alanı var, `migrations` içinde `1.0.13-hltb` yok) ilk açıldığında `backups/library-*.json` en yeniden eskiye okunur. Süresi olmayan her oyun için aynı kimlikteki en yeni yedek süresi, HowLongToBeat kaynak kayıtları ve `hltb…` AI işaretleri geri yüklenir. Türkçe alanlar geri getirilmez. Mevcut süre kaydı korunur, yedek dosyaları değiştirilmez, okunamayan yedek atlanır. Sonra işaret kaydedilir ve onarım bir daha çalışmaz. 1.0.12’de alınmış bir yedeği geri yüklemek veya JSON olarak içe aktarmak da aynı onarımı yapar.
2. **Arka planda yalnız süre tamamlama.** Açılışta ve geri yükleme/içe aktarma sonrasında, katalog bilgisi alınmış (`catalogCheckedAt`) ama süre kaydı olmayan oyunlar sıraya “yalnız süre” işi olarak girer. Örnek: 1.0.12 açıkken eklenen veya yenilenen oyunlar. Üst şeritte **Oyun süreleri tamamlanıyor** ve **Durdur** görünür. Bu iş mağaza sonuçlarını, `fetchStatus`/`fetchError` alanlarını ve AI araştırma sırasını değiştirmez. Aynı oyun için tam yenileme istenirse bekleyen iş tam yenilemeye yükseltilir.
3. **İnternet yoksa.** GOG kataloğuna da ulaşılamıyorsa ve süre bulunamadıysa hiçbir şey yazılmaz. Bekleyen diğer süre işleri bırakılır ve bir sonraki açılışta yeniden denenir. Böylece çevrimdışı açılış oyunları kalıcı olarak “alınamadı” diye işaretlemez.
4. **1.0.11 veya öncesinden doğrudan geçiş.** Süreler zaten korunur; yalnız Türkçe alanlar bir kez temizlenir (öncesinde `…-yukseltme-oncesi.json` yedeği alınır). Yeni kütüphaneler işaretli başlar ve yedek taramaz.

## Değişen dosyalar (1.0.12 kaynağına göre)

- `shared/types.ts`, `electron/validation.ts`: `CompletionTimes`, `Game.hltb`, şema; `AppState.migrations`, `QueueState.timesOnly`.
- `shared/domain.ts`: `HLTB_RESTORE_MIGRATION`; `shared/catalog-state.ts`: `hasCompletionHours`; `shared/research-progress.ts`: yalnız açıklama.
- `electron/catalogs.ts`, `electron/providers.ts`: HLTB okuma yolları, `completionTimes`, `refreshTimes`, sırada yalnız süre işleri ve çevrimdışı davranış.
- `electron/research.ts`, `electron/tools.ts`: `update_game_info.hltb`, `refresh_game_info` açıklaması.
- `electron/store.ts`: Türkçe-only eski veri temizliği, `restoreTimes` onarımı; `electron/service.ts`: arka plan süre tamamlama.
- `src/components/Catalogs.tsx` (`PlayTimes`), `Detail.tsx`, `Chat.tsx`, `App.tsx` (şerit metni), `style.css`.
- Testler: yeni `tests/revision113.test.ts` (9) ve `tests/ui/revision113.spec.ts` (1). 1.0.11’deki HLTB testleri geri geldi (`catalogs`, `revision109`, `app.spec`, `revision109.spec`). `revision106`, `revision112`, `research`, `revision112.spec` uyarlandı.
- Betikler: `upgrade-smoke.cjs` (1.0.12 dosyası + yedek → süreler geri ve ekranda), `catalog-ui-smoke.cjs` (canlı arka plan tamamlama aşaması; bekleme Node tarafında gerçek değeri sorgulayacak biçimde düzeltildi), `research-smoke.cjs`, `provider-smoke.ts`.

## Doğrulama özeti

Ayrıntı ve paket sonuçları: [TEST-RAPORU.md](../TEST-RAPORU.md).

- Prettier ve TypeScript geçti. **313/313** birim/entegrasyon (19 dosya), **36/36** Playwright arayüz testi.
- Linux Electron: açılış/IPC, sekmeli tarayıcı, aşamalı araştırma (yalnız DONANIM → ÖZET), devam/baştan ve **yükseltme** senaryoları geçti. Yükseltme senaryosunda 1.0.11 dosyasının süreleri korundu. Ardından 1.0.12 biçimli süresiz dosya, yükseltme öncesi yedekten onarıldı ve **Ne kadar sürer?** bölümünde “7 saat” göründü (`docs/yukseltme-sureler-1.0.13.png`).
- Duyarlılık: geri yükleme çağrısı kasıtlı olarak devre dışı bırakılınca `revision113` testlerinden üçü kırıldı; geri alınınca geçti.
- **Canlı ağ (16 Ekim 2026):** Stardew Valley için Steam/GOG/Xbox bulundu, Epic bulunamadı. Süreler GOG’daki HLTB bölümünden geldi: 53 / 94,5 / 172,5 saat. 1.0.12 durumu kurulunca arka plan tamamlaması süreleri yeniden getirdi; bilgi durumu (`done`), mağazalar ve araştırma değişmedi (`docs/canli-magazalar-1.0.13.txt`, `docs/sure-tamamlama-canli-1.0.13.png`). Sağlayıcı katmanı: Portal 2 → Codepotatoes 8,59 / 13,76 / 22,96; Hollow Knight → GOG HLTB 27 / 41,5 / 65,5; Fortnite → Codepotatoes araması 66,1 / 180,2 / 519,79 saat (`docs/canli-saglayicilar-1.0.13.txt`).

**Denenmeyenler:** gerçek Windows, gerçek LM Studio modeli ve senin gerçek 1.0.12 kütüphanen/yedeğin. Onarım, aynı biçimde hazırlanmış test dosyalarıyla denendi. Canlı sonuçlar o anki sağlayıcı yanıtlarıdır; Codepotatoes veya HLTB sitesi değişirse süre “alınamadı” görünebilir.
