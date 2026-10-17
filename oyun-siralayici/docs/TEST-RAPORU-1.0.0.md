# Test ve paketleme raporu

**Sürüm:** 1.0.0  
**Tarih:** 15 Ekim 2026  
**Ortam:** Linux x64; Node.js 22.22.0; yaklaşık 2 GB RAM. Windows sanal makinesi kullanılmadı.

## Sonuç özeti

| Kontrol | Sonuç | Gerçekte doğrulanan kapsam |
|---|---|---|
| TypeScript `tsc --noEmit` | Geçti | Uygulama, backend, test ve yapılandırma tür denetimi |
| Vitest | **70 / 70 geçti** | Alan mantığı, kayıt, güvenlik, SSE aktarımı, izin kapısı, soru akışı, kuyruk |
| Playwright Chromium | **9 / 9 geçti** | Gerçek React arayüzü + aynı backend servisinin önizleme köprüsü |
| Electron masaüstü smoke testi | Geçti, **Linux** | Üretim renderer derlemesi, sandbox preload/IPC, pencere açılışı, ekle/sil/geri al |
| Canlı Steam | Geçti | Portal 2 arama, appdetails, resmi dil tablosu, kaynak tarihleri, kapak indirme/önbellek |
| Canlı anahtarsız web araması | Geçti | DuckDuckGo üzerinden kaynak adaylarının alınması; yamanın doğrulanması değil |
| `npm audit` | **0 bildirilen açık** | O tarihte kilitli geliştirme + üretim bağımlılık ağacı; mutlak güvenlik garantisi değil |
| Windows portable paket | **Üretildi** | Electron 44.7.2 x64 uygulama + NSIS taşınabilir başlatıcı; gerçek EXE dosyası |
| Gerçek Windows çalıştırma | **Yapılmadı** | Windows WMI/dxdiag, native cam, GPU/driver ve Windows antivirüs davranışı doğrulanmadı |
| Gerçek LM Studio modeli | **Yapılmadı** | Model tool-call kalitesi/latansı/VRAM ihtiyacı ayrıca kullanıcı cihazında denenmeli |
| `Derle.ps1` Windows üzerinde yürütme | **Yapılmadı** | Kaynak scripti sağlandı; gerçek paket Linux’tan eşdeğer npm derleme hattıyla üretildi |

## 70 otomatik test

### Alan mantığı: 19

- `1.`, `1)`, `1 -`, madde işaretleri, boş/noktalama satırları, orijinal satır numaraları.
- Dahilî başlangıç/bitiş aralığı; mevcut ve aynı aktarım içindeki normalize yinelenenler.
- Sayıyla başlayan gerçek adların manuel eklemede korunması; Türkçe harf normalizasyonu.
- Virgül/tırnak içeren CSV isimlerinin ayrıştırılması.
- Arap/Romen rakamlı seri, ilk oyunun seriye katılması, sonraki eklemede seriye katılım, manuel dağıtma tercihi.
- Çoklu blok sıralaması, bilinmeyen hedef reddi ve kendi üzerine bırakmada değişiklik yapılmaması.
- Türkçe büyük `İ`, Steam’in `İşletim Sistemi *` etiketi, RAM/VRAM/disk/DirectX ayrıştırması.
- Minimum/önerilen/belirsiz/eksik sonuçları, RAM/disk grubu, belirsiz VRAM, Windows sürüm kontrolü, yama uydurmama.

### Kayıt ve doğrulama: 12

Boş başlangıç; yinelenen birleştirmede not koruma; sil/geri al; grup/Oynama Listesi ayrımı; bitişik manuel seri; sıra ve verinin yeniden yüklenmesi; oturum izinlerinin sıfırlanması; değiştirmeden önce yedek; kötü şekilli JSON/ID/kapak reddi; `javascript:` kaynak ve geçersiz ayar reddi; manuel yama kaynağı zorunluluğu; geç metadata’nın silinen oyunu diriltmemesi; bozuk dosyayı koruyup sağlam yedeğe dönme.

### Web ve araç sınırı: 19

localhost, sayısal/hex loopback, özel/rezerve IPv4, IPv6 loopback/mapped IPv4, yerel alan adı, uygunsuz protokol/port ve URL içi kimlik bilgisi engelleri; public HTTPS kabulü; HTML script/iframe/navigation ayıklama; düz yazının araç sayılmaması; JSON ve araç girdi sınırları; soru kimlikleri.

### LM aktarımı: 6

Native/OpenAI temel adres ayrımı; gerçek yetenek alanlarından model seçenekleri; bölünmüş SSE paketleri ve parça parça araç argümanları; ayrı reasoning ve bölünmüş `<think>` etiketleri; tamamlanmamış akıştan araç çalıştırmama; native reasoning gövdesi ve OpenAI’ye belgelenmemiş effort alanı göndermeme.

### Ajan: 10

Onaydan önce mutasyon yok; ret model sonucuna dönüyor; izinli silme ve undo; araç/sohbet sınırında “her zaman” izni; isteğe bağlı okuma izni; sihirbaz sonucuyla devam; iptalde bekleyen izin temizliği; JSON yedek modunda aynı izin kapısı; düz yazı/bozuk JSON ile işlem yapılmaması; uydurma ID hatası; native şema reddinden sonra açıklanmış JSON yedeği. Bazı testler aynı senaryoda birden fazla sınırı kontrol eder.

### Kuyruk ve oturum kurtarma: 4

Önbellekten dönen oyunun `loading` kalmaması; aktif isteği iptal edip bekleyen oyunları normale döndürme; yinelenen mutasyon ID’lerini reddetme; yarım kalmış araç geçmişine iptal sonucu ekleyip **eski aracı tekrar çalıştırmama**.

## 9 tarayıcı arayüz testi

1. Toplu liste aktarımı, satır aralığı, yinelenen birleştirme, otomatik seri daralt/aç.
2. Grup oluşturma, üyelik taşıma, ayrı Oynama Listesi, silme onayı ve Ctrl+Z.
3. **2.000 oyun** ile sanallaştırma: aynı anda 30’dan az oyun satırı DOM’da; sona kaydırma; Alt+↓ sıralaması ve sayfa yenilemede kalıcılık.
4. Gerçek fare sürüklemesiyle oyun → neden grubu, ardından oyun → sohbet eki.
5. Tema ve manuel donanımın yeniden yüklenmesi; desteklenmeyen düşünme kontrolünün kapalı olması.
6. Görünür izin diyaloğu; reddedince hiçbir oyun eklenmemesi; izin verince gerçek kayıt; Markdown kalın metin çıktısı.
7. Soru sihirbazı ileri/geri, seçimin korunması, çoklu seçim, özel yanıt ve ajanın devamı.
8. 1000×740 düzen, sohbet panelini gizleme, Ctrl+K, modal içi klavye odağı ve Escape.
9. Soru atlama ve iptalin modele geri dönmesi; kütüphanede mutasyon olmaması.

**Önemli:** AI arayüz testleri deterministik bir sahte LM sunucusu kullanır. Bunlar izin/akış/renderer/backend bütünleşmesini doğrular; gerçek bir dil modelinin doğru araç seçeceğini veya iyi Türkçe yanıt vereceğini kanıtlamaz.

## Canlı kaynak kontrolü

- Portal 2 (Steam app 620) için gerçek arama, metadata, görseller, Türkçe arayüz/altyazı tablosu ve CPU/OS gereksinim metni alındı. Oyun test verisi dağıtım kütüphanesine eklenmedi.
- Anahtarsız DuckDuckGo HTML aramasında ilgili kaynak adayları alındı. Bing RSS’nin bazı sorgularda alakasız sonuç verdiği görüldüğü için son sürümde **DuckDuckGo birincil, Bing yedek** yapıldı. Tırnak içindeki oyun adının sonuç metni/URL’siyle eşleşmesi de kontrol edilir.
- Bu bağlantıların dönmesi, bir yamanın çalıştığı/güvenli olduğu anlamına gelmez; hiçbir yama indirilmedi veya çalıştırılmadı.
- Kanıt çıktıları `docs/canli-kaynak-testi.txt` ve `docs/canli-arama-testi.txt` içindedir. İlk dosyanın sonundaki Bing denemesi eski sağlayıcı önceliğinin gözlemidir; son davranış ikinci dosyadadır.

## Windows paketinin doğrulanması

- `npm run build` başarılı tamamlandı.
- İçteki uygulama PE32+ **x86-64 Windows** yürütülebiliridir. Dıştaki NSIS taşınabilir başlatıcının PE32 görünmesi normaldir; payload x64’tür.
- `app.asar` içinde yalnızca üretim UI dosyaları, paketlenmiş main/preload ve package manifest vardır. Geliştirme sunucusu, test verileri, `node_modules`, kullanıcı kütüphanesi ve API anahtarları eklenmez.
- Paket içindeki main/preload byte içerikleri çalışma alanındaki son üretim derlemesiyle karşılaştırıldı; eşleşti.
- Windows kaynak/simge düzenlemesi yapıldı; **kod imzası yoktur**.
- Türkçe ve İngilizce Electron runtime dil paketleri korunur. Üçüncü taraf lisans bildirimleri pakete dahildir.
- İlk denemede maksimum 7-Zip sıkıştırması 2 GB ortamda bellek yetersizliğine takıldı. Varsayılan 5 düzeyiyle yeniden paketleme başarılı oldu; bu düzey tekrar derleme scriptinde kalıcıdır.

## Kullanıcının Windows kabul kontrolü

- [ ] EXE açılıyor ve ana pencere boş kütüphane ile geliyor.
- [ ] 5–10 oyun aktarılıp kapat/aç sonrasında sıra ve notlar korunuyor.
- [ ] WMI/dxdiag donanımı doğru; doğru GPU/disk seçili, belirsiz VRAM elle kontrol edilmiş.
- [ ] Steam eşleşmesi ve örnek oyun bilgisi doğru.
- [ ] LM Studio bağlantı testi/model listesi geliyor.
- [ ] `list_games` benzeri okuma aracı, izinli ekleme, ret ve silme/undo akışı gerçek modelle deneniyor.
- [ ] Soru sihirbazı sonrası gerçek model devam ediyor.
- [ ] Düşünme seçeneği yalnızca destek bilgisi geldiyse açık; gerekirse varsayılana dönülüyor.
- [ ] Uygulama izinleri, SmartScreen/antivirüs ve Mica/Acrylic işletim sistemi üzerinde ayrıca değerlendiriliyor.
- [ ] JSON dışa aktar/yedek geri yükleme ve veri klasörü erişimi kontrol ediliyor.

Test kayıtları `docs/test-logs/` altındadır. Testlerin geçmesi tüm donanım, bütün oyunlar ve bütün modeller için hatasızlık garantisi değildir.
