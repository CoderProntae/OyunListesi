# Oyun Sıralayıcı 2.0 – 2.2.1: Son Kullanıcı Bilgilendirmesi

Bu belge 2.0 ile gelen her şeyi sade bir dille anlatır. Eski ve yeni görünümü yan yana görmek için uygulamada **Ayarlar → Güncellemeler → "Yenilikleri ve eski / yeni karşılaştırmasını göster"** düğmesine bas. Açılan pencerede ortadaki çizgiyi sağa sola sürükleyerek iki görünümü karşılaştırabilirsin.

---

## 1. Başlarken

- `Oyun-Siralayici-2.2.1-Portable.exe` dosyasını çift tıklayarak aç. Kurulum gerekmez.
- Kütüphanen, sohbetlerin ve ayarların EXE'nin yanında durmaz, Windows kullanıcı klasöründe saklanır. EXE'yi taşısan ya da silsen de verilerin kaybolmaz.
- 1.x sürümünden geçtiysen ilk açılışta "Yenilikler" penceresi bir kez çıkar.

---

## 2. Güncellemeler: artık siteden EXE indirmek yok

1. Yeni sürüm çıkınca sağ üstte **yeşil tik** ve sürüm numarası belirir.
2. Tike basınca sürüm notları açılır. **İndir**'e bas.
3. İndirme sürerken sağ üstte yüzde görünür (ör. %42). Üzerine gelince ya da pencereyi açınca hız da görünür (ör. 3,4 MB/sn). İndirme, sunucu izin verdiğinde aynı anda 4 bağlantıyla yapılır.
4. İndirme bitince kısa bir süre **"Doğrulanıyor…"**, ardından **"Güncelleme indirildi"** yazar.
5. Ona basınca yeni sürüm açılır. Eski sürüm o sırada sağ üstte **"Yeni sürüm açılıyor…"** gösterir ve yeni sürüm açılınca kendiliğinden kapanır. Yeni EXE **masaüstüne** iner; eski EXE, yeni sürüm açıldıktan sonra arka planda silinir.

2.0.5'ten itibaren arada **terminal (komut penceresi) açılmaz**; arka planda kapanmadan kalan bir şey de olmaz.

Bilmen gerekenler:
- Güncellemenin durduğu sunucu uzun süren bağlantıları yarıda kesebilir. Uygulama bu durumda kaldığı yerden kendiliğinden devam eder; bir şey yapman gerekmez (2.0.3).
- Dosya önce gizli bir geçici klasöre iner, doğrulandıktan sonra masaüstüne kopyalanır. Masaüstü OneDrive ile eşitleniyorsa bu, indirmeyi yavaşlatmaz.
- Bir sorun olursa sağ üstte **"Güncelleme sorunu"** görünür. Basınca nedenini görür, **Yeniden dene** ile tekrar başlatırsın.
- Masaüstüne kopyalanamazsa güncelleme, geçici klasördeki doğrulanmış kopyayla yine yapılır.
- İndirilen dosya bozuk ya da değiştirilmiş çıkarsa kullanılmaz. Uygulama dosyanın parmak izini (SHA-256) kontrol eder.
- Uygulama açılışta ve 6 saatte bir yeni sürüm var mı diye bakar. Bunu kapatmak istersen: **Ayarlar → Güncellemeler → "Yeni sürümü kendiliğinden denetle"**.
- Elle kontrol etmek için: **Ayarlar → Güncellemeler → Şimdi denetle**.
- Yeni sürüm 2 dakika içinde açılmazsa eski sürümde **"Yeni sürüm açılmadı"** yazar. Eski sürümü kapat (saatin yanındaki simgeye sağ tık → **Çıkış**), sonra masaüstündeki yeni EXE'yi çift tıkla.
- İndirme bağlantıları bir sürüm çıktıktan sonra birkaç ay geçerli kalır. Uygulamayı çok uzun süre açmazsan bağlantının süresi dolabilir. Bu durumda bir sonraki sürümle yeniden gelir.
- Bu güncelleme sistemi 2.0 ile geldi. 2.0 kullanıyorsan 2.0.1 sağ üstte yeşil tikle görünür.

**2.0.4 veya daha eski bir sürümden güncellerken** kurulumu son kez eski yöntem yapar. Üstünde `find "…"` yazan bir terminal açılıp kalırsa:
- O pencereyi **× ile kapatma**; kapatırsan yenisi açılır.
- En kolayı: masaüstüne inen yeni EXE'yi (ör. `Oyun-Siralayici-2.0.8-Portable.exe`) çift tıkla. Yeni sürüm açılınca takılı kalan terminali ve pencerelerini kendisi kapatır. Eski EXE kalırsa elle silebilirsin; verilerin silinmez.
- Ya da terminalin içine tıkla, **Ctrl + Z**'ye, sonra **Enter**'a bas. Kurulum devam eder, eski EXE silinir ve yeni sürüm açılır.

---

## 3. Sohbet listesi

Sohbet panelinin solunda artık bir **sohbet listesi** var.

- **Genişletmek / daraltmak:** Listenin sağındaki uzun çizgiyi sürükle. Çizgiye bir kez tıklarsan liste kapanır ya da açılır. Sohbet başlığındaki saat simgesi de aynı işi yapar.
- **Yeniden adlandırmak:** Sohbetin adına çift tıkla (ya da sohbeti seçip **F2**'ye bas), yeni adı yaz, Enter'a bas.
- **Silmek:** Sohbetin yanındaki çöp kutusuna bas, uygulama "emin misin?" diye sorar.
  - **Shift** tuşuna basılı tutarak çöp kutusuna basarsan uyarı çıkmadan hemen silinir.
  - Klavyede: **Delete** sorarak siler, **Shift + Delete** sormadan siler.
- **Gruplar:** Listenin üstündeki klasör simgesiyle yeni grup aç.
  - Sohbeti gruba **sürükleyip bırakabilir** ya da sohbete sağ tıklayıp **Gruba taşı**'yı seçebilirsin.
  - Grubun adına çift tıklayarak adını değiştir. Yanındaki **…** menüsünden rengini seç ya da grubu sil.
  - Grubu silince içindeki sohbetler silinmez, gruptan çıkar.
- **Araştırmalar grubu:** AI'nin oyunlar için yaptığı otomatik araştırma sohbetleri kendiliğinden bu grupta toplanır. Bu grup silinemez ama adı ve rengi değiştirilebilir.
- Listenin üstündeki arama kutusu sohbet adlarında arar.
- Düzenle ve sil düğmeleri sohbetin üzerine gelince görünür.

### İki sohbet, alt alta (2.0.2)
- Sohbet başlığındaki **iki satır** simgesine bas: ikinci bir sohbet alta açılır. İki sohbet aynı anda çalışabilir.
- İki sohbet açıkken ikisi de **sade** görünür: ince bir başlık satırı, tek satırlık yazı alanı, daha az süs.
- Hangi bölmedeysen o bölme işaretlenir (başlığın solunda renkli çizgi). Listede tıkladığın sohbet o bölmede açılır. Listede **Üst** ve **Alt** işaretleri hangi sohbetin nerede olduğunu gösterir.
- Diğer bölmedeki sohbeti seçersen iki sohbet yer değiştirir.
- Listede bir sohbete sağ tıklayıp **"Altta aç"** da diyebilirsin.
- İki bölmenin arasındaki çizgiyi sürükleyerek yükseklikleri ayarla. Çift tıklarsan eşitlenir.
- Bir bölmenin **×** düğmesi o bölmeyi kapatır ve tek sohbete dönersin. Başlıktaki aynı simge de tek sohbete döndürür.

---

## 4. Oyun tanımlayıcı ve oyun içi gösterge (2.0'ın yıldızı)

### Ne yapar?
- Bir oyun açtığında, oyuna tıklamana gerek kalmadan onu tanır. FPS ölçümü oyunun penceresi açılır açılmaz başlar, bu yüzden oyuna geçtiğinde değerler bekletmeden hazırdır.
- Oyun açılınca oyunun sağ üst köşesine **"Şimdi oynanıyor: Oyunun adı"** bildirimi sağdan kayarak gelir. Birkaç saniye sonra gider, ardından değerler hızlıca kayarak gelir. Oyunun adını sürekli görmek istersen: Ctrl + Tab → Görünüm → "Oyunun adı sürekli görünsün".
- Uygulamanın sağ üstünde de "Şimdi oynanıyor" kayarak gelir, birkaç saniye sonra küçük bir simgeye dönüşür. Üzerine gelince adı yeniden görünür.
- Gösterge **oyunun içinde kalır**:
  - Oyunun penceresi görünürken, oyuna tıklamamış olsan da görünür (ör. ikinci ekranda).
  - Oyunun üstüne başka bir pencere gelince onunla birlikte örtülür.
  - Oyun küçültülünce kaybolur. Diğer programların üstünde asılı kalmaz.
- Köşede seçtiğin değerler canlı olarak durur: **FPS**, %1 en düşük FPS, kare süresi, işlemci kullanımı ve sıcaklığı, ekran kartı kullanımı ve sıcaklığı, ekran kartı belleği, RAM, ekran kartı gücü, saat hızı, fan, saat, oturum süresi ve dizüstü bilgisayarda pil.
- Oyunlar Steam, Epic ve GOG kayıtlarından, Xbox klasörlerinden ve kütüphanendeki adlardan tanınır. Kütüphanede olmayan ama tam ekran açılıp ekran kartını kullanan programlar da "oyun" sayılır.
- Kütüphanendeki oyun açılınca durumu **"Oynanıyor"** olur (yalnız "Oynanacak" ise). Bu bilgisayarda ne kadar oynadığın oyunun sayfasında görünür: "Bu bilgisayarda 3 sa 20 dk oynandı".

### Oyunun içinde ayar paneli: Ctrl + Tab
- Oyun öndeyken **Ctrl + Tab**'a bas, oyunun üstünde ayar paneli açılır. Kapatmak için tekrar **Ctrl + Tab**, **Esc** ya da sağ üstteki **×**. Kapanınca oyun yeniden öne gelir.
- Panel açıkken başka bir programa geçersen panel kendiliğinden kapanır. × düğmesine basmak gerekmez.
- Ctrl + Tab yalnızca bir oyun öndeyken çalışır. Tarayıcıda sekme değiştirmek gibi normal işleri bozmaz. Tuşu panelin **Oyun ve izinler** sekmesinden değiştirebilirsin.
- Aynı ayarlar uygulamada **Ayarlar → Oyun katmanı** bölümünde de var. Her değişiklik hemen kaydedilir.

### Panelin sekmeleri
- **Göstergeler:** Köşede hangi değerlerin görüneceğini işaretle, ↑ ↓ ile sırala.
  - Her değer için **uyarı** ve **tehlike** sınırı yazabilirsin. Değer sınırı geçince önce sarıya, sonra kırmızıya döner; düşünce eski rengine geri döner.
  - FPS'te düşük değer kötüdür (ör. 30'un altı kırmızı). Sıcaklıkta yüksek değer kötüdür (ör. 86 °C üstü kırmızı).
- **Görünüm:** Hazır görünümler var: **Sade** (yalnız FPS), **Standart**, **Ayrıntılı**.
  - **+ Yeni görünüm** ile kendi görünümünü oluşturup adını verebilirsin.
  - Köşe (sağ üst, sol üst, sağ alt, sol alt), alt alta ya da yan yana dizilim, boyut ve arka plan saydamlığı ayarlanır.
  - Altı rengin hepsi seçilebilir: değer, etiket, arka plan, vurgu, uyarı, tehlike. Sağdaki önizleme anında değişir.
- **Süre ve alarm:**
  - **Oyun süresi sınırı:** Ör. 60 dk seçersen süre dolunca köşede kırmızı uyarı ve Windows bildirimi çıkar, istersen kısa bir ses çalar. Oyun kapanmaz. Sonrasında her X dakikada bir hatırlatır.
  - **Alarm:** Ör. "21:30 Yemek". Alarm her gün o saatte bir kez çalar, oyun açık olmasa da Windows bildirimi gelir.
- **Ses:**
  - **Oyun arka plana geçince sesini kapat:** Alt+Tab yapınca oyun susar, geri dönünce sesi gelir.
  - **Oyun öndeyken diğer uygulamaları sessize al:** Oyun bitince yalnızca bu özelliğin kapattığı sesler geri açılır. Susturulmasını istemediğin programları listeye yaz (ör. discord.exe).
- **FPS sınırı:**
  - **RivaTuner (önerilen):** MSI Afterburner ile gelen RivaTuner Statistics Server yüklüyse sınır **anında** uygulanır. Arka plandaki oyun için ayrı, daha düşük bir sınır verilebilir (ör. arka planda 30 FPS).
  - **NVIDIA sürücüsü:** Sınır oyunun NVIDIA ayarlarına yazılır, **oyunu yeniden açınca** geçerli olur.
  - Çalışan oyun için genel sınırdan farklı bir sınır da yazılabilir.
- **Oyun ve izinler:**
  - Tanınan oyunun adı burada görünür. Yanlış tanındıysa **Kütüphanedeki oyunla eşleştir**, oyun değilse **Bu bir oyun değil** de.
  - Kapatınca arka planda çalışma, Windows açılınca başlama ve sıcaklık ayarları da buradadır.

### FPS için bir kerelik Windows izni
Windows, FPS ölçümüne güvenlik nedeniyle varsayılan olarak izin vermez. Köşede FPS yerine "izin" yazıyorsa:
1. **Ctrl + Tab → Oyun ve izinler → "FPS iznini ver (bir kerelik)"** düğmesine bas.
2. Windows'un "Değişiklik yapılsın mı?" sorusuna **Evet** de.
3. Windows'tan bir kez **oturumu kapatıp yeniden aç** (bilgisayarı yeniden başlatmak da olur).

Bundan sonra FPS her oyunda kendiliğinden görünür.

### İşlemci sıcaklığı
- Windows işlemci sıcaklığını programlara vermez.
- Görmek istersen ücretsiz **LibreHardwareMonitor** programını aç. Menüden **Options → Remote Web Server → Run**'ı seç.
- Sonra Oyun Sıralayıcı'da **Oyun ve izinler → "LibreHardwareMonitor'dan işlemci sıcaklığını oku"** seçeneğini aç.
- NVIDIA ekran kartının sıcaklığı bunsuz da görünür.

### Arka planda çalışma
- Pencereyi kapatınca uygulama kapanmaz, ekranın sağ altındaki simgelerin arasında (saatin yanı) çalışmaya devam eder. Gösterge bunun için gereklidir.
- Simgeye tıklayınca pencere geri açılır.
- **Tamamen kapatmak için** simgeye sağ tıkla ve **Çıkış**'ı seç.
- İstersen **Windows açılınca başlat** ve **pencereyi açmadan simge olarak başlat** seçeneklerini açabilirsin.

### Bilmen gerekenler (dürüst sınırlar)
- Gösterge oyunun içine girmez ve oyunun belleğine dokunmaz, yalnızca ekranın üstüne çizilir. Bu yüzden hile koruması olan çevrimiçi oyunlarda risk oluşturmaz.
- Aynı nedenle **"özel tam ekran" (exclusive fullscreen)** modundaki bazı eski oyunlarda köşe göstergesi görünmeyebilir. Oyunun görüntü ayarından **"Kenarlıksız pencere" / "Borderless"** seçersen görünür.
- Görev çubuğunda oyunun üzerine gelince açılan küçük önizlemede yalnızca oyunun kendi görüntüsü olur. Göstergenin oraya girmesi için programın oyunun içine girmesi gerekirdi; bu da hile korumalı oyunlarda risk oluşturduğu için yapılmadı.
- Ekran kartı değerleri NVIDIA kartlarda en ayrıntılıdır. Diğer kartlarda kullanım ve bellek görünür, sıcaklık görünmeyebilir.
- Bu özellik yalnızca Windows uygulamasında çalışır.

---

## 5. Düzeltmeler

- **DLC olarak satılan bölümler** (ör. bir serinin "Episode 2"si): HowLongToBeat süreleri artık bulunuyor. Böyle bölümler HowLongToBeat'te ana oyunun ek içerikleri arasında listeleniyor. Uygulama artık oraya da bakıyor ve doğru bölümü Steam kimliğinden doğruluyor.
- **Çıkış tarihi:** Steam bazı DLC'lerde tarih vermiyor. Tarih artık HowLongToBeat'ten ya da Metacritic'ten alınıyor ve gün-ay-yıl olarak görünüyor (ör. "24 Mart 2015").
- **Metacritic puanı:** Steam vermiyorsa puan doğrudan Metacritic'ten, yalnızca adı ve yılı tutan tek bir kayıt varsa alınıyor.
- İlk açılışta bu bilgileri eksik olan oyunlar mağazalarından bir kez yeniden alınır. Sağ üstteki ilerleme çubuğunda görebilirsin.
- **Adında iki nokta veya tire olan oyunlar (2.0.4):** HowLongToBeat'te farklı yazılan adlar bulunamıyordu (ör. My Abandonware'deki "Unreal: Gold", HowLongToBeat'te "Unreal Gold"). Artık bulunuyor. Adında böyle bir işaret olup süresi eksik kalan oyunlar ilk açılışta bir kez kendiliğinden yenilenir.
- **Metacritic "puan yok" (2.0.4):** Metacritic bazı eski oyunları listeler ama yeterli eleştirmen incelemesi olmadığı için puan vermez (ör. Unreal Gold). Bu durumda oyun sayfasında **"— / puan yok"** yazar; "puan yok"a basınca Metacritic sayfası açılır. Başka bir sürümün (ör. ilk Unreal'ın) puanı asla kullanılmaz.
- **Donanım aşaması (2.0.4, 2.0.5):** Sistem gereksinimi bulunamayan oyunlarda (mağazada da PCGamingWiki'de de yoksa) AI araştırması donanım aşamasına girmez; karşılaştırılacak bir şey olmadığı için doğrudan özete geçer. Özet kapalıysa model hiç çağrılmaz.

---

## 6. Daha sade, daha hızlı ve daha canlı

- Üst çubuklar inceldi, boşluklar azaldı, yüzeyler sadeleşti.
- "Doğrulama gerekiyor" işareti artık gri. Böylece **sarı tik** (minimumu karşılıyor) ve **yeşil tik** (tamamen karşılıyor) daha net seçiliyor.
- Ayarlar gibi ağır bölümler yalnızca açıldıklarında yükleniyor, uygulama daha hızlı açılıyor. Ana kod paketi yaklaşık %27 küçüldü.
- 2.0.1 ile gelen animasyonlar:
  - Sohbet paneli açılıp kapanırken kayarak gelir ve gider; sohbet listesi genişleyip daralırken akar.
  - Yeni mesajlar, Ayarlar sekmeleri, oyun sekmelerinin alt çizgisi, sol menüdeki seçim ve Ayarlar menüsü animasyonlu.
  - Düğmelere basınca küçük bir tepki var.
  - Hepsini **Ayarlar → Görünüm → Akıcı animasyonlar** ile kapatabilirsin. Hızını aynı yerdeki **Animasyon hızı** ile ayarlarsın.
- Hiçbir özellik kaldırılmadı.

---

## 7. Yapay zekâ (ajan)

- Talimatlar ve araç açıklamaları kısaltıldı. Model her istekte daha az okuyor, aynı bağlama daha çok sohbet sığıyor.
- **Toplu düzenleme:** "Şu 10 oyunu bitti yap" gibi istekler tek adımda yapılıyor ve **Ctrl + Z** ile tek seferde geri alınıyor.
- Ajan aynı anda 20 oyunun bilgisini tek seferde okuyabiliyor.
- Sistem gereksinimleri oyunun mağaza sayfasından, mağaza yayımlamıyorsa PCGamingWiki'den gelir. Ajan bunları değiştiremez (1.0.17'den beri).

### AI araştırmasını elle başlatmak (2.0.8)

Araştırmayı şuralardan elle başlatırsın:
- Oyun sayfasındaki ince araştırma çubuğu: **Araştır**, **Araştırmaya devam et** ya da **Baştan araştır**.
- **İstatistikler** sayfası: **Tüm oyunları yeniden araştır** ya da **Seçtiğim oyunları yeniden araştır**.

Araştırmada donanım aşaması varsa önce **Donanım kontrolü** penceresi açılır. 2.1.0'dan beri donanım aşaması yalnız uygulamanın donanım verisiyle karar veremediği bir satır varsa olur (10. bölüm); bu yüzden pencere çoğu oyunda hiç çıkmaz. İki seçenek var:
1. **AI'ya bırak:** AI, uygulamanın karar veremediği satırları bilgisayarınla karşılaştırır; gerekirse internette araştırır. O oyunda daha önce kendin işaretlediğin satırlar kaldırılır.
2. **Kontrolleri sen seç, AI ayarlasın:** Oyunun sistem gereksinimleri tablosu açılır. Her satırda **Geçti** ya da **Geçmedi**'yi seç.
   - Uygulamanın kendisi hesaplayabildiği satırlar (ör. RAM, disk) önceden işaretli gelir; istediğini değiştirebilirsin.
   - **Hepsi Geçti** / **Hepsi Geçmedi** düğmeleri tüm satırları bir kerede işaretler.
   - Birden çok oyun seçtiysen her oyunun tablosu sırayla gelir (**Sonraki oyun**).
   - **Araştırmayı başlat**'a basınca işaretlerin hemen kaydedilir. AI bunları sorgulamadan, değiştirmeden ve internette araştırmadan, her satıra kısa bir açıklama yazarak kaydeder. Sonra özet aşaması her zamanki gibi çalışır.
   - **Sistem** sekmesinde bu satırların yanında **Senin kararın** yazar. Fareyle satırın üzerine gelince AI'ın açıklaması görünür.
   - İşaretler **Ctrl + Z** ile geri alınır.

Bilmen gerekenler:
- Bu pencere yalnızca elle başlattığın araştırmada çıkar. Otomatik araştırma sormaz ve senin işaretlerine dokunmaz.
- Bilgisayarının donanımı ya da oyunun gereksinimleri değişirse o satırdaki işaretin artık geçerli olmaz ve satır yeniden karşılaştırılır.
- Araştırmayı durdurmak: oyun sayfasındaki çubukta **Durdur** yalnızca o oyunu durdurur, sıradaki diğer oyunlar çalışmaya devam eder (2.1.3). Bütün kuyruğu durdurmak için **İstatistikler → Araştırmayı durdur**.
- Durdurulan ya da yarıda kalan bir araştırmanın bütün sonuçları (karşılaştırmalar ve Türkçe özet) kayıtlıysa araştırma **tamamlandı** sayılır. Eksik bir şey varsa **durduruldu** olarak kalır ve çubukta **Araştırmaya devam et** görünür.
- Tamamlanan araştırmalar oyun sayfasında artık görünmez. Araştırma geçmişi sohbet listesinde durur. Bir oyunu yeniden araştırmak için **İstatistikler → Seçtiğim oyunları yeniden araştır**'a bas, oyunları işaretle (arama kutusuyla süzebilirsin), **Yeniden araştır**'a bas. Şu an araştırılan oyunlar seçilemez.

---

## 8. Kendi serini oluştur (2.0.4, 2.0.6)

Uygulama aynı adla başlayan oyunları (ör. "Half-Life", "Half-Life 2") kendiliğinden seri yapar. Kendi serini de artık kolayca oluşturabilirsin:

1. Kütüphane listesinin üstünde, **OYUN / SERİ** yazısının yanındaki **Yeni seri** düğmesine bas. Ya da bir oyuna **sağ tıkla** (veya oyun sayfasındaki **⋯** düğmesine bas) ve **Seri oluştur / seriye ekle**'yi seç.
2. Açılan pencerede seriye bir **ad** ver. Seçtiğin oyunların adından bir öneri gelir (ör. "Unreal: Gold" için "Unreal"); istediğin gibi değiştirebilirsin.
3. Listeden serideki oyunları **işaretle**. Üstteki arama kutusu listeyi süzer. En az iki oyun gerekir.
4. **Seriyi oluştur**'a bas. Hiçbir oyunun yeri değişmez (2.0.6). Yan yana duran oyunlar seri başlığının altında görünür.

Bilmen gerekenler:
- **Mevcut bir seriye eklemek:** Aynı pencerenin en üstündeki **Nereye?** kutusundan seriyi seç, oyunları işaretle, **Kaydet**'e bas.
- **Düzenlemek:** Seri başlığındaki **⋯** düğmesine bas. Adı değiştirebilir, oyun ekleyip çıkarabilir ya da **Seriyi dağıt** diyebilirsin (oyunlar silinmez).
- Başka bir serideki oyunu işaretlersen o seriden bu seriye taşınır. Tek oyunu kalan seri kendiliğinden kalkar.
- Seriden çıkardığın oyun kendiliğinden geri eklenmez.

**Araya başka oyun koymak (2.0.6):** Seri işlemleri sıranı değiştirmez; sırayı yalnızca sen değiştirirsin. Örneğin "1. Oyun, 2. Oyun, ARA OYUN, 4. Oyun" sırası olduğu gibi kalır ve liste şöyle görünür:
- **Seri adı** başlığının altında 1. ve 2. oyun (başlıkta **2/3**),
- ardından ARA OYUN normal satır olarak,
- ardından **Seri adı (devam)** başlığının altında 4. oyun (başlıkta **1/3**).

Bir başlıktan daraltınca serinin bütün bölümleri birlikte daralır. Bir başlığı sürüklemek yalnız o bölümü taşır; aradaki oyun yerinde kalır. Seriyi bir araya getirmek istersen seri başlığındaki **⋯** → **Oyunları yan yana topla** (aradaki oyunlar serinin arkasına geçer, **Ctrl + Z** ile geri alınır). Daha önce yeri kaymış bir oyunu bir kez sürükleyip eski yerine koyman yeter; bir daha kaymaz.
- Her işlem **Ctrl + Z** (ya da üstteki **Geri al**) ile geri alınır.

---

## 9. PCGamingWiki: sistem gereksinimleri (2.0.5) ve eksik bilgiler (2.0.7)

Bazı oyunların mağaza sayfasında sistem gereksinimi yoktur: My Abandonware oyunları, **Platform yok** ile eklediğin oyunlar ve gereksinim yazmayan mağaza sayfaları. Bu oyunların gereksinimleri artık **PCGamingWiki**'den alınır.

- Yalnızca **Windows** gereksinimleri kullanılır. Adı ya da çıkış yılı tutmayan sayfa alınmaz; uydurma ya da başka bir oyunun bilgisi gelmez.
- Oyun sayfasında **Sistem** sekmesinin altında kaynak görünür: **"Gereksinimler: PCGamingWiki (sayfanın adı) · mağaza yayımlamadığı için buradan alındı"**. **PCGamingWiki sayfası** düğmesi sayfayı uygulamanın tarayıcısında açar.
- PCGamingWiki'de de yoksa gereksinimler **"belirtilmemiş"** kalır ve nedeni yazar (ör. "PCGamingWiki'de yalnızca DOS gereksinimi var; Windows için yok."). Bu oyunlarda AI araştırmasının donanım aşaması olmaz.
- Gereksinimi olmayan oyunlar 2.0.5'in ilk açılışında bir kez kendiliğinden yenilenir ve PCGamingWiki'de aranır. Bu sırada listenin üstünde **"Bilgiler alınıyor"** ilerlemesi görünür.
- PCGamingWiki'ye ulaşılamazsa (ör. internet yoksa) uygulama sonraki açılışta yeniden dener. Bu sırada **"Sistem gereksinimleri PCGamingWiki'den alınıyor"** yazar.
- Mağaza gereksinim yayımlıyorsa gereksinimler için PCGamingWiki'ye bakılmaz.

**Eksik bilgiler (2.0.7):** Oyunun platformu bir bilgiyi vermiyorsa o bilgi de aynı PCGamingWiki sayfasından alınır: **kapak**, **geliştirici**, **yayıncı**, **çıkış yılı**, **türler** ve **açıklama**.
- Platformun verdiği bilgi hiç değiştirilmez; yalnızca boş alanlar doldurulur. Kendin girdiğin ya da daha önce gelmiş bir bilgi de olduğu gibi kalır.
- Sayfada Windows gereksinimi olmasa da (ör. yalnızca DOS) kapak ve diğer bilgiler alınır. Gereksinimler yine "belirtilmemiş" kalır.
- Geliştirici ve yayıncı olarak oyunun ilk çıkışındakiler alınır (sonraki port ve yeniden yayınlar değil). Çıkış yılı, oyunun herhangi bir platformdaki ilk çıkışıdır.
- Açıklama PCGamingWiki'deki gibi İngilizcedir.
- Örnek: My Abandonware'deki "Unreal: Gold" için kapak, yayıncı (GT Interactive), türler (Action, FPS, Shooter) ve açıklama PCGamingWiki'deki "Unreal" sayfasından gelir. Yıl (2000) My Abandonware'deki gibi kalır.
- Bilgisi eksik oyunlar 2.0.7'nin ilk açılışında bir kez kendiliğinden yenilenir (listenin üstünde **"Bilgiler alınıyor"**).

---

## 10. Donanım karşılaştırması: gerçek verilerle (2.1.0)

### Ne değişti?
Eskiden işlemci ve ekran kartı satırlarının çoğunu yapay zekâ karşılaştırıyordu; senin bilgisayarında bu, oyun başına dakikalar sürüyordu. Artık uygulama bu satırları kendisi, anında karşılaştırıyor. Bunun için EXE'nin içinde bir donanım verisi var:
- **PassMark puanları:** yaklaşık 4.900 işlemci ve 3.000 ekran kartı, 2026'ya kadar. Bütün işlemciler aynı ölçekte, bütün kartlar aynı ölçekte puanlı. İşlemcide hem çok çekirdek hem tek çekirdek puanına bakılır.
- **TechPowerUp özellikleri:** her kartın DirectX düzeyi, OpenGL, Vulkan, Shader Model, belleği ve çıkış yılı.
- Veri her yeni sürümde tazelenir. Hangi tarihli veri kullanıldığı **Sistem** sekmesinin altında yazar.

### Tabloyu okumak
Oyun sayfası → **Sistem** sekmesi:
- **✓** karşılıyor, **✕** karşılamıyor, **·** karşılaştırılamadı (AI'a kalır).
- **≈ (sarı):** puanlar arasındaki fark %10'dan az, yani "yaklaşık eşit". Bu satır karşılanmış sayılır.
- Tablonun altında her işlemci ve ekran kartı satırının açıklaması yazar. Satırın solundaki renk sonucu gösterir (yeşil, kırmızı, sarı).

Senin bilgisayarınla (i5-4460, GTX 1660 SUPER) örnekler:
- "GeForce GTX 760" isteyen oyun: kartın yaklaşık 2,6 kat güçlü → **✓**
- "GeForce RTX 4060" öneren oyun: kartın onun yaklaşık %65'i → **✕**
- "Core i5-3570K" isteyen oyun: aradaki fark %4 → **≈ yaklaşık eşit**
- "64MB DirectX 9 compatible AGP graphics card with hardware T&L support": model adı yok; satır parçalarına ayrılır. 64 MB bellek (sende 6 GB), DirectX 9 (sende 12.1); AGP ve donanımsal T&L o dönemin özellikleri, kartın karşılar → **✓**

### Model adı yazmayan satırlar
- "OpenGL 3.0, 512 MB", "Shader Model 3.0", "dahili grafik desteklenmez", "AVX2 gerekli", "64 bit işlemci" gibi satırlar tek tek kontrol edilir.
- "2.4 GHz çift çekirdek" gibi satırlarda yalnız GHz'e bakılmaz: oyunun çıktığı yıllardaki aynı özellikteki işlemcilerin ortasıyla kıyaslanır. Sayılar tutsa bile işlemcin o yılların işlemcilerinden zayıfsa **sınırda** yazar. Bu satırlar tahmindir.
- "Any" (herhangi biri), yalnız ekran çözünürlüğü yazan satırlar ve 1990'ların donanımı (Pentium 166, Voodoo, SVGA) da karşılanmış sayılır.

### Yapay zekânın işi
- AI artık yalnız uygulamanın okuyamadığı satırlara bakar (ör. veride olmayan bir parça adı, "GeForce 600 serisi" gibi seri ifadeleri). Bu yüzden çoğu oyunda araştırmanın donanım aşaması hiç olmaz; araştırma çok daha kısa sürer.
- AI'ın bir satır için bulduğu sonuç, aynı gereksinim başka oyunlarda da geçiyorsa oraya da yazılır. Aynı şey bir daha araştırılmaz.
- Veriyle hesaplanan satırları AI değiştiremez.
- Türkçe özet kapalıysa ve AI'a kalan satır yoksa araştırma hemen biter; model seçili olmasa da.

### Bilmen gerekenler
- Puanlar sentetik testlerden gelir. Kartların ve işlemcilerin kabaca karşılaştırmasıdır; oyundaki FPS'i garanti etmez.
- Bilgisayar ekran kartının belleğini, DirectX düzeyini ya da Vulkan sürümünü okuyamazsa kartın bilinen değerleri kullanılır; satırın açıklamasında yazar.
- Sürümler arasında çıkan yeni parçalar bir sonraki sürüme kadar veride olmayabilir; o satırlar AI'a kalır.
- PassMark verisi serbest lisanslı değildir. Uygulama yalnız senin kullanımın için olduğu sürece sorun yok; başkalarına dağıtacaksan PassMark'tan izin gerekir.
- Bir satır yanlış görünürse önce **Ayarlar → Donanım**'da bilgisayarının parça adlarının doğru olduğuna bak. Hâlâ yanlışsa o satırı (gereksinim metniyle birlikte) bana bildir.

---

## 11. 2.1.1: arayüz ve oyun katmanı temizliği

- **Ayarlar → Oyun katmanı → FPS sınırı:** üç seçenek (Kapalı / RivaTuner / NVIDIA) düzgün görünüyor; radyo düğmesi metnin solunda. Önceki sürümde düğme metnin üstünde, esmiş boş bir kutu gibi duruyordu.
- **Görünüm sekmesi:** renk çipleri artık adının yanında; etiketlerdeki gereksiz boşluklar ve kaydırıcı altı boşluklar gitti. Düğme, onay kutusu ve kaydırıcı vurgu renkleri koyu/açık temada aynı.
- **Hata mesajları:** bir işlem başarısız olursa yalnızca gerçek neden yazıyor (ör. "Oyun kimliği bulunamadı."); Electron'un iç teknik metni ("Error invoking remote method…") gösterilmiyor.
- **Dar pencerede sohbet çekmecesi:** pencere 1160 px'ten darsa sohbet paneli içeriğin üstünde açılır. Karartılmış alana bir kez tıklamak çekmeceyi kapatır; altındaki düğmeler ancak çekmece kapalıyken tıklanır. Geniş pencerede her şey eskisi gibi yan yanadır.
- **Sohbet listesi sağ tık menüsü:** pencerenin sağ ya da alt kenarına yakın açılırsa kendiliğden içeri kayar, ekran dışına taşmaz.
- **Köşe göstergesi:** FPS ölçülemiyorsa (örn. Windows izni bekleniyorsa) değer yerine yazan kısa ifadenin nedeni, satırın üzerinde bekleyince görünen ipucunda yazıyor.
- Bu sürümdeki değişiklikler yalnız arayüz ve hata mesajıdır; donanım karşılaştırması, araştırma akışı ve veri kaynakları 2.1.0'daki gibidir.

## 12. 2.1.2: bozuk gereksinim satırları ve kendi kararın

- **Düz sayı yazan mağazalar:** Bazı mağaza sayfaları işlemci yerine yalnız "64", işletim sistemi yerine yalnız "10" yazar (Bendy and the Ink Machine'de görüldü). Uygulama artık "64"ü 64 bit işlemci, "10"u Windows 10 olarak anlar ve karşılaştırır; bu satırlar AI'a puan diye gitmez.
- **Etiketsiz önerilen bloğu:** Önerilen gereksinim bazen tek bir cümledir ("64-bit işlemci gerektirir"). Cümle doğru bileşene yerleştirilir; Sistem sekmesinde Önerilen sütunu açılır ve karşılaştırma yapılır.
- **Gereksinimi hiç olmayan oyunlar:** Sistem sekmesinde "Karşılıyor / Karşılamıyor / Bilinmiyor" düğmeleri çıkar. Seçtiğin karar oyuna kaydedilir ve sayfanın üstündeki durum yazısında "Karşılıyor (senin kararın)" gibi görünür. Bu bir nottur; uygulama yoktan gereksinim uydurmaz. 2.1.3'ten beri bu karar kütüphane satırındaki noktayı, sıralamayı ve istatistikleri de değiştiriyor (13. bölüm).
- Kütüphane listesinde fareyle bekleyince çıkan önizleme kartı, çok dar pencerede ekran kenarından taşmaz.

## 13. 2.1.3: senin kararın her yerde, araştırma durdurma tek oyunluk

- **Kendi kararın artık sonucu belirliyor:** Sistem gereksinimi hiç alınamayan bir oyunda **Sistem** sekmesindeki "Karşılıyor / Karşılamıyor / Bilinmiyor" düğmelerinden birine bastığında, bu karar yalnızca oyun sayfasındaki yazıyı değiştirmiyor. Kütüphane satırındaki yuvarlak da aynı sonucu gösteriyor: Karşılıyor = yeşil tik, Karşılamıyor = kırmızı çarpı, Bilinmiyor = soru işareti. "Uyumluluğa göre" sıralama ve **İstatistikler**'deki "Donanım eşleşmesi" sayıları da senin kararını sayar.
- **Neresi gösteriyor:** Sistem sekmesinin üstündeki durum kutusu ("Karşılıyor (senin kararın)" + kısa açıklama), Genel bakış'taki **SİSTEM UYUMU** kutusu ve kütüphane satırındaki nokta. Noktanın üzerine gelince açıklama, ekran okuyucuya ise kararın adı okunur.
- **Sınırı:** Bu bir nottur; uygulama yoktan gereksinim uydurmaz, donanım karşılaştırması üretmez. İleride mağazadan gerçek gereksinim gelirse karşılaştırma önceliği alır, senin işaretin arka plana düşer.
- **Gereksinimi olmayan, senin de işaretlemediğin oyun:** artık "Doğrulama gerekiyor" değil, "Gereksinim belirtilmemiş" yazar. Doğrulaman gereken bir şey yok çünkü ortada gereksinim yok.
- **Oyun sayfasındaki "Durdur":** yalnızca o oyunun araştırmasını durdurur. Önceden tek oyun için "Durdur" dediğinde sıradaki bütün oyunlar da duruyordu. Durdurulan oyunun boşalttığı yer sıradaki oyuna geçer.
- **Model bekleyen oyun:** "AI araştırması bekliyor" yazan oyun sırada demektir; sayfasında "Araştır" değil "Durdur" görünür.
- **İstatistikler → "Araştırmayı durdur":** eskisi gibi tüm kuyruğu durdurur.

## 14. 2.1.4: Ayarlar, güncellemeler ve tarayıcı

- **Ayarlar yalnızca senin değiştirdiğini yazar.** Pencere açıldığı andaki değerlerin bir kopyasıyla çalışıyordu; "Ayarları kaydet" bu yüzden başka yerden anında kaydedilmiş ayarları geri alabiliyordu. İki somut örnek: **Güncellemeler → "Yeni sürümü kendiliğinden denetle"** kutusunu kapatıp başka sekmeden kaydedince kutu yeniden açılıyordu; **Oyun katmanı**'nda değiştirdiğin panel kısayolu, **LM Studio → Bağlantıyı test et**'ten sonra eski değerine dönüyordu. Artık yalnızca o pencerede dokunduğun alanlar yazılıyor.
- **Donanım sekmesi.** Buradaki değişiklikler yalnızca Donanım sekmesi açıkken kaydediliyordu; başka sekmeye geçip "Ayarları kaydet"e basınca yazdıkların sessizce gidiyordu. Donanım profili artık hangi sekmede olursan ol kaydedilir.
- **Hata mesajları Türkçe.** Sınır dışında bir değer yazınca (ör. **Maksimum çıktı tokenı** = 50) ekrana İngilizce bir teknik döküm geliyordu. Şimdi: "Geçersiz değer, hiçbir şey kaydedilmedi. Maksimum çıktı tokenı en az 128 olmalı." Pencere açık kalır, değeri düzeltip yeniden kaydedebilirsin. Aynı biçim tüm alanlar için geçerli (donanım, oyun adı, grup adı…).
- **Arka plan görseli.** Dosya seçme düğmesi İngilizce "Choose File" yerine Türkçe "Görsel seç · PNG/JPG/WebP, en fazla 5 MB".
- **Tarayıcı.** Oyun sayfasındaki bir mağaza bağlantısına ikinci kez tıkladığında aynı sayfayı açan ikinci bir sekme oluşmuyor; açık olan sekme öne geliyor. Sekmeler, adres çubuğu, Ctrl+L / Ctrl+T / Ctrl+W ve indirme bildirimleri eskisi gibi.
- **Güncelleme akışı değişmedi:** yeni sürüm sağ üstte yeşil tikle görünür, indirme sana sorulur, dosya SHA-256 ile doğrulanır, "Güncelleme indirildi"ye basınca yeni sürüm açılır ve eskisi silinir.

## 15. 2.1.5: donanım adları, elle eklenen oyunlar ve Türkçe sıralama

Bu sürümde mağazaların yazdığı donanım adlarıyla uygulamanın puan listesinin yazdığı adlar arasındaki uyuşmazlıklar giderildi. Karşılaştırmayı oyun sayfasında **Sistem** sekmesinde, her satırın açıklamasında görürsün.

- **Seri adı yazan gereksinimler.** "GeForce 600 series" ya da "Radeon HD 7000 series" gibi satırlar tek bir kart değil, bir nesil anlatır. Eskiden "600" sayısı listedeki alakasız bir kartla ("600 PCI", 2004 model bir PCI kartı) eşleşiyor ve "904 kat güçlü" gibi anlamsız bir cümle çıkıyordu. Şimdi o neslin **en zayıf masaüstü kartı** taban alınıyor ve hangi kartın kullanıldığı açıklamada yazıyor: *"GeForce 600 serisinin en zayıf masaüstü kartı GeForce GT 610 esas alındı."* Tümleşik grafikli işlemci kayıtları (Radeon HD 7290 gibi) taban sayılmıyor. Sonuç "tahminî" olarak işaretleniyor.
- **"Athlon II X4 760K".** Puan listesi bu işlemciyi "AMD Athlon X4 760K" adıyla yazıyor; mağazalar "Athlon II X4 760K" diyor. İki yazım da artık aynı işlemciyi buluyor. Eskiden bu satır için yanlış bir aile üyesi üzerinden tahmin üretiliyordu ("Athlon II X4 559").
- **Uzantısı yazılmayan modeller.** "Intel Core i7 4700" ya da "i5 8250" gibi adlar listede yalnız uzantılı sürümleriyle var (i7-4700MQ/HQ/EQ). Artık bu aile bulunuyor, en zayıf üyesi taban alınıyor ve açıklamada hangi modelin kullanıldığı yazıyor. Eskiden bu satırlar "karşılaştırılamadı" diye boş kalıyordu.
- **Elle eklediğin oyunlar ve PCGamingWiki.** Oyunu platform seçmeden elle eklediğinde adın sonuna yazdığın parantez ("Unreal Gold (1998)", "Gothic II (Gold Edition)") ya da "GOTY / Edition" sözleri aramayı bozuyordu; PCGamingWiki'de sayfa olduğu hâlde "bulunamadı" diyordu. Şimdi bu sözler atılmış hâli de deneniyor. Sürümü ayırt eden sözler ("HD", "Remastered", "II") asla atılmıyor, yani farklı bir sürümün gereksinimi senin oyununa yazılmıyor.
- **Tür filtresi Türkçe alfabesine göre.** Kütüphanedeki tür filtresinde Ç, Ö, Ü, İ, Ş artık doğru yerde; eskiden "Şehir" listenin en sonuna düşüyordu.
- **Baştan sona tarama.** Uygulamanın bütün ekranları, sekmeleri ve pencereleri otomatik olarak açılıp tarandı: hiçbir yerde hata, "undefined"/"NaN" gibi iç değer, İngilizce düğme yazısı ya da İngilizce dosya seçme kutusu kalmadığı doğrulandı. Boş kütüphane, 300 karakterlik oyun adı, silme + geri alma ve dışa/içe aktarma turu da aynı taramadan geçti. Karşılaştırma motoru 60 bozuk ya da anlamsız gereksinim satırıyla denendi ("64", "NaN", "Any", 400 karakterlik metin, Arapça, emoji): hiçbiri çökmüyor, hiçbiri uydurma veri üretmiyor.

## 16. 2.1.6: oyun katmanı oyunun üstünde

Bazı oyunlar kendi pencerelerini sürekli en üste taşıyor. Little Nightmares 3 gibi Unreal Engine (4.27) ile yapılan tam ekran oyunlarda katman bu yüzden oyunun arkasında kalıyordu: köşedeki gösterge oyunda görünmüyor, başka bir programa geçtiğinde bir an görünüp kayboluyor, **Ctrl + Tab** ile açılan panel oyunun arkasında açılıyordu.

- **Oyun öndeyken katman da en üstte.** Gösterge ve panel, oyun öndeyken en üstte tutuluyor; bu sıra saniyede bir yeniden kuruluyor, yani oyun kendini üste taşısa bile katman onun üstünde kalıyor.
- **Başka programların üstüne çıkmıyor.** Başka bir program öne geçtiği anda katman en üstten çıkıp oyun penceresinin hemen üstüne yerleşiyor. 6. bölümdeki "Gösterge oyunun içinde kalır" davranışı aynen duruyor: oyunun üstüne başka bir pencere gelince katman da onunla birlikte örtülür, oyun küçültülünce kaybolur.
- **Panel açıkken oyun arkada kalsa bile panel üstte kalır**; başka bir programa geçtiğinde panel kendiliğinden kapanır.
- **Oyun "Tam ekran" modundaysa** (ekran kartının doğrudan çizdiği mod) hiçbir program oyunun üstüne çizemez; bu Windows'un kuralı. Göstergenin görünmesi için oyunun görüntü ayarlarında **Kenarlıksız / Pencereli tam ekran** (Borderless) modunu seç.

## 17. 2.2.0: oyun içi katman

Gösterge artık oyunun kendi karesinin içine çiziliyor (DirectX 11 ve DirectX 12). Yani oyun tam ekranda bile olsa, oyunu odağa almadan bile köşedeki değerler ve Ctrl + Tab paneli görünür.

- **Nasıl açılır?** Oyun tanındığı anda yardımcı süreç oyunun sürecine küçük bir çizim DLL'i yerleştirir. Oyun kapanınca DLL kendini söker.
- **Ayar:** Ayarlar → Oyun katmanı → Oyun ve izinler → **Çizim yöntemi**: *Otomatik* (önce oyunun içi, olmazsa pencere), *Her zaman oyunun içinde*, *Pencere katmanı* (2.0.1'deki eski davranış).
- **Panel:** Ctrl + Tab paneli oyunun içinde açılır. Panel açıkken fare ve klavye oyununa gitmez; Esc, Ctrl + Tab, panelin dışına tıklamak ya da **Kapat** düğmesi kapatır. Düzenlemeler anında kaydedilir.
- **Korumalı oyunlar:** Easy Anti-Cheat, BattlEye, Vanguard, XIGNCODE, nProtect, FACEIT gibi bir koruma tespit edilirse oyunun sürecine hiç dokunulmaz; gösterge pencere katmanına düşer ve nedeni panelde yazar. Online oyunlarda bu yöntemi kullanmaman önerilir.
- **Güvenlik:** Katman yalnız çizim verisi taşır. Oyunun belleği okunmaz, oyunu adına tuş/fare kullanılmaz, oyun dosyalarına yazılmaz.
- **Eski oyunlar:** 2.2.0'da OpenGL, Vulkan ve DirectX 9 oyunlarında oyun içi çizim yoktu; 2.2.1 ile DirectX 9 ve OpenGL eklendi (18. bölüm). Vulkan bir sonraki sürümde.
- **Görünmüyorsa:** oyunun görüntü ayarlarında "Kenarlıksız/Pencereli tam ekran" seçili olsun; yöntemi "Her zaman oyunun içinde" yapıp oyunu yeniden başlat.

## 18. 2.2.1: oyun içi panel düzeltmeleri ve eski oyunlar

**Panel artık her durumda kapanıyor.** 2.2.0'da oyun içindeki panel bazen kapanmıyor, bazen de Ctrl + Tab hiç çalışmıyordu. Nedeni şuydu: oyun içindeyken bir ayar değiştirdiğinde (ör. panelde bir göstergeyi kapattığında) uygulama katmanı oyunun içinden söküp yeniden kurmaya çalışıyordu. Sökme işlemi katmana "çık" işareti koyuyor, yeniden kurulan katman da bu işareti görür görmez kendini kapatıyordu; geriye ne panel kalıyordu ne kısayol. Artık oyun içindeyken katman sökülmüyor: yaptığın değişiklik aynı karede uygulanıyor.

- **Kapatma yolları:** Esc, Ctrl + Tab (bir daha), panelin dışına tıklamak, panelin sağındaki **Kapat**.
- **FPS satırı boş değil.** Oyun içi katman kareyi kendisi ölçtüğü için FPS artık doğrudan oyundan gelen ölçümdür. Ölçüm yoksa nedeni yazılır: **izin** (Windows FPS ölçümüne izin vermiyor), **…** (ölçüm başlıyor), **—** (bu oyun ölçülemiyor).

**DirectX 9 ve OpenGL oyunları da oyunun içinde çiziliyor.**
- **DirectX 9** ile çalışan oyunlarda (2004–2013 dönemi: örn. GTA IV öncesi oyunlar, Source motorunun eski sürümleri) gösterge ve panel artık oyunun kendi karesinin içinde.
- **OpenGL** ile çalışan oyunlarda (Doom 3, Quake 4, eski Minecraft, birçok bağımsız oyun) aynı şekilde oyunun içinde.
- Her ikisi de oyunun çizim durumunu kaydedip geri yükler: oyunun kendi görüntüsüne, ayarlarına ya da dosyalarına dokunulmaz.
- **Vulkan** bir sonraki sürümde: Vulkan için Windows'a ayrı bir katman kaydı (örtük katman) gerekiyor, hazırlığı sürüyor. Vulkan oyunlarında şimdilik pencere katmanı çalışır.
- **Doğrulama:** sahte DirectX 9 ve sahte OpenGL oyunlarıyla uçtan uca testler (yerleştirme → kanca → çizim) her paketlemede otomatik koşuyor; ikisi de çizilen kare sayısını doğruluyor.

## 19. Sık sorulanlar

**Güncelleme indirildi ama yeni sürüm açılmadı?**
Eski sürümü kapat (saatin yanındaki simgeye sağ tık → **Çıkış**), sonra masaüstündeki `Oyun-Siralayici-…-Portable.exe` dosyasını elle aç. Verilerin olduğu gibi durur. Üstünde `find "…"` yazan bir terminal açık kaldıysa 2. bölümün sonundaki adımlara bak.

**Sistem gereksinimleri neden "belirtilmemiş"?**
Ne oyunun mağaza sayfasında ne de PCGamingWiki'de Windows gereksinimi var. Nedeni kutunun içinde yazar. Daha sonra eklenirse oyun sayfasının sağ üstündeki yenile düğmesiyle (↻, **Verileri yenile**) gelir.

**Köşede hiçbir şey görünmüyor.**
- **Ayarlar → Oyun katmanı → Oyun ve izinler**'de "Oyun tanımlayıcı ve gösterge açık" seçili olmalı.
- Oyunu kenarlıksız pencerede çalıştır.
- Oyun tanınmıyorsa oyunu öne alıp Ctrl + Tab ile paneli aç ve kütüphanedeki oyunla eşleştir.

**FPS yerine "izin" yazıyor.**
4. bölümdeki "FPS için bir kerelik Windows izni" adımlarını uygula.

**Ctrl + Tab başka bir şey yapıyor.**
Kısayolu **Oyun ve izinler → Panel kısayolu** alanından değiştir (ör. `Control+Shift+O`).

**Metacritic yerine "puan yok" yazıyor.**
Metacritic bu oyunu listeliyor ama eleştirmen puanı vermemiş. "puan yok"a basıp sayfayı kendin görebilirsin. Puan verilirse "Bilgileri yeniden topla" ile gelir.

**Araştır'a bastım ama "Donanım kontrolü" penceresi çıkmadı.**
Bu oyunda AI'a kalan donanım satırı yok; hepsi donanım verisiyle karşılaştırıldı (10. bölüm). Pencere yalnızca donanım aşaması olan oyunlarda çıkar.

**Sistem sekmesinde ≈ işareti ne demek?**
Bilgisayarındaki parça ile istenen parça arasındaki puan farkı %10'dan az: yaklaşık eşit. Karşılanmış sayılır.

**Uygulamayı tamamen nasıl kapatırım?**
Saatin yanındaki simgeye sağ tıkla ve **Çıkış**'ı seç.
