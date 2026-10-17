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
