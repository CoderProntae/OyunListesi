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

## 2.0.2

**İki sohbet, alt alta**
- Sohbet başlığındaki yeni düğmeyle (iki satır simgesi) ikinci bir sohbet alta açılır; iki sohbet aynı anda çalışabilir.
- İki sohbet açıkken ikisi de sade görünür: ince başlık satırı, rol etiketleri yok, tek satırlık yazı alanı.
- Sohbet listesinde tıkladığın sohbet, odaktaki bölmede açılır (Üst / Alt işaretiyle görünür). Diğer bölmedeki sohbeti seçersen ikisi yer değiştirir. Listede sağ tık → "Altta aç".
- Aradaki çizgiyi sürükleyerek yükseklikleri ayarla; çift tıklayınca eşitlenir. Bölmenin × düğmesi tek sohbete döner.

**Güncelleme**
- İndirme artık aynı anda 4 bağlantıyla yapılıyor (sunucu izin verdiğinde) ve hızı gösteriliyor. Testte tek bağlantıya göre 2 kattan hızlı.
- Dosya önce gizli bir geçici klasöre iniyor, doğrulandıktan sonra masaüstüne kopyalanıyor. Masaüstü OneDrive ile eşitleniyorsa yarım dosyanın yüklenmeye başlaması hem indirmeyi yavaşlatabiliyor hem de sonda dosyayı kilitleyebiliyordu.
- İndirme bitince "Doğrulanıyor…" ve ardından "Güncelleme indirildi" görünür. Bir sorun olursa sağ üstte "Güncelleme sorunu" kalır; artık sessizce kaybolmuyor. Masaüstüne kopyalanamazsa güncelleme geçici klasördeki doğrulanmış kopyayla yapılır.

**Arayüz**
- Oyun katmanı ayarları açık temada da okunaklı.
- Sohbet listesinde düzenle/sil düğmeleri üzerine gelince çıkıyor; başlıklara daha çok yer kalıyor.
- Mağaza kartlarında uzun adlar tek satırda kalıyor; oyun listesinde kısalan adın tamamı üzerine gelince görünüyor.
- "Yenilikler" karşılaştırması küçük pencerelere sığıyor; toplu düzenleme aracı sohbette Türkçe adıyla görünüyor.
