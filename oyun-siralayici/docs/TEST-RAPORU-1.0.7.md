# Oyun Sıralayıcı 1.0.7 — test ve teslim raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Birim/entegrasyon | **190 / 190**, 13 dosya |
| Playwright UI | **26 / 26** |
| Üretim Linux Electron açılış / IPC / ekle-sil-geri al | Geçti |
| Sekmeli uygulama tarayıcısı | Geçti — yerel web fixture |
| Eski kütüphane geçişi, durdurma ve yeniden açılış | Geçti — fixture kütüphane |
| Yeni aşamalı araştırma ve hatalı araç çağrısını düzeltme | Geçti — gerçek Linux Electron, yerel deterministik HTTP/SSE model sunucusu |
| Windows x64 portable paket | Üretildi; iç uygulama PE `0x8664` |
| ASAR içerik denetimi | **8 uygulama/arayüz/tarayıcı dosyası byte eşleşti** |
| `npm audit` | **0** bildirilen zafiyet |
| Gerçek Windows, WMI/dxdiag/DPAPI/Mica/SmartScreen | **Test edilmedi** |
| Kullanıcının LM Studio modeli ve gerçek düşünme döngüsü | **Test edilmedi** |
| Kullanıcının kütüphanesi | **Erişilmedi** |

## Ekran görüntüsünden bilinenler ve bilinmeyenler

`Expected object, received null` araç girdisinin doğrulanamadığını gösterir. Önceki kod, JSON çözümleme başarısızlığında girdiyi `null` yaptığı için asıl girdi gerçekten null mı, yarım/bozuk JSON mu, yalnızca görüntüden ayırt edilemez. Düzeltme bu ayrımı korur.

HTTP 500 model sunucusunun hata yanıtıdır. Gerçek sunucu günlüğüne erişilmediği için sebebi kesinleştirilemez. Bozuk native araç geçmişini JSON olarak çözümleyen bir model şablonu da sorun yaşayabilir; bu protokol riski giderildi. Ancak görüntüdeki 500’ün kesin nedeninin bu olduğu veya model sunucusundaki bütün 500 hatalarının çözüldüğü iddia edilmez.

## Yeni 18 regresyon testi

`tests/revision107.test.ts`:

- Null, dizi, sayı, metin, boş ve yarım JSON girdilerinin kayıt yapmadan reddi.
- Yalnızca açık JSON kod bloğu/çift kodlama sarmallarının açılması; eksik alan veya değer tahmin edilmemesi.
- Bozuk native girdinin ham halinin korunması; sunucuya geçerli çağrı zarfı ve hata sonucu verilmesi; modelin sonraki geçerli çağrısının gerçekten kaydedilmesi.
- Nested `patch:null` gibi hatalarda alan adı içeren düzeltme mesajı.
- Geçersiz girdili kartın yeniden denenmesinde aynı null girdiyi yürütmek yerine modele yeni çağrı ürettirme.
- JSON modunda aynı yanıttaki bir hatalı çağrının diğer geçerli çağrıyı engellememesi.
- Donanım karşılaştırması ve özetin **yama aşamasından önce gerçekten kaydedilmesi**. Yama aşamasındaki akış bekletilip iptal edilir; önceki kayıtların korunduğu doğrulanır.
- Özet açıksa yazılmamış özetin eksik sonuçta yer alması; ayar kapalıysa özet aşamasının/kontrolünün atlanması.
- Çıktı token sınırının görünür uyarısı; yarım araç girdisinin uygulanmaması.
- HTTP 500 ham gövdesinin korunması ve kör otomatik tekrar yapılmaması.
- Eski bozuk native araç geçmişinin yalnızca aktarım zarfının düzeltilmesi; kayıtlı geçmiş ve ham girdinin kaybolmaması.
- OpenAI SSE `finish_reason:length` bilgisinin korunması.

1.0.6’daki ilk model turunun yama sorgusu içermesi beklentisi, yeni donanım-ilk/yama-sonrası akışa göre güncellendi. Bütün oyunların geniş sorguyla araştırılması, eski geçmişlerin korunması ve önceki 172 regresyon testi çalışmaya devam eder. UI’ya HTTP 500 açıklaması ve açılabilir gerçek teknik yanıt kontrolü eklendi.

## Native HTTP/SSE testinin kapsamı

`scripts/research-smoke.cjs` derlenmiş Electron uygulamasını açar ve gerçek IPC üzerinden toplu araştırma düğmesine basar. Yerel fixture sunucusu sırasıyla:

1. `check_compatibility` / `record_compatibility` ile CPU karşılaştırmasını kaydettirir.
2. `update_game_info` ile oyun özeti kaydettirir.
3. Resmi dil/süre aşamasını bitirir; doldurulmayan alanlar eksik kalır.
4. Yama aşamasında bilerek yarım JSON gönderir; kaydın reddini ve ham girdinin korunmasını doğrular.
5. Düzgün çağrı gönderir; yeni yama durumunun kaydını doğrular.

Bu, gerçek uygulama ve protokol testidir; gerçek LM Studio modelinin çıkarımı veya gerçek bir yamanın doğrulanması değildir. Kullanıcının modelindeki düşünme döngüsünün tekrarlandığı/çözüldüğü iddia edilmez. Talimat iyileştirildi: birden fazla uygun yama için tek kazanan seçmek gerekmez. Keyfî araç tur kotası, düşünmeyi sessizce kapatma veya yeni kaynak/alıntı kapısı eklenmedi.

## Kanıtlar

- `docs/typecheck-1.0.7.txt`
- `docs/birim-testleri-1.0.7.txt`
- `docs/arayuz-testleri-1.0.7.txt`
- `docs/masaustu-test-1.0.7.txt`
- `docs/tarayici-test-1.0.7.txt`
- `docs/yukseltme-test-1.0.7.txt`
- `docs/asamali-masaustu-test-1.0.7.txt`
- `docs/asamali-arastirma-1.0.7.png`
- `docs/paket-dogrulama-1.0.7.json`
- `docs/guvenlik-taramasi-1.0.7.txt`

Önceki canlı internet kontrolleri `docs/TEST-RAPORU-1.0.6.md` ve `docs/TEST-RAPORU-1.0.5.md` içinde tarihleriyle korunur. Bu sürüm için yeniden yapılmış canlı sorgular gibi sunulmaz.

```bash
npm ci
npm run typecheck
npm test
npm run build
# preview:server ve dev ayrı süreçlerde çalışır; Playwright Chromium gerekir.
npm run test:ui
# Linux masaüstü kontrolleri:
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
xvfb-run -a node scripts/research-smoke.cjs
node scripts/verify-package.cjs
npm audit
```

İlk native paralel çalıştırmada Electron’un aynı anda indiriliyor olmasına bağlı `ETXTBSY` çıktı; indirme tamamlandıktan sonra yeni araştırma testi ayrı çalıştırılıp geçti. Bu hazırlık hatası ürün testi başarısı olarak sayılmadı.

## Güncelleme

1.0.6’dan geçiş mevcut bitmiş işlerin hepsini otomatik yeniden başlatmaz. Eksikleri tamamlamak için **Tüm oyunları yeniden araştır** veya tek oyunda **Araştır** kullanılır. Devam eden/eski bekleyen işler mevcut devam davranışını korur. EXE imzasız Windows x64 taşınabilir pakettir; Windows’ta çalıştırılmadı. Dosya boyutu ve SHA-256 `BUILD-INFO.json`, dağıtım özetleri `SHA256.txt` içindedir.
