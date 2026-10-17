# Açık bulgular — ajan desteği incelemesi

> **Tarihsel kayıt (1.0.8):** Aşağıdaki durum inceleme yapıldığı ana aittir. Kullanıcının sonraki talebiyle 11 bulgu 1.0.9’da düzeltildi. Güncel sonuç: [1.0.9 düzeltme raporu](AGENT-DESTEK-DUZELTMELERI-1.0.9.md).

**Tarih:** 15 Ekim 2026  
**İncelenen kaynak:** Oyun Sıralayıcı 1.0.8  
**Durum:** Yalnızca inceleme. Bu listedeki bulgular düzeltilmedi. Uygulama kaynakları, mevcut testler, EXE ve kaynak ZIP değiştirilmedi.

## Kullanıcının isteği ve kapsam

Kullanıcı önceki gereksinim/tik bulgularının unutulmamasını, modelin yapmak istediği işlemlerin uygulamada gerçekten desteklenip desteklenmediğinin tekrar incelenmesini istedi. Bu, model kalitesi değerlendirmesi veya yeni bir düzeltme talebi değildir. Sonraki çalışmada bu listeyi açık işler olarak ele al; uygulanmış düzeltme sayma.

19 ajan aracı; araç tarifleri; kabul edilen girdiler; veri kayıt yolları; karşılaştırma hesabı; mağaza kartı ve araştırma tamamlanma kontrolü incelendi. Gerçek kullanıcı kütüphanesine/modeline erişilmedi. Geçici yerel kayıtlarla 11 davranış doğrulandı. Mağaza kartı ayrıca gerçek React bileşeninin statik HTML çıktısında kontrol edildi. Bu çalışma Windows veya gerçek model çıkarım testi değildir.

**Kanıt:** `AGENT-DESTEK-INCELEMESI-1.0.8.json`. İlk 2 bulgu önceki konuşmadaki bulgulardır; kalan 9 bulgu bu incelemede kaydedildi. Bunların hepsi aynı tür hata değildir: bazıları eksik ajan yeteneği, bazıları açıkça tanımlı uygulama kuralı, bazıları kayıt/gösterim/doğrulama kusurudur.

## Önceki bulgular — hâlâ açık

### A01 — Gereğinden geniş karşılaştırma geçersizleştirmesi

- **Tür:** Aşırı geniş bağımlılık / yeniden değerlendirme eksikliği.
- **Kod:** `shared/compatibility.ts:260–306`.
- `compatibilityKey`, bütün gereksinim düzeylerini ve donanım alanlarını tek anahtarda birleştirir. GPU karşılaştırması kendi GPU verisi değişmese de disk gereksinimi veya boş disk değişince eski kabul edilir.
- **Doğrulama:** Geçerli AI GPU sonucu `pass`; yalnızca minimum disk gereksinimi 7’den 8’e değiştirildi; GPU sonucu `unknown` oldu.
- Gerçekten ilgili donanım/gereksinim değiştiğinde eski sonucun geçersiz olması doğrudur. Sorun ilgisiz bileşen değişikliğinin de aynı sonucu düşürmesidir.

### A02 — Ham gereksinim metnini güncelleme, tablo alanlarını güncellemiyor

- **Tür:** Kısmi destek / eksik ayrıştırma bağlantısı.
- **Kod:** `electron/research.ts:108–131`.
- `minimum.raw` gibi ham metin kaydedilebilir fakat bu yolda yeni metin CPU/GPU/RAM alanlarına ayrıştırılmaz. Alanlardan metin üretme vardır; ters yönde otomatik ayrıştırma yoktur.
- **Doğrulama:** Yeni metinde Core i5-4460 / 2 GB RAM yazmasına rağmen karşılaştırmanın kullandığı alanlar Pentium 4 / 1 GB kaldı.
- Model yapılandırılmış CPU/RAM alanlarını ayrıca yazarsa bu alanlar desteklenir. Bütün gereksinim güncellemelerinin bozuk olduğu iddiası yoktur.

## Yeni bulgular

### A03 — Hatalı bir sayısal gereksinimi “bilinmiyor” olarak temizleme desteği yok

- **Tür:** Eksik düzenleme yeteneği.
- **Kod:** `electron/research.ts` içindeki `researchPatch` ve iç içe alan birleştirme; `electron/validation.ts` içindeki `requirementsSchema`.
- Örneğin yanlış kaydedilmiş `minimum.vramGB` alanına `null` verilemez; alanı yeni istekte göndermemek eski değeri korur. Ayrı bir alan kaldırma işlemi de ajan araçlarında yoktur.
- **Doğrulama:** `vramGB:null` reddedildi; GPU adı değiştirilip VRAM gönderilmeyince eski 8 GB kaldı.
- Bu, modelin doğru değeri bilmemesi değil, mevcut yanlış değeri belirsiz hâle getirecek doğrudan işlemin bulunmamasıdır. Sıfır yazmak alanı temizlemek değildir.

### A04 — Ajanın bulduğu mağaza bağlantısı eski katalog sonucunun arkasında gizlenebiliyor

- **Tür:** Kayıt–arayüz uyuşmazlığı ve eksik ajan yetkisi.
- **Kod:** `src/components/Catalogs.tsx:35–48`, `electron/research.ts`, `electron/tools.ts`.
- Ajan `stores` alanını değiştirebilir; `storeChecks` alanını değiştiremez. Mağaza kartı eski katalog kontrolünü öncelikli kullanır.
- **Doğrulama:** Eski Steam kontrolü `not_found` iken geçerli biçimde bir Steam ürün bağlantısı `verified:true` olarak kaydedildi. React kartı hâlâ **Bulunamadı** gösterdi ve ürün düğmesini göstermedi.
- Kaydedilen bağlantının gerçek ürün içeriği/ağ erişimi bu fixture testinin konusu değildir; yalnızca kayıt ve gösterim önceliği sınandı.

### A05 — HLTB’de tek alan güncellemesi diğer süreleri düşürebiliyor

- **Tür:** İç içe güncelleme davranışında tutarsızlık / veri kaybı riski.
- **Kod:** `electron/research.ts:102–131`.
- Gereksinim/Türkçe nesneleri birleştirilirken `hltb` bütünüyle değiştirilir.
- **Doğrulama:** Ana hikâye 5, yan içerikle 10, %100 20 saatti. Model ana hikâyeyi 6 olarak, gerekli durum ve tarihle gönderdi. Göndermediği 10 ve 20 saat değerleri kayboldu.
- Model tüm eski alanları okuyup geri göndererek bunu önleyebilir; ancak tek bir süreyi düzeltme davranışı diğer alan güncellemeleriyle tutarlı değildir.

### A06 — Arayüzdeki grup ve seri yönetiminin ajan karşılığı eksik

- **Tür:** Desteklenmeyen ajan işlemleri; arayüz özelliği yokluğu değil.
- **Kod:** `electron/tools.ts` içindeki 19 araç; `electron/service.ts` `group`/`series`; `electron/store.ts` `group`/`series`.
- Yeni grup oluşturma/adını değiştirme ve seri oluşturma/adlandırma/dağıtma servis ve arayüzde var, ajan araç listesinde yok.
- Model mevcut gruba oyun taşıyabilir. Fakat “şu adla yeni bir grup oluştur, bu oyunları oraya koy” işinin ilk adımı için aracı yoktur.
- **Doğrulama:** Servis yöntemleri ile ilan edilen ajan araçları karşılaştırıldı. Bu işlemler için gizli genel servis çağırma aracı da yoktur.

### A07 — Modele sunulan araç tarifi, kabul edilen girdilerle tam eşleşmiyor

- **Tür:** Araç şeması / doğrulama uyumsuzluğu.
- **Kod:** `electron/tools.ts`, `electron/validation.ts:60`.
- HLTB `sourceUpdatedAt` veri kaydında kabul ediliyor; modele verilen HLTB araç şemasında yok ve o nesne ek alanları yasaklıyor.
- `list_games.limit` gerçek doğrulamada en fazla 100; modele verilen şemada bu üst sınır belirtilmiyor.
- **Doğrulama:** Kaynak tarihi arka uçta kabul edildiği hâlde ilan edilen özelliklerde yok; limit 101 ilan edilen basit integer tipine uysa da gerçek doğrulamada reddedildi.
- Sayfalama desteği vardır. Buradaki sorun sayfalama sınırının kendisi değil, modele sözleşmenin eksik anlatılmasıdır.

### A08 — AI karşılaştırması kaydedildiği hâlde mevcut kaba tahmini değiştiremiyor

- **Tür:** Bilinçli uygulama kuralı + sonuç uygulama desteği/geri bildirim eksikliği.
- **Kod:** `shared/compatibility.ts:294–306`; `electron/agent.ts:728–766`.
- AI sonuçları sadece mevcut durum `unknown` olduğunda uygulanır. Bu kural kesin sayısal RAM/disk sonuçlarının yanında kaba CPU/GPU sınıf tahminlerine de uygulanıyor.
- **Doğrulama:** Yerel kaba GPU hesabı `pass` üretti. Fixture AI `fail` sonucu başarıyla saklandı, araç `ok:true` döndü; ekranda kullanılan hesap hâlâ `pass` kaldı.
- Testteki `fail` gerçek bir donanım iddiası değildir. Test, çelişen bir AI değerlendirmesinin uygulamada nasıl ele alındığını gösterir.
- Sayısal RAM/disk hesabını keyfî model cevabıyla ezmemek ayrı ve anlaşılır bir tasarımdır. Kaba CPU/GPU tahminini düzeltme desteği ve kaydın uygulanıp uygulanmadığının açık bildirilmesi eksiktir. “Kaydedildi” her durumda “gösterime uygulandı” demek değildir.

### A09 — Özet desteği kullanılan araca göre farklı davranıyor

- **Tür:** Tutarsız önkoşul.
- **Kod:** `electron/agent.ts:795–798`; `electron/tools.ts` `generate_short_description`; `electron/research.ts` `aiSummary`.
- Doğrudan `update_game_info` ile AI özeti yazmak destekleniyor.
- Ayrı `generate_short_description` aracı ise önce açıklama bulunmasını zorunlu tutuyor. Açıklama yoksa modeli çağırmadan hata veriyor.
- **Doğrulama:** Açıklamasız fixture’da “Önce kaynaklı oyun açıklaması getirilmeli” hatası alındı; model çağrılmadı. Aynı oyuna doğrudan `aiSummary` yazılması kabul edildi.
- Bu nedenle “özet üretimi hiç desteklenmiyor” doğru değildir; iki farklı yolun koşulları tutarsızdır.

### A10 — Bilinmeyen CPU için olumlu AI tiki uygulanabiliyor

- **Tür:** Doğrulama hatası.
- **Kod:** `shared/compatibility.ts:122–130, 294–296`; `electron/agent.ts` `record_compatibility`.
- Boş CPU adı hesapta **Algılanamadı** olarak gösterilir. AI sonucunu atlama koşulu ise yalnızca **Bilinmiyor** metnini kontrol eder.
- **Doğrulama:** CPU boşken AI `pass` kaydı verildi. Sonuç `actual: Algılanamadı`, `status: pass`, `ai:true` oldu.
- Bu, yeterli bilgi olmadığı hâlde olumlu sonucun uygulanabildiği ayrı bir açık noktadır; kullanıcının mevcut bilgisayarına dair bir tespit değildir.

### A11 — HLTB saatleri olmadan araştırma tamamlanmış sayılabiliyor

- **Tür:** Tamamlanma doğrulaması eksikliği.
- **Kod:** `electron/service.ts:340–346`; `electron/validation.ts` `completionTimesSchema`.
- HLTB tamamlanma kontrolü yalnızca `status === found` değerine bakıyor. Durum “bulundu” olsa da hiç saat olmayabilir.
- **Doğrulama:** Diğer alanları tamamlanmış fixture’da HLTB yalnızca `found` ve tarih içeriyordu. Model ek veri yazmadığı hâlde araştırma `done` oldu; ana/yan/%100 süreleri yoktu.
- Genel “model tamam dedi diye tamam sayılıyor” iddiası değildir; diğer alanlar denetleniyor. Bu bulgu HLTB’nin bu özel eksik kontrolüyle ilgilidir.

## Sorun olarak karıştırılmaması gerekenler

- Sistem gereksinimlerini yazmak ile kullanıcının bilgisayarını karşılaştırmak ayrı işlemlerdir; karşılaştırma aracı gerçekten vardır. Yalnızca gereksinim yazılması her bileşende tik garantisi değildir.
- Ajan web araması ve metin sayfası okuması yapabilir. Uygulamanın Chromium tarayıcısını fareyle kontrol eden ayrı bir ajan aracı yoktur. JavaScript ile oluşan sayfaları etkileşimli gezme ve PDF okuma mevcut `fetch_page` yolunda desteklenmez; bunlar mevcut teknik kapsam sınırlarıdır.
- Kaynak/alıntı/önceden sayfa okuma şartı bütün `update_game_info` kayıtlarına uygulanmıyor. A09, ayrı özet yardımcısına özgü kalan önkoşuldur.
- Buradaki bulgular modelin düşünme döngüsünün sebebini veya her HTTP 500’ün nedenini kanıtlamaz.
- Sonraki bir düzeltmede verileri kayıtsız şartsız olumlu tikleme, kaynak uydurma veya gerçek sayısal hesabı rastgele değiştirme çözüm sayılmamalı.

## Değişiklik yapılmadığının kontrolü

İnceleme başlamadan önce kaynak/önceki belge dosyaları ve dağıtım EXE/ZIP’i özetlendi. Testlerden sonra **185 özgün dosyanın hiçbirinin değişmediği** SHA-256 karşılaştırmasıyla doğrulandı. Yalnızca bu yeni inceleme notu ve JSON kanıt kaydı eklendi. Geçici fixture’lar silindi; uygulama derlenmedi veya yeniden paketlenmedi. Mevcut 1.0.8 indirme dosyaları bu bulguların düzeltmesini içermez.
