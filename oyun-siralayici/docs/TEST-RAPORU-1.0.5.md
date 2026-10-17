# Oyun Sıralayıcı 1.0.5 — test ve teslim raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Vitest birim/entegrasyon | **156 / 156**, 11 dosya |
| Playwright arayüz | **23 / 23** |
| Üretim Electron açılış, IPC, otonom varsayılan, ekle/sil/geri al | Geçti — Linux |
| Sekmeli Electron tarayıcı, adres, geri/ileri, popup, IPC/oturum ayrılığı | Geçti — Linux, yerel fixture web sunucusu |
| Gerçek mağaza/HLTB verisinin masaüstünde gösterimi | Geçti — Stardew Valley, Linux Electron |
| Canlı HLTB Steam-ID / ad araması | Hades, Portal 2, Fortnite için gerçek süreler alındı |
| Canlı Xbox katalog kontrolü | Hades ve Stardew Valley ürünleri; Halo Infinite çoklu sürüm → belirsiz adaylar |
| Canlı Türkçe yama keşfi | Max Payne 1 ve Max Payne 2 için ilgili Oyun Çeviri sayfaları; HBO Max sonucu yok |
| `npm audit` | **0** bildirilen zafiyet |
| Windows portable paket | Üretildi, iç uygulama Windows x64 PE |
| ASAR doğrulaması | Ana süreç, preload’lar, tarayıcı HTML/JS ve renderer/CSS dahil **8 dosya byte eşleşti** |
| Gerçek Windows, WMI/dxdiag, Mica/Acrylic, DPAPI, SmartScreen | **Test edilmedi** |
| Kullanıcının gerçek LM Studio modeli | **Test edilmedi**; ajan davranışı deterministik model/SSE testleriyle doğrulandı |

## 1.0.5’e özgü kontroller

### Gereksinimler ve karşılaştırma

Kullanıcının verdiği yapı test fixture’ına aktarıldı:

- Minimum CPU: Pentium 4 2 GHz / Athlon XP 1800+.
- Minimum GPU: 128 MB NVIDIA 6600 veya ATI X1300.
- Minimum RAM: 1 GB; disk: 7 GB; OS: Windows XP SP2 / Vista.
- Önerilen bölümde yalnızca CPU 2.5 GHz / Athlon XP 2400+ bulunur; GPU/RAM/disk türetilmez.
- Optimum CPU 3 GHz / Athlon XP 3000+, RAM 2 GB, GPU NVIDIA 8300 / ATI X1800 ayrı kalır.

Ayrıştırma, MB→GB, düzey ayrımı ve bileşen adına göre tablo eşleştirmesi test edildi. İkinci tabloda VRAM satırı yokken OS satırının kaymaması arayüz testine eklendi. Sistem ham metin/açıklama ve donanım düzenleme düğmelerinin yokluğu doğrulandı.

AI karşılaştırması yalnızca belirsiz satırı tamamlar; deterministik disk hesabını ezmez. Donanım veya gereksinim değişirse eski sonuç uygulanmaz. Testte kullanılan AI karşılaştırma sonucu fixture’dır; gerçek benchmark sonucu veya kullanıcının bilgisayarında oynanabilirlik ölçümü olarak sunulmaz.

### Otomatik araştırma

- Metadata tamamlanınca model yoksa dürüst bekleme durumu; sahte sonuç veya sohbet oluşturma yok.
- Bağlantı kesik olduğunda her kuyruk öğesinde tekrar tekrar bağlanmama.
- Gerçek ajan araç zinciri: oyun okuma, web arama aracı, karşılaştırma, AI karşılaştırma kaydı, Türkçe kaydı.
- Kaynak veya alıntı olmadan izin verilen metadata düzenlemesi; mevcut otonomi testleri korunur.
- Ayrı otomatik sohbet; aktif kullanıcı sohbetinin değişmemesi.
- Yalnızca “doldurdum” diyen modelin kaydı tamamlamış sayılmaması.
- Çalışan model akışını iptal etme, bekleyen işleri durdurma.
- Normal sohbetin araştırmayı duraklatması ve ardından araştırmanın sürmesi.
- Geri almanın tamamlanmış değişikliği geri çevirmesi ve arka planı durdurması.

**Bu testlerde gerçek kullanıcının LM Studio modeli kullanılmadı.** Gerçek modelin araç seçimi/arama başarısı ve donanım değerlendirmesinin doğruluğu modele ve ulaşılabilen kaynaklara bağlıdır. Bulunamayan bilgi belirsiz kalır.

### Sağlayıcılar ve arayüz

Katalog testleri 21’den 26’ya çıkarıldı: HLTB Steam ID, yanlış devam oyunu ve boş süre reddi; Xbox gerçek ID/platform/fiyat; üyelik indirimini genel fiyat saymama; belirsiz sürümler; elle Steam seçimi yapılmamış satırı otomatik eşleştirmeme.

Arayüz testleri 20’den 23’e çıkarıldı. İstenen kaldırmalar nedeniyle eski Notlarım/Kaynaklar, slogan ve ayrıntı açılır bölümü beklentileri yeni kabul kriterlerine göre değiştirildi; eski not/kaynak verisinin JSON’da korunması ayrıca test edildi. Yeni testler:

1. İstatistikler açılışı, tek oynama listesi, yinelenen düğme/footer yokluğu, sıra değişince ilk bitmemiş oyunun başlığa gelmesi.
2. Toplu aktarım satırında farklı Steam adı arayıp seçme, gerçek appId ve oynama listesi üyeliğinin kaydı.
3. Minimum/önerilen/optimum tablosu, eksik önerilen alanlar ve bileşen satırlarının doğru hizalanması.

Önceki sanallaştırma, sürükleme, seriler, izin, geri alma, wizard, tema, donanım ayarı, native/JSON araçlar, uzun araç akışı, Markdown ve ayrı sohbet geçmişi testleri çalışmaya devam eder. Keyfî araç tur kotası eklenmedi.

## Canlı internet kontrolleri

Tam sonuçlar: `docs/canli-saglayicilar-1.0.5.jsonl`. Tekrar komutu:

```bash
npx tsx scripts/revision105-live.ts
```

- Hades → HLTB 62941, Portal 2 → 7231, Fortnite → 3657 gerçek kayıtlarına ulaşıldı. Süreler kaynaktan okundu; Codepotatoes hizmeti **topluluk API’si** olarak etiketlendi.
- Aynı Hades sorgusunun farklı güncellenmiş kaynak kayıtları döndürebildiği görüldü. `sourceUpdatedAt` ayrı saklanır/gösterilir; kaynak süreleri sabit veya resmi garanti sayılmaz.
- Hades için Xbox ürün ID’si `9P8DL6W0JBB8`; Stardew Valley için `9MWR1NC6VQ6L`. PC/konsol bilgisi API’den alınır. Halo Infinite iki gerçek ürünle döndü; ilk ürün zorla seçilmedi.
- Max Payne → `https://www.oyunceviri.net/max-payne-1/`.
- Max Payne 2 → `https://www.oyunceviri.net/max-payne-2-100-turkce-yama/`. Diğer numaralı oyunlar elendi.
- Canlı genel aramada Bing’in HBO Max döndürdüğü regresyon yeniden üretildi. Oyun Çeviri kataloğu ve ilgililik kontrolü eklendi. Bir yama adayının bulunması dosyanın indirilip oyunda çalıştırıldığı anlamına gelmez; dosyalar indirilip yürütülmedi.
- Steam/GOG/HLTB/Xbox ile Stardew Valley’in gerçek kapak/mağaza/süre kartları Linux Electron’da görüntülendi. GOG HLTB değerleri: 53 / 94.5 / 172.5 saat; tüm tarzlar 100.5 saat.

## Kanıt dosyaları

- `docs/birim-testleri-1.0.5.txt`
- `docs/arayuz-testleri-1.0.5.txt`
- `docs/masaustu-test-1.0.5.txt`
- `docs/tarayici-test-1.0.5.txt`
- `docs/canli-masaustu-1.0.5.txt`
- `docs/canli-saglayicilar-1.0.5.jsonl`
- `docs/paket-dogrulama-1.0.5.json`
- `docs/guvenlik-taramasi-1.0.5.txt`
- `docs/arayuz-1.0.5.png`, `magazalar-1.0.5.png`, `sureler-1.0.5.png`, `tarayici-1.0.5.png`
- `BUILD-INFO.json`: sürüm, boyut, SHA-256, bağımlılık/derleme bilgileri.

Native WebContentsView için tarayıcı ekran görüntüsü Xvfb pencere kompozitinden alındı. İlk Linux smoke girişiminde eksik `libgtk-3` nedeniyle Electron açılmadı; test ortamına sistem bağımlılığı kurulduktan sonra testler geçti. Bu bir Windows kurulum bağımlılığı değildir; Windows paketinde Electron bulunur.

Windows paketi Linux üzerinde çapraz derlendi. NSIS dış başlatıcısının PE32 olması normaldir; iç uygulamanın x64 PE başlığı ayrıca doğrulandı. Son kullanıcı Windows kabul testi ve gerçek LM Studio modeliyle deneme bu raporun yerine geçmez.
