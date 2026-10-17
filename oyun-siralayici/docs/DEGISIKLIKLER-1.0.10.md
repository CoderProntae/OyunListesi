# 1.0.10 — araştırma akışı ve kişisel not özelliğinin kaldırılması

15 Ekim 2026. Bu sürüm kullanıcıya yeni bir teknik prompt yüklemek yerine uygulamanın veri, araç ve tamamlanma akışını değiştirir.

## 1. Kişisel not özelliği gerçekten kaldırıldı

`Game.note` veri tipinden, başlangıç değerlerinden, kayıt/import doğrulamasından, JSON/CSV oyun dışa aktarımından ve `edit_game` şemasından çıkarıldı. Notlarım görünümü ve ilgili erişilebilirlik/stil kalıntıları kaldırıldı. Eski dosyalardaki alan yüklenirken atılır; geri alma veya içe aktarma bu özelliği geri getirmez. Eski alanı yazmaya çalışan çağrı reddedilir.

**Silinmeyenler:** tarihî sohbetler, disk üzerinde önceden oluşturulmuş yedekler, kaynak/yama açıklamaları ve donanım algılama tanı bilgisi. Bunlar yeni kişisel not alanı değildir. Eski sohbet veya yedek içinde daha önce yazılmış not metni kalabilir.

## 2. Türkçe Grafik/GPU ayrıştırması

Gereksinim ayrıştırıcısı Türkçe/İngilizce etiketleri, büyük harf Türkçe karakterleri, noktalı virgül/virgül/dikey çizgi/satır ayırıcılarını ve HTML tablolarını işler. Etiket tanıma normalleştirilir; virgüllü ondalıklar gereksiz bölünmez.

Kullanıcının örneği regresyon testi oldu:

> OS: Microsoft Windows 2000/XP; CPU: 450MHz AMD/Intel işlemci; RAM: 96 MB (128 MB önerilen); Grafik: 16MB Direct3D uyumlu ekran kartı; Depolama: 830 MB HDD (tam kurulum), 530 MB minimum.

Sonuç: CPU ve OS metni; RAM **0,09375 GB**, GPU metni, VRAM **0,015625 GB**, depolama **0,810546875 GB**. Bu değerler yalnız ham metinde değil gerçek alanlarda saklanır. Mevcut kütüphane yüklenirken boş yapılandırılmış alanlar ham metinden onarılır; açıkça girilmiş alanlar ezilmez. Bu, gerçek Windows uyumluluğu testi değildir.

## 3. Eksik önerilen CPU ve diğer bileşenler

Minimum, önerilen ve etkin optimum düzeylerinin OS/CPU/GPU/RAM/disk kapsamı uygulamada değerlendirilir. Eksik gereksinim, belirsiz karşılaştırma ve bekleyen kayıt ayrı tutulur. Kaynakta bütün seviye veya tek bileşen yayımlanmamış olabilir; bu açıkça işaretlenir ve tabloda **Yayımlanmamış** görünür. Örneğin yalnız 128 MB önerilen RAM biliniyorsa diğer önerilen bileşenler uydurulmaz.

Ajan gereksinim veya karşılaştırma yazdıktan sonra erken bitirmeye çalışırsa uygulama eksik alanları düzeltme turuna verir. Değişmeyen eksik durum tekrar dönerse tamamlandı denmez. Aynı hatalı kayıt veri değişmeden yinelendiğinde işlem döngüsü durdurulur. Sabit toplam tur veya araç kotası eklenmedi.

`record_compatibility` sonucu gerçekten uygulanmalıdır. Yayımlanmamış gereksinime sahte tik yazılamaz. Zaten doğrulanabilir sayısal karşılaştırma tekrar geldiğinde mevcut uygulanmış sonuç korunur; gereksiz başarısız tekrar oluşturulmaz. Genel donanım üstünlüğü, oyunun kesin açılacağı veya sorunsuz çalışacağı iddiasına dönüştürülmez.

## 4. Geçmiş araç kartları

Araç girdisi ve çıktısı çağrı anında bağımsız kopyalanır. Daha sonraki oyun değişiklikleri önceki `get_game_info` veya diğer araç kartlarını değiştirmez. Kayıt/açılış sonrasında da aynı kalır. Eski sürümde daha önce değişip kaydedilmiş bir kartın orijinal eski içeriği geri getirilemez.

## 5. Kısa otomatik araştırma talimatları

Ortak kurallar `electron/agent-policy.ts` içindedir. Aşama talimatları oyun adı/kimliği ve kısa hedef taşır; cihaz dökümü veya tekrar tekrar uzun kontrol listesi taşımaz. Ajan `get_hardware` ve `get_game_info` ile güncel durumu okuyabilir. Normal araç sayısı 26’dır.

Aynı Max Payne ölçüm verisiyle, karakter sayısı:

| Aşama | 1.0.9 | 1.0.10 |
|---|---:|---:|
| Donanım | 5076 | 137 |
| Özet | 895 | 109 |
| Dil ve süre | 678 | 134 |
| Türkçe yama | 1434 | 163 |
| **Toplam aşama gövdesi** | **8083** | **543** |

Bu yaklaşık **%93 daha kısa aşama gövdesi** demektir; toplam istek veya token tasarrufu ölçümü değildir. 1348 karakterlik ortak politika, araç şemaları, geçmiş ve araçlarla okunan veriler ayrıca bağlama girer. Gerçek Electron testinin ilk aşama talimatı 144 karakterdir; oyun adı/kimliğine göre uzunluk değişir.

Arka plan araştırması yalnız hedef oyunun araştırma alanlarına erişir; normal kullanıcı sohbetinin düzenleme/geri alma araçları korunur. Kaynak, alıntı, önceki fetch şartı veya keyfî tur kotası eklenmedi. Çıktı tavanı ve gerçek model bağlamı farklı olmaya devam eder; seçilen çıktı tavanı sessizce küçültülmez.

## 6. Doğrulama ve sınırlar

**275 birim/entegrasyon testi**, **32 arayüz testi**, dört Linux Electron senaryosu geçti. Yeni 28 birim ve iki arayüz testi bu sürümün regresyonlarını kapsar. Doğal kullanıcı isteğiyle başlayan HTTP/SSE testinde modelin erken bitirmesi uygulama denetimiyle onarılır; eksik önerilen alanların durumu kaydedilir. Ayrı senaryoda aynı başarısız kıyas sahte başarıya dönüşmeden durur.

Windows portable oluşturuldu; iç uygulamanın x64 PE mimarisi ve sekiz ASAR dosyasının derlenmiş kaynakla byte eşleşmesi doğrulandı. **Gerçek Windows çalıştırması, kullanıcının LM Studio modeli ve oyunun açılışı denenmedi.** Sentetik model cevapları gerçek web araştırması/benchmark kanıtı değildir. Bu sürümde yeni canlı sağlayıcı testi yapılmadı; önceki canlı testler tarihî kanıt olarak tutuldu.

Kanıtlar: `TEST-RAPORU.md`, `prompt-olcumu-1.0.10.json`, `ajan-akisi-1.0.10.png`, `birim-testleri-1.0.10.txt`, `arayuz-testleri-1.0.10.txt`, dört Electron raporu ve `paket-dogrulama-1.0.10.json`.

## Güncelleme

Eski EXE’yi kapatıp **1.0.10** dosyasını aç. Veri klasörünü silme, ara sürüm kurma veya oyunları yeniden içe aktarma. Sorunlu oyun için **Araştır** kullan; tüm kütüphaneyi yenilemek istersen **İstatistikler → Tüm oyunları yeniden araştır** bulunur. Model/bağlam/çıktı ayarlarını bu düzeltme için değiştirmen gerekmez. Önceki araştırmanın yanlış bilgisini, yeni araştırma yapılmadan doğruymuş gibi işaretlemiyoruz.
