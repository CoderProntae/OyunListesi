# Oyun Sıralayıcı 1.0.11 — test ve paket raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Birim/entegrasyon | **295/295**, 17 dosya |
| Yeni 1.0.11 regresyonları | **20** |
| Playwright Chromium | **35/35**, üç yeni senaryo |
| Native ve JSON manuel devam | Geçti — sentetik model |
| Linux Electron açılış/IPC/ekle/sil/geri al | Geçti |
| Linux Electron aşamalı araştırma | Geçti — 11 istekte seçilen 16128 çıktı tavanı korundu |
| Linux Electron eski kayıt geçişi | Geçti — durdurma/reopen, not kaldırılması, etiket/sıra korunması |
| Linux Electron sekmeli tarayıcı/izolasyon | Geçti |
| **Linux Electron devam / baştan IPC testi** | **Geçti — tamamlanmış donanım atlandı, açık restart donanımdan başladı** |
| Windows x64 portable | Üretildi; iç uygulama PE `0x8664` |
| ASAR byte doğrulaması | **8 dosya** derlenmiş çıktıyla eşleşti |
| npm audit | **0 bildirilen zafiyet**; genel güvenlik garantisi değildir |
| Gerçek Windows / WMI / DPAPI / SmartScreen | **Denenmedi** |
| Kullanıcının LM Studio modeli / thinking davranışı | **Denenmedi** |
| Gerçek oyun açılışı, FPS veya yeni canlı web araştırması | **Yapılmadı** |

## Yeni regresyon kapsamı

- İptal edilmiş araştırmayı sürdürürken manuel kaydedilmiş donanımın atlanması.
- Aşama işaretine körü körüne güvenilmemesi; değişen donanım belirsizlik yaratınca yeniden incelenmesi.
- Karşılanmayan ama tamamlanmış donanım karşılaştırmasının tekrar iş sayılmaması.
- Tüm kayıtlar tamamlandıysa devam isteğinin model çağrısı yapmadan işi tamamlaması.
- Açık baştan ve toplu yeniden araştırmanın donanımı bilerek yeniden çalıştırması.
- Özet ayarının kapalı olması; kaydedilmiş dil/sürenin atlanması; saatsiz HLTB ve kontrol bekleyen yamanın eksik kalması.
- Kayıt/reopen sırasında son aşama ve durdurma durumunun korunması.
- Native ve JSON modlarında sohbette “Devam et” → gerçek donanım yazması → kalan aşamalar.
- Son aşamayı manuel tamamlayınca cancelled yerine done durumu.
- Hem sohbet Durdur hem araştırma Durdur kontrolünün manuel devamı kesmesi; iptal/hata sonrası otomatik yeniden başlamama.
- Boş/geçersiz takip mesajının sahte running bırakmaması; ikinci eşzamanlı gönderimin takip bilgisini silmemesi.
- İlgisiz sohbetin durmuş araştırmayı başlatmaması; açık “devam etme” isteğinde kalan akışın başlatılmaması.
- Gerçek otomatik donanım turunu yarıda kesip eski sohbet içinde tamamlayınca donanımı ikinci defa başlatmama ve eski sohbeti koruma.

## Kanıtlar

`docs/typecheck-1.0.11.txt`, `birim-testleri-1.0.11.txt`, `arayuz-testleri-1.0.11.txt`, `arayuz-sonuclari-1.0.11.json`, `arastirmaya-devam-1.0.11.png`, `devam-masaustu-1.0.11.txt`, `masaustu-test-1.0.11.txt`, `asamali-arastirma-1.0.11.txt`, `yukseltme-test-1.0.11.txt`, `tarayici-test-1.0.11.txt`, `derleme-1.0.11.txt`, `paketleme-1.0.11.txt`, `paket-dogrulama-1.0.11.json`, `guvenlik-taramasi-1.0.11.json`.

Bunlar deterministik yerel HTTP/SSE model-fixture testleridir. Thinking beklemesi testte kasıtlı açık tutulan akıştır; gerçek modelin düşünme döngüsünün çözüldüğünü göstermez. Eski canlı sağlayıcı testleri tarihî kanıt olarak korunur.

## Tekrarlama

```sh
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build:code
xvfb-run -a node scripts/resume-smoke.cjs
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/research-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
node scripts/package.mjs
node scripts/verify-package.cjs
```

Node 22 ve Linux Electron sistem bağımlılıkları gerekir. Windows derleme kısayolu `Derle.cmd`; UI testleri ayrıca çalıştırılır. Çapraz paketleme gerçek Windows çalıştırması değildir. Kullanıcının gerçek kütüphanesine veya LM Studio’suna erişilmedi. Önceki sürümlerin raporları `docs` altında tarihî kanıt olarak tutulur.
