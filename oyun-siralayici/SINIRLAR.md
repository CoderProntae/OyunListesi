# 1.0.13 — kaldırılan engeller ve kalan teknik koşullar

Bu liste modelin zekâsı hakkında bir değerlendirme değil; uygulamanın hangi kontrolleri uyguladığının dökümüdür.

## 1.0.13 — HowLongToBeat süreleri geri geldi

- **Geri getirildi (1.0.11 davranışı):** `Game.hltb` ve şeması, mağaza yenilemesindeki süre okuma sırası (GOG ürün sayfasındaki HLTB bölümü → Codepotatoes topluluk API’si `/steam/{appId}` veya ad araması → HLTB oyun sayfası; sayfa adresi bilinmiyorsa arama sağlayıcısı), “Ne kadar sürer?” bölümü, HowLongToBeat kaynak kaydı, `refresh_game_info` içinde HLTB ve `update_game_info.hltb` kısmi güncellemesi (`found` için en az bir sayısal süre gerekir). Ajan araç sayısı yine **25**.
- **Araştırmaya bağlı değil:** araştırma aşamaları yine yalnız `hardware` ve isteğe bağlı `summary`. `researchProgress` süreleri hiç hesaba katmaz; süre bulunamaması araştırmayı eksik bırakmaz.
- **Bir defalık onarım:** `library.json` içindeki `migrations` listesi `1.0.13-hltb` işaretini taşır. İşaret yalnız 1.0.12’nin yazdığı dosyalarda (`notes` alanı var, işaret yok) eksiktir; o zaman `backups/library-*.json` dosyaları en yeniden eskiye okunur. Okunamayan/bozuk yedek atlanır. Süresi olmayan her oyun için aynı kimlikteki en yeni yedek süresi, HowLongToBeat kaynak kayıtları ve `hltb…` AI düzenleme işaretleri geri yüklenir. Mevcut süre kaydı her zaman korunur, yedekler değiştirilmez, işaret kaydedilir ve onarım bir daha çalışmaz. 1.0.12 biçimli bir yedeğin geri yüklenmesi veya içe aktarılması da aynı onarımı tetikler. 1.0.11 ve öncesinin dosyalarında süreler zaten korunur (yalnız Türkçe alanlar temizlenir); yeni kütüphaneler işaretli başlar.
- **Arka planda yalnızca süre tamamlama:** açılışta ve geri yükleme/içe aktarma sonrasında `catalogCheckedAt` olan ama `hltb` kaydı olmayan oyunlar, sıraya “yalnız süre” işi olarak girer. Bu iş mağaza sonuçlarına, `fetchStatus`/`fetchError` alanlarına ve AI araştırma sırasına dokunmaz; hata bandı göstermez. Aynı oyun için tam yenileme istenirse bekleyen süre işi tam yenilemeye yükseltilir. **Durdur** yalnız süre işlerinin oyun durumunu değiştirmez; kalanlar sonraki açılışta yeniden seçilir.
- **İnternet yoksa:** GOG kataloğu da erişilemez ve süre bulunamazsa hiçbir şey yazılmaz, bekleyen diğer süre işleri bırakılır ve sonraki açılışta yeniden denenir. GOG yanıt verir ama süre kaynaklarına ulaşılamazsa normal yenilemedeki gibi “alınamadı” kaydedilir; bu oyunlar kendiliğinden yeniden denenmez, **Süreleri yenile** kullanılır.
- **Sınır:** yedek döngüsü en yeni 12 dosyayı tutar. 1.0.12’nin günlük yedeklerinde süre yoktur; yükseltme öncesi yedek döngüden çıkmışsa süreler yedek yerine arka plan tamamlamasıyla internetten gelir. Yedekten geri gelen süreler eski kontrol tarihini taşır; yeni alınmış gibi gösterilmez.

## 1.0.12 — kaldırılan özellikler ve Not sekmesi

- **Kaldırıldı (gizlenmedi):** Türkçe sekmesi; resmi Türkçe arayüz/ses/altyazı alanları (`Game.turkish`); Türkçe yama araması ve kaydı (`check_turkish_patch` aracı, `patchSearch` IPC çağrısı, elle yama penceresi); HowLongToBeat verisi (`Game.hltb`), sağlayıcıları (GOG HLTB bölümü, Codepotatoes API, HLTB sayfası) ve “Ne kadar sürer?” bölümü *(bu kısım istenmeden kaldırılmıştı; 1.0.13’te geri getirildi)*; Steam dil tablosu ve GOG dil kaydı okuma; Türkçe filtresi/rozeti; “DİL VE SÜRE” ve “TÜRKÇE YAMA” araştırma aşamaları; 1.0.6 yama yeniden araştırma geçişi (`patchSearchRevision`). Ajan araç sayısı **25**.
- **Araştırma aşamaları:** yalnızca `hardware` ve (özet ayarı açıksa) `summary`. Tamamlanma yine kaydedilmiş sonuçlardan hesaplanır (`shared/research-progress.ts`). Eski dosyadaki `research.stage: details/patch` yüklenirken atılır; yalnız bu aşamalar yüzünden eksik görünen kayıt bir defalık yeniden değerlendirilir. Hiçbir oyun kendiliğinden yeniden kuyruğa alınmaz; açık durdurma korunur. Kalan aşaması olmayan devam, model çağırmadan ve boş araştırma sohbeti açmadan biter.
- **Bir defalık geçiş:** `turkish` taşıyan dosya (1.0.12’de `hltb` taşıyan dosya da; 1.0.13 süreleri temizlemez) yüklenmeden önce dokunulmamış kopyası `backups/library-<zaman>-yukseltme-oncesi.json` olarak alınır (normal 12 yedek döngüsüne girer). Yalnız kaldırılan alanları anlatan kaynak kayıtları ve `aiEditedFields` girdileri temizlenir; mağaza/gereksinim kaynakları korunur. Boş varsayılan “Türkçe Yama Yok” koleksiyonu kaldırılır, oyun içeren aynı adlı koleksiyon korunur. Eski yedekler ve tarihî sohbet metinleri değiştirilmez.
- **Not sekmesi:** oyun başına tek serbest metin; en fazla 20.000 karakter; boş/yalnız boşluk metin notu siler. `library.json` içinde oyun kayıtlarından ayrı `notes` alanında, oyun kimliğine göre tutulur. Masaüstünde yalnız `note` IPC çağrısıyla yazılır; değişiklik yalnız uygulama penceresine `note` olayıyla gider.
- **Ajan erişimi yok:** not hiçbir ajan aracının girdisinde/çıktısında, araç şemasında, sistem/aşama talimatında, sohbet geçmişinde veya araştırma isteğinde yer almaz; `edit_game`/`update_game_info` not alanı kabul etmez. Uygulama tarayıcısının ayrı köprüsü de notlara erişmez. Testler bu durumu modele giden istek gövdelerinde ve araç sonuçlarında bilinen bir not metnini arayarak doğrular.
- **Geri alma/yedek:** Ctrl+Z oyun/grup/seri anlık görüntülerini geri yükler; notları geri almaz ve onları ezmez. Oyun silinince notu oturum boyunca durur (Ctrl+Z ile oyun geri gelirse not yerindedir), sonraki açılışta silinmiş oyunların notları atılır. Ajan da bir oyunu silebildiğinden (geri alınabilir) o oyunun notu bu kurala tabidir; ajan notu okumaz. Tam JSON dışa aktarımı ve otomatik yedekler notları içerir; CSV/metin içermez. Notu olmayan eski yedek geri yüklenirse mevcut notlar korunur; notlu yedekteki not, aynı oyunun mevcut notunun yerine geçer. Bozuk tek not girdisi atılır, kütüphanenin tamamı okunamaz hale gelmez.
- Notlar diğer kütüphane verileri gibi şifrelenmeden yerel JSON dosyasında durur; dosya erişimi işletim sistemi kullanıcı korumasına bağlıdır.

## Artık uygulanmıyor

- Varsayılan işlem öncesi onay. Otonom modda **silme dahil** bütün tanımlı kütüphane araçları doğrudan yürütülür.
- Araştırılmış veri kaydetmek için zorunlu kaynak, alıntı veya önceden sayfa okuma.
- Alıntının sayfada birebir bulunması ve her alan için ayrı kanıt.
- Veri düzenlemelerini arama başlığına veya önceden indirilmiş alıntıya bağlayan zorunlu kanıt zinciri. Tekrarlı “güvenilmez” etiketleri yoktur.
- Public web sitelerinde yalnızca 80/443 kullanma şartı.
- Araçlarda 10 tur / tek yanıtta 8 çağrı kotası.
- Otomatik geçmiş sıkıştırması, 16K varsayımı, 65K geçmiş / 22K sonuç kesmesi.
- Model akışında 5 dakika toplam zaman sınırı ve SSE zarfında 2MB toplam sınır.
- AI özeti üretmek için önceden açıklama alma şartı.
- Türkçe dil/yama özellikleri ve “DİL VE SÜRE” / “TÜRKÇE YAMA” araştırma aşamaları: 1.0.12’de kaldırıldı. (HowLongToBeat süreleri araştırma aşaması olmadan, mağaza yenilemesinin parçası olarak 1.0.13’te geri geldi.)

## İsteğe bağlı

**İşlem öncesi onay iste** ayarı varsayılan kapalıdır. Açarsan izin penceresi ve sohbet başına izinler kullanılabilir. Okuma araçlarının onayı da yalnızca bu modda geçerlidir. Soru sihirbazı bir izin kapısı değil, kullanıcının tercihlerini öğrenme aracıdır.

## Hâlâ geçerli olanlar

- **Gerçek model bağlamı/çıktısı, VRAM ve sunucu protokolü.** Uygulama bunları büyütemez. Konuşma gönderilmeden gizlice atılmaz; model sunucusu kapasite hatası verirse hata gösterilir. 1.0.8’de karakter sayısına göre kalan bağlam tahmini ve çıktı sınırını 128’e kadar düşürme kaldırıldı. Ajan için seçilen çıktı sınırı aynen gönderilir; yüklü bağlam bilgisi bunu daraltmaz. Sunucunun gerçek kapasite/çıktı sınırlaması yine geçerlidir.
- **Veri biçimi:** geçerli oyun kimliği, mevcut alan adları, sayı/boolean/metin türleri ve uygulamanın veri şeması. Örneğin puan alanı 0–10’dur. Kimlik, ayar, ham dosya yolu veya komut, oyun bilgisi alanı değildir. Bu uygulama rastgele dosya silme veya shell çalıştırma aracı sunmaz.
- **Web bağlantısı:** HTTP(S), URL içinde gömülü parola yok, özel/rezerve ağ adreslerine web sayfası aracından erişim yok; DNS/yönlendirme kontrolleri sürer. Kullanıcının ayarladığı yerel LM Studio bağlantısı bundan ayrıdır. Ajanın sayfa getirme aracı HTML/JS kodu çalıştırmaz. Yeni uygulama tarayıcısı ise ayrı ve uygulama IPC’si olmayan Chromium sekmelerinde normal web sayfası olarak JS çalıştırır. Kullanıcının elle yaptığı HTTP(S) gezinme, ajan web araçlarının özel ağ filtresinden ayrı bir özelliktir. Bu kontroller içerik veya model hakkında “güvenilmez” kararı vermez.
- **İndirme ve kayıt belleği:** web isteği varsayılan 2MB / 18sn; sağlayıcılar bazı isteklerde farklı boyut seçer. Sayfa bölümü varsayılan 8.000, istenirse 100.000 karaktere kadar; sonraki bölüm okunabilir. Sayfa önbelleği 40 URL × en çok 10 sohbet; gerektiğinde yeniden indirilir. Tek metin/düşünme yanıtı 1 milyon karakter, tamamlanmamış tek SSE çerçevesi 4 milyon karakter; araç argümanları 50.000 karakter. Bunlar tur sayısı kotaları değildir.
- **Toplu veri/kalıcılık:** kütüphane 20.000 oyun, tek aktarımda 5.000 satır, 100 kullanıcı sohbeti ve ayrı otomatik araştırma sohbetleri (toplu yeniden araştırmada yeni sohbet açılır, eskisi korunur; eski toplam sohbet kesmesi kaldırıldı); yeni mesaj başlangıcında çok uzun sohbet için yeni sohbet uyarısı; kullanıcı mesajı 15.000 karakter. İçeri aktarma 128MB. Metin, bağlantı ve dizilerin veri şemasında kendi depolama boyutları vardır. Bunlar düşünme kısıtı değil uygulamanın mevcut veri kapasitesidir.
- **Geri alma/yedek:** mevcut oturumda 25 kütüphane geri alma adımı, en son 12 otomatik yedek. Durdur tamamlanmış işlemleri kendiliğinden geri almaz.

Tam şema `electron/validation.ts`, araçlar `electron/tools.ts`, ağ katmanı `electron/network.ts` içindedir. Kapak görselleri için ayrı uygulama önbelleği/medya kontrolleri vardır. Kaynak bağlantısı sunulması artık düzenleme önkoşulu değildir; bağlantı sunulursa geçerli HTTP(S) biçiminde olmalıdır.


## 1.0.6 sağlayıcı / tarayıcı kapsamı

- Otomatik kaynaklar: Steam, GOG, Epic için **EGData topluluk API’si**, Xbox için Microsoft Store kataloğu. Resmi destekli bir Epic API aboneliği yoktur. HowLongToBeat süreleri için GOG ürün sayfasındaki HLTB bölümü, Codepotatoes topluluk API’si ve HLTB sayfası kullanılır (1.0.12’de yanlışlıkla kaldırılmış, 1.0.13’te geri gelmiştir); resmi HLTB API’si değildir. Sağlayıcı biçimi/erişimi değişirse kontrol başarısız olabilir; başka sağlayıcının sonucu korunur.
- Otomatik mağaza katalog eşleştirmesi normalleştirilmiş başlık kullanır; bu kontrol genel web aramasına uygulanmaz. Arama motorunun döndürdüğü sıralama ve olağan en fazla 20 sonuç sınırı korunur; bütün internetin tarandığı iddia edilmez. CAPTCHA/HTTP engeli veya ilgisiz sonuç olabilir. Mağaza slug’ı başlıktan uydurulmaz.
- SteamDB için ücretsiz genel API koşulu karşılanmadığından otomatik veri çıkarımı uygulanmadı. SteamDB bağlantısı yalnızca uygulama tarayıcısında açılır.
- Tarayıcı sekmeleri için sabit sayısal kota yoktur. Her sekme Chromium belleği kullanır. Ayrı çerez profili ve ayrı IPC doğrulaması vardır; web sayfaları kütüphaneye/LM anahtarlarına doğrudan erişemez.
- Tarayıcı, tam Chrome/Edge yerine geçen genel amaçlı bir ürün değildir: uzantı, yer imi, sekme oturumu geri yükleme veya şifre yöneticisi arayüzü yoktur. Kamera/mikrofon/konum/bildirim gibi site izinleri reddedilir. DRM, harici uygulama protokolleri ve bazı oturum açma akışları çalışmayabilir. HTTP(S) gezinme, kaydet diyaloğu, geri/ileri, sekmeler ve arama vardır.
- EGData fiyatının kaynakta son değişim tarihi kontrol tarihinden ayrı gösterilir.


## Otomatik araştırma

- Seçili ve erişilebilir LM modeli olmadan çalışmaz; oyun kaydında bekleme durumu gösterilir. Bağlantı başarısızsa her oyun için tekrar tekrar sunucuya yüklenilmez; kullanıcı bağlantı testi veya Araştır ile yeniden başlatabilir.
- Her yeni otomatik araştırma işi yeni araştırma sohbetinde, donanım → özet aşamalarıyla yürür (1.0.12’de dil/süre ve yama aşamaları kaldırıldı); eski sohbetler korunur, aktif kullanıcı sohbeti değiştirilmez. Normal mesaj önceliklidir. Durdur / Ctrl+Z mevcut değişiklik ve kuyruk davranışını görünür tutar.
- Bir alanı doldurmayan model yanıtı doldurulmuş kayıt sayılmaz. Gereksinim, karşılaştırma ve etkinse yazılmamış özet eksik sonuçta sayılır. Bir aşamanın bitmesi verinin doğrulandığı anlamına gelmez. Model araçları yanlış seçebilir veya düşünmede takılabilir; aşama talimatları modelin her davranışını garanti etmez. Keyfî tur/zaman kotası eklenmedi. Daha önce kaydedilen donanım sonucu sonraki aşama beklerken kaybolmaz.
- `record_compatibility` donanım/gereksinim bağlam anahtarını kullanır. Bu, eski bilgisayar veya eski gereksinim için üretilmiş sonucun yeni tabloya uygulanmasını önler; kaynak/alıntı zorunluluğu değildir. Bilinen sayısal hesaplara AI sonucu üstün gelmez. Algılanmamış bilgisayar değerleri internetten bulunmuş gibi kabul edilmez.
- Xbox katalog kaydı Game Pass veya PC sahipliği anlamına gelmez; platform ayrı kontrol edilir.

## Araç biçimi ve sunucu hataları (1.0.7)

- Null, dizi, tek değer, yarım JSON ve şema hatası veri değiştirmez. Yalnızca tam JSON kod bloğu/çift kodlama gibi açık sarmallar açılır; eksik değer tamamlanmaz. Gerçek ham girdi hata kartında saklanır.
- Sunucuya gönderilen eski bozuk native araç zarfı düzeltilir; ham değer ve eski sonuç taşınmaya devam eder. Kayıtlı geçmişin içeriği atılmaz. JSON modunda bozuk dış yanıt zarfı yine çalıştırılmaz.
- HTTP 500 bir sunucu yanıtıdır; sebebi yalnızca koddan anlaşılamaz. Uygulama kullanıcının LM Studio günlüğüne/belleğine erişmez. Otomatik tekrarlarla sunucuya yüklenilmez.
- Özet model tarafından mevcut doğru bilgilerden yazılabilir; her özet için yeni internet sorgusu zorunlu değildir. Bu, bilinmeyen ayrıntıları uydurma veya araştırılmayan şeyi araştırılmış gösterme izni değildir.

## 1.0.8 çıktı ayarının kapsamı

- OpenAI/native, JSON yedek ve desteklenen düşünme API’sindeki **ajan** istekleri seçilen çıktı limitini kullanır. Alanın 16K katına yuvarlanması yoktur; UI adımı 1’dir. Eski kayıtlı değerler korunur.
- Ayrı kısa açıklama yardımcısının `shortSummary` isteği kısa özet için mevcut 600-token hedefini korur; bu, ajan konuşmasının çıktı sınırı değildir. 1.0.7’den gelen aşamalı otomatik araştırmanın özet turu normal ajan çağrısıdır ve seçilen limiti kullanır.
- Uygulama gerçek tokenizer veya sınırsız bağlam sağlamaz. Seçilen üst sınırın model tarafından tamamının üretilebileceği garanti değildir. Sunucu isteği reddederse hata görünür; geçmiş veya çıktı sınırı gizlice kısılmaz.


## 1.0.9 ajan işlemi / kayıt sözleşmesi

- Grup ve seri yönetimi artık ajan araçlarıyla da yapılır. Toplam 25 araç; native ve JSON yolları aynı doğrulayıcıdan üretilen şemayı kullanır. Kullanıcının onay ayarı ve geri alma korunur.
- 2.1.0: CPU/GPU satırları PassMark puanları ve TechPowerUp özellikleriyle hesaplanır; bu satırları AI değiştiremez (yanlışsa donanım adı ya da gereksinim düzeltilir, ya da "Kontrolleri sen seç" ile kendi kararın girilir). Puanlar sentetik testlerdir, oyundaki FPS'i garanti etmez; %10 içindeki fark "yaklaşık eşit" sayılır. Model adı yazmayan satırlar oyunun yılına göre tahmin edilir ("tahmini"). Seri ifadeleri ("GeForce 600 serisi"), yazım hataları ve verideki eksik modeller AI'ya kalır. PassMark verisinin lisansı serbest değildir; uygulama kişisel kullanım içindir. Veri her sürümle yenilenir; sürümler arasında çıkan yeni parçalar bir sonraki sürüme kadar AI ile çözülür.
- Araştırılmış CPU/GPU karşılaştırması yalnız verinin karar veremediği satırlar içindir. Sayısal ölçüm sonuçları değişmez; yanlışsa ölçüm/gereksinim kaydı düzeltilir. Eksik gerçek donanıma olumlu/olumsuz AI karşılaştırması kaydedilmez. Uygulanamayan araç sonucu başarı sayılmaz.
- Karşılaştırma anahtarı düzey/bileşen bazlıdır. Eski genel anahtarlı kayıtlar da yalnız ilgili girdileri hâlâ eşleşiyorsa kullanılır. Bağımsız disk değişikliği GPU kararını geçersizleştirmez.
- Yeni gereksinim metni o düzeyin yeni yapılandırılmış yorumudur; ayrıştırılamayan alan belirsiz kalır. Açık alanlar önceliklidir; isteğe bağlı gereksinimde null temizler, göndermemek korur.
- Mağaza bağlantısı/kontrol durumu aynı anda güncellenir. Sağlayıcı yenilemesinde yalnız düzenlenen mağaza korunur; diğer mağazaların yeni sonuçları engellenmez. Ürün URL biçimi kontrolü gerçek dünyada ürünün doğrulandığı iddiası değildir.
- HLTB kısmi alanları birleştirilir; `found` için en az bir sayısal süre gerekir (1.0.12’de kaldırılmış, 1.0.13’te yeniden geçerli).
- Şemaların alan/sınır tarifleri otomatik üretilir; veritabanındaki mevcut kayda bağlı koşullar yürütmede denetlenir ve anlaşılır hata döner.
- `fetch_page` hâlâ HTTP metin/HTML aracıdır; ajan için fareyle tarayıcı kontrolü, sayfa JS çalıştırma veya PDF çözümleme eklenmedi. Bunlar 11 bulgunun dışında belgelenmiş kapsam sınırlarıdır.


## 1.0.10 — uygulama denetimi ve kaldırılan not özelliği

- Kişisel `Game.note` alanı ve düzenleme yolu yoktur. Eski kayıt/import alanı atılır. (1.0.12’deki Not sekmesi bu alan değildir; oyun kaydının dışındaki `notes` kaydıdır ve ajan erişemez.) `Hardware.note` donanım algılama açıklamasıdır; kişisel not özelliği değildir. Kaynak/yama açıklamaları, sohbetler ve eski yedek dosyaları silinmez.
- Minimum ve önerilen seviyelerdeki OS/CPU/GPU/RAM/disk kapsamı ayrı değerlendirilir. Yayımlanmamış ile henüz bilinmeyen farklıdır. Kısmi önerilen RAM kaydı, eksik önerilen CPU’nun tamamlandığı anlamına gelmez.
- Gereksinim/karşılaştırma yazılan sohbet için model bitirmeden uygulama kontrolü yapılır; eksikler modele geri verilir. Aynı eksik durum hiç ilerlemeden geri gelirse sahte tamamlanma yerine durulur. Aynı hatalı yazma da veri değişmedikçe tekrar tekrar yürütülmez. Bu, toplam tur/araç kotası değildir.
- Ortak politika kısa aşama talimatlarına eşlik eder; cihaz/oyun verisi gerektiğinde araçlarla alınır. Mevcut modelin gerçek bağlam kapasitesi, araç tarifleri ve sonuçların boyutu ortadan kalkmaz; çıktı tavanı gizlice küçültülmez.
- Arka plan araştırması yalnız hedef oyunun araştırma/karşılaştırma alanlarını yazar. Kütüphane düzenleme araçları normal kullanıcı sohbetinde korunur; kaynak/alıntı/önceden fetch zorunluluğu eklenmedi.
- Uygulama eksik alan ve uygulanmayan kayıt hatasını yakalar; modelin okuduğu web bilgisinin doğruluğunu veya eski oyunun Windows’ta gerçekten açılacağını garanti etmez. Model yayımlanmamış bilgisini yanlış bildirirse bu da model hatası olabilir.
- Tarihî araç kartlarının gelecekte değişmesi engellendi; geçmişte bozulup dosyaya yazılmış bir kartın asıl eski içeriği geriye dönük yeniden üretilemez.


## 1.0.11 — devam ve baştan araştırma ayrımı

- Devamda aşama tamamlanması `shared/research-progress.ts` üzerinden güncel kayıtlardan hesaplanır. Kalıcı `research.stage` son çalışılan aşamadır; tek başına başarı kanıtı değildir. Eski dosyalarda bu alan olmasa da kayıtlar okunur.
- Durmuş araştırmanın kendi sohbetindeki normal gönderim, araştırma işiyle ilişkilendirilir. Başarılı sonuçta durum güncellenir; bir aşama tamamlandıysa veya devam istendiyse kalan akış yürür. İlgisiz sohbet eski durdurulmuş işi kendiliğinden başlatmaz.
- Stop/error sonucunda otomatik devam edilmez. Manuel devam sırasında hem sohbetin Durdur’u hem oyun araştırmasının Durdur’u etkilidir. Aynı anda ikinci gönderim, çalışan işin takip bilgisini silemez.
- Devam her aşamanın mevcut durumunu tekrar kontrol eder. Güncel veri değerlendirmeyi belirsiz bırakıyorsa ilgili aşama tekrar gerekir; yalnızca eski “tamamlandı” bayrağına güvenilmez. Karşılanmayan ama değerlendirmesi tamamlanmış bir donanım sonucu da araştırma bakımından tamamlanmış olabilir; bu, oyunun çalışacağı anlamına gelmez.
- Baştan/toplu yeniden araştırma bütün etkin aşamaları çalıştırır. Sonraki otomatik aşamalar temiz bir araştırma sohbetinde yürüyebilir; önceki kesilmiş/manuel sohbet silinmez.
- Model thinking döngüsünü tespit edip zorla kesen yeni token/zaman kotası eklenmedi. Kullanıcı Durdur kontrolü korunur; model kalitesi veya gerçek Windows uyumluluğu garantisi verilmez.
