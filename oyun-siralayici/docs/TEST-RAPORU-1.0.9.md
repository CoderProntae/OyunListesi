# Oyun Sıralayıcı 1.0.9 — ajan desteği düzeltmeleri

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

1.0.8’de incelenen **11 bulgu** düzeltildi. Bunlar uygulamanın ajan işlem desteği, kayıt/arayüz tutarlılığı ve doğrulama koşullarıyla ilgilidir; modelin her araştırmada doğru bilgi üretmesini garanti etmez.

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Birim/entegrasyon | **247/247**, 15 dosya |
| Yeni 1.0.9 regresyonları | **44**, A01–A11 ve bağımsız mağaza yenilemesi |
| Playwright Chromium arayüz | **30/30**, 3 yeni test |
| Native/JSON yeni araç döngüsü | Geçti — deterministik LM cevapları |
| Özel grup CRUD, seri oluştur/adlandır/dağıt | Gerçek ajan yürütmesi, onay/ret, geri alma |
| Mağaza/HLTB UI | HTTP/SSE ajan çağrısı sonrası ürün düğmesi; 6/10/20 saat; yeniden yükleme/geri alma |
| Sistem UI | Kaba GPU tikinin AI sonucu ile değişmesi, ilgisiz disk değişiminde korunması; eksik CPU’ya sahte tik yok |
| Linux Electron açılış/IPC/ekle/sil/geri al | Geçti |
| Linux Electron aşamalı araştırma | Geçti; **9 isteğin tamamında 16128** çıktı sınırı |
| Linux Electron eski kayıt geçişi/stop/reopen | Geçti — geçici fixture kütüphanesi |
| Linux Electron sekmeli tarayıcı/IPC izolasyonu | Geçti — yerel test sayfası |
| Windows x64 portable | Üretildi; iç uygulama PE mimarisi `0x8664` |
| ASAR doğrulaması | **8 derlenmiş dosya byte eşleşti** |
| `npm audit` | **0 bildirilen açık** |

## Kapsam

A01 bileşene özel karşılaştırma anahtarı; A02 metin gereksinimlerini ayrıştırma; A03 alanı null ile temizleme; A04 mağaza durum/link eşleştirmesi; A05 HLTB kısmi birleştirme; A06 altı grup/seri aracı; A07 doğrulayıcıdan üretilen araç şeması; A08 CPU/GPU araştırma sonucunun gerçekten uygulanması; A09 açıklamasız özet desteği; A10 eksik gerçek donanım kontrolü; A11 boş süre verisiyle tamamlanma kontrolü.

Detaylı davranışlar, test eşleşmesi ve sınırlamalar: [11 bulgunun kapanış raporu](docs/AGENT-DESTEK-DUZELTMELERI-1.0.9.md).

- Araç sayısı **25**. Şemalar `zod-to-json-schema 3.25.1` ile gerçek Zod doğrulayıcılarından üretilir; AJV 8.20.0 ile bağımsız derlenebilirlik/örnek doğrulaması yapıldı.
- Otonom varsayılan, isteğe bağlı onay, Ctrl+Z, durdurma, yedekler, kişisel notlar ve ayrı sohbet geçmişleri korunur.
- 1.0.6 geniş yama sorgusu, 1.0.7 bozuk girdi onarımı/aşamalar ve 1.0.8 seçilen çıktı sınırını aynen gönderme davranışı testlerde korunur.
- Yeni düzeltmelerin testleri geçici Service/Store kayıtları, React SSR, Chromium, Linux Electron ve deterministik model cevapları kullanır. Kullanıcının gerçek kütüphanesine erişilmedi.

## Kanıt dosyaları

- `tests/revision109.test.ts`, `tests/ui/revision109.spec.ts`
- `docs/typecheck-1.0.9.txt`, `docs/birim-testleri-1.0.9.txt`
- `docs/arayuz-testleri-1.0.9.txt`, `docs/arayuz-sonuclari-1.0.9.json`
- `docs/masaustu-test-1.0.9.txt`, `docs/asamali-arastirma-1.0.9.txt`
- `docs/yukseltme-test-1.0.9.txt`, `docs/tarayici-test-1.0.9.txt`
- `docs/paket-dogrulama-1.0.9.json`, `docs/guvenlik-taramasi-1.0.9.json`
- 1.0.9 arayüz, aşamalı araştırma, tarayıcı ve toplu araştırma ekran görüntüleri.

## Dürüst sınırlar

**Gerçek Windows çalıştırması, WMI/DPAPI/Mica/SmartScreen davranışı ve kullanıcının LM Studio modeli test edilmedi.** Windows paketi Linux üzerinde çapraz üretildi; Linux Electron testi Windows kabul testi değildir. Paket dijital imzasızdır.

Yeni canlı mağaza/yama/HLTB veya gerçek model performans testi yapılmadı. Önceki sürümlerin canlı kaynak kanıtları tarihsel olarak saklanır; yeniden yapılmış gibi sunulmaz. Eski HTTP 500’ün kesin sunucu içi nedeni kanıtlanmış değildir. `npm audit` sonucu tam güvenlik garantisi değildir.

Yeni sürüm eski yanlış bilgiyi tahmin ederek doldurmaz. İlgili oyun için **Araştır** başlatılabilir; bitmiş bütün araştırmalar kendiliğinden tekrar edilmez.

## Önceki raporlar

- `docs/AGENT-DESTEK-INCELEMESI-1.0.8.md` ve `.json`: bu 11 bulgunun düzeltme öncesi kanıtı.
- `docs/TEST-RAPORU-1.0.8.md`: önceki çıktı sınırı sürümünün gerçek test raporu.
