# 1.0.13 — Sağlayıcılar ve uygulama tarayıcısı

> 1.0.13: HowLongToBeat süreleri geri geldi. 1.0.12 bunları istenmeden kaldırmıştı; mağaza yenilemesi yine GOG ürün sayfasını, Codepotatoes topluluk API’sini ve gerekirse HLTB sayfasını okur. Steam dil tablosu / GOG dil kaydı okuma ve Türkçe yama araması 1.0.12’den beri kaldırılmış olarak kalır; tarihî bölümlerdeki bu konular yalnız kayıt amaçlıdır.

## Verinin gerçekten geldiği yer

| Özellik | Kullanılan kaynak | Bağlantı / davranış |
|---|---|---|
| Steam | `store.steampowered.com/api/storesearch`, `appdetails`, `appreviews` | Eşleşen `appId` ile doğrudan `/app/{id}/` |
| GOG | `catalog.gog.com/v1/catalog?query=...`, `api.gog.com/v2/games/{id}` | API’nin `storeLink` alanı; ada göre URL uydurulmaz |
| Epic Games | **EGData topluluk API’si**, `POST https://api.egdata.app/search/v2/search?country=TR&locale=en-US` | Katalogdaki `offerMappings` / `productSlug` ile Epic ürün URL’si; `urlSlug` bir ürün slug’ı varsayılmaz |
| Xbox | Microsoft `storeedgefd.dsx.mp.microsoft.com/v9.0/search` | API’nin ProductId değeriyle `xbox.com/tr-TR/games/store/-/{id}`; PC/konsol platformu ve çoklu sürüm durumu |
| HowLongToBeat | GOG ürün sayfasındaki HLTB bölümü → `hltbapi.codepotatoes.de/steam/{id}` veya POST `/hltb/search` → gerçek HLTB oyun sayfasındaki `__NEXT_DATA__` (sayfa adresi bilinmiyorsa arama sağlayıcısıyla `site:howlongtobeat.com/game/` araması) | Ana hikâye, ek içerik, %100, tüm tarzlar; kaynak + tarih. Doğrudan HLTB alanları saniyeden saate çevrilir |
| SteamDB | **Otomatik veri sağlayıcısı değil** | Bilinen Steam appId için `https://steamdb.info/app/{id}/` tarayıcı bağlantısı |

Bu kaynaklar için uygulamada ücretli API anahtarı istenmez. EGData, Epic’in resmi destekli API’si değildir. HLTB sayfası okuma ve Codepotatoes da resmi HLTB API’si olarak sunulmaz. API/sayfa biçimi veya erişim politikası değişebilir.

### SteamDB koşulu

15 Ekim 2026 incelemesinde SteamDB SSS’si API’yi gelecekteki bir olasılık olarak anlatıyordu; kullanılabilir genel ücretsiz API sunmuyordu. Aynı SSS otomatik kazımayı da yasaklıyor. Kullanıcının “ücretliyse veya API yoksa veri çekme” şartı nedeniyle metadata akışında SteamDB isteği, otomatik güncelleme notu/depot/satış geçmişi okuma veya kazıma alternatifi yoktur. Kullanıcı bağlantıyı normal tarayıcı gezintisi olarak açabilir.

Resmi SSS: [1](https://steamdb.info/faq/)

### Epic neden EGData?

Bu ortamda doğrudan Epic GraphQL denemesi 403, eski GraphQL host’u 404 döndürdü. Kimlik doğrulaması/CAPTCHA aşılmadı. Belgelenmiş ücretsiz public EGData API’si gerçek ürün sonuçları döndürdüğü için bu kaynak seçildi. Arayüzde **EGData · topluluk kataloğu** yazılır. Epic sayfasının kendisi bu sorguyla canlı doğrulanmış sayılmaz.

Public arama dokümanı: [1](https://docs.egdata.app/docs/offer-search)

Katalog türü yalnızca `BASE_GAME` ile sınırlandırılmıyor: Fortnite gibi bazı eski/ücretsiz PC kayıtları `OTHERS` türündedir. Aynı adlı mobil/PC teklifler varsa PC etiketi tercih edilir; aynı canonical URL’ye giden teklifler birleştirilir. Hâlâ birden fazla farklı ürün varsa otomatik seçim yapılmaz. Bu seçim, başlıktan URL üretmek değildir.

## “Yok” ve bağlantı hatası aynı şey değildir

- **Var:** Eşleşen ürün ve katalogdan gelen ürün bağlantısı var.
- **Bulunamadı:** Başarılı katalog sorgusunda bu adla kesin ürün eşleşmesi yok. Bütün bölgelerde/isimlerde/sürümlerde kesinlikle satılmıyor iddiası değildir.
- **Kontrol edilemedi:** Ağ, HTTP, JSON biçimi veya sağlayıcı sorunu. “Oyun yok” anlamına gelmez.
- **Eşleşme belirsiz:** Aynı adla birden fazla farklı ürün; adaylar ayrıntıda gösterilir.
- **Henüz bakılmadı:** Bu kayıtta yeni katalog kontrolü yapılmamış.

Steam, GOG, Epic ve Xbox sorguları ayrı yakalanır ve paralel yürütülür. Steam’de olmamak oyunu `fetchStatus:error` durumuna sokmaz. Sağlayıcı hatası diğer mağazayı, kişisel notları veya kütüphane kaydını yok etmez.

Başlık eşleştirmesi temkinlidir; farklı ad/edition/remaster aynı oyun varsayılmaz. Ajanın genel web arama aracında bu otomatik katalog filtresi uygulanmaz. Ajan hâlâ kaynak/alıntı zorunluluğu olmadan metadata düzenleyebilir.

## HLTB süreleri

- Gerçek süre verisi kalıcı `game.hltb` alanına yazılır; **Genel bakış → Ne kadar sürer?** kartları bu sayıları gösterir.
- GOG üzerinden alınmışsa **HowLongToBeat · GOG üzerinde yayımlanan süreler**, asıl HLTB oyun URL’si ve GOG kaynak URL’si saklanır. GOG’un kendi yayın gecikmesi olabilir. Codepotatoes yanıtındaki `lastUpdatedAt` kaynak güncellemesi olarak ayrı gösterilir.
- HLTB’nin kendi sayfası okunacaksa oyun adı kontrol edilir; yanlış devam oyununun süresi kaydedilmez. `comp_main`, `comp_plus`, `comp_100`, `comp_all` kullanılır. Kendi `playHours` kaydın ayrıdır.
- 403/CAPTCHA/erişim engeli aşılmaya çalışılmaz. Başarısızlık açıklanır; önceden başarılı değer varsa eski kontrol tarihiyle korunur.
- 1.0.12’nin sildiği süreler bir defalık olarak yedeklerden geri yüklenir; yedekte süresi olmayan, katalog bilgisi alınmış oyunlar açılışta “yalnız süre” işiyle tamamlanır (ayrıntı: `SINIRLAR.md`, 1.0.13 bölümü).

## Fiyatların tarihi ve önbellek

- EGData fiyatı, API’nin döndürdüğü TR kaydıdır. `price.updatedAt` geçmiş tarihli olabilir; “bugün alındı” ile “fiyat kaynağında bugün güncellendi” karıştırılmaz. Ödeme sayfası belirleyicidir.
- Varsayılan metadata önbelleği 168 saattir. **Tümünü yenile / Mağazaları yenile / Süreleri yenile** bu önbelleği atlar. Eski katalog kaydı `catalogVersion:105` taşımadığından yeni kaynak kontrolünü atlatmaz.

## Tarayıcı mimarisi

```text
Ana uygulama BrowserWindow
  preload: desktop.call -> app:call (ana pencere + ana frame denetimi)
  openExternal / openBrowser
       |
       v
AppBrowser — uygulamaya ait ayrı BrowserWindow
  browser.html + browser-ui.js
  browser-preload.cjs -> browser:command (yalnızca chrome penceresi + ana frame)
       |
       +-- WebContentsView / sekme 1 — preload yok
       +-- WebContentsView / sekme 2 — preload yok
       +-- ...
```

- Uzak siteler `window.desktop`, `window.browserChrome` veya Node `require` alamaz. Browser komutları yalnızca yerel chrome penceresinden kabul edilir.
- Sekmeler `persist:oyun-browser` oturumundadır; ana uygulama oturumundan ayrıdır. `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, `webSecurity:true`.
- Adres alanı HTTP(S) adresini açar; normal metni DuckDuckGo aramasına dönüştürür. Başlıktan ürün bağlantısı üretme işlemi değildir; bu kullanıcının elle açtığı tarayıcı aramasıdır.
- Yeni pencere isteyen bağlantılar uygulamadaki yeni sekmeye çevrilir. Dış protokoller/file/JavaScript URL’si açılmaz. Sertifika hataları atlanmaz. Uzak web sayfalarının site izinleri reddedilir.
- İndirilen dosyalar için kaydet diyaloğu vardır; otomatik çalıştırma yoktur. İndirme, Windows oturum açma/DRM ve site bazlı CAPTCHA uyumluluğu gerçek Windows üzerinde ayrıca kontrol edilmelidir.
- Kapatılan sekmenin WebContents’i kapatılır. Pencere kapanınca bütün sekmeler kapanır. Çerezler ayrı Chromium profilinde kalır; kütüphane JSON yedeğine girmez.
- EXE’de siteyi iframe içine yerleştirme yöntemi kullanılmaz. Geliştirme web önizlemesinde gerçek Electron WebContentsView yoktur; bu fark üst menüde açıklanır.

## Test kanıtları

- `tests/catalogs.test.ts`: 27 deterministik test; katalog eşleştirmesi, eksik/erişilemeyen kaynak ayrımı, iptal, eski önbellek, korunan AI alanları, bağlantı sınıflandırması HLTB süre okuma yolları ve 1.0.13’te tam yenilemenin HLTB isteği gönderip dil tablosu/yama araması yapmadığı; yalnız süre yenilemesinin mağaza sonucunu ve bilgi durumunu değiştirmediği, çevrimdışıyken hiçbir şey yazmadığı.
- `scripts/provider-smoke.ts`: isteğe bağlı gerçek internet kontrolü (mağazalar, süreler ve gereksinimler). 1.0.13 kaydı: `docs/canli-saglayicilar-1.0.13.txt` (Portal 2 → Codepotatoes, Hollow Knight → GOG HLTB bölümü, Fortnite → Codepotatoes araması). 1.0.5 tarihli önceki katalog kaydı `docs/canli-saglayicilar-1.0.5.jsonl` arşivdir; HLTB/yama içeren eski `revision105-live.ts` ve `patch-search-live.ts` scriptleri 1.0.12’de silindi.
- `scripts/browser-smoke.cjs`: gerçek Linux Electron penceresi; sekmeler, adres, popup, geri/ileri, Ctrl+L, IPC/oturum ayrılığı, file URL engeli ve yeniden açılış. Yerel fixture web sunucusu kullanır, gerçek mağaza oturum açma testi değildir.
- `scripts/catalog-ui-smoke.cjs`: isteğe bağlı canlı Steam/GOG/HLTB verisiyle Stardew Valley’in masaüstü mağaza ve süre kartları; ikinci aşamada 1.0.12’nin bıraktığı “mağaza var, süre yok” durumunu kurup arka plan tamamlamasının süreleri getirdiğini, bilgi durumunu/mağazaları değiştirmediğini ve araştırma başlatmadığını kontrol eder. 1.0.13 kaydı: `docs/canli-magazalar-1.0.13.txt`, `docs/sure-tamamlama-canli-1.0.13.png`.
- `docs/tarayici-1.0.5.png` gerçek Xvfb masaüstü görüntüsüdür. Sadece chrome sayfasının Playwright ekran görüntüsü native WebContentsView katmanını içermez; bu nedenle pencere kompoziti alınmıştır.

**Gerçek Windows çalıştırma ve kullanıcının gerçek LM Studio modeli bu ortamda test edilmedi.**


## Otomatik AI araştırması

`Service` metadata kuyruğundan bağımsız bir araştırma kuyruğu tutar. `Agent.research` oyun başına ayrı sohbetle gerçek araç döngüsünü kullanır; sadece özet yazan yanıtlarla durumun doldurulduğu varsayılmaz. `record_compatibility` model/tarih/açıklama ve isteğe bağlı kaynakla sonuç kaydeder. `shared/compatibility.ts` yalnızca güncel bağlamdaki belirsiz satırlara bu sonuçları uygular.

1.0.12’de araştırma yalnız **donanım** ve (ayar açıksa) **özet** aşamalarıdır. Türkçe yama keşfi (`check_turkish_patch`), `patchSearchRevision:106` toplu yeniden araştırma geçişi ve `turkish.reviewPending` kaldırıldı. Eski canlı arama kaydı `docs/genel-yama-arama-1.0.6.jsonl` tarihî arşiv olarak durur.

Oyun ayrıntısındaki **Not** sekmesinin metni hiçbir sağlayıcıya, arama motoruna veya model sunucusuna gönderilmez.

## 1.0.7 araştırma düzeni

`electron/research-plan.ts` 1.0.12’de ayrı donanım ve isteğe bağlı özet aşamalarını oluşturur (1.0.7–1.0.11 arasında resmi dil/HLTB ve yama aşamaları da vardı). `Agent.research` bu aşamaları ayrı model turlarıyla tek yeni iş sohbetinde yürütür; sohbetin önceki aşamaları kesilmez, eski iş sohbetleri saklanır. Ajanın araç seti daraltılmaz ve yeni araç tur kotası yoktur. Her aşamadaki gerçek kayıtlar anında kalıcı veriye uygulanır; sonraki aşamada Durdur önceki kayıtları silmez.

`electron/tool-input.ts` yalnızca belirsiz olmayan JSON sarmallarını açar; bozuk girdiye onarım geri bildirimi üretir. Eski hatalı native araç geçmişinin dışarı gönderilen zarfını normalleştirir; ham girdi ve orijinal sonuç korunur. `scripts/research-smoke.cjs` gerçek Linux Electron + yerel HTTP/SSE fixture ile donanım/özet sırasını, özet aşamasındaki bozuk çağrının reddini ve düzeltilmiş çağrının kaydını doğrular. Gerçek kullanıcı modeliyle çıkarım yapılmış değildir.

## 1.0.8 çıktı aktarımı

`Agent.context` artık karakter sayısından çıktı bütçesi hesaplamaz. `LMClient.stream` normal ajan yolunda `max_tokens: settings.maxTokens`, desteklenen düşünme yolunda `max_output_tokens: settings.maxTokens` gönderir. Araç açıklamaları ve tam sohbet/araç sonuçları korunur. `scripts/research-smoke.cjs` artık 16128 seçimi, 16384 bağlam bilgisi ve eski hesabı 128’e düşüren uzun fixture ile 9 gerçek HTTP isteğinde seçilen limitin korunduğunu da doğrular. Bu fixture gerçek model kapasitesi/kalitesi testi değildir.
