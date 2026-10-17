# Oyun Sıralayıcı 1.0.2 — test ve paket raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Vitest | **115 / 115** |
| Playwright Chromium | **14 / 14** |
| Üretim Electron pencere/IPC/ekle-sil-geri al | Linux testi; sonuç `docs/test-logs/1.0.2/electron-linux-smoke.txt` |
| Windows portable paket | Gerçek x64 Electron + NSIS EXE; `BUILD-INFO.json` hash/boyut içerir |
| Gerçek Windows / gerçek kullanıcı LM Studio modeli | **Bu ortamda test edilmedi** |

Son test/build kayıtları `docs/test-logs/1.0.2/`; önceki raporlar sürüm numarasıyla `docs/` altında. Önceki sürümlerin kısaltma/10-tur davranışı tarihçedir, güncel davranış değildir.

## Bu revizyonun kapsamı

- Ajan döngüsü sabit 10 turda kesilmez. Native ve JSON araç yanıtlarındaki 8 çağrı kotası kaldırıldı. Aynı anda tek aktif ajan isteği korunur; Durdur ve izinler korunur.
- Konuşma ve araç sonuçları karakter bütçesiyle kısaltılmaz. 65.000 geçmiş / 22.000 sonuç tavanı ve 16K bilinmeyen-bağlam varsayımı kaldırıldı. Girdi tamdır; yaklaşık bağlam hesabı yalnızca yanıt için istenen çıktı üst sınırını ayarlayabilir.
- Tam okunabilir sayfa ilk 16K’da kesilmez; oturum önbelleğine alınır. Bölüm yanıtları `text`, `offset`, `endOffset`, `hasMore`, `nextOffset`, `totalChars` ve devam girdisi taşır. `find` ve `refresh` desteklenir. Ağdan güvenli biçimde alınan içerik dışında veri uydurulmaz; JavaScript çalıştırılmaz.
- Uzun üretimde beş dakika zaman aşımı ve SSE taşıma zarfının toplam 2MB kotası kaldırıldı. Tek mesaj/tek bozuk SSE çerçevesi, ağ ve araç şeması için kaynak tüketimi korumaları durur; “sonsuz bellek/bağlam” iddiası yoktur.
- Uzun araç çalışmaları diske ara kayıt yapar; görsel mesajlar gerektiğinde bölünür ancak iş kesilmez. Eski 500-blok / 8-tool-call / 10K-apiHistory doğrulama tavanları uzun kaydın yeniden açılmasını bozmaması için kaldırıldı. Toplam dosya/içe aktarma güvenlik boyutu denetimleri korunur.
- Eski sohbet/ayarlar okunabilir. Yeni `contextTokens` varsayılanı 0/otomatik. Model/adres değişiminde elle girilmiş değer, yeni değer açıkça verilmemişse sıfırlanır.

## Yeni regresyonlar

Önceki 99 testin bağlam testleri, artık istenmeyen sıkıştırmayı beklemek yerine **tam içeriği korumayı** denetleyecek şekilde güncellendi. Yeni 16 test:

1. 16.000 karakterden uzun sayfanın bütün bölümlerinin kayıpsız birleştirilmesi.
2. Bitiş/boş bölüm/sözcük bulma-bulamama sonuçları.
3. HTML temizleme sonrası 16K ötesinin korunması, script metninin ayıklanması.
4. Bölüm parametrelerinin güvenli doğrulaması.
5. Aynı sohbette cache devamı, `refresh` ile yeniden indirme ve sohbetler arası cache ayrılığı.
6. **30 ardışık araç turu** ve 31. model isteğinde final yanıt.
7. Tek native yanıtta **16 araç çağrısı**, sonuç ve kaydın doğrulanması.
8. JSON modunda 16 çağrının şemadan geçmesi.
9. Sürekli araç isteyen modelin 23. tur civarında kullanıcı iptaliyle durdurulabilmesi.
10. 20.000 çıktı ayarının bütün girdi bütçesini önceden tüketmemesi; gerçek kaynak metninin korunması.
11. Yüklü bağlam bilinmezken 16K/65K varsayımı yapılmaması; 100.000 karakter geçmişin değişmeden korunması.
12. Yeni sohbet promptunda başka sohbetin özel metni/izinlerinin bulunmaması, ortak kütüphanenin erişilebilir kalması.
13. Eski ayarların varsayılanla okunması ve model değişiminde manuel bağlamın sıfırlanması.
14. Eski doğrulama tavanlarından uzun kayıtların parse edilebilmesi.
15. Modelin teorik maksimum kapasitesinin yüklü bağlam sanılmaması.
16. **2MB’dan büyük SSE zarfı** taşıyan normal yanıtın erken kesilmemesi ve taşımanın kullanıcı iptal sinyalini kullanması.

## Arayüz

Önceki 12 senaryo tekrar geçti. Yeni iki senaryo: ayrı çıktı/bağlam alanlarında 20.000 ve 32.768 değerlerinin kaydedilip yeniden açılması; gerçek HTTP/SSE kullanan deterministik sahte modelle **15 araç turu**, kapanabilir grup ve final Markdown yanıtın görülmesi.

Bunlar gerçek dil modelinin araştırma kalitesini, doğru tool seçmesini, prompt-template uyumluluğunu veya VRAM ihtiyacını doğrulamaz. Kaynak/paging testleri deterministik fixture kullanır; bu revizyonda canlı Steam/DDG veya gerçek kullanıcı modelinde yeni test yapıldığı iddia edilmez.

## Kullanıcı cihazında son kontrol

1. Eski EXE kapalıyken 1.0.2’yi aç. Aynı `%APPDATA%\Oyun Siralayici\` dizini kullanılır.
2. LM Studio’da Context Length’i kontrol et. Uygulamadaki çıktı üst sınırından farklı olduğunu unutma; bağlantı testini yenile.
3. Yeni sohbet açıp bir oyun için kaynaklı araştırma iste. Birden fazla sayfa bölümü ve 10’dan fazla araç çalışmasını gözle.
4. Gereksiz tekrar varsa Durdur; başka sohbetin konuşmaları yeni promptta olmamalı. Oyun kayıtları ortak kalmalıdır.
5. Gerçek bağlam aşımında daha büyük bağlam yükle veya yeni sohbet aç. İçerik sessizce atılmaz. Eski sürümün zaten keserek sakladığı metin yeniden sayfa okunmadan geri getirilemez.

Paket imzasızdır; Windows/SmartScreen, WMI/dxdiag, DPAPI ve native cam için gerçek Windows kontrolü gereklidir. Güvenlik yazılımını kapatma. Testlerin geçmesi her modelde hatasızlık garantisi değildir.
