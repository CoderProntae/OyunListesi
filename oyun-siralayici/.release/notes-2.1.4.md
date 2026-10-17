## 2.1.4

**Ayarlar yalnızca senin değiştirdiğini yazıyor**
- Ayarlar penceresi, açıldığı andaki değerlerin kopyasıyla çalışıyordu. "Ayarları kaydet" bu yüzden başka yerden anında kaydedilmiş ayarları geri alabiliyordu: Güncellemeler'deki "Yeni sürümü kendiliğinden denetle" kapanışı ve Oyun katmanı değişiklikleri (ör. panel kısayolu) "Bağlantıyı test et"ten sonra eski değerine dönüyordu. Artık yalnızca o pencerede dokunduğun alanlar yazılıyor.
- Donanım sekmesinde yaptığın değişiklik, başka bir sekmeye geçip kaydedince sessizce kayboluyordu. Donanım profili artık hangi sekmede olursan ol kaydediliyor.
- Sınır dışında bir değer yazınca (ör. maksimum çıktı tokenı 50) hata olarak İngilizce bir JSON dökümü çıkıyordu. Şimdi Türkçe ve alanın kendi adıyla: "Geçersiz değer, hiçbir şey kaydedilmedi. Maksimum çıktı tokenı en az 128 olmalı." Pencere açık kalır; değeri düzeltip yeniden kaydedebilirsin.
- Arka plan görseli seçimi artık İngilizce "Choose File" düğmesiyle değil, Türkçe "Görsel seç" düğmesiyle.

**Tarayıcı**
- Aynı mağaza bağlantısına ikinci kez tıkladığında yeni sekme yığılmıyor; açık olan sekme öne geliyor.
