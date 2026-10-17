# Oyun Sıralayıcı 1.0.13 — test ve paket raporu

**16 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| Prettier biçim denetimi | Geçti |
| TypeScript | Geçti |
| Birim/entegrasyon | **313/313**, 19 dosya |
| Yeni 1.0.13 regresyonları | **9** (`tests/revision113.test.ts`) + geri getirilen 1.0.11 HLTB testleri |
| Onarım testinin duyarlılığı | Yedekten geri yükleme çağrısı kasıtlı olarak kapatılınca 3 test kırıldı; geri alınca geçti |
| Playwright Chromium | **36/36** (yeni: yedekten geri gelen sürelerin ekranda görünmesi; geri gelen: HLTB saatleri, kısmi HLTB güncellemesinin yenileme/geri almada korunması) |
| Linux Electron açılış/IPC/ekle/sil/geri al | Geçti |
| Linux Electron aşamalı araştırma | Geçti — yalnız DONANIM → ÖZET; süre aşaması yok; özet aşamasında bozuk çağrı onarıldı; seçilen çıktı tavanı korundu; kişisel not hiçbir isteğe girmedi |
| Linux Electron devam / baştan | Geçti |
| **Linux Electron yükseltme** | **Geçti** — 1.0.11 dosyası: Türkçe veri bir kez temizlendi, **süreler korundu**, yükseltme öncesi yedek alındı, hiçbir oyun kuyruğa girmedi, açık durdurma korundu, Not sekmesi çalıştı. Ardından 1.0.12 biçimli süresiz dosya açıldı: süreler yedekten geri geldi, **Ne kadar sürer?** bölümünde “7 saat” göründü, işaret kaydedildi |
| Linux Electron sekmeli tarayıcı/izolasyon | Geçti |
| İsteğe bağlı canlı mağaza + süre testi (gerçek ağ) | Geçti — Stardew Valley: Steam/GOG/Xbox bulundu, Epic bulunamadı; süreler GOG’daki HLTB bölümünden 53 / 94,5 / 172,5 saat. İkinci aşama (1.0.12 durumu): arka plan tamamlaması süreleri yeniden getirdi; bilgi durumu `done`, mağazalar ve araştırma değişmedi; ekranda saat değeri göründü |
| İsteğe bağlı canlı sağlayıcı testi | Geçti — Portal 2 → Codepotatoes; Hollow Knight → GOG HLTB bölümü; Fortnite → Codepotatoes araması |
| Windows x64 portable | Üretildi; iç uygulama PE `0x8664` |
| ASAR byte doğrulaması | **8 dosya** derlenmiş çıktıyla eşleşti |
| Paket içi tarama | Kaldırılan Türkçe araç/IPC/arayüz dizgeleri yok (tek eşleşme: eski `patchSearchRevision` alanını tanıyan yükseltme kodu). HLTB sağlayıcısı, onarım işareti, “Ne kadar sürer?”, “Oyun süreleri tamamlanıyor” ve Not sekmesi var |
| npm audit | **0 bildirilen zafiyet** (551 bağımlılık); genel güvenlik garantisi değildir |
| Gerçek Windows / WMI / DPAPI / SmartScreen | **Denenmedi** |
| Kullanıcının LM Studio modeli | **Denenmedi** |
| Kullanıcının gerçek 1.0.12 kütüphanesi ve yedeği | **Denenmedi** — aynı biçimde hazırlanmış test dosyaları kullanıldı |

## Yeni regresyon kapsamı (1.0.13)

- 1.0.12 biçimli kütüphane (not alanı var, işaret yok) yüklenince süreler, HowLongToBeat kaynak kayıtları ve `hltb…` AI işaretleri yükseltme öncesi yedekten gelir. Daha yeni ama süresiz 1.0.12 yedeği eskisini gölgelemez. Türkçe alanlar geri gelmez. Etiketler ve notlar korunur. İşaret diske yazılır. Yedek dosyaları bayt bayt değişmeden kalır.
- Onarım bir defadır: işaretten sonra silinen bir süre yedekten tekrar doldurulmaz.
- Mevcut süre kaydı (ör. `not_found`) yedek değeriyle ezilmez. Yedekte süresi olmayan oyun boş kalır.
- 1.0.11 dosyasında süreler doğrudan korunur, yalnız Türkçe veri atılır, yükseltme öncesi yedek alınır. Yeni kütüphane işaretli doğar.
- Yedek listesinden 1.0.12 yedeği geri yüklemek de süreleri getirir ve notları korur.
- Arka plan tamamlaması yalnız `catalogCheckedAt` olup süresi olmayan oyunu seçer. Mağaza zenginleştirmesini çağırmaz. `fetchStatus` (`review`) değişmez, araştırma başlatılmaz, şerit “yalnız süre” durumunu gösterir.
- Çevrimdışı: hiçbir oyuna süre yazılmaz, kalan iki iş bırakılır (sayaç 1/1, hata 0). Sonraki açılışta üç oyunun süresi de tamamlanır.
- Sıra: bekleyen süre işi tam yenileme isteğiyle tam işe yükseltilir (`queued`). Durdur, yalnız süre işlerinin durumuna dokunmaz; tam iş `idle` olur.
- Sağlayıcı: GOG’daki HLTB bölümünden yalnız süre yenilemesi mağaza listesini ve bilgi durumunu değiştirmez. GOG yanıt verir ama süre bulunamazsa “alınamadı” kaydedilir. Hiçbir şey erişilemezse hiçbir şey yazılmaz.
- Tam yenileme HLTB’yi yine alır, dil tablosu veya yama araması yapmaz. Araştırma aşamaları yine yalnız `hardware` ve isteğe bağlı `summary`.
- Geri getirilen 1.0.11 testleri: GOG HLTB bölümü, Codepotatoes `/steam` ve arama yolları, HLTB sayfası, “found ama saat yok” durumu, `update_game_info.hltb` kısmi güncellemesi ve şeması, eski değerin korunması.

**Arayüz:** “Ne kadar sürer?” bölümü ve HowLongToBeat etiketi tekrar görünür. Gerçek HLTB saatleri gösterilir (arama kısayolu değil). Kısmi HLTB güncellemesi yenileme ve geri almada korunur. Yükseltme öncesi yedeği olan 1.0.12 biçimli içe aktarım 23,5 / 47 / 95 saati, **HLTB oyun sayfası** ve **Süreleri yenile** düğmelerini gösterir. Sekmeler **Genel bakış · Mağazalar · Sistem · Not**. Türkçe sekmesi/filtresi/yama düğmesi yine yok.

**Test betiği düzeltmesi:** `catalog-ui-smoke.cjs`, sayfa içindeki async bir koşulla bekliyordu. Playwright bu koşulun döndürdüğü Promise’i “doğru” saydığı için bekleme hemen bitebiliyordu. Ayrıca veri yokken de görünen “Ana hikâye” etiketi kontrol ediliyordu. Artık değer Node tarafında sorgulanıyor, ekranda “saat” birimi bekleniyor ve ikinci aşamada sürelerin başta gerçekten silinmiş olduğu doğrulanıyor.

**Paket taraması yöntemi:** derlenmiş JavaScript, Türkçe karakterleri `\xE7` / `\u0131` biçiminde kaçışlıyor. 1.0.13 taraması bu kaçışları çözdükten sonra arar. 1.0.12 taraması kaçışları çözmüyordu, bu yüzden Türkçe karakterli dizgeler için yetersizdi. 1.0.12 kaynak kodunda bu dizgelerin bulunmadığı ayrıca kontrol edildi.

## Kanıtlar

`docs/typecheck-1.0.13.txt`, `birim-testleri-1.0.13.txt`, `arayuz-testleri-1.0.13.txt`, `arayuz-sonuclari-1.0.13.json`, `ne-kadar-surer-1.0.13.png`, `masaustu-test-1.0.13.txt`, `arayuz-1.0.13.png`, `tarayici-test-1.0.13.txt`, `tarayici-1.0.13.png`, `asamali-arastirma-1.0.13.txt`, `asamali-arastirma-1.0.13.png`, `devam-masaustu-1.0.13.txt`, `yukseltme-test-1.0.13.txt`, `yukseltme-1.0.13.png`, `yukseltme-sureler-1.0.13.png`, `canli-magazalar-1.0.13.txt`, `sure-tamamlama-canli-1.0.13.png`, `canli-saglayicilar-1.0.13.txt`, `derleme-1.0.13.txt`, `paketleme-1.0.13.txt`, `paket-dogrulama-1.0.13.json`, `paket-taramasi-1.0.13.json`, `guvenlik-taramasi-1.0.13.json`; paket kimliği `BUILD-INFO.json`.

Model yanıtları deterministik yerel HTTP/SSE test sunucusundan gelir; gerçek model kalitesini veya düşünme davranışını göstermez. Canlı testler 16 Ekim 2026’daki sağlayıcı yanıtlarıdır; her oyun ve her zaman için sonuç garantisi değildir.

## Tekrarlama

```sh
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build:code
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
xvfb-run -a node scripts/research-smoke.cjs
xvfb-run -a node scripts/resume-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
xvfb-run -a node scripts/catalog-ui-smoke.cjs   # isteğe bağlı, gerçek internet
npx tsx scripts/provider-smoke.ts "Portal 2"     # isteğe bağlı, gerçek internet
node scripts/package.mjs
node scripts/verify-package.cjs
```

Node 22 ve Linux Electron sistem bağımlılıkları gerekir. Windows derleme kısayolu `Derle.cmd`; UI testleri ayrıca çalıştırılır. Çapraz paketleme gerçek Windows çalıştırması değildir. Kullanıcının gerçek kütüphanesine veya LM Studio kurulumuna erişilmedi.
