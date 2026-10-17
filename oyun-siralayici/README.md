# Oyun Sıralayıcı 1.0.13

Türkçe, yerel öncelikli Windows oyun kütüphanesi; LM Studio ile otonom araç kullanan sohbet ajanı.

> **Durum:** Windows x64 taşınabilir EXE, Linux üzerinde çapraz paketlenmiştir. Bu, gerçek Windows üzerinde çalıştırılmış olduğu anlamına gelmez. Testlerin kapsamı `TEST-RAPORU.md` dosyasında ayrı ayrı belirtilir. İmzalı/ticari olarak sertifikalandırılmış bir sürüm değildir.

## Kullanıcı için hızlı başlangıç

1. `Oyun-Siralayici-1.0.13-Portable.exe` dosyasını indirip Windows 10/11 x64 üzerinde aç. Node.js, Python, .NET veya ayrı WebView kurulumu gerekmez; Electron çalışma zamanı paketin içindedir. İlk açılışta taşınabilir paket geçici dizine açılır; birkaç saniye sürebilir.
2. **Liste aktar** ile metnini yapıştır. İlk/son satırı belirle, önizlemedeki adları düzelt, satırdaki Steam seç düğmesiyle doğru ürünü seç, yinelenenleri kontrol et ve **Onayla ve içe aktar** düğmesine bas.
3. **Ayarlar → Donanım** bölümünü kontrol et. Windows sürümü donanımı ilk açılışta algılamayı dener; yanlış/boş alanları elle düzelt. Doğru oyun diski ve GPU’yu seç. VRAM kesin değilse doğrulama anahtarını açık bırakma.
4. AI istersen LM Studio’da bir model yükle, Developer/Local Server bölümünden sunucuyu başlat. **Ayarlar → LM Studio** içinde varsayılan `http://127.0.0.1:1234/v1` adresini test et ve model seç. Anahtar yalnızca sunucun istiyorsa gerekli.
5. Bir oyunu sohbete sürükle veya `@` ile ekle. Varsayılan **Otonom ajan** modunda ekleme, düzenleme, silme, taşıma ve sıralama doğrudan uygulanır. Son kütüphane işlemlerini **Ctrl+Z** ile geri alabilirsin.

**İnternet yoksa:** yerel kütüphane, gruplar, seriler, sıralama ve kayıtlı bilgiler çalışır. Yeni mağaza/HowLongToBeat bilgisi, arama ve uzak sayfa getirme çalışmaz. Yerel LM Studio aynı cihazda çalışıyorsa sohbet internet gerektirmez; web araçları yine internet gerektirir.

**Windows uyarısı:** EXE dijital imzalı değildir; SmartScreen veya antivirüs itibar uyarısı gösterebilir. Güvenlik yazılımını kapatma. Dosyanın bu dağıtımdan geldiğini ve `SHA256.txt` ile eşleştiğini kontrol et. Kurumsal politikalar imzasız uygulamayı engelleyebilir.

## 1.0.13 — “Ne kadar sürer?” geri geldi

1.0.12’de yalnızca otomatik araştırmanın “DİL VE SÜRE” aşaması kaldırılmalıydı. HowLongToBeat süreleri ise yanlışlıkla tamamen kaldırılmıştı. 1.0.13 bu hatayı düzeltir; 1.0.12’deki diğer değişiklikler aynen kalır.

- **Geri gelenler (1.0.11’deki gibi):** **Genel bakış → Ne kadar sürer?** bölümü (Ana hikâye, Hikâye + yan içerik, %100 tamamlama; varsa tüm tarzlar), kaynak ve tarih satırı, **Süreleri yenile**, **HLTB oyun sayfası**, **Verinin alındığı sayfa**. Süreler oyun eklenince ve **Bilgileri yenile** sırasında kendiliğinden alınır: GOG ürün sayfasındaki HowLongToBeat bölümü → Codepotatoes topluluk API’si (Steam kimliği / ad) → HowLongToBeat oyun sayfası. Kaynak kaydı (HowLongToBeat) ve kısmi güncellemede diğer saatlerin korunması da geri geldi.
- **Ajan:** `refresh_game_info` mağazalarla birlikte süreleri de yeniler; `update_game_info.hltb` süre kaydını düzeltebilir (kısmi güncelleme diğer saatleri korur). Bu, araç listesine yeni bir araç eklemez.
- **Kaldırılmış olarak kalanlar:** “DİL VE SÜRE” ve “TÜRKÇE YAMA” araştırma aşamaları, Türkçe sekmesi ve bütün Türkçe dil/yama özellikleri. Otomatik araştırma yalnızca **Donanım → Özet** aşamalarıdır; araştırmanın tamamlanması sürelere bağlı değildir. **Not** sekmesi aynen durur ve ajan ona erişemez.
- **1.0.12’nin sildiği süreler kendiliğinden geri gelir:** 1.0.12 ile kaydedilmiş bir kütüphane ilk açıldığında `backups` klasöründeki yedekler en yeniden eskiye taranır; her oyun için süresi bulunan en yeni yedekteki süreler, HowLongToBeat kaynak kaydı ve AI düzenleme işaretleri geri yüklenir (genellikle 1.0.12’nin aldığı `…-yukseltme-oncesi.json`). Bu işlem bir kez yapılır, internet gerektirmez, yedek dosyalarını değiştirmez ve mevcut bir süre kaydının üzerine yazmaz. 1.0.12’de alınmış bir yedeği **Ayarlar → Veriler & yedekler** içinden geri yüklemek veya JSON olarak içe aktarmak da aynı onarımı yapar.
- **Yedekte süresi olmayan oyunlar** (ör. 1.0.12 açıkken eklenen veya yenilenen oyunlar) açılışta arka planda **yalnızca süreler** için sorgulanır. Üst şeritte **Oyun süreleri tamamlanıyor** görünür ve **Durdur** ile durdurulabilir. Mağaza sonuçları, bilgi alma durumu ve AI araştırması değişmez; hata bandı çıkmaz. GOG kataloğuna da ulaşılamıyorsa (büyük olasılıkla internet yok) hiçbir şey hatalı işaretlenmez, kalan oyunlar bir sonraki açılışta tekrar denenir.

**Doğrulama:** 313/313 birim/entegrasyon, 36/36 arayüz testi; beş Linux Electron senaryosu (yükseltmede 1.0.12 dosyasının yedekten onarımı ve ekranda gösterimi dahil), gerçek ağda mağaza + süre ve arka plan tamamlama testi, Windows paket kontrolü. Gerçek Windows, gerçek LM Studio modeli ve senin gerçek 1.0.12 kütüphanen denenmedi. [Değişiklik raporu](docs/DEGISIKLIKLER-1.0.13.md) · [Test raporu](TEST-RAPORU.md).

## 1.0.12 — Türkçe sekmesi ve dil/süre aşaması kaldırıldı, Not sekmesi eklendi

- **Türkçe sekmesi ve ona bağlı bütün ajan özellikleri kaldırıldı:** resmi Türkçe arayüz/ses/altyazı alanları, Türkçe yama araması (`check_turkish_patch` aracı), yama kaydı/elle yama penceresi, kütüphanedeki Türkçe filtresi ve rozeti, “Türkçe yama araştırmasını ajana ver” düğmesi, ajan kurallarındaki yama cümlesi ve Steam/GOG dil tablosu okuma. Ajan artık bu alanları göremez ve yazamaz.
- **Son araştırma aşaması (“DİL VE SÜRE”) tamamen kaldırıldı;** “TÜRKÇE YAMA” aşaması da yok. Otomatik araştırma yalnızca **Donanım → Özet** (özet ayarı açıksa) aşamalarından oluşur. *(Düzeltme: 1.0.12 bu sırada HowLongToBeat sürelerini ve “Ne kadar sürer?” bölümünü de tamamen kaldırmıştı. Bu istenmemişti; **1.0.13’te geri getirildi**, yukarıya bak.)*
- **Yeni Not sekmesi:** oyun ayrıntısında **Genel bakış · Mağazalar · Sistem · Not**. Not sekmesinde yalnız serbest metin notu vardır (puan vb. yok). Yazdıkça otomatik kaydedilir, en fazla 20.000 karakterdir; metni silmek notu kaldırır.
- **Ajan bu nota erişemez:** not oyun kaydının içinde değil, ayrı bir alanda tutulur. Hiçbir ajan aracı, sohbet bağlamı, otomatik araştırma veya uygulama tarayıcısı notu okuyamaz ya da değiştiremez. Test senaryolarında modele giden bütün istekler ve araç sonuçları not metni için tarandı; hiçbirinde bulunmadı.
- **Not ve geri alma:** Ctrl+Z oyun/grup/seri işlemlerini geri alır; yazdığın notu geri almaz. Silinen oyun Ctrl+Z ile geri gelirse notu da yerindedir. Tam JSON yedeği notları içerir; CSV/metin dışa aktarımı içermez.
- **Eski veriler:** önceki sürümlerin (1.0.11 ve öncesi) dosyası ilk açılışta bir kez temizlenir (1.0.12 bu temizlikte süreleri de siliyordu; 1.0.13 yalnızca Türkçe verileri temizler ve 1.0.12’nin sildiği süreleri yedekten geri yükler); önce dosyanın dokunulmamış kopyası `backups` içine `…-yukseltme-oncesi.json` olarak alınır. Yalnız kaldırılan aşamalar yüzünden eksik görünen araştırmalar tamamlandı sayılır; hiçbir oyun kendiliğinden yeniden araştırmaya alınmaz. Boş kalan varsayılan **Türkçe Yama Yok** koleksiyonu kaldırılır; içine oyun koyduysan koleksiyon korunur.

**Doğrulama:** 293/293 birim/entegrasyon, 34/34 arayüz testi; beş Linux Electron senaryosu, isteğe bağlı canlı mağaza testi ve Windows paket kontrolü. Gerçek Windows ve gerçek LM Studio modeli denenmedi. [Değişiklik raporu](docs/DEGISIKLIKLER-1.0.12.md) · [Test raporu](TEST-RAPORU.md).

## Neler var?

### Kütüphane ve koleksiyonlar

- Numaralı/düz metin, TXT/Markdown/CSV oyun adı içe aktarımı; kaynak satır numaraları, başlangıç/bitiş aralığı, düzenlenebilir sanallaştırılmış önizleme, satır seçimi, yinelenen uyarısı ve birleştirme.
- Tek oyun ve toplu satır eklemede Steam arama/seçme. Seçim kullanıcıya aittir; uygulama kimliğiyle elle eşleştirme de vardır. Steam seçilmeden eklenen oyun diğer kataloglarda araştırılır.
- Sıralı sanallaştırılmış oyun listesi, sürükleme tutamaçları, bırakma göstergesi, yükseltilmiş sürükleme kartı, **Alt+↑/↓**. Çoklu seçim için Ctrl/Shift; Ctrl+A ve toplu işlemler.
- Ad araması; durum, tür, yıl ve platform filtreleri; manuel/ad/yıl/uyumluluk sırası.
- Sayılı başlıklardan otomatik seri sezgisi; manuel seri oluşturma/adlandırma/dağıtma. Görünen sırada bitişik seri üyeleri daraltılabilir; seri başlığıyla birlikte taşınır. Tek oyun ayrı sürüklenebilir.
- Renkli/simgeli özel neden grupları; üst çipler grup ekranı ve bırakma hedefidir. Gruba sağ tıklayınca düzenleme açılır. **Oynama Listesi özel gruplardan ayrıdır.** Bu sürümde “gruba taşı” eski özel üyelikleri değiştirir.
- Planlandı/oynanıyor/bitti/bırakıldı/izlenecek durumları, puan, etiket ve elle oynanan saat alanları.
- Oyun ayrıntısında **Not** sekmesi: oyun başına serbest metin notu. Yalnız arayüzden yazılır; ajan araçları, sohbet ve araştırma bu notu göremez/değiştiremez. (1.0.10’da kaldırılan eski `note` alanı geri getirilmedi; yeni not oyun kaydının dışında tutulur.)
- İstatistikler, tür grafiği, rastgele oyun, ruh hali/zaman tercihlerini ajana gönderme, komut paleti, dosya bırakma.

### Oyun bilgisi ve doğruluk

- Steam arama, appdetails ve değerlendirme uçlarından resmi açıklama, tarih/tür, geliştirici/yayıncı, kapak, gereksinimler, mevcut fiyat, Metacritic/Steam skorları, ekran görüntüsü ve mevcut fragman bağlantısı.
- Bilgi toplama sıralı, arka planda ve iptal edilebilirdir. Hata durumları görünür; elle yeniden deneme vardır.
- Yerel önbellek, kaynak URL’si ve kontrol tarihi. Varsayılan önbellek 168 saattir.
- AI özeti seçili modelle üretilir; AI/model/tarih etiketi ayrıdır. Otomatik araştırma kendi özetini kaydedebilir; araştırma kapalıysa mevcut mağaza açıklamasından özet üretilir. Model yoksa özet uydurulmaz.
- **GOG:** kendi kataloğu ve ürün API’sinden doğrudan ürün bağlantısı, fiyat/para birimi, açıklama, geliştirici/yayıncı, platform, görseller ve gereksinimler alınır. **Epic:** ücretsiz, anahtarsız EGData topluluk API’sinden ürün eşlemesi, açıklama, kapak, geliştirici/yayıncı, platform ve bölgesel fiyat kaydı alınır. Epic’in resmi destekli API’si gibi sunulmaz. Fiyatın kaynak güncelleme tarihi ayrı gösterilir.
- **Mağazalar** ayrı sekmedir. Var / bu adla bulunamadı / kontrol edilemedi / eşleşme belirsiz durumları ayrıdır. Steam’de olmamak hata değildir. Başlıklardan ürün slug’ı uydurulmaz; katalogdan gelen gerçek bağlantı kullanılır. Eski kaynak kayıtları JSON’da korunur; Kaynaklar sayfası artık yoktur.
- **HowLongToBeat süreleri otomatik alınır (Genel bakış → Ne kadar sürer?):** GOG ürünündeki HLTB bölümü varsa kaynaklı olarak okunur; yoksa Codepotatoes topluluk API’si Steam kimliği / ad ile sorgulanır, son seçenek olarak gerçek HLTB sayfa JSON’u okunur. Ana hikâye, yan içerik, %100 ve tüm tarzlar ayrı saat değerleridir. Resmi HLTB API’si iddiası yoktur. HTTP 403/CAPTCHA/site değişikliği veriyi engelleyebilir; sayı uydurulmaz, eski süre korunursa yeni alınmış gibi gösterilmez. Kişisel oynanan saat ayrıdır. (1.0.12’de yanlışlıkla kaldırılmış, 1.0.13’te geri gelmiştir.)
- Benzer oyun adayları ve AI araştırması (donanım + özet) korunur. Türkçe dil/yama bilgisi 1.0.12’den itibaren uygulamada yoktur.

### Uygulama tarayıcısı (1.0.4’ten korunur)

- Üst menüde **Tarayıcı**: uygulamaya ait ayrı pencere; sekme aç/kapat/seç, adres veya DuckDuckGo araması, geri/ileri, yenile/durdur. Oyun, kaynak ve mağaza bağlantıları bu pencerede yeni sekme açar. Popup/target-blank bağlantıları da içeride kalır.
- **Ctrl+L** adres, **Ctrl+T** yeni sekme, **Ctrl+W** sekmeyi kapat, **Ctrl+Tab / Ctrl+Shift+Tab** sekme değiştir. Sekme sayısına keyfi kota konmadı; her açık sekme RAM kullanır.
- Steam ID varsa **Mağazalar → Steam → SteamDB** gerçek oyun sayfasını açar. SteamDB’den API dışı otomatik veri toplama yoktur.
- Web içerikleri Node, uygulama preload’u ve oyun/LM ayarlarına erişmez. Ayrı `persist:oyun-browser` çerez oturumu kullanılır. HTTP(S) dışı üst seviye gezinme açılmaz; indirilen dosya otomatik çalıştırılmaz, kaydet diyaloğu kullanılır. Site izinleri varsayılan reddedilir. Sertifika/DRM/CAPTCHA/oturum açma uyumluluğu her site için garanti edilmez.
- Sekmeler pencere kapanınca kapanır; sekme geçmişi yedeğe eklenmez. Çerez/web önbelleği `%APPDATA%\Oyun Siralayici\Partitions\oyun-browser\` altındadır; kütüphane JSON ihracı bu web oturumunu dışa aktarmaz. Bu Chromium profili, uygulamanın metadata/kapak önbelleğinden ayrıdır.

Sağlayıcı uçları, eşleştirme ve kaynak ayrımı: **[docs/SAGLAYICILAR-VE-TARAYICI.md](docs/SAGLAYICILAR-VE-TARAYICI.md)**.

### Donanım ve uyumluluk

- Windows OS/mimari, CPU/çekirdek/iş parçacığı/hız, GPU/VRAM, RAM ve boş disk alanı: `systeminformation`.
- `dxdiag.exe` XML ile GPU DirectX özellik düzeyi ve özel VRAM doğrulaması denenir. Yüklü DirectX sürümü ayrı bilgi alanıdır.
- `vulkaninfo.exe --summary` bulunursa sürüm bilgisi okunur; bulunmazsa bilinmiyor kalır. Araç uygulamayla birlikte dağıtılmaz.
- 2.1.0: CPU/GPU satırları `shared/hardware-db.json` ile karşılaştırılır: PassMark puanları (işlemcide çok çekirdek + tek çekirdek, ekran kartında G3D Mark; çekirdek, iş parçacığı, saat, bellek, yıl) ve TechPowerUp GPU veritabanı dökümü (DirectX özellik düzeyi, OpenGL, Vulkan, Shader Model, çıkış yılı). Veri her sürümde `scripts/hardware-data.ts` ile yenilenir; ulaşılamazsa önceki dosya kalır.
- Gereksinim metni parça parça okunur (`shared/hardware-match.ts`): model adları ve "veya" seçenekleri (önce bilgisayarın markası), bellek, DirectX/Shader Model/OpenGL/Vulkan, T&L, AGP/PCI, "dahili grafik desteklenmez", SSE/AVX, 64 bit, "2.4 GHz çift çekirdek" (oyunun çıktığı yılların benzer işlemcileriyle), 1990'ların donanımı, "Any", yalnız çözünürlük. Fark %10'dan azsa "yaklaşık eşit" (≈, karşılanmış sayılır). Okunamayan satır belirsiz kalır ve AI araştırmasına gider; AI'ın sonucu aynı metin ve aynı bilgisayar için diğer oyunlara da yazılır. Veriyle hesaplanan satırı AI değiştiremez. Puanlar kaba bir karşılaştırmadır, FPS garantisi vermez. Ölçüm: `scripts/hardware-coverage.ts` (Kaggle Steam gereksinim listesinde 7.835 oyunda CPU %99, GPU %95 karar).
- Yeşil: kontrol edilen önerilen bileşenler yeterli; turuncu: minimum doğrulanmış; sarı: eksik/belirsiz karşılaştırma; kırmızı: RAM/disk/VRAM/OS/API gibi doğrulanabilir gereksinim eksikliği. Bileşen gerekçeleri ayrıntıda ve araç ipucunda yer alır.
- Donanım değiştirilince değerlendirme yeniden hesaplanır. Gerekçeli grup önerileri kullanıcı tıklamasıyla uygulanır; oyunlar gizlice taşınmaz.

### LM Studio ajanı

- Model listeleme ve bağlantı testi, OpenAI uyumlu SSE akışı, Markdown/kod/liste/tablo görünümü, sohbet geçmişi/yeni/sil, oyun ekleri.
- Native function calling; desteklenmeyen şema hatasında veya açık seçimle **yapılandırılmış JSON yedek modu**. Geçersiz JSON veya düz metin araç olarak yürütülmez. Yedek moda geçiş sohbette açıklanır.
- Araçlar: `web_search`, `fetch_page`, `list_games`, `get_list_state`, `get_game_info`, `refresh_game_info`, `edit_game`, `update_game_info`, `add_game`, `remove_game`, `reorder`, `move_to_group`, `create_group`, `edit_group`, `delete_group`, `create_series`, `rename_series`, `dissolve_series`, `add_to_play_list`, `check_compatibility`, `record_compatibility`, `generate_short_description`, `recommend_similar`, `ask_user_questions` (25 araç). Not sekmesine erişen araç yoktur.
- **Otonom mod varsayılan:** ajan mutasyonları ve okumalar için izin penceresi açılmaz. İsteğe bağlı **İşlem öncesi onay iste** açılırsa eski ret/tek seferlik izin/sohbet boyunca izin akışı kullanılır. `ask_user_questions` gerçek bilgi eksikliği için soru sorabilir; otomatik onay kontrolü değildir.
- Araç kartları metinle sırayla görünür; durum, süre, girdi, çıktı, kaynaklar ve yeniden deneme içerir. Düşünme çıktısı ayrı katlanır bölümdür; istenirse gizlenir.
- Soru sihirbazı: 1–6 soru, tekli/çoklu seçim, ilerleme, geri/devam/atla/iptal, “Farklı bir cevabım var” alanı. Sonuçlar araç yanıtı olur ve ajan devam eder.
- Düşünme düzeyi model adından tahmin edilmez. `/api/v1/models` yetenek yanıtında desteklenen seçenekler varsa açılır. Özel düzey seçildiğinde belgelenmiş `/api/v1/chat` + JSON araç modu kullanılır; OpenAI API’ye desteklenmeyen `reasoning_effort` gönderilmez. Bu düzey ayarı sohbet için geçerlidir; kısa özet üretimi OpenAI uç noktasının model varsayılanlarını kullanır.
- Aynı anda bir aktif ajan isteği vardır. Sabit araç/tur kotası yoktur; 10 tur ve 8 çağrı sınırları kaldırılmıştır. İptal, yarım araç geçmişini güvenli iptal sonucuyla tamamlar; yeniden açılınca eski araçlar kendiliğinden çalıştırılmaz.

### 1.0.3’ten korunan: otonom çalışma ve doğrudan veri düzenleme

- `No user query found in messages` hatası için kullanıcı isteği ve native çağrı/sonuç eşleşmeleri korunur. **1.0.2’de otomatik geçmiş kısaltma tamamen kaldırıldı**: eski turlar, son araç çıktıları ve kullanıcı metni içerik bütçesi bahanesiyle silinmez. JSON sonuçları gerçek kullanıcı isteğinden ayrı işaretlenir.
- 65.000 karakterlik geçmiş tavanı, 22.000 karakterlik araç sonucu kesmesi ve varsayımsal 16K bağlam kaldırıldı. Girdi korunur. 1.0.8’de yaklaşık karakter maliyetine göre çıktı bütçesini daraltma da kaldırıldı. Seçilen ajan çıktı sınırı aynen gönderilir; gerçek kapasiteyi model sunucusu uygular.
- Otomatik modda HTTP 500 veya SSE içindeki Jinja/şablon hatası da JSON yedeğine geçebilir. Yedek, native tool rolleri yerine bir kullanıcı transkripti kullanır; tamamlanan araçları uygulama tekrar çalıştırmaz. Açıkça seçilmiş native mod değiştirilmez.
- `edit_game`: ad, etiket, puan, durum, Oynama Listesi ve kişisel oynama süresi (not yok). `update_game_info`: yıl/tür/platform/geliştirici/yayıncı/açıklama/puan-fiyat bilgileri, minimum ve önerilen gereksinimler (kısmi güncelleme: yalnızca verilen alanlar değişir, diğerleri korunur; `null` tek alanı siler), mağazalar, HowLongToBeat süreleri (`hltb`; kısmi güncelleme diğer saatleri korur) ve AI özeti. Dosya yolu, kimlik, ayarlar, kod veya keyfi alan düzenleyemez.
- `update_game_info` için yalnızca `gameId` ve `patch` gerekir. Kaynak (`sources` veya eski `evidence`), alıntı ve alan yolları isteğe bağlıdır. Önceden `fetch_page` çağrısı, birebir alıntı eşleşmesi veya her alan için kanıt zorunluluğu yoktur.
- Otonom modda veri doğrudan kaydedilir ve geri alınabilir. Onay modu ayrıca açılırsa pencere önce/sonra değerleri ve varsa eklenmiş bağlantıları gösterir. Kaynak verilmemesi bu modda da işlemi engellemez.
- AI tarafından değiştirilen alanlar ve zaman kaydedilir; otomatik güncelleme Steam yenilemesiyle ezilmez. Etiket **AI tarafından kaydedildi** şeklindedir; kullanıcı tek tek onaylamış veya kaynak denetiminden geçmiş gibi etiketlenmez. Kaynak yoksa uydurma bağlantı oluşturulmaz.
- Kaynak bağlantısı olmayan AI alanları da `aiEditedFields` ile korunur. Kaynak kaydı son 100 bağlantıyla sınırlıdır; alan koruması artık bu listenin varlığına bağlı değildir.
- Koleksiyon çipleri **Koleksiyonlar** altında; sürükleme başlayınca hedefler otomatik açılır. Steam eşleştirme Mağazalar’dadır. Sistem görünümü yalnızca karşılaştırma tablosu ve sonuçları içerir; ham kaynak/açıklamalar kaldırıldı. Teknik ajan hata ayrıntıları açılır bölümlerde kalır. Ardışık araçlar tek açılır grupta; girdi/çıktı/kaynak/süre/yeniden deneme işlevleri korunur. Animasyon ve temalar kaldırılmadı.

### Sayfa okuma ve bağlam ayarları (1.0.2)

- `fetch_page` indirilen yanıtın **tam okunabilir metnini** sohbet oturumunda tutar; ilk 16.000 karakterde kalıcı olarak kesmez. JavaScript çalıştırmaz; HTML temizleme ve güvenli ağ yanıtı boyutu/timeout denetimleri korunur.
- `offset` + `length` ile bölüm okur. Varsayılan 8.000 karakter; bölüm başına en fazla 100.000 karakter taşıma sınırıdır, sayfanın toplam okuma sınırı değildir. `hasMore`, `nextOffset`, `totalChars` ve hazır `continueWith` girdisi döner. `find` ile ilgili sözcüğe atlanır; bulunamadığında `found:false` açıkça döner. `refresh:true` gerçek yeniden indirmedir. Aynı URL/offset aynı bölümdür, tekrarlı fetch yerine devam parametresi kullanılmalıdır.
- Bir sonuç tekrar tekrar “truncated/preview” nesnesine sarılmaz. Sohbetin sayfa önbelleği uygulama oturumuna özeldir; yeniden açılınca gerekirse sayfa tekrar okunur. Sayfa önbelleği düzenleme izni için kullanılmaz.
- **Maksimum çıktı tokenı**, tek yanıtta üretilecek metin için üst sınırdır. **Yüklü bağlamı elle belirt** yalnızca bilgi amaçlıdır; LM Studio’da gerçekten yüklenmiş Context Length değerini kaydeder, çıktı sınırını azaltmaz; `0` otomatik okuma demektir, modele yeniden yükleme komutu değildir. Modelin teorik `max_context_length` değeri yüklü bağlam sanılmaz. Sunucu bilgi vermiyorsa 16K varsayılmaz. Bağlam yüklemesini değiştirince bağlantıyı tekrar test et; model/adres değişiminde elle girilen bağlam sıfırlanır.
- Her sohbet ayrı `apiHistory`, mesaj ve araç izni taşır; native reasoning isteklerinde `store:false` kullanılır. Başka sohbetin mesajları prompta eklenmez. Kütüphane, donanım ve genel ayarlar ortaktır.
- Uzun ajan çalışması, yanıt tamamlanınca, kullanıcı Durdur’a basınca veya gerçek bir sunucu/araç hatası akışı sonlandırınca biter; sabit 10 tur yoktur. Tek araç hatası sonuç olarak modele döner; yeniden denemeye/alternatife model karar verebilir. Sonsuz döngüye giren modeli Durdur ile kesebilirsin.
- Model üretimindeki sabit 5 dakika ve toplam SSE zarfındaki 2 MB sınırı kaldırıldı; çok sayıda küçük SSE parçası meşru yanıtı erken kesmez. **Güvenlik/resource sınırları devam eder:** tek metin/düşünme yanıtı 1 milyon karakter, tamamlanmamış tek SSE çerçevesi 4 milyon karakter, araç girdisi/URL/doğrulama/ağ boyutu sınırları. Bu, fiziksel olarak sınırsız bağlam/bellek veya her modelde hatasız çalışma vaadi değildir.
- 1.0.1’de zaten kesilerek saklanmış eski çıktının eksik kısmı geriye dönük yaratılmaz; kaynağı yeniden oku veya yeni sohbetten başla. Gerçek bağlam aşımında metin gizlice silinmez; sunucunun hatası gösterilir. Sohbet kaydı korunur.

### 1.0.3’te ayrıca kaldırılan engeller

- Zorunlu kanıt zinciri, kaynak/alıntı/önceden fetch şartı yoktur. Normal web güvenliği ve veri biçimi kontrolleri sürer; arama sonuçları doğrulanmış bilgi garantisi değildir.
- Public web sitelerinde 80/443 dışındaki port engeli kaldırıldı. Ağ katmanı gerçek DNS/HTTP hatalarını yine bildirir; bu bir kaynağın içeriği hakkında güvenilirlik yargısı değildir.
- `update_game_info` artık mağaza bağlantıları, ekran görüntüsü URL’leri, fragman, Steam app ID ve modelin yazdığı AI özetini de kaydeder. `refresh_game_info` Steam/GOG/Epic/Xbox ve HLTB verisini ajan içinden yeniler. `update_game_info.hltb` süre kaydını da düzenleyebilir. Özet üretimi için önceden resmi açıklama bulunması şartı kaldırıldı.
- Yerleşik eski sistem yönergesi “izin sonucunu bekle” demeye devam etmez; yalnızca birebir eski varsayılan metin güncellenir. Kullanıcının özel yönergesi korunur. Otonom/onaylı çalışma modu promptta açıkça bildirilir.
- `requireApproval:false` yeni ve eski ayarlarda varsayılandır; sonradan açtığın onay tercihi korunur. İşlemler **silme dahil** otomatik olabilir. Durdur, geri alma ve yedekleme kalır.

Kaldırılanlar ve kalan teknik koşulların açık listesi: **SINIRLAR.md**. “Hiçbir teknik sınır yok” iddiası yoktur; gerçek model kapasitesi ve uygulamanın veri/bağlantı biçimi hâlâ geçerlidir.

### Görünüm

Karanlık/açık/sistem/neon/okyanus/orman/gün batımı/AMOLED, özel vurgu rengi, font ve boyut, yoğunluk, köşe yarıçapı, animasyon hızı/kapatma, yerel arka plan resmi ve bulanıklık. Windows destekliyorsa Mica/Acrylic ve pencere opaklığı. İşletim sisteminin azaltılmış hareket tercihi dikkate alınır. Bu, iOS’un yerel arayüzü değil; Electron içinde cam, yaylı geçiş ve akıcı hareket yaklaşımıdır.

## Veri nerede tutulur?

Windows masaüstünde: **`%APPDATA%\Oyun Siralayici\`**

```text
Oyun Siralayici/
├─ library.json                  Oyunlar, sıra, gruplar, seriler, ayarlar, donanım, sohbetler, notlar
├─ library.json.tmp              Atomik kaydın geçici dosyası
├─ secrets.bin                   LM/Brave anahtarları; Electron safeStorage/Windows DPAPI
├─ media/<sha256>.img             Kaynak URL’sine göre isimlenmiş kapak/arka plan önbelleği
├─ backups/library-<tarih>.json   Son 12 otomatik/elle yedek (1.0.11 yükseltmesinde …-yukseltme-oncesi.json)
└─ library-corrupt-<zaman>.json   Okunamayan ana dosyanın korunan kopyası, oluşursa
```

- **Taşınabilir olan çalıştırılabilir pakettir.** Veri varsayılan olarak EXE yanına değil kullanıcı profilindeki bu klasöre yazılır. EXE’yi başka PC’ye taşımak kütüphaneyi taşımaz; JSON yedeği veya uygulama kapalıyken veri klasörü kopyası gerekir.
- Normal kütüphane ve sohbet JSON’u şifreli değildir; işletim sistemi kullanıcı hesabının dosya korumasına dayanır. Özel sohbetler için diskinin erişimini koru.
- API anahtarları JSON dışa aktarımına dahil edilmez. `secrets.bin` Windows kullanıcı/makine korumasına bağlıdır; başka PC’de anahtarı yeniden girmek gerekebilir.
- Otomatik yedek, günlük ilk kayıtta ve içe aktarma öncesinde alınır. Son 12 korunur. Geri al, yalnızca oyun/grup/seri değişikliklerini en fazla 25 adım ve mevcut oturum içinde saklar; sohbet/ayar silme için geri al değildir.
- Tam JSON; metadata, sıralar, gruplar, seriler, ayarlar, sohbetler ve oyun notlarını içerir. Notlar Ctrl+Z geri alma adımlarına dahil değildir. Kapak dosyaları JSON’a gömülmez; `media` klasörü kopyalanabilir veya bilgiler yeniden çekilebilir.
- CSV ve numaralı metin dışa aktarılır; bunların içe aktarımı oyun adlarını alır. **Tam geri yükleme için JSON kullan.** Tam JSON dosyası sınırı 128 MB; bir seferde 5.000 oyun, kütüphanede en fazla 20.000 oyun; 100 sohbet.

## Gizlilik ve güvenlik

- Telemetri, hesap, reklam, otomatik güncelleme servisi yoktur.
- Ağ trafiği: eklenen oyun adları Steam/GOG/EGData/Microsoft kataloglarına; süreler için Codepotatoes topluluk API’sine (`hltbapi.codepotatoes.de`, Steam kimliği veya ad) ve gerektiğinde HLTB sayfasını bulmak için arama sağlayıcısına ve `howlongtobeat.com`’a gönderilir. Görseller ilgili Steam/GOG/Epic/Microsoft CDN’lerinden gelir. İstenen web araması, hedef sayfa ve seçilen LM sunucusu ayrıca kullanılır. Bağlantılar EXE içinde uygulamanın sekmeli tarayıcısında; web önizlemesinde sistem tarayıcısının yeni sekmesinde açılır. Ziyaret ettiğin sitelerin kendi çerezleri/ağ istekleri olabilir; uygulama telemetri eklemez.
- LM adresi uzak bir sunucuya değiştirilirse konuşma ve kullanılan bağlam o sunucuya gider. “Yerel” gizlilik için localhost kullan. **Not sekmesindeki notlar hiçbir modele gönderilmez** (yerel veya uzak). Araştırma için araçlarla okunan donanım ve oyun verileri seçili modele gider. Tarihî sohbetler ve eski yedek dosyaları geriye dönük silinmez; bunların içindeki eski metinler yerinde kalır.
- Anahtarsız arama DuckDuckGo → Bing RSS yedeğidir. İsteğe bağlı herkese açık SearXNG veya Brave API. CAPTCHA/hız sınırı mümkündür; sonuç uydurulmaz.
- Web fetch: HTTP(S), public sitelerde özel portlar dahil, kimlik bilgisi içermeyen URL, özel/rezerve IP ve yerel alan adı engeli, tüm DNS adreslerini kontrol ve bağlantıda IP sabitleme, her yönlendirmeyi kontrol, boyut/zaman sınırı. HTML scriptleri çalıştırılmaz. Kullanıcının seçtiği LM adresi ayrı, açıkça yetkilendirilmiş bağlantıdır; localhost burada doğal olarak serbesttir.
- Renderer `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`; dar IPC yöntemi listesi; ana pencere/ana frame kontrolü; yeni pencere ve gezinme engeli; izin talepleri reddedilir; CSP ve güvenli Markdown. Web sayfasındaki içerik kullanıcı isteğinin yerine geçmez; ajanın getirdiği sayfa kodu uygulama renderer’ında yürütülmez. İstenen normal web gezintisi, tamamen ayrı ve uygulama IPC’si olmayan WebContentsView içinde JavaScript çalıştırabilir.
- Kaynak/araç doğrulaması modelin asla yanlış cümle üretmeyeceğini garanti etmez. Görünür araç sonucu, gerçek işlem ve kaynak tarihini kontrol et.

## Mimari

```text
React renderer (Türkçe UI, sanallaştırma, DnD, Markdown)
       │ dar çağrı API’si + durum/oyun/sohbet/araç olayları
       ▼
Electron preload (contextBridge, yöntem allowlist)
       ▼
Electron main / Service
 ├─ Store             Atomik JSON, şema doğrulama, yedek, geri al, ayrı oyun notları
 ├─ AppBrowser        Ayrı chrome IPC + sekme başına yalıtılmış WebContentsView
 ├─ Providers + Queue Steam/GOG/EGData/Xbox/HLTB, medya önbelleği, iptal edilebilir sıra
 ├─ Hardware          systeminformation + dxdiag / isteğe bağlı vulkaninfo
 ├─ LMClient          OpenAI SSE / native reasoning SSE
 └─ Agent             Otonom araçlar, isteğe bağlı onay, soru akışı, tur kotası yok
       └─ Network     DNS-sabitlenmiş güvenli public fetch + arama sağlayıcıları
```

Donanım/uyumluluk ve içe aktarma alan mantığı `shared` katmanındadır. Tarayıcı önizlemesi aynı `Service` sınıfına geliştirme HTTP/SSE köprüsüyle bağlanır; üretim EXE’sinde HTTP sunucusu çalıştırılmaz. Metadata güncellemeleri tüm büyük kütüphaneyi her seferinde IPC’den göndermek yerine tek oyun olayıyla iletilir.

### Kaynak dizini

```text
src/
  App.tsx                      Uygulama kabuğu, olay akışı, seçim ve sürükleme bağlama
  style.css                    Temalar, responsive düzen, cam ve hareket stilleri
  components/Library.tsx       Sanallaştırılmış liste, filtreler, seriler, grup çipleri
  components/Detail.tsx        İstatistikler, oyun ayrıntıları, Not sekmesi, araştırma durumu
  components/Catalogs.tsx      Mağaza durumları ve HLTB süre kartları
  components/Chat.tsx          Markdown sohbet, araç kartları, izin ve soru sihirbazı
  components/Modals.tsx        İçe aktarım, oyun/grup/seri/işlem pencereleri
  components/Settings.tsx      Görünüm, LM, donanım, web, yedek ayarları
  components/UI.tsx            Odak tuzaklı modal ve paylaşılan bileşenler
  lib/api.ts, context.tsx      Desktop/preview köprüsü ve UI bağlamı
shared/
  types.ts, domain.ts          Veri modelleri, ayrıştırma, sıra ve seri mantığı
  compatibility.ts             Temkinli bileşen karşılaştırma
  hardware-match.ts            Gereksinim metnini okuma, PassMark/TechPowerUp ile karşılaştırma (2.1.0)
  hardware-db.json             Donanım verisi (scripts/hardware-data.ts üretir)
  browser.ts, links.ts          Adres/arama ve ürün bağlantısı sınıflandırması
 electron/
  main.ts, preload.ts          Güvenli uygulama penceresi ve IPC
  browser.ts                   Sekmeler, gezinme, oturum ayrılığı, indirme diyaloğu
  browser.html, browser-ui.ts   Yerel tarayıcı adres/sekme arayüzü
  browser-preload.ts            Yalnızca tarayıcı komutları için ayrı köprü
  service.ts, store.ts          Uygulama işlemleri, kayıt ve yedek
  validation.ts                İçe aktarılan/kaydedilen verinin Zod şemaları
  providers.ts, network.ts     Çoklu sağlayıcı birleştirme, kuyruk, web araçları
  catalogs.ts                  GOG/Epic/Xbox eşleştirmeleri ve HLTB okuma
  hardware.ts                  Windows donanım algılama
  lm.ts, agent.ts, tools.ts     Model aktarımı, ajan, araç sözleşmeleri
  context.ts, research.ts       Geçmiş bütünlüğü, isteğe bağlı kaynaklı düzenleme
  pages.ts                     Kayıpsız sayfa bölümleme ve devam bilgisi
scripts/                        Paketleme, lisanslar, önizleme, Electron smoke testi
resources/                      Simge ve üçüncü taraf lisans bildirimleri
tests/                          Birim/entegrasyon + Playwright arayüz testleri
Derle.ps1 / Derle.cmd            Windows tek komut / çift tıklama derlemesi
```

## Bağımlılıklar ve tekrar derleme

**Geliştirmek/derlemek için:** Windows 10/11 x64, Node.js **22.12+ (22 LTS veya 24 LTS önerilir)**, npm, ilk indirmeler için internet. Python/.NET/Visual Studio Build Tools gerekmez; native modül derlenmez. Paketleme sırasında Electron ve NSIS araçları otomatik indirilir. 4 GB veya daha fazla boş RAM ve yaklaşık 2 GB boş disk önerilir; büyük kütüphane/model ayrı bellek ister.

Başlıca kilitli sürümler: Electron 44.7.2; electron-builder 26.15.3; React 19.1.1; TypeScript 5.9.3; Vite 6.4.4; Framer Motion 14.2.0; dnd-kit; TanStack Virtual; react-markdown/remark-gfm; systeminformation 5.33.15; undici 6.29.0; cheerio; ipaddr.js; Zod; zod-to-json-schema 3.25.1 (gerçek doğrulayıcıdan araç JSON şeması). Tam sürüm ağacı `package-lock.json` içindedir. Builder’ın eski proxy bağımlılığı güvenli `global-agent 4.1.3` ile kilitlenir. Vitest 5.0.4 ve Playwright 1.56.1 ve AJV 8.20.0 test için kullanılır.

Kaynak ZIP’ini aç, proje klasöründe PowerShell ile **tek komut**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Derle.ps1
```

Alternatif: `Derle.cmd` dosyasına çift tıkla. Script `npm ci`, TypeScript kontrolü, birim testleri ve Windows portable paketlemesini çalıştırır. Başarısız adımda durur. Sonuç **`Yayin\Oyun-Siralayici-1.0.13-Portable.exe`** ve SHA-256 dosyasıdır. Arayüz testleri ayrıca Chromium indirmesi gerektirdiğinden bu kısa derleme scriptine dahil değildir.

```powershell
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

`npm run build` ham çıktısı proje üstündeki `.cache\oyun-package` klasörüne gider. Paketleyici, düşük bellekli ortamlarda da çalışabilmesi için 7-Zip sıkıştırmasını varsayılan 3 düzeyinde tutar. `ELECTRON_BUILDER_COMPRESSION_LEVEL` ortam değişkeniyle değiştirilebilir.

Masaüstü geliştirme: `npm run desktop`. Tarayıcı geliştirme: ayrı terminallerde `npm run preview:server` ve `npm run dev`; `http://localhost:5173`. Önizleme geliştirme içindir, herkese açık production sunucusu olarak kullanılmamalıdır. Sandbox’taki tarayıcı önizlemesinin localhost’u **senin PC’n değildir**; orada Windows donanımı veya kendi LM Studio’n algılanamaz.

## Bilinen sınırlar / teslim kapsamı

1. EXE gerçekten derlenmiş/paketlenmiştir; **gerçek Windows çalıştırma, WMI/dxdiag, Windows cam efektleri, SmartScreen ve gerçek bir LM Studio modeliyle uçtan uca test burada yapılamadı.** Linux Electron smoke testi ve kontrollü sahte LM sunuculu testler farklı kapsamdır.
2. İmzasız x64 paket. ARM64 için ayrı native paket, kurulum sihirbazı, imzalama, otomatik güncelleme yoktur.
3. Otomatik katalog kapsamı Steam, GOG, Epic (EGData) ve Xbox / Microsoft Store ile sınırlıdır; bütün mağazaların tamamını taradığı iddia edilmez. Diğer ürün bağlantıları ajan tarafından eklenebilir. Otomatik tamamlama hâlâ Steam’den gelir; adına eklenen Steam dışı oyunlar da diğer sağlayıcılarda kontrol edilir. Bölge, yaş, isim/sürüm farkı veya API değişikliği sonuçları etkileyebilir.
4. Türkçe dil/yama bilgisi 1.0.12’de kaldırıldı; uygulama bunu göstermez veya araştırmaz. HowLongToBeat süreleri topluluk verisidir; HLTB okuma resmi API garantisi taşımaz, Codepotatoes topluluk servisi veya HLTB sitesi değişirse/engellerse süre “alınamadı” görünür. SteamDB’nin kullanılabilir genel ücretsiz API’si bulunmadığı için satış/fiyat geçmişi kazıması uygulanmadı; sadece doğrudan tarayıcı bağlantısı vardır.
5. Donanım tablosu sınırlı/yaklaşıktır. Emülatör, mod, sürücü, optimizasyon, termal sınır, çözünürlük ve FPS tahmini yapmaz. Sarı sonucu yeşile zorlamaz.
6. Otomatik seri sezgisi ad numaralandırmasına dayanır; yanlış pozitif/eksik seri olabilir. Elle düzeltme vardır. Yeni üye aynı seriye katılabilir; daraltılan başlık sadece görünür sırada bitişik üyeler için oluşur.
7. JSON yedek araç modu native tool calling kadar güvenilir olmayabilir. API/model sürüm uyumu ayrıca kontrol edilmelidir. Düşünme yetenek bilgisi yoksa kontrol kapalıdır. Çıktı bütçesi karakter sayısından tahmin edilmez; seçilen ajan limiti aynen gönderilir. Geçmiş kırpılmaz; gerçek kapasiteyi sunucu belirler.
8. Arama sağlayıcıları engel/CAPTCHA uygulayabilir. SearXNG bu güvenli web katmanında public HTTP(S) adreslerinde kullanılabilir; yerel SearXNG adresi kabul edilmez.
9. Yerel JSON saklama tek kullanıcılıdır. Cloud sync, çok kullanıcılı veritabanı, Steam hesabından otomatik sahiplik/oynanma saati içe aktarımı yoktur. Büyük metadata arşivlerinin kayıt/yedek süresi disk hızına bağlıdır.
10. Görsel/animasyon dili modern bir cam arayüzdür; işletim sistemi düzeyinde iOS animasyon motoru değildir. Erişilebilirlik için hareket kapatılabilir; küçük genişliklerde sohbet açılır yan panel olur.

## Resmi teknik referanslar

- LM Studio model yetenekleri: https://lmstudio.ai/docs/developer/rest/list
- LM Studio OpenAI uyumlu sohbet: https://lmstudio.ai/docs/developer/openai-compat/chat-completions
- Native reasoning/chat: https://lmstudio.ai/docs/developer/rest/chat
- Native SSE olayları: https://lmstudio.ai/docs/developer/rest/streaming-events
- Electron güvenliği: https://www.electronjs.org/docs/latest/tutorial/security
- Electron kullanıcı veri yolu: https://www.electronjs.org/docs/latest/api/app#appgetpathname
- electron-builder portable: https://www.electron.build/nsis.html#portable

MIT lisanslı uygulama kodu; üçüncü taraflar kendi lisanslarına tabidir. Lisans bildirimleri `resources/THIRD-PARTY-LICENSES.txt` ve paket içinde bulunur.

## Önceki sürüm notları (tarihî)

> Bu bölümlerde geçen Türkçe sekmesi, resmi dil, Türkçe yama ve “dil-süre/yama aşaması” ifadeleri o sürümlerin kaydıdır; **bu özellikler 1.0.12’den beri yoktur.** HowLongToBeat süreleri ve “Ne kadar sürer?” bölümü ise 1.0.13’te geri geldi (araştırma aşaması olarak değil, mağaza yenilemesinin parçası olarak).

### 1.0.11 — durdurduktan sonra kaldığı yerden devam

- **Araştırmaya devam et** ile **Baştan araştır** ayrıldı. Devam işlemi kayıtlı sonuçlardan eksik aşamaları hesaplar; tamamlanan donanım aşamasını tekrar başlatmaz.
- Araştırma sohbetinde **Durdur → Devam et** sonrasında kaydedilen donanım sonucu otomatik akışa yansır. Başarılı tamamlamadan sonra kalan özet/dil-süre/yama aşamalarına geçilir; arayüz eski “durduruldu” durumunda kalmaz.
- Durdurma veya model hatası devam izni sayılmaz. Kaydedilmiş değişiklikler ve eski sohbetler korunur. Eski sürümde manuel tamamlanmış kayıtlar da devam sırasında okunur; yeni bir aşama işareti gerektirmez.
- Tamamlanma modelin “bitti” cümlesinden değil gerçek gereksinim/karşılaştırma ve diğer kayıtlardan doğrulanır. Donanım/gereksinim değişikliği değerlendirmeyi belirsiz bırakırsa eksik aşama yeniden ele alınır.
- **Baştan araştır** ve **Tüm oyunları yeniden araştır** bilerek tam araştırma yapar. Bu sürüm modelin kendi thinking döngüsünü giderdiği iddiasını taşımaz; durdurma sonrası uygulamanın ilerlemeyi kaybetmesini düzeltir.

**Doğrulama:** 295/295 birim, 35/35 UI; beş Linux Electron senaryosu ve Windows paket kontrolü. Gerçek Windows/LM Studio modeli denenmedi. [Değişiklik raporu](docs/DEGISIKLIKLER-1.0.11.md) · [1.0.11 test raporu](docs/TEST-RAPORU-1.0.11.md).

### 1.0.10’dan korunanlar — kişisel notlar kaldırıldı, araştırma akışı düzeltildi

- **Kişisel oyun notu özelliği tamamen kaldırıldı:** arayüz, veri tipi/doğrulama, kayıt, içe/dışa aktarım ve ajan düzenleme araçları. Eski oyun verisi yüklenirken alan temizlenir; eski yedek/sohbet metinleri geriye dönük değiştirilmez.
- **Türkçe gereksinimler gerçek alanlara ayrıştırılır:** noktalı virgüllü `Grafik`, `Ekran kartı`, GPU/VRAM, CPU, RAM ve depolama. Eski ham metindeki kayıp alanlar mevcut açık değerleri ezmeden tamamlanır.
- **Denetim uygulamada:** her seviyenin eksik gereksinimleri ve bekleyen karşılaştırmaları takip edilir. Model erken bitirirse düzeltme turu başlatılır; yayımlanmayan CPU vb. tahmin edilmez, tabloda **Yayımlanmamış** görünür. Kaydedilmeyen/uygulanmayan kıyas başarı sayılmaz. İlerlemesiz aynı hata tekrarı durdurulur.
- **Geçmiş değişmez:** araç kartları çağrı anındaki girdiyi/sonucu saklar, sonraki oyun düzenlemesinde geçmiş kartı değiştirmez.
- **Kısa otomatik talimatlar:** ortak kurallar uygulamanın yerleşik politikasında; cihaz ve oyun bilgileri araçlardan okunur. Örnek Max Payne ölçümünde dört aşama gövdesi toplam **8083 → 543 karakter**; bu tüm istek/token boyutu değildir. Araç tarifleri ve gerektiğinde okunan veriler hâlâ bağlama girer.
- Normal isteğini yazman veya **Araştır** düğmesini kullanman yeterli; teknik kuralları her seferinde promptuna eklemen gerekmez. Normal sohbetin düzenleme araçları korunur; arka plan araştırması hedef oyunun araştırma verileriyle sınırlıdır.

**1.0.10 testi:** 275/275 birim, 32/32 arayüz, dört Linux Electron senaryosu; Windows x64 paket/ASAR doğrulaması. Gerçek Windows ve gerçek LM modeli denenmedi. [Ayrıntı](docs/DEGISIKLIKLER-1.0.10.md) · [Test raporu](docs/TEST-RAPORU-1.0.10.md).

### 1.0.9’dan korunan düzeltmeler (önceki sürüm)


- Karşılaştırma sonuçları bileşene özel korunur; ilgisiz disk değişikliği GPU tikini kaldırmaz. AI araştırması yalnız donanım verisinin karar veremediği CPU/GPU satırlarına bakar (2.1.0); uygulanmayan kayda başarı denmez. Gerçek donanım eksikken sahte tik oluşmaz.
- Gereksinim metni yeniden ayrıştırılır; açık alanlar önceliklidir. `null` yanlış isteğe bağlı gereksinimi siler. Eksik bilgi uydurulmaz.
- Mağaza bağlantısı ve kontrol durumu eşlenir. HLTB kısmi güncellemesi diğer saatleri korur; boş `found` tamamlanmış veri sayılmaz.
- Grup oluşturma/düzenleme/silme ve seri oluşturma/adlandırma/dağıtma için **6 yeni ajan aracı** vardır. Otonom/onaylı kullanım ve geri alma korunur.
- Native/JSON araç tarifleri gerçek doğrulama şemasından üretilir. Ayrı özet yardımcısında önceden açıklama şartı kaldırıldı.

**Önceki sürüm testi:** 247 birim/entegrasyon (44 yeni), 30 UI (3 yeni); Linux Electron, HTTP/SSE fixture, paket byte/mimari doğrulaması. Gerçek Windows ve kullanıcının modeli test edilmedi. Ayrıntı: [11 bulgunun kapanış raporu](docs/AGENT-DESTEK-DUZELTMELERI-1.0.9.md).

**Güncelleme:** Eski EXE’yi kapatıp güncel sürümü (1.0.13) aç; önce ara sürüm kurma, veri klasörünü silme, oyunları tekrar aktarma. Eski eksik/yanlış bilgi için ilgili oyunda **Araştır** kullan. Tamamlanmış bütün işler otomatik yeniden başlatılmaz. Model/bağlam/çıktı ayarın değiştirilmez.

### 1.0.8 — seçilen çıktı sınırının 128’e düşürülmesi düzeltildi

Kullanıcının ayarı **16128** iken gerçek istek **`max_tokens:128`** gönderiyordu. Kaynakta bulunan yaklaşık `karakter/2.5` girdi hesabı ve kalan bağlama göre çıktı daraltma kaldırıldı. Uygulama bu sınırı kendi kendine düşürmeyecek.

- Ajan çağrılarında OpenAI/native ve JSON yedek yolunda `max_tokens`, düşünme API’sinde `max_output_tokens`, seçilen `maxTokens` değeridir. İkinci bir gizli çıktı-limit parametresi kaldırıldı.
- Uzun konuşma/araç sonuçları kesilmez. Gerçek model kapasitesini sunucu uygular; sunucu bağlam hatası verirse gösterilir. Kullanıcının ayarı gizlice değiştirilmez, kapasite hatasında daha düşük bütçeyle otomatik tekrar yapılmaz.
- Çıktı alanı 1’er token adımını destekler: **16128, 20000, 20001** aynen kaydedilip gönderilir. 16K’nın katı olma veya 32768’e yuvarlama kuralı yoktur.
- Ayarlarda ajan isteğine gönderilecek üst sınır açıkça gösterilir. Yüklü bağlam alanı yalnızca kayıt/bilgi amaçlıdır; modeli yeniden yüklemez veya çıktı sınırını daraltmaz. Yanıt üst sınırı ile modelin toplam bağlam kapasitesi farklıdır.
- Test: **203 birim/entegrasyon ve 27 UI**. Linux Electron + yerel HTTP/SSE fixture ile eski hesabın 128’e düşürdüğü uzun geçmişte **9/9 isteğin 16128 gönderdiği** doğrulandı. Gerçek kullanıcı modeli/Windows çalıştırması test edilmedi; HTTP 500’ün tüm olası nedenlerinin çözüldüğü iddia edilmez.

1.0.7’yi önce kurmak gerekmez. Eski EXE’yi kapatıp güncel sürümü (1.0.13) aç; veri klasörünü silme. Önce sorun çıkan tek oyunda **Araştır** ile dene. 1.0.7’nin araç girdisi onarımı korunur; araştırma aşamaları 1.0.12’de **donanım → özet** olarak sadeleşti.

### 1.0.7’den korunan araç girdisi onarımı ve aşamalı araştırma

- Bozuk/yarım JSON artık `null` diye maskelenmez. Ham girdi araç kartında ve hata sonucunda korunur; modele gerekli alanları içeren düzeltme geri bildirimi gönderilir. Eksik değer tahmin edilip kayıt yapılmaz. Yalnızca açık JSON kod bloğu veya çift JSON kodlaması gibi belirsiz olmayan sarmallar açılır.
- Eski sohbetlerdeki bozuk native araç girdileri sunucuya gönderilirken geçerli protokol zarfına alınır; ham girdi araç sonucunda korunur, kayıtlı geçmiş değiştirilmez veya kesilmez. Bu, bazı şablonların hatalı JSON’u çözümleyememe riskini giderir; tüm HTTP 500 hatalarını çözdüğü iddia edilmez.
- Geçersiz girdili kartta **Yeniden dene**, aynı bozuk girdiyi tekrar yürütmek yerine modelden düzeltilmiş bir çağrı ister. JSON yedek modunda da tek bir kötü çağrı diğer geçerli çağrıları düşürmez.
- Otomatik araştırma artık **Donanım → Özet (ayarı açıksa) → Resmi dil/HLTB → Türkçe yama** olarak ayrı model turlarına bölünür. Her yeni araştırma işi yeni sohbetle başlar; önceki sohbet korunur. Aşama adı oyun ayrıntısında görünür. Araç tur kotası veya yeni zorunlu kaynak kapısı eklenmedi.
- Yama için birden fazla uygun kaynak bulunması tek bir kazanan seçmeyi gerektirmez. Genel `oyun adı türkçe yama` sorgusu ve filtresiz aday iletimi korunur. Modelin iç düşünme döngüsünün kesin önlendiği iddia edilmez; gerekirse Durdur kullanılabilir.
- Özet model tarafından yazılır; yeterli mevcut açıklama/bilinen doğru bilgi varsa ayrıca web araması gerekmez. Bilgi belirsizse araştırması, bilmediğini uydurmaması istenir. Otomatik özet açıksa kaydedilmeyen özet artık eksik sonuçta sayılır.
- Modelin bildirdiği çıktı token sınırı görünür uyarı olur. HTTP 5xx için anlaşılır sunucu hatası açıklaması ve açılabilir ham teknik yanıt vardır; kör otomatik 500 tekrarları yoktur.

**1.0.6’dan güncelleme:** mevcut bitmiş araştırmalar kendiliğinden bütünüyle yeniden başlatılmaz. Eksik kalanlar için **İstatistikler → Tüm oyunları yeniden araştır** veya tek oyunda **Araştır** kullan. Eski EXE’yi kapat; veri klasörünü silme. 1.0.7 testi: **190 birim/entegrasyon, 26 UI**, Linux Electron + deterministik HTTP/SSE model fixture; gerçek Windows ve kullanıcının modeli test edilmedi.

### 1.0.6’dan korunan geniş yama araması ve eski kayıt geçişi

- Yama keşfinin ilk sorgusu tam olarak **`oyun adı + türkçe yama`**. Zorunlu site/katalog önceliği, `site:` veya tırnak ekleme, oyun sözcüğü/devam oyunu filtresi yok. Arama motorunun sonuçları modele iletilir; alakasız sonucu değerlendirmek modelin işidir.
- İlk açılışta **bütün eski kayıtlar**, bitmiş oyunlar ve daha önce “yok” denmiş oyunlar dahil, bir defa yeniden araştırma kuyruğuna girer. Yeni oyun otomasyonu kapalı olsa da bu sürüme özel toplu geçiş yapılır. Seçili/bağlı model olmadan işlem bekler.
- Önce yedek alınır; oyunlar, sıra ve eski sohbetler korunur; kişisel oyun notu alanı 1.0.10’da kaldırılmıştır. Her yeniden araştırma yeni bir araştırma sohbetiyle başlar. Eski olumsuz kayıtlar **Yeniden araştırılacak** olarak görünür; yeni sonuç yazılmadan kesin “yok” sayılmaz.
- **İstatistikler → Tüm oyunları yeniden araştır** ile daha sonra tekrar başlatılabilir. Kuyruk ve çalışan sayısı ile durdurma düğmesi görünür. Açıkça durdurulan işler yeniden açılınca kendiliğinden başlamaz; yarıda kalmış çalışan görev ise sıraya döner.
- Masaüstü IPC izin listesine araştırma/yeniden araştırma/durdurma eklendi; gerçek Electron üzerinde düğmeler test edildi. Bu kontrollerin servisle aynı listeyi taşıdığı regresyon testi var.
- Doğrulama: **1.0.6’da 172 birim/entegrasyon, 25 arayüz testi**; Linux Electron yükseltme ve yeniden açılış testi. Canlı genel arama Max Payne/Hades için ilgili bağlantılar döndürdü; yama dosyası veya gerçek kullanıcı modeli test edilmedi.

Bilgisayarındaki kütüphaneye bu geliştirme ortamından erişilmedi. Toplu AI araştırması yeni EXE’yi açıp modeli bağladığında kendi bilgisayarında yapılır.

### 1.0.5’ten korunan diğer değişiklikler

- HLTB eşleştirmesinde genel aramaya bağımlılık azaltıldı: GOG bölümünden sonra Steam appId / tam ad ile **Codepotatoes topluluk API’si**, ardından HLTB sayfa JSON’u. Resmi HLTB API’si değildir. Kaynak güncelleme ve kontrol tarihi ayrı saklanır.
- **Xbox / Microsoft Store** katalog kartı: gerçek ürün ID’si, platform, mevcut fiyat; aynı adlı çoklu sürümde belirsizlik ve ürün adayları. Game Pass/sahiplik entegrasyonu değildir.
- `Video card`, `HARD DRIVE SPACE` ve çok düzeyli eski gereksinim metinleri ayrıştırılır. Yalnızca minimum ve önerilen düzey vardır; eski metinlerdeki üçüncü blok yok sayılır ve önerilene karışmaz. Kaynaksız önerilen GPU/RAM/disk türetilmez. Sistem satırları dizi indeksiyle değil bileşen adıyla eşleşir.
- Katalog toplama bitince **otomatik AI araştırma kuyruğu**: donanım/gereksinimler → isteğe bağlı özet → resmi dil/süre → Türkçe yama. `record_compatibility` CPU/GPU tahminlerini de düzeltebilir; sayısal RAM/disk/VRAM/DirectX hesabını ezmez. Yalnız ilgili bileşenin donanım/gereksinimi değişirse eski AI sonucu geçersiz kalır. Eksik gerçek donanıma AI sonucu uygulanmaz.
- Model yoksa bekler; bağlantı testi/model seçimi ile devam eder. Ayrı araştırma sohbetleri, durdurma, öncelikli normal sohbet ve geri alma vardır. Modelin sözlü tamamlanma iddiası yerine alanların gerçek durumu gösterilir. Kaynak/alıntı/önceden fetch zorunluluğu ve keyfî araç tur kotası yoktur.
- Açılış **İstatistikler**; tek ana liste **Oynama Listesi**, yeni ve eski oyunlar burada. **Sonraki Oyun** sıradaki ilk bitmemiş kaydı gösterir. Toplu aktarımın her satırında elle Steam arama/seçme vardır; seçilmemiş satır sessizce Steam ile eşleştirilmez.
- İstenen Notlarım/Kaynaklar sekmeleri, sistem açıklama/ham metin bölümü, sistem içi donanım düğmesi, yinelenen üst/sol ekleme düğmeleri, üst sağ sohbet düğmesi, sloganlar ve footer kaldırıldı. Kaynak kayıtları ve Ayarlar’daki donanım yönetimi korunur. Kişisel oyun notları artık veri modelinde yoktur.

Eski kayıtlar için **Mağazalar → Mağazaları yenile** kullan; eski katalog sürümü yeni sağlayıcıları atlamaz. Kullanım: [BASLA.md](BASLA.md). Testler: [TEST-RAPORU.md](TEST-RAPORU.md).
