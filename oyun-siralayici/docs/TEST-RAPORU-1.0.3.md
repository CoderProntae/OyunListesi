# Oyun Sıralayıcı 1.0.3 — otonom ajan revizyonu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Vitest | **120 / 120** |
| Playwright | **16 / 16** |
| Üretim Electron açılış/IPC/ekle-sil/geri al | Linux smoke kaydı: `docs/test-logs/1.0.3/electron-linux-smoke.txt` |
| Windows portable EXE | Gerçek x64 paket; manifest/hash: `BUILD-INFO.json` |
| Gerçek Windows ve kullanıcının gerçek LM Studio modeli | **Bu ortamda test edilmedi** |

## Değişiklikler

Varsayılan `requireApproval:false`. Ekleme, düzenleme, silme, sıralama, gruba taşıma ve oynama listesi değişiklikleri izin penceresi olmadan uygulanır. Onay modu ayardan ayrıca açılabilir; bu modun ret/izin/sohbet boyunca izin ve iptal regresyonları hâlâ test edilir.

`update_game_info` artık yalnızca oyun kimliği ve değişiklik nesnesi ister. Kaynak, alıntı, alan listesi ve önceden fetch şartı yoktur. Eski `evidence` girdisi uyumluluk için isteğe bağlı kabul edilir. Kaynaksız güncellemelerin alanları/tarihi kaydedilir; arka plan Steam yanıtı bu alanları ezmez. Kaynak yoksa sahte URL oluşturulmaz. Kaynak/alıntı varsa saklanır ama doğruluk ispatı gibi etiketlenmez.

Mağaza bağlantıları, ekran görüntüsü URL’leri, fragman, Steam kimliği ve doğrudan AI özeti düzenlenebilir. Steam yenileme aracı eklendi. Özet üretimi için önceden açıklama bulunması zorunluluğu kaldırıldı.

Yerleşik eski “izin bekle” yönergesi yalnızca tam metin eşleşiyorsa güncellenir; özel kullanıcı yönergeleri korunur. Modele çalışma modu açıkça bildirilir. Arama sonuçlarının tam başlık eşleşmesi filtresi ve tekrar eden güvenilirlik uyarıları kaldırıldı; public web sitelerinin özel portları kabul edilir. Teknik URL/veri biçimi kontrolleri `SINIRLAR.md` içinde açıkça listelenir.

## Test kapsamı

- **19 araştırma/otonomi testi:** onaysız ve kaynaksız kayıt; yalnızca URL; eski evidence biçimi; alıntı eşleştirmeden kaydetme; alan bazında kanıt istememe; kayıt zamanı; undo; isteğe bağlı onay ve ret; not/durum; ekle/sırala/grup/oynama listesi/sil; eski okuma-onayı ayarının otonom modu engellememesi; genişletilmiş metadata alanları; Steam yenileme/undo; kaynaksız alanın arka planda korunması; kalıcılık; varsayılan prompt göçü; veri/prototype şeması; sohbet cache ayrılığı.
- **15 ajan testi:** eski onay modunun regresyonlarına ek olarak otonom JSON araç akışında metadata kaydı. Template yedeği tamamlanmış değişikliği tekrar çalıştırmaz.
- **14 sayfa/uzun akış testi:** önceki 30 ardışık tur, tek yanıtta 16 native çağrı, JSON çoklu çağrı, iptal, sayfalama, 20.000 token/bağlam ayrımı, sohbet ayrılığı korunur.
- Diğer testler: alan mantığı 19, kayıt 12, ağ/şema 18, LM 8, kuyruk 4, geçmiş bütünlüğü 11.
- **16 arayüz testi:** önceki 14 senaryoya ek olarak gerçek HTTP/SSE sahte modelle hiçbir izin penceresi/fetch/evidence olmadan metadata güncelleme + Ctrl+Z; isteğe bağlı onay ayarının kaydedilip yeniden açılması. Önceki izin testi artık bu modu açıkça etkinleştirir.

Eski kanıt zorunluluğu testleri yeni talebe göre kabul testlerine çevrildi. Public özel-port engeli testi kaldırıldı; public özel-port kabulü ve özel IP engeli birlikte kontrol edilir. Bu beklenen davranış değişiklikleridir, sessizce atlanmış hatalar değildir.

Testler deterministik model/kaynak fixture kullanır; gerçek modelin doğru bilgiyi seçtiğini veya her web sitesinin erişilebilirliğini kanıtlamaz. Bu revizyonda yeni canlı Steam/DDG doğrulaması yapılmış gibi sunulmaz.

## Güncelleme

Eski EXE’yi kapatıp yenisini aç. Ürün adı, App ID ve `%APPDATA%\Oyun Siralayici\` değişmedi. Eski kayıtlar okunur. Sohbet başlığında **Otonom ajan** görünür. Önceki sohbet içindeki eski araç yönergelerinin etkisini taşımamak için ilk denemeyi yeni sohbette yapmak yararlı olabilir; eski sohbeti silmek gerekmez.

Paket imzasızdır. Windows WMI/dxdiag, native cam, DPAPI ve SmartScreen davranışı gerçek Windows üzerinde ayrıca kontrol edilmelidir. Son kayıtlar `docs/test-logs/1.0.3/` altındadır; önceki raporlar `docs/TEST-RAPORU-1.0.x.md` adıyla tarihçedir.
