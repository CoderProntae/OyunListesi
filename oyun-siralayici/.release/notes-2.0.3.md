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
