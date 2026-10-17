# Oyun Sıralayıcı 1.0.8 — çıktı sınırı düzeltmesi

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Doğrulanan uygulama hatası

Kullanıcının ayarı **16128** iken istekte **`max_tokens:128`** bulundu. Aynı görüntüde `record_compatibility` için yarım JSON argümanı ve sonrasında `Expected object, received null` hata sonucu vardı.

1.0.7 dahil eski kod, tam konuşma ve araç şemalarının karakter sayısını 2.5’e bölüp token tahmini yapıyordu. `min(seçilen_limit, max(128, bağlam − tahmin))` hesabı, seçilen 16128 değerini 128’e düşürebiliyordu. Gerçek tokenizer kullanılmadığından kalan kapasite doğru hesaplanmış sayılmazdı.

**Bu hesap ve taşıma katmanındaki ikinci limit parametresi kaldırıldı.** OpenAI/native ve JSON ajan istekleri `max_tokens: settings.maxTokens`; desteklenen düşünme API’si `max_output_tokens: settings.maxTokens` gönderir. Modelden bağımsız tahminle otomatik düşürme veya 16K’ya yuvarlama yoktur. Gerçek bağlam kapasitesini yine sunucu uygular.

Bu bulgu uygulamanın sınırı düşürdüğünü doğrular. Kullanıcının HTTP 500 yanıtının kesin sunucu içi nedeni ise hâlâ kanıtlanmış değildir; gerçek LM Studio günlüğüne/modeline erişilmedi. Düşük bütçe → yarım araç çağrısı → bozuk geçmiş, gözlenen hatalarla uyumlu bir zincirdir; bütün 500 hatalarının çözüldüğü iddia edilmez.

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Birim/entegrasyon | **203 / 203**, 14 dosya |
| Playwright UI | **27 / 27** |
| Linux Electron + yerel HTTP/SSE model fixture | **9 / 9 ajan isteğinde 16128** |
| Eski hesabı aynı uzun fixture üzerinde uygulama | Eski hesap 128’e düşürüyor; yeni gönderim 16128 |
| Native/JSON/düşünme API’si gerçek istek gövdesi | 16128 ve 20000 aynen gönderildi — taklit fetch/SSE testleri |
| UI’dan kaydetme → HTTP sunucusunda alma | **20001, 20000, 16128**, sırası ve değerleri aynen korundu |
| Masaüstü açılış, IPC, ekle/sil/geri al | Geçti — Linux |
| Sekmeli tarayıcı, popup, gezinme ve IPC/oturum ayrılığı | Geçti — Linux + yerel fixture |
| Eski kayıt geçişi / durdurma / yeniden açılış | Geçti — fixture kütüphane |
| Windows x64 portable paket | Üretildi; iç uygulama PE `0x8664` |
| ASAR içerik doğrulaması | **8 dosya byte eşleşti** |
| `npm audit` | **0** bildirilen zafiyet |
| Gerçek Windows / kullanıcının modeli / gerçek 500 tekrar testi | **Test edilmedi** |

## Yeni regresyonlar

`tests/revision108.test.ts` içindeki **13 test**:

- Elle girilen 128/8192/16384/32768 bağlam değerlerinin seçilen 16128 çıktı limitini azaltmaması.
- Modelin bildirdiği yüklü bağlamın da çıktı limitini azaltmaması.
- Native, JSON ve desteklenen düşünme yollarında 16128/20000 ayarlarının gerçek HTTP gövdesinde aynen korunması.
- Uzun ve kaçış karakterleri içeren araç sonuçlarının eksilmeden taşınması.
- 16128, 20000, 20001 değerlerinin yuvarlanmaması; kullanıcının açıkça seçtiği 128’e ise saygı gösterilmesi.
- Sunucudan gelen gerçek kapasite hatasında görünür hata; otomatik bütçe düşürme, geçmiş silme veya tekrar olmaması.

Önceki `pages` testi artık yaklaşık bir alt sınır yerine **tam 20000** bekliyor. Eski `stream` bütçe-parametresi testi kaldırılan ikinci parametre yerine seçilen değerin korunmasını denetliyor; yeni testler HTTP gövdesini doğrudan yakalıyor. Önceki 190 regresyon testi korunur.

UI’ya eklenen 27. test, uzun geçmişle ayar ekranından 20001 → 20000 → 16128 girer; alanın geçerliliğini, kaydı, sunucuya giden sayıları ve yeniden yükleme sonrası korunmasını kontrol eder. Çıktı alanı adımı 1 oldu; bağlamın bilgi amaçlı olduğu açıklandı.

## Native testin kapsamı

`scripts/research-smoke.cjs` derlenmiş Electron uygulamasını kullanır. Fixture oyununda uzun gereksinim metni ve 16384 bağlam bilgisi vardır; gerçek sunucu modeli yoktur. Yerel HTTP/SSE test sunucusu 9 isteğin tamamında 16128 görür. Aynı verilerle eski tahminin 128’e düşeceği ayrıca hesaplanıp doğrulanır.

Donanım → özet → resmi dil/süre → yama aşamaları, kaydedilen CPU/özet/yama sonuçları, bilerek bozulmuş çağrının reddi ve sonraki düzeltilmiş kaydın başarısı da doğrulanır. Bu, gerçek kullanıcı modelinin kapasitesinin 16128 yanıtı kaldırabildiğini veya thinking döngüsünün çözüldüğünü kanıtlamaz.

## Kanıt dosyaları

- `docs/typecheck-1.0.8.txt`
- `docs/birim-testleri-1.0.8.txt`
- `docs/arayuz-testleri-1.0.8.txt`
- `docs/cikti-siniri-masaustu-1.0.8.txt`
- `docs/cikti-siniri-1.0.8.png`
- `docs/asamali-arastirma-1.0.8.png`
- `docs/masaustu-test-1.0.8.txt`
- `docs/tarayici-test-1.0.8.txt`
- `docs/yukseltme-test-1.0.8.txt`
- `docs/paket-dogrulama-1.0.8.json`
- `docs/guvenlik-taramasi-1.0.8.txt`

```bash
npm ci
npm run typecheck
npm test
npm run build
# Chromium, dev ve preview:server gerekir:
npm run test:ui
xvfb-run -a node scripts/research-smoke.cjs
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
node scripts/verify-package.cjs
npm audit
```

Önceki testler `docs/TEST-RAPORU-1.0.7.md` ve daha eski raporlarda tarihleriyle korunur. Bu sürümde yeni canlı web araştırması veya gerçek yama kurulumu yapılmadı.

## Kullanıcıya teslim sınırı

1.0.8 tek başına önceki düzeltmeleri içerir. Veri klasörü ve mevcut ayar korunur; 16128 seçimi için kullanıcıdan daha yüksek bağlam yüklemesi istenmez. Tamamlanmış bütün işler güncelleme nedeniyle otomatik yeniden başlatılmaz. Önce hatalı tek oyunda **Araştır** önerilir. Paket imzasızdır ve Linux’ta çapraz üretilmiştir; Windows’ta çalıştırılmadı. Özetler `BUILD-INFO.json` ve dağıtımın `SHA256.txt` dosyasındadır.
