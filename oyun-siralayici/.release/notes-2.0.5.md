## 2.0.5

**Bu güncellemeyi kurarken (son kez eski yöntem)**
- Bu kurulumu hâlâ eski sürüm yapar. "find" yazan bir pencere açılıp kalırsa onu × ile kapatma (yenisi açılır). Pencerenin içine tıkla, Ctrl+Z'ye, sonra Enter'a bas; yeni sürüm açılır.
- Ya da hiç uğraşma: masaüstündeki Oyun-Siralayici-2.0.5-Portable.exe dosyasını çift tıkla. 2.0.5 açılınca takılı kalan pencereleri kendisi kapatır.

**Güncelleme artık terminal açmıyor**
- 2.0.5'ten sonraki güncellemelerde arada komut penceresi (terminal) açılmaz. Yeni sürüm doğrudan açılır; eski sürüm o sırada "Yeni sürüm açılıyor…" gösterir ve yeni sürüm açılınca kendiliğinden kapanır.
- Eski EXE, yeni sürüm açıldıktan sonra arka planda silinir; yeni sürümün açılması bunu beklemez.

**Sistem gereksinimleri: PCGamingWiki**
- Mağazası sistem gereksinimi yayımlamayan oyunlarda (My Abandonware, "Platform yok" ile eklenenler, gereksinim yazmayan mağaza sayfaları) gereksinimler PCGamingWiki'den alınır. Yalnız Windows gereksinimleri kullanılır; adı ya da çıkış yılı tutmayan sayfa alınmaz.
- Sistem sekmesinde kaynak "Gereksinimler: PCGamingWiki" olarak görünür; "PCGamingWiki sayfası" ile sayfayı açabilirsin.
- PCGamingWiki'de de yoksa "belirtilmemiş" kalır ve nedeni yazılır (ör. yalnızca DOS gereksinimi var). Bu oyunların AI araştırmasında donanım aşaması olmaz.
- Gereksinimi olmayan oyunlar ilk açılışta bir kez kendiliğinden PCGamingWiki'de aranır.

## 2.0.4

**Seriler**
- Kendi serini oluşturabilirsin: listenin üstündeki "Yeni seri" düğmesi veya bir oyuna sağ tık (ya da oyun sayfasındaki ⋯) → "Seri oluştur / seriye ekle".
- Pencerede seriye ad ver, oyunları aranabilir listeden işaretle. Seçtiğin oyunların adından bir seri adı önerilir.
- Aynı pencereden mevcut bir seriye oyun ekleyebilirsin ("Nereye?"). Seri başlığındaki ⋯ düğmesiyle seriye oyun ekleyip çıkarabilir, adını değiştirebilirsin.
- Başka bir seriden alınan oyun o seriden çıkar; tek oyunu kalan seri kendiliğinden kalkar. Geri al (Ctrl+Z) çalışır.

**Bilgiler**
- HowLongToBeat, adındaki iki nokta veya tire HowLongToBeat'teki yazılışında olmayan oyunları bulamıyordu (ör. My Abandonware'deki "Unreal: Gold", HowLongToBeat'te "Unreal Gold"). Artık bu işaretler olmadan da aranıyor; adında böyle bir işaret olup süresi eksik kalan oyunlar bir kez kendiliğinden yenilenir.
- Metacritic bir oyunu listeleyip eleştirmen puanı vermiyorsa (yeterli inceleme yoksa) artık "—" yerine "puan yok" yazıyor; tıklayınca Metacritic sayfası açılıyor. Başka bir sürümün puanı kullanılmaz.

**AI araştırması**
- Mağazası sistem gereksinimi yayımlamayan oyunlarda artık donanım aşaması yok; karşılaştırılacak bir şey olmadığı için doğrudan özete geçiliyor (özet kapalıysa hiç model çağrılmıyor).

## 2.0.3

**Güncelleme: "terminated" hatası giderildi**
- Güncellemenin durduğu dosya sunucusu, uzun süren her bağlantıyı yaklaşık 20–30 saniye sonra kesiyor. Hızlı bağlantıda dosya bu süreden önce bittiği için fark edilmiyordu; yavaş bağlantıda indirme hep yarıda "terminated" ile duruyordu.
- Artık kesilen her parça kaldığı yerden devam ediyor; veri geldikçe kaç kez kesilirse kesilsin indirme tamamlanıyor. Yalnız art arda hiç veri gelmezse duruyor ve sağ üstte nedenini gösteriyor.
- Gerçek sunucuda yavaş hat taklidiyle denendi: bağlantılar 3 kez kesildi, indirme kendiliğinden devam edip doğrulandı.
