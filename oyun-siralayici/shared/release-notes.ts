// Notes of the version that is running (shown in Ayarlar → Güncellemeler and in
// "Yenilikler"). New versions bring their own notes in the update channel.
export const RELEASE_NOTES = `## 2.2.1

**Oyun içi panel düzeltildi**
- Ctrl + Tab paneli artık her durumda kapanıyor: aynı kısayola bir daha basmak, Esc, panelin dışına tıklamak ve "Kapat" düğmesi aynı işi yapıyor. 2.2.0'da oyun içinde bir ayar değiştirdiğinde katman sökülüp yeniden kurulmaya çalışılıyordu; "çık" işareti kaldığı için yeni katman anında kendini kapatıyor, panel kapanmıyor ve Ctrl + Tab bazen tamamen çalışmaz oluyordu. Artık oyun içindeyken katman sökülmüyor, değişiklik aynı karede uygulanıyor.
- FPS satırı boş ("-") kalmıyor: kareyi oyunun içinde ölçtüğümüz için FPS doğrudan kancadan geliyor. Ölçüm yoksa nedeni yazılıyor: "izin" (Windows izin vermiyor), "…" (ölçüm başlıyor), "—" (bu oyun ölçülemiyor).

**DirectX 9 ve OpenGL oyunları da oyunun içinde**
- DirectX 9 ile çalışan oyunlarda (2004–2013 dönemi) gösterge ve panel artık oyunun kendi karesinin içinde çiziliyor.
- OpenGL ile çalışan oyunlarda (Doom 3, Quake 4, eski Minecraft, birçok bağımsız oyun) aynı şekilde oyunun içinde çiziliyor.
- İki arka uç da oyunun çizim durumunu kaydedip geri yüklüyor: oyunun görüntüsüne, ayarlarına ya da dosyalarına dokunulmuyor. D3D9 için cihaz vtable'ı (Present/Reset) ve Direct3DCreate9 kancası, OpenGL için wglSwapBuffers kancası kullanılıyor.
- Doğrulama: sahte D3D9 ve sahte OpenGL oyunlarıyla uçtan uca testler (yerleştirme → kanca → çizim) otomatik koşuyor; D3D12 testiyle birlikte üçü de çizilen kare sayısını doğruluyor.
- Vulkan bir sonraki sürümde: Windows'a örtük katman (implicit layer) kaydı gerekiyor, hazırlığı sürüyor. Vulkan oyunlarında şimdilik pencere katmanı kullanılıyor.

## 2.2.0

**Oyun içi katman: gösterge artık oyunun kendi karesinin içinde**
- Bazı oyunlar (ör. Little Nightmares 3) kendi pencerelerini sürekli en üste taşıdığı için köşe göstergesi oyunun arkasında kalıyordu. Bu sürümde gösterge, oyunun grafik arayüzüne (DirectX 11 / DirectX 12) oyunun kendi karesi sunulmadan hemen önce çiziliyor: tam ekran dahil her görüntü modunda, oyunu odağa almadan görünür.
- Ctrl + Tab paneli de oyunun içinde açılır: sekmeler, anahtarlar, kaydırıcılar ve gösterge listesi oyunun üstünde çalışır; düzenlemeler anında kaydedilir. Panel açıkken fare ve klavye oyununa iletilmez.
- Çizim yöntemi Ayarlar → Oyun katmanı → Oyun ve izinler → "Çizim yöntemi" ile seçilir: Otomatik (önce oyunun içi, olmazsa pencere), Her zaman oyunun içinde, Pencere katmanı (eski davranış).
- Enjeksiyon, oyunu tanıyan yardımcı süreç tarafından ve yalnız oyun penceresi görünürken yapılır. Easy Anti-Cheat, BattlEye, Vanguard, XIGNCODE, nProtect, FACEIT gibi korumalardan biri tespit edilirse oyunun sürecine HİÇ dokunulmaz ve pencere katmanına düşülür; nedeni uygulamada yazılır.
- Katman oyunun içine yalnız çizim verisi taşır: oyunun belleği okunmaz, tuş/fare oyunu adına kullanılmaz, dosyalarına yazılmaz. Oyun kapanınca katman kendini söker.
- Doğrulama: sahte D3D12 oyunu ile uçtan uca test (enjeksiyon → kanca → çizim) otomatik koşar; D3D11 çizimi ekran görüntüsüyle doğrulanmıştır. Geç enjeksiyon yolu (kukla cihaz) Wine ikinci bir grafik cihazı kurulumunu desteklemediği için yalnız gerçek Windows'ta doğrulanabilir.
- Bu sürümde OpenGL / Vulkan / D3D9 ile çalışan eski oyunlar için oyun içi çizim YOKTUR; onlarda pencere katmanı kullanılmaya devam eder.

## 2.1.6

**Oyun katmanı: oyunun üstünde kalıyor**
- Bazı oyunlar kendi pencerelerini sürekli en üste taşıyor (Unreal Engine 5 ile yapılan tam ekran oyunlar, örneğin Little Nightmares 3). Katman bu yüzden oyunun arkasında kalıyordu: köşedeki gösterge oyunda görünmüyor, başka bir programa geçince bir an görünüp kayboluyor, Ctrl + Tab ile açılan panel oyunun arkasında açılıyordu. Artık oyun öndeyken katman pencereleri de en üstte tutuluyor ve bu sıra saniyede bir yeniden kuruluyor.
- Davranışın öbür yarısı aynı kaldı: başka bir program öne geçtiği anda katman en üstten çıkıyor, oyun penceresinin hemen üstünde durmaya devam ediyor. Yani katman başka programların üstüne çıkmıyor.
- Oyun "Tam ekran" modunda çalışıyorsa (ekran kartının doğrudan çizdiği mod) hiçbir program oyunun üstüne çizemez. Köşedeki gösterge için oyunun görüntü ayarlarında "Kenarlıksız / Pencereli tam ekran" (Borderless) modunu seç.

## 2.1.5

**Donanım adları: mağazanın yazdığı gibi okunuyor**
- Seri adı veren gereksinimler ("GeForce 600 series", "Radeon HD 7000 series") artık bir nesil olarak okunuyor. Eskiden "600" sayısı, 2004 model bir PCI kartıyla ("600 PCI") eşleşip "904 kat güçlü" gibi anlamsız bir sonuç üretiyordu; şimdi o neslin en zayıf masaüstü kartı esas alınıyor ve hangi kartın kullanıldığı açıklamasında yazıyor (ör. "GeForce 600 serisinin en zayıf masaüstü kartı GeForce GT 610"). Tümleşik grafikli APU kayıtları (Radeon HD 7290 gibi) seri tabanı sayılmıyor.
- "Athlon II X4 760K" bulunuyor: puan listesi bu işlemciyi "Athlon X4 760K" diye yazıyor, mağazalar "Athlon II X4 760K" diyor; iki yazım da aynı işlemciyi veriyor. Eskiden yanlış bir aile üyesi ("Athlon II X4 559") üzerinden tahmin üretiliyordu.
- Uzantısı yazılmayan modeller ("Intel Core i7 4700", "i5 8250") artık ailesinin kayıtlı üyeleriyle karşılaştırılıyor; hangi modelin esas alındığı açıklamada belirtiliyor ve sonuç "tahminî" sayılıyor. Eskiden bu satırlar "karşılaştırılamadı" diye boş kalıyordu.

**PCGamingWiki: elle yazdığın oyun adı da bulunuyor**
- Platform seçmeden elle eklediğin oyunlarda adın sonuna yazdığın parantezli yıl ya da sürüm ("Unreal Gold (1998)", "Gothic II (Gold Edition)") ve sona eklenen "GOTY / Edition" sözleri aramayı bozuyordu; şimdi bunlar ek aday ad olarak da deneniyor. Sürümü ayırt eden sözler ("HD", "Remastered", "II") asla silinmiyor.

**Arayüz**
- Tür filtresi Türkçe alfabesine göre sıralanıyor: Ç, Ö, Ü, İ, Ş artık doğru yerinde (eski sıralama "Şehir"i en sona atıyordu).

**Tarama**
- Uygulamanın tamamı baştan tarandı: her ekran, sekme ve pencere açıldı; hiçbir yerde konsol hatası, "undefined"/"NaN" gibi iç değer, İngilizce düğme yazısı ya da İngilizce dosya seçme kutusu kalmadığı doğrulandı. Boş kütüphane, 300 karakterlik oyun adı, silme + geri alma ve dışa/içe aktarma turu da aynı taramadan geçti. Karşılaştırma motoru 60 bozuk/anlamsız gereksinim satırıyla denendi: hiçbiri çökmüyor, uydurma veri üretmiyor.

## 2.1.4

**Ayarlar yalnızca senin değiştirdiğini yazıyor**
- Ayarlar penceresi, açıldığı andaki değerlerin kopyasıyla çalışıyordu. "Ayarları kaydet" bu yüzden başka yerden anında kaydedilmiş ayarları geri alabiliyordu: Güncellemeler'deki "Yeni sürümü kendiliğinden denetle" kapanışı ve Oyun katmanı değişiklikleri (ör. panel kısayolu) "Bağlantıyı test et"ten sonra eski değerine dönüyordu. Artık yalnızca o pencerede dokunduğun alanlar yazılıyor.
- Donanım sekmesinde yaptığın değişiklik, başka bir sekmeye geçip kaydedince sessizce kayboluyordu. Donanım profili artık hangi sekmede olursan ol kaydediliyor.
- Sınır dışında bir değer yazınca (ör. maksimum çıktı tokenı 50) hata olarak İngilizce bir JSON dökümü çıkıyordu. Şimdi Türkçe ve alanın kendi adıyla: "Geçersiz değer, hiçbir şey kaydedilmedi. Maksimum çıktı tokenı en az 128 olmalı." Pencere açık kalır; değeri düzeltip yeniden kaydedebilirsin.
- Arka plan görseli seçimi artık İngilizce "Choose File" düğmesiyle değil, Türkçe "Görsel seç" düğmesiyle.

**Tarayıcı**
- Aynı mağaza bağlantısına ikinci kez tıkladığında yeni sekme yığılmıyor; açık olan sekme öne geliyor.

## 2.1.3

**Senin kararın artık her yerde görünüyor**
- Sistem gereksinimi hiç alınamayan bir oyunda Karşılıyor / Karşılamıyor / Bilinmiyor dediğinde, kararın yalnızca oyun sayfasındaki yazıyı değiştirmiyor: kütüphane satırındaki nokta da aynı sonuca dönüyor (Karşılıyor = yeşil tik, Karşılamıyor = kırmızı çarpı, Bilinmiyor = soru işareti). "Uyumluluğa göre" sıralama ve İstatistikler'deki donanım eşleşmesi sayıları da bu kararı kullanıyor.
- Sistem sekmesinde kararın, durum kutusunda açıklamasıyla yazıyor: "Karşılıyor (senin kararın)" + "Sistem gereksinimi yayımlanmadı; bu oyunun bilgisayarında çalıştığını sen işaretledin." Genel bakış'taki SİSTEM UYUMU kutusu aynı yazıyı gösteriyor.
- Gereksinimi olmayan ve senin de işaretlemediğin oyunlarda "Doğrulama gerekiyor" yerine "Gereksinim belirtilmemiş" yazıyor; ekran okuyucu da noktanın gerçek adını okuyor.
- Kararın donanım karşılaştırması üretmez. Mağaza verisi sonradan gelirse gerçek karşılaştırma önceliği alır, senin işaretin arka plana düşer.

**Araştırma akışı**
- Oyun sayfasındaki "Durdur" artık yalnızca o oyunun araştırmasını durduruyor; sıradaki diğer oyunlar çalışmaya devam ediyor (önceden tek oyun için bütün kuyruk duruyordu). Durdurulan oyunun boşalttığı yer sıradaki oyuna geçiyor.
- Model bekleyen oyun sırada sayılır: "AI araştırması bekliyor" durumunda oyun sayfasında "Durdur" var, bir daha "Araştır" çıkmıyor.
- İstatistikler'deki "Araştırmayı durdur" eskisi gibi bütün kuyruğu durdurur.

## 2.1.2

**Bozuk gereksinim satırları artık doğru karşılaştırılıyor**
- Mağaza işlemci gereksinimini düz sayı yazmışsa ("64", "32") doğru okunur: "64" = 64 bit işlemci, "32" = 32 bit (senin işlemcin ikisini de çalıştırır). Bu satırlar artık AI'a "puan" diye gitmez; açıklamada ne istendiği yazar.
- İşletim sistemi gereksinimi düz sayıysa ("10", "7") Windows sürümü sayılır ve kendi Windows'unla karşılaştırılır.
- Önerilen gereksinim bloğu etiketsiz tek cümleyse (ör. "64-bit işlemci gerektirir") cümle doğru bileşene yerleştirilir; Önerilen sütunu açılır ve karşılaştırılır (Bendy and the Ink Machine örneği).
- Sistem gereksinimleri hiç alınamayan oyunlarda Sistem sekmesinde üç seçenek var: Karşılıyor / Karşılamıyor / Bilinmiyor. Kararın oyuna kaydedilir, sayfanın üstündeki durum yazısında da görünür.
- Liste kenarındaki önizleme kartı çok dar pencerede ekranın dışına taşmaz.

## 2.1.1

**Arayüz ve oyun katmanı temizliği**
- Oyun katmanı → FPS sınırı sekmesinde seçenekler düzeldi: radyo düğmesi artık metnin solunda (önce üstünde, esmiş bir kutu olarak duruyordu). Görünüm sekmesinde renk çipleri adının yanında, gereksiz boşluklar gitti; düğme ve kaydırıcı renkleri iki temada da tutarlı.
- Hata mesajları artık iç yazıyla çıkmıyor: "Error invoking remote method…" yerine yalnızca gerçek neden görünür (sohbet, katman paneli ve bildirimlerde).
- Dar pencerede (1160 px altı) sohbet bir çekmece gibi açılıyor; karartılmış alana tıklayınca çekmece kapanıyor. Çekmecenin altındaki düğmeler artık "yarı tıklanabilir" sahte durumda değil.
- Sohbet listesinin sağ tık menüsü pencere kenarına yakın açılırsa ekrana sığacak şekilde kayıyor.
- Köşe göstergesinde FPS ölçülemiyorsa nedeni satırın ipucunda yazıyor (ör. Windows izni gerekiyorsa).
- Arayüz denetimi baştan sona temiz: 0 hata, 0 not.

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

## 2.0.5

**Güncelleme artık terminal açmıyor**
- Bundan sonraki güncellemelerde arada komut penceresi (terminal) açılmaz. Yeni sürüm doğrudan açılır; eski sürüm o sırada "Yeni sürüm açılıyor…" gösterir ve yeni sürüm açılınca kendiliğinden kapanır.
- Eski EXE, yeni sürüm açıldıktan sonra arka planda silinir; yeni sürümün açılması bunu beklemez.
- 2.0.0–2.0.4'ün güncelleme betiği takılı kalabiliyordu ("find" yazan, kapanmayan pencere). 2.0.5 açılınca böyle takılı kalmış bir betik ve pencereleri kendiliğinden kapatılır.

**Sistem gereksinimleri: PCGamingWiki**
- Mağazası sistem gereksinimi yayımlamayan oyunlarda (My Abandonware, "Platform yok" ile eklenenler, gereksinim yazmayan mağaza sayfaları) gereksinimler PCGamingWiki'den alınır. Yalnız Windows gereksinimleri kullanılır; adı ya da çıkış yılı tutmayan sayfa alınmaz.
- Sistem sekmesinde kaynak "Gereksinimler: PCGamingWiki" olarak görünür; "PCGamingWiki sayfası" ile sayfayı açabilirsin.
- PCGamingWiki'de de yoksa "belirtilmemiş" kalır ve nedeni yazılır (ör. yalnızca DOS gereksinimi var). Bu oyunların AI araştırmasında donanım aşaması olmaz.
- Gereksinimi olmayan oyunlar ilk açılışta bir kez kendiliğinden PCGamingWiki'de aranır. PCGamingWiki'ye ulaşılamazsa sonraki açılışta yeniden denenir.

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

## 2.0.1

**Oyun katmanı**
- Odak gerekmiyor: oyunun penceresi açıldığı anda tanınıyor ve FPS ölçümü hemen başlıyor. Oyun öne gelince değerler beklemeden görünüyor.
- Gösterge artık oyunun içinde kalıyor: oyun penceresi görünürken (odak başka yerdeyken de) görünür, oyunun üstüne başka bir pencere gelince onunla birlikte örtülür, oyun küçültülünce kaybolur. Diğer programların üstünde asılı kalmıyor.
- Ctrl+Tab paneli başka bir programa geçince kendiliğinden kapanıyor; × düğmesine basmak gerekmiyor.
- Oyun açılınca sağ üstte "Şimdi oynanıyor" bildirimi sağdan kayarak gelir, birkaç saniye sonra gider; ardından değerler hızlıca kayarak gelir. Oyunun adı artık sürekli görünmüyor (istersen Görünüm sekmesinden açılabilir).

**Animasyonlar**
- Sohbet paneli açılıp kapanırken kayarak gelir/gider; sohbet listesi genişleyip daralırken akar.
- Yeni mesajlar, Ayarlar sekmeleri, oyun sekmelerinin alt çizgisi, sol menüdeki seçim ve Ayarlar menüsü animasyonlu; düğmelere basınca küçük bir tepki var.
- Uygulamanın sağ üstündeki "Şimdi oynanıyor" kayarak gelir, birkaç saniye sonra simgeye küçülür (üzerine gelince adı görünür).
- Hepsi Ayarlar → Görünüm → Animasyonlar ile kapatılabilir.

**Düzeltmeler**
- Pencere küçülünce sohbet listesi sığmayacak kadar geniş kalıyordu.
- Gösterge görünümünün adı silinip yeniden yazılamıyordu.
- Geçersiz panel kısayolu sessizce kaydediliyordu; artık uyarı veriyor.
- Video ve toplantı programları (Filmler ve TV, Medya Oynatıcı, Zoom, Teams…) tam ekranda oyun sanılabiliyordu.
- Gösterge penceresi boyutunu her saniye yeniden soruyordu; artık yalnız değişince.

## 2.0 — büyük sürüm

**Oyun tanımlayıcı ve oyun içi gösterge**
- Açtığın oyunu tanır; sağ üstte "Şimdi oynanıyor" ve seçtiğin değerler görünür: FPS, %1 en düşük FPS, kare süresi, işlemci, ekran kartı, sıcaklıklar, RAM, ekran kartı belleği, güç, saat ve oturum süresi.
- Oyundayken **Ctrl+Tab** ayar panelini açar. Hazır görünümler (Sade, Standart, Ayrıntılı), kendi görünümlerin, renkler, konum, boyut ve saydamlık ayarlanabilir.
- Değer belirlediğin sınırı geçince rengi değişir, düşünce eski haline döner.
- Oyun süresi sınırı, saatli alarm, arka plandaki oyunu veya diğer uygulamaları sessize alma.
- FPS sınırı: RivaTuner yüklüyse anında (arka plandaki oyun için ayrı sınır), NVIDIA sürücüsüyle oyun yeniden açılınca.
- Uygulama kapatılınca görev çubuğunun sağındaki simgede arka planda çalışmaya devam eder.

**Güncellemeler**
- Yeni sürüm çıkınca sağ üstte yeşil tik görünür. Notları okuyup tek tıkla indirebilirsin; indirme yüzdesi sağ üstte görünür, yeni EXE masaüstüne iner, "Güncelleme indirildi"ye basınca uygulama yeni sürümle yeniden açılır ve eski EXE silinir.

**Sohbetler**
- Sohbet listesi sohbet panelinin solunda; sağındaki uzun çizgiyi sürükleyerek genişlet.
- Yeniden adlandırma, silme (Shift ile uyarısız), gruplar ve grup renkleri. Araştırma sohbetleri kendiliğinden "Araştırmalar" grubunda toplanır.

**Düzeltmeler**
- DLC olarak satılan bölümlerin (ör. "Episode 2") HowLongToBeat süreleri artık bulunuyor.
- Steam çıkış tarihi vermiyorsa tarih HowLongToBeat veya Metacritic'ten alınıyor.
- Steam Metacritic puanı vermiyorsa puan Metacritic'ten alınıyor.

**Daha hızlı ve sade**
- Yenilenen, daha sade arayüz; ağır bölümler gerektiğinde yükleniyor.
- Ajan: daha kısa talimatlar ve araç açıklamaları, toplu düzenleme (edit_games), aynı anda birden fazla oyun bilgisi (get_game_info).`;
