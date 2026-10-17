# Oyun Sıralayıcı 1.0.12 — test ve paket raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| Prettier biçim denetimi | Geçti |
| TypeScript | Geçti |
| Birim/entegrasyon | **293/293**, 18 dosya |
| Yeni 1.0.12 regresyonları | **17** (`tests/revision112.test.ts`) |
| Playwright Chromium | **34/34**, iki yeni senaryo |
| Ajanın nota erişememesi | Geçti — okuma araçlarının çıktısı, sohbet ve otomatik araştırmada modele giden her istek bilinen not metni için tarandı |
| İzolasyon testinin duyarlılığı | Kasıtlı sızıntı (`get_game_info` notu döndürsün) iki testi kırdı; geri alınca geçti |
| Linux Electron açılış/IPC/ekle/sil/geri al | Geçti |
| Linux Electron aşamalı araştırma | Geçti — yalnız DONANIM → ÖZET; özet aşamasında bozuk çağrı onarıldı; 8 istekte seçilen 16128 çıktı tavanı korundu; kişisel not hiçbir isteğe girmedi |
| Linux Electron devam / baştan | Geçti — devam yalnız ÖZET; baştan DONANIM → ÖZET; eski sohbet korundu |
| **Linux Electron 1.0.11 → 1.0.12 yükseltme** | **Geçti** — Türkçe/HLTB verisi bir kez temizlendi, yükseltme öncesi yedek alındı, hiçbir oyun kuyruğa girmedi, açık durdurma korundu, boş “Türkçe Yama Yok” kaldırıldı, Not sekmesinden yazılan not yeniden açılışta korundu |
| Linux Electron sekmeli tarayıcı/izolasyon | Geçti |
| İsteğe bağlı canlı mağaza testi (gerçek ağ) | Geçti — Stardew Valley: Steam/GOG/Xbox bulundu, Epic bulunamadı; HLTB/Türkçe verisi alınmadı, HLTB bölümü çizilmedi |
| Windows x64 portable | Üretildi; iç uygulama PE `0x8664` |
| ASAR byte doğrulaması | **8 dosya** derlenmiş çıktıyla eşleşti |
| Paket içi tarama | Kaldırılan araç/IPC/sağlayıcı/arayüz dizgeleri yok; tek eşleşme yükseltme kodunun eski alan tespiti |
| npm audit | **0 bildirilen zafiyet** (551 bağımlılık); genel güvenlik garantisi değildir |
| Gerçek Windows / WMI / DPAPI / SmartScreen | **Denenmedi** |
| Kullanıcının LM Studio modeli | **Denenmedi** |
| Gerçek oyun açılışı, FPS | **Yapılmadı** |

## Yeni regresyon kapsamı (1.0.12)

- Araç listesi, araç şemaları/açıklamaları ve ortak ajan kurallarında Türkçe/yama/HLTB izi yok; araç sayısı 25; `patchSearch` masaüstü çağrısı yok.
- Otomatik araştırma yalnız `hardware` ve isteğe bağlı `summary`; aşama talimatlarında kaldırılan aşama yok.
- `update_game_info` ile `turkish`/`hltb` yazma denemesi atomik olarak reddedilir (aynı çağrıdaki geçerli alan da yazılmaz).
- Donanım + özet kaydı, dil/HLTB verisi olmadan araştırmayı tamamlar. Kalan aşaması olmayan devam boş sohbet açmaz, modeli çağırmaz.
- 1.0.11 biçimli kütüphane: kaldırılan alanlar atılır; etiket/puan korunur; yalnız kaldırılan aşamalar yüzünden eksik olan iş **tamamlandı** olur; DİL VE SÜRE’de durdurulan iş gerçek eksikle **eksik** olur; donanımda durdurulan iş durmuş kalır; HLTB kaynak kaydı ve `turkish.*`/`hltb.*` alan izleri temizlenir, mağaza kaynağı korunur; hiçbir oyun kuyruğa girmez; dokunulmamış dosya yedeklenir; eski yedekler değişmez; geçiş ikinci açılışta tekrarlanmaz.
- `sources`/`aiEditedFields`/`tags` alanı olmayan eski kayıt varsayılanlarla yüklenir (yükseltme Electron testinin yakaladığı hatanın regresyonu).
- Oyun içeren eski “Türkçe Yama Yok” koleksiyonu korunur.
- Yarıda kalmış (running → queued) eski iş, kalan gerçek aşama yoksa model çağrısı ve sohbet olmadan **tamamlandı** olur.
- Not oyun kaydının dışında saklanır, yeniden açılışta korunur, tam JSON yedeğinde bulunur, CSV’de bulunmaz.
- `note` çağrısı: 20.000 karakter sınırı, bilinmeyen oyun, yanlış tür reddi; boşluktan oluşan metin notu siler; yalnız uygulama penceresine `note` olayı gider.
- Ctrl+Z notu geri almaz; oyun silinip geri alınınca not yerinde; önceki oturumda silinmiş oyunun notu taşınmaz/dışa aktarılmaz.
- Notsuz eski yedek geri yüklenince mevcut notlar korunur; notlu yedekteki not aynı oyunun notunun yerine geçer; bozuk not girdisi kütüphaneyi okunamaz yapmaz.
- `get_game_info`, `list_games`, `get_list_state`, `get_hardware`, `check_compatibility`, `recommend_similar`, `update_game_info`, `edit_game` çıktılarında not yok; `edit_game`/`update_game_info` `note`/`notes`/`userNote` alanını reddeder.
- Bir sohbet turu ve bir tam otomatik araştırma boyunca modele giden bütün istek gövdelerinde ve kayıtlı sohbetlerde not yok.

**Arayüz:** Türkçe sekmesi, Türkçe filtresi, “Ne kadar sürer?” ve yama düğmesinin yokluğu; Not sekmesinde yazma → **Kaydedildi**; sekmeden hemen çıkınca kayıt; yeniden yüklemede korunma; ajan `get_game_info` ile oyun kaydını okurken modele giden isteklerde/araç sonucunda not yok; metni silince not kaldırılır.

**Uyarlanan eski testler:** Türkçe yama, HLTB ve 1.0.6 yama geçişine özgü testler özellik kaldırıldığı için silindi; aşama sırası, devam/baştan, toplu yeniden araştırma, mağaza ve geri alma testleri yeni iki aşamalı akışa göre güncellendi. Eski testlerin `docs/` içindeki tarihî ekran görüntülerinin üzerine yazması engellendi (artık `.cache` altına yazarlar).

## Kanıtlar

`docs/typecheck-1.0.12.txt`, `birim-testleri-1.0.12.txt`, `arayuz-testleri-1.0.12.txt`, `arayuz-sonuclari-1.0.12.json`, `not-sekmesi-1.0.12.png`, `masaustu-test-1.0.12.txt`, `arayuz-1.0.12.png`, `tarayici-test-1.0.12.txt`, `tarayici-1.0.12.png`, `asamali-arastirma-1.0.12.txt`, `asamali-arastirma-1.0.12.png`, `devam-masaustu-1.0.12.txt`, `yukseltme-test-1.0.12.txt`, `yukseltme-1.0.12.png`, `canli-magazalar-1.0.12.txt`, `derleme-1.0.12.txt`, `paketleme-1.0.12.txt`, `paket-dogrulama-1.0.12.json`, `paket-taramasi-1.0.12.json`, `guvenlik-taramasi-1.0.12.json`.

Model yanıtları deterministik yerel HTTP/SSE test sunucusundan gelir; gerçek model kalitesini veya düşünme davranışını göstermez. Canlı mağaza testi tek oyunla, o anki sağlayıcı yanıtlarıyla yapıldı; her oyun ve her zaman için sonuç garantisi değildir.

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
node scripts/package.mjs
node scripts/verify-package.cjs
```

Node 22 ve Linux Electron sistem bağımlılıkları gerekir. Windows derleme kısayolu `Derle.cmd`; UI testleri ayrıca çalıştırılır. Çapraz paketleme gerçek Windows çalıştırması değildir. Kullanıcının gerçek kütüphanesine veya LM Studio’suna erişilmedi. Önceki sürümlerin raporları `docs` altında tarihî kanıt olarak tutulur (`docs/TEST-RAPORU-1.0.11.md` dahil).
