## 2.1.0

**Donanım karşılaştırması artık gerçek verilerle**
- İşlemci ve ekran kartı gereksinimleri artık PassMark puanlarıyla (yaklaşık 4.900 işlemci ve 3.000 ekran kartı) ve TechPowerUp özellikleriyle (DirectX, OpenGL, Vulkan, Shader Model, bellek, çıkış yılı) karşılaştırılıyor. Karşılaştırma anında yapılır; yapay zekâ gerekmez.
- Gereksinim satırı parça parça okunur: "GTX 660 veya HD 7870" gibi seçenekler (önce senin kartının markası sayılır), "64 MB DirectX 9 uyumlu AGP kart, donanımsal T&L", "OpenGL 3.0, 512 MB", "2.4 GHz çift çekirdek", "dahili grafik desteklenmez", "AVX2 gerekli", eski Windows adları (95, 98, XP).
- Sistem sekmesinde tablonun altında her işlemci ve ekran kartı satırının açıklaması yazar. Örnek: "GeForce GTX 1660 SUPER, istenen GeForce GTX 760 kartından yaklaşık 2,6 kat güçlü".
- Puanlar arasındaki fark %10'dan azsa satırda ≈ ve "yaklaşık eşit" görünür; bu, karşılanmış sayılır.
- Model adı yazmayan satırlar (ör. "2.4 GHz çift çekirdek") oyunun çıktığı yıllardaki benzer işlemcilerle kıyaslanır; yalnız GHz'e bakılmaz.
- Bilgisayar ekran kartının belleğini, DirectX düzeyini ya da Vulkan sürümünü okuyamadıysa kartın bilinen değerleri kullanılır.

**AI araştırması çok daha kısa**
- AI artık yalnız uygulamanın okuyamadığı satırlara bakar (ör. veride olmayan bir parça adı). Bu yüzden çoğu oyunda donanım aşaması hiç olmaz ve "Donanım kontrolü" sorusu çıkmaz.
- AI'ın bir satır için bulduğu sonuç, aynı gereksinim başka oyunlarda da geçiyorsa oraya da yazılır; aynı şey bir daha araştırılmaz.
- Veriyle hesaplanan satırları AI değiştiremez. Özet kapalıysa ve AI'a kalan satır yoksa araştırma model beklemeden hemen biter.
- Donanım verisi her yeni sürümde tazelenir.

**2.0.4 veya daha eski bir sürümden güncelliyorsan**
- Bu kurulumu son kez eski yöntem yapar. "find" yazan bir pencere açılıp kalırsa onu × ile kapatma (yenisi açılır). Pencerenin içine tıkla, Ctrl+Z'ye, sonra Enter'a bas; yeni sürüm açılır.
- Ya da masaüstündeki Oyun-Siralayici-2.1.0-Portable.exe dosyasını çift tıkla. Takılı kalan pencereleri kendisi kapatır.

## 2.0.8

**Donanım kontrolünü sen de yapabilirsin**
- AI araştırmasını elle başlatınca (oyun sayfası ya da İstatistikler) araştırmada donanım aşaması varsa önce sorulur: "AI'ya bırak" ya da "Kontrolleri sen seç, AI ayarlasın".
- İkincisinde oyunun sistem gereksinimleri tablosu açılır; her satırı Geçti ya da Geçmedi olarak işaretlersin (uygulamanın hesaplayabildiği satırlar önceden işaretli). AI işaretlerini sorgulamadan ve araştırmadan, açıklamalarıyla kaydeder. Sistem sekmesinde bu satırlarda "Senin kararın" yazar.
- Otomatik araştırma sormaz ve işaretlerine dokunmaz. "AI'ya bırak" o oyundaki eski işaretlerini kaldırır.

**Araştırma durumu**
- Durdurulan ya da yarıda kalan bir araştırmanın bütün sonuçları (karşılaştırmalar ve Türkçe özet) kayıtlıysa artık "tamamlandı" sayılır. Eksik bir şey varsa durduruldu olarak kalır.
- Tamamlanan araştırmalar oyun sayfasında gösterilmiyor. Araştırma çubuğu inceldi: yalnızca eksik bir şey varken ya da araştırma sürerken görünür.
- Bir oyunu yeniden araştırmak için: İstatistikler → "Seçtiğim oyunları yeniden araştır" → oyunları işaretle → "Yeniden araştır".

## 2.0.7

**Eksik bilgiler PCGamingWiki'den**
- Oyunun platformu bir bilgiyi vermiyorsa (kapak, geliştirici, yayıncı, çıkış yılı, türler, açıklama) o bilgi oyunun PCGamingWiki sayfasından alınır. En çok My Abandonware ve "Platform yok" ile eklenen oyunlarda işe yarar.
- Platformun verdiği bilgi hiç değiştirilmez; yalnızca boş alanlar doldurulur. Sayfa, sistem gereksinimlerinde olduğu gibi adı ve çıkış yılı tutarsa kullanılır.
- Sayfada Windows gereksinimi olmasa da (ör. yalnızca DOS) kapak ve diğer bilgiler alınır. Açıklama PCGamingWiki'deki gibi İngilizcedir.
- Bilgisi eksik oyunlar ilk açılışta bir kez kendiliğinden yenilenir.

## 2.0.6

**Seriler artık sıranı bozmuyor**
- Seri oluşturmak, seriye oyun eklemek veya çıkarmak hiçbir oyunun yerini değiştirmez. Sırayı yalnızca sen değiştirirsin.
- Serinin oyunları arasına başka bir oyun koyduysan seri bölünür: ilk bölüm seri başlığının altında, sonraki bölüm "Seri adı (devam)" başlığının altında görünür. Başlıktaki sayı o bölümde serinin kaç oyunu olduğunu gösterir (ör. 2/3).
- Bir başlıktan daraltınca serinin bütün bölümleri birlikte daralır. Başlığı sürüklemek yalnız o bölümü taşır; aradaki oyun yerinde kalır.
- Seriyi bir araya getirmek istersen: seri başlığındaki ⋯ → "Oyunları yan yana topla". Ctrl+Z ile geri alınır.
