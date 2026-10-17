# Oyun Sıralayıcı 1.0.1 — test ve paketleme raporu

**Tarih:** 15 Ekim 2026 · **Ortam:** Linux x64, Node 22.22.0, Electron 44.7.2, electron-builder 26.15.3.

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Vitest birim/entegrasyon | **99 / 99 geçti** |
| Playwright Chromium arayüz | **12 / 12 geçti** |
| Üretim Electron açılış/IPC/ekle-sil-geri al | **Geçti — Linux** |
| Bağımlılık denetimi | **0 bildirilen açık**; mutlak güvenlik garantisi değildir |
| Windows x64 portable EXE | **Gerçek dosya üretildi**, imzasız |
| Gerçek Windows çalıştırma | **Test edilmedi** |
| Gerçek LM Studio / ornith modeli | **Bu ortamda test edilmedi**; model ve prompt-template davranışı kullanıcı cihazında ayrıca doğrulanmalı |

Kayıtlar `docs/test-logs/1.0.1/` altında. Windows paketinin hash/boyutu `BUILD-INFO.json` içindedir. Gerçek Steam/DDG kontrolleri **önceki 1.0.0 çalışmasından** devralınan kanıttır; bu revizyonda yeniden canlı kaynak testi yapıldığı iddia edilmez. Eski rapor `docs/TEST-RAPORU-1.0.0.md` altında saklanır.

## Bildirilen ajan hatası

Eski `context()` kodu karakter bütçesi aşıldığında ilk mesajı, ardından bir sonraki `user` mesajına kadar olan kayıtları siliyordu. Tek kullanıcı isteği + büyük araç sonuçları durumunda yalnızca son `tool` mesajı kalabiliyordu. Bu, “No user query found in messages” şablon hatasına yol açabilecek geçersiz bir konuşmadır.

Yeni paketleyici gerçek son kullanıcı isteğini korur, eski turları bütün olarak çıkarır, native tool çağrılarını yanıtlarıyla beraber tutar, büyük sonuçları geçerli JSON içinde kısaltır. JSON modunun sentetik kullanıcı-rolü sonuçlarını gerçek kullanıcı isteğinden ayırır. Sistem/araç tanımları ve çıktı rezervi hesaba katılır; çıktı üst sınırı gerektiğinde o tur için düşürülür. Bu yaklaşık karakter bütçesidir, modele özel tokenizer ölçümü değildir. Sığmayan istek sessizce silinmez.

Otomatik modda şablona özgü HTTP 500/SSE hataları, tamamlanmış mutasyonları yeniden yürütmeden JSON transkript biçimine geçebilir. Genel sunucu hataları körlemesine tekrar edilmez; açık native seçimi değiştirilmez.

## 29 yeni otomatik kontrol (önceki 70’e ek)

### Bağlam: 11

Üç büyük arama sonucu senaryosu; gerçek kullanıcı isteğinin korunması; kalıcı geçmişin değişmemesi; eski turların bütün çıkarılması; eski/yeni JSON sonuç işaretleri; eksik native tool yanıtının iptal verisiyle tamamlanması; yetim sonucun temizlenmesi; eksik veya çok büyük kullanıcı isteğinde açık hata; tek kullanıcı JSON transkripti; kaçış karakterleriyle geçerli JSON kısaltma; şablon hatası tanıma.

### Ajan: 4

Dört ardışık model isteğinin her birinde Max Payne araştırma isteğinin hâlâ bulunması; 500 şablon hatasından sonra önceden eklenmiş oyunun ikinci kez eklenmemesi; statüsüz SSE şablon hatasında yedek; açık native modda otomatik biçim değiştirmeme. Aynı senaryoda tur çıktı sınırının düşmesi ve kalıcı ayarın değişmemesi de kontrol edilir.

### Kaynaklı düzenleme: 14

Gerçek `fetch_page` kaydı zorunluluğu; önce/sonra izin önizlemesi; izin sonrası kaynak/alıntı/tarih kaydı ve geri alma; ret sonrası değişiklik olmaması; uydurma alıntı reddi; her alan için kanıt; ilgisiz alan yolu reddi; sohbetler arası kaynak yetkisi aktarılmaması; keyfi alan/ID/ayar/prototype yolu engeli; script URL/negatif veya sınır dışı değer/boş patch reddi; kişisel düzenlemenin araştırma alanlarına yazamaması; not/durum izni ve undo; sınırlı kaynak belleği; arka plan Steam yenilemesinin onaylı alanları ezmemesi.

Alıntı eşleştirme anlamsal bir doğruluk testi değildir. Modelin alıntıyı yanlış yorumlaması veya yanlış oyunun sayfasını seçmesi otomatik olarak dışlanamaz; kullanıcı önizlemesi ve “AI kaynak önerisi” etiketi bu nedenle korunur.

## 12 arayüz senaryosu

Önceki 9 senaryo yeniden çalıştırıldı: toplu aktarım/seri, grup/Oynama Listesi/sil/undo, 2.000 oyun sanallaştırma, gerçek pointer sürükleme, tema/donanım/unsupported reasoning, ajan onay-ret/Markdown, soru sihirbazı, 1000×740 düzen/odak, sihirbaz atla/iptal.

Yeni 3 senaryo:
1. Kapalı eşleşme paneli açılınca eşleştirme düğmesinin erişilebilirliği; sistem tablosu; açıklama/kaynak metni açılır bölümü; donanım ayarına erişim.
2. Ardışık üç araç kartının tek grupta kapanması; açınca sonuç/kaynak/yeniden deneme; uzun hatanın teknik ayrıntısına erişim.
3. Kaynaklı AI etiketi, alıntı ve alan yollarının yeniden yüklemeden sonra korunması.

Sürükleme testi, kapalı koleksiyonların sürükleme başladığında otomatik açıldığını da denetler. Hiçbir önceki test kaldırılmadı; değişen görünür başlık ve yeni açılır grup davranışı için seçiciler güncellendi.

## Dağıtım / veri uyumluluğu

- App ID, ürün adı ve veri dizini değiştirilmedi: `%APPDATA%\Oyun Siralayici\`.
- Eski veri formatı version 1 korunur. Kaynak alıntısı/alan yolları ve sentetik araç sonucu işareti isteğe bağlı ek alanlardır; eski kayıtlar okunabilir.
- Paket yalnızca üretim renderer, main/preload, manifest ve lisansları içerir; test kütüphanesi/API anahtarı eklenmez.
- 2 GB Linux ortamında sonraki düzey-5 paketleme denemesi kesildi; son paket ve tekrar derleme scriptinde daha düşük bellekli sıkıştırma düzeyi 3 kullanıldı. Bu işlevleri veya çalışma zamanı verilerini değiştirmez.
- Dış NSIS başlatıcı PE32, iç Electron uygulaması PE32+ x64’tür. Bu normaldir.
- Gerçek Windows WMI/dxdiag, Mica/Acrylic, DPAPI, antivirüs ve PowerShell derleme scripti Windows üzerinde ayrıca denenmelidir. İmzasız paket SmartScreen uyarısı verebilir; güvenlik yazılımını kapatmak önerilmez.

## Kullanıcı cihazında son kontrol

1. Eski uygulamayı kapat, 1.0.1’i aç; mevcut oyunlar, sıra, notlar ve sohbetler korunuyor mu?
2. LM Studio’da modeli yükle, bağlantıyı test et; araç modu Otomatik olsun.
3. Bir oyun için birkaç web araması yaptır; ardından kaynak sayfasını okumasını ve izinle bilgi kaydetmesini iste.
4. İzin ekranındaki alanları/alıntıyı kontrol et; bir kez reddet, bir kez izin ver, `Ctrl+Z` ile geri al.
5. Aynı modelde hâlâ şablon hatası varsa teknik ayrıntıyı ve LM Studio sürümü/model bağlamını paylaş. JSON yedek modu ayrıca denenebilir.

Görsel kanıt: `docs/arayuz-1.0.1.png` üretim Electron boş başlangıcıdır. `docs/sistem-1.0.1.png` bilinmeyen alanları boş bırakılmış Max Payne 1 test kaydıyla yalnızca düzeni gösterir; gerçek oyun verisi toplanmış olduğu iddiası değildir. Bu test kayıtları dağıtım paketinde yoktur.
