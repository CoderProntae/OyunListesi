# Oyun Sıralayıcı 1.0.10 — test ve paket raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Birim/entegrasyon | **275/275**, 16 dosya |
| Yeni 1.0.10 birim regresyonları | **28** |
| Playwright Chromium arayüz | **32/32**, iki yeni senaryo |
| Native/JSON araç döngüsü | Geçti — sentetik model cevapları |
| Linux Electron açılış/IPC/ekle/sil/geri al | Geçti |
| Linux Electron aşamalı araştırma | Geçti — **11 istekte 16128** çıktı sınırı değişmedi |
| Linux Electron eski kayıt geçişi | Geçti — kişisel notlar atıldı, etiketler/sıra ve durdurma durumu korundu |
| Linux Electron sekmeli tarayıcı/izolasyon | Geçti |
| Windows x64 portable | Üretildi; iç uygulama PE `0x8664` |
| ASAR doğrulaması | **8 dosya** derlenmiş çıktı ile byte eşleşti |
| npm audit | **0 bildirilen zafiyet**; tüm güvenliğin garantisi değildir |
| Gerçek Windows çalıştırması | **Yapılmadı** |
| Kullanıcının gerçek LM Studio modeli | **Denenmedi** |
| Oyunun gerçek açılışı/FPS testi | **Yapılmadı** |
| Yeni canlı web/sağlayıcı testi | **Yapılmadı**; 1.0.5/1.0.6 kanıtları tarihîdir |

## Yeni testlerin kapsamı

- Türkçe Grafik/Ekran kartı/GRAFİK/GPU etiketleri ve tam Max Payne ham metni; GPU, VRAM, CPU, RAM, disk ve OS alanları.
- Kişisel oyun notunun şema/default/import/export/araç katmanından kaldırılması; eski kayıt açılışı ve tekrar yükleme.
- Araç çıktısının sonraki oyun düzenlemesinde değişmemesi, diske kayıt ve yeniden açılışta korunması.
- Minimum/önerilen bileşen kapsamı; kısmi önerilen RAM bilgisinin CPU eksikliğini gizlememesi; açık yayımlanmamış durumu; sahte tik reddi.
- Native ve JSON modlarında erken bitirme → uygulama denetimi → düzeltme; değişmeyen başarısız kayıtların durdurulması.
- Arka plan araştırmasının yalnız hedef oyunda çalışması ve kişisel/kütüphane düzenleme araçlarının bu akışa verilmemesi; normal sohbet araçlarının korunması.
- Kısa aşama promptları; cihaz dökümü yerine araç okuması; mevcut uzun araç döngüsü ve çıktı tavanı regresyonları.

İki yeni arayüz testi gerçek uygulama arayüzünü ve yerel HTTP/SSE model-fixture sunucusunu kullanır. Birincisi normal kullanıcı isteğinden sonra eksik önerilen alan durumunun uygulama geri bildirimiyle tamamlanmasını ve değişmeyen geçmiş kartlarını gösterir. İkincisi yinelenen başarısız kıyasın sahte başarı olmadan durmasını doğrular. `docs/ajan-akisi-1.0.10.png` bu sentetik senaryonun ekran görüntüsüdür; gerçek Max Payne benchmark’ı değildir.

## Kanıt dosyaları

- `docs/typecheck-1.0.10.txt`
- `docs/birim-testleri-1.0.10.txt`
- `docs/arayuz-testleri-1.0.10.txt`, `docs/arayuz-sonuclari-1.0.10.json`
- `docs/masaustu-test-1.0.10.txt`
- `docs/asamali-arastirma-1.0.10.txt`
- `docs/yukseltme-test-1.0.10.txt`
- `docs/tarayici-test-1.0.10.txt`
- `docs/derleme-1.0.10.txt`, `docs/paketleme-1.0.10.txt`
- `docs/paket-dogrulama-1.0.10.json`
- `docs/guvenlik-taramasi-1.0.10.json`
- `docs/prompt-olcumu-1.0.10.json`
- `docs/DEGISIKLIKLER-1.0.10.md`

## Tekrarlama

Node 22 ile `npm ci`, `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run build:code`. Playwright için `npx playwright install chromium`; Linux masaüstü kontrolleri için Electron sistem bağımlılıkları ve Xvfb gerekir.

```sh
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/research-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
node scripts/package.mjs
node scripts/verify-package.cjs
```

Windows üzerinde kısa derleme yolu `Derle.cmd` dosyasıdır; UI testleri ayrıca çalıştırılır. Çapraz paketleme Windows/WMI/DPAPI/SmartScreen doğrulaması değildir. Gerçek model sonuçları, site erişimi ve eski oyun uyumluluğu değişebilir. Kullanıcının gerçek kütüphanesi veya LM Studio’su bu testlerde okunmadı/değiştirilmedi.

Önceki sürümlerin raporları `docs` içinde tarihî kanıt olarak tutulur; bu sürümün güncel sonuçları yukarıdakilerdir.
