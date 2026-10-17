# 1.0.11 — Durdur / Devam et ve araştırma ilerlemesi

15 Ekim 2026.

## Hata neydi?

İki ayrı akış vardı: otomatik araştırma işi ve o araştırmanın sohbetine sonradan yazılan kullanıcı mesajı. Durdurulan otomatik iş `cancelled` durumunda kalıyordu; sohbette “Devam et” denilerek kaydedilen sonuçlar bu işin durumuna bağlanmıyordu. Araştırma tekrar başlatılınca aşama döngüsü her seferinde donanımdan başlıyordu.

Bu nedenle model donanım bilgisini gerçekten kaydetmiş olsa da arayüz durduruldu diyebiliyor, düğmeye basınca donanım tekrar araştırılıyordu.

## Düzeltme

1. **Gerçek kayıtlardan aşama denetimi:** minimum/önerilen/etkin optimum gereksinim ve karşılaştırmaları, isteğe bağlı özet, resmi dil/HLTB ve yama sonuçları ayrı kontrol edilir. `shared/research-progress.ts` hem devam planı hem son durum için ortak kaynaktır.
2. **Devam ve baştan ayrı:** devamda tamamlanmış aşamalar atlanır. Baştan veya toplu yeniden araştırma bütün etkin aşamaları bilerek çalıştırır.
3. **Manuel sohbet ile iş durumu eşlendi:** araştırmanın kendi sohbetindeki kullanıcı turu takip edilir. Başarılı kayıttan sonra artık eski “durduruldu” etiketi kalmaz. Bir aşama tamamlandıysa veya devam istendiyse kalan aşamalar otomatik yürütülür.
4. **Durdurma gerçekten durdurur:** manuel devam da sohbet ve araştırma Durdur düğmeleriyle kesilebilir. İptal veya model hatası yeni aşamalara geçme izni sayılmaz. Aynı anda ikinci mesaj, çalışan işin takip bilgisini silemez.
5. **Kaydedilmiş sonuçlar ve geçmiş korunur:** sonraki otomatik aşamalar temiz bir araştırma sohbetinde yürüyebilir; kesilmiş ve manuel tamamlanmış eski sohbet silinmez. Son çalışılan aşama dosyada tutulur; başarı yalnız bu işaretten çıkarılmaz.

## Kullanım

- Eski EXE’yi kapat, 1.0.11’i aç; veri klasörünü silme.
- Yarım kalmış oyunda **Araştırmaya devam et** kullan. Önceki sürümde manuel tamamladığın donanım kaydı da kontrol edilir; eski dosyada yeni `stage` alanının bulunması şart değildir.
- Model düşünmede takılırsa **Durdur**; aynı **Araştırma geçmişi** sohbetinde “Devam et” yazabilirsin. Donanım kaydı tamamlanınca kalan akış sürer.
- Yalnız en baştan yapmak istiyorsan **Baştan araştır** kullan. **Tüm oyunları yeniden araştır** da tam yenilemedir, devam düğmesi değildir.

## Ne, tamamlandı sayılır?

Modelin “bitti” yazması tek başına yeterli değildir. Gerçek yapılandırılmış gereksinimler ve uygulanan karşılaştırmalar kontrol edilir. Kaynakta yayımlanmamış bilgi açıkça kayıtlı olabilir; değer uydurulmaz. Donanımın yetersiz olduğu belirlenmişse araştırma aşaması tamamlanmış olabilir — bu oyunun çalışacağı anlamına gelmez.

Cihaz/gereksinim değişikliği karşılaştırmayı belirsiz bırakırsa ilgili aşama tekrar gerekir. Saat içermeyen HLTB kaydı ve yeniden kontrol bekleyen yama tamamlandı sayılmaz. Özet ayarı kapalıysa özet aşaması aranmaz.

## Doğrulama

- **295/295 birim/entegrasyon testi**, 17 dosya; bu sürüm için **20 yeni regresyon**.
- **35/35 Playwright arayüz testi**, üç yeni senaryo: düşünme akışını durdurup sohbetten devam; kaydedilmiş donanımı atlayan devam düğmesi; bilerek donanımdan başlayan baştan düğmesi.
- **Beş Linux Electron senaryosu**. Yeni devam testinde gerçek IPC üzerinden yalnız eksik yama aşamasına geçildi; açık yeniden başlatmada donanım tekrar çalıştı. Önceki sohbet korundu.
- Windows x64 portable ve ASAR içerik doğrulaması; ayrıntılar `TEST-RAPORU.md` ve sürüm rapor dosyalarında.

`arastirmaya-devam-1.0.11.png` sentetik HTTP/SSE model senaryosunun ekran görüntüsüdür; gerçek oyun veya gerçek model değerlendirmesi değildir.

## Sınırlar

Bu değişiklik **modelin kendi thinking döngüsünü ortadan kaldırdığı iddiası taşımaz**. Durdurup devam ederken uygulamanın ilerlemeyi kaybetmesini düzeltir. Yeni düşünme token kotası, zaman kotası veya keyfî araç tur sınırı eklenmedi. Çıktı ayarı, kaynak zorunluluğu olmaması ve önceki işlevler korunur.

Gerçek Windows, kullanıcının LM Studio modeli, gerçek kütüphanesi ve oyun çalıştırması bu ortamda test edilmedi. Test modeli deterministik yanıtlardan oluşur. 1.0.11 için yeni canlı web araştırması yapılmadı.
