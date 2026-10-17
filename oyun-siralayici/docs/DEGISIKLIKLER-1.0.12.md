# 1.0.12 — Türkçe sekmesi ve dil/süre aşaması kaldırıldı, Not sekmesi eklendi

15 Ekim 2026.

> **Düzeltme (1.0.13):** Bu sürüm, “son araştırma aşamasını kaldır” isteğini yanlış uygulayıp HowLongToBeat süreleri özelliğini de tamamen kaldırdı: “Ne kadar sürer?” bölümü, `Game.hltb`, HLTB ağ istekleri ve `update_game_info.hltb`. Üstelik yükseltme geçişi kayıtlı süreleri dosyadan sildi. Kullanıcı yalnız araştırma aşamasının kaldırılmasını istemişti. 1.0.13 süreleri geri getirir ve 1.0.12’nin sildiği süreleri onarır: [DEGISIKLIKLER-1.0.13.md](DEGISIKLIKLER-1.0.13.md). Aşağıdaki metin 1.0.12’nin kaydı olarak değiştirilmeden bırakıldı.

## İstenen

1. Türkçe sekmesini ve onunla ilgili bütün ajan özelliklerini kaldırmak.
2. Son araştırma aşamasını (resmi dil + How Long To Beat) tamamen kaldırmak.
3. Oyun başına yalnız not içeren bir **Not** sekmesi eklemek (puan vb. yok); ajan bu sekmeye erişemeyecek, yalnız arayüz kullanacak.

## 1. Kaldırılanlar (gizlenmedi, koddan çıkarıldı)

| Alan | Kaldırılan |
|---|---|
| Oyun ayrıntısı | **Türkçe** sekmesi, Genel bakıştaki **TÜRKÇE DESTEĞİ** kartı, **Ne kadar sürer?** (HowLongToBeat) bölümü |
| Kütüphane | **Türkçe filtresi** (Resmi Türkçe / Yama kaydı var / Dil bilinmiyor), fareyle üzerine gelince görünen Türkçe rozeti |
| Pencereler | **Türkçe yama kaydı** (elle düzenleme) penceresi, toplu işlemlerdeki **Türkçe yama araştırmasını ajana ver** düğmesi |
| Ajan | `check_turkish_patch` aracı (araç sayısı 26 → **25**); `update_game_info` içindeki `turkish` ve `hltb` alanları; ortak kurallardaki yama cümlesi; araç açıklamalarındaki HLTB ifadeleri |
| Araştırma | **DİL VE SÜRE** ve **TÜRKÇE YAMA** aşamaları. Otomatik araştırma artık yalnız **Donanım → Özet** (özet ayarı açıksa) |
| Veri | `Game.turkish`, `Game.hltb`, `patchSearchRevision`; 1.0.6’nın tüm kütüphaneyi yama için yeniden araştırma geçişi |
| Ağ istekleri | Steam mağaza sayfasının dil tablosu, GOG dil kaydı, yalnız HLTB için indirilen GOG ürün sayfası, Codepotatoes HLTB API’si, HLTB sayfası ve “oyun adı + türkçe yama” araması |
| Masaüstü köprüsü | `patchSearch` çağrısı (izin listesinden de çıktı) |
| Varsayılanlar | Yeni kütüphanelerde **Türkçe Yama Yok** koleksiyonu oluşturulmaz; uyumluluk ekranı bu koleksiyonu önermez |
| Sohbet | “Türkçe oynayabilir miyim?” öneri kartı → yerine “Benzer ne oynarım?” |

Korunanlar: mağazalar (Steam, GOG, Epic/EGData, Xbox), donanım karşılaştırması, AI özeti, oynama listesi, koleksiyonlar/seriler, tarayıcı, sohbet, otonom çalışma, isteğe bağlı onay, Durdur/Devam, Ctrl+Z, yedekler, çıktı sınırı ayarı. Steam isteklerindeki `l=turkish` parametresi Türkçe mağaza açıklaması/tür adları içindir; Türkçe sekmesiyle ilgisi olmadığından korundu.

## 2. Not sekmesi

- Oyun ayrıntısında sekmeler: **Genel bakış · Mağazalar · Sistem · Not**.
- Tek bir serbest metin kutusu; puan veya başka alan yok. Yazmayı bırakınca yaklaşık yarım saniyede, sekmeden çıkınca veya kutudan ayrılınca hemen kaydedilir. Durum: **Yazılıyor… / Kaydediliyor… / Kaydedildi · tarih saat / Kaydedilemedi + Tekrar dene**. En fazla 20.000 karakter; metni tamamen silmek notu kaldırır.
- **Ajan erişemez.** Not, oyun kaydının (`Game`) içinde değil, `library.json` içindeki ayrı `notes` alanında tutulur. Bunun nedeni: `get_game_info` gibi araçlar oyun kaydını modele verir; not orada olsaydı sızabilirdi. Hiçbir araç, sistem/aşama talimatı, sohbet geçmişi, otomatik araştırma isteği veya tarayıcı köprüsü `notes` alanını okumaz. `edit_game` / `update_game_info` not alanını kabul etmez. Not değişikliği yalnız uygulama penceresine `note` olayıyla gider.
- **Geri alma:** Ctrl+Z oyun/koleksiyon/seri adımlarını geri alır, notu geri almaz ve ezmez. Silinen oyun Ctrl+Z ile geri gelirse notu yerindedir. Silinmiş oyunların notları sonraki açılışta temizlenir. Ajan bir oyunu silebilir (geri alınabilir); bu durumda notun akıbeti de aynı kurala bağlıdır, ajan notu okumaz.
- **Yedek:** Tam JSON dışa aktarımı ve otomatik yedekler notları içerir; CSV/metin içermez. Notu olmayan eski yedek geri yüklenirse mevcut notlar korunur; notlu yedekteki not, aynı oyunun mevcut notunun yerine geçer. Bozuk tek not girdisi atılır, kütüphanenin tamamı okunamaz hale gelmez.
- 1.0.10’da kaldırılan eski `Game.note` alanı geri getirilmedi. Eski dosyalardaki o alan yine atılır; eski, AI’nin yazmış olabileceği notlar yeni Not sekmesine taşınmaz.

## 3. Eski kütüphanenin yükseltilmesi (bir defalık)

1. Dosyada `turkish`/`hltb` varsa, yüklemeden önce dokunulmamış kopya `backups/library-<zaman>-yukseltme-oncesi.json` olarak alınır. **Ayarlar → Veriler & yedekler → Otomatik yedekler** listesinde görünür; normal 12 yedek döngüsüne girer.
2. Kaldırılan alanlar atılır. Yalnız bu alanları anlatan kaynak kayıtları (ör. HLTB API) ve `aiEditedFields` girdileri temizlenir; mağaza ve gereksinim kaynakları korunur. Etiket, puan, durum, sıra, koleksiyon ve sohbetler korunur.
3. Araştırma durumu: durumu **eksik** olanlar ile **DİL VE SÜRE / TÜRKÇE YAMA** aşamasında durdurulmuş/hata almış olanlar kayıtlı sonuçlardan yeniden değerlendirilir. Donanım (ve açıksa özet) tamamsa **tamamlandı**, değilse kalan gerçek eksikle **eksik** görünür. Donanım veya özet aşamasında açıkça durdurulan iş durmuş kalır. **Hiçbir oyun kendiliğinden yeniden kuyruğa alınmaz.**
4. Yarıda kalmış bir işin kalan aşaması yoksa (yalnız kaldırılan aşamalar kalmışsa) model çağrılmadan ve boş “Araştırma” sohbeti açılmadan tamamlanır.
5. Boş varsayılan **Türkçe Yama Yok** koleksiyonu kaldırılır. İçinde oyun varsa kullanıcının düzenidir, korunur.
6. Geçiş bir kez çalışır; temizlenmiş dosya yeniden açıldığında tekrar yedek veya değişiklik olmaz. Eski yedek dosyaları ve tarihî sohbet metinleri değiştirilmez.

## 4. Doğrulama

- Tip denetimi geçti. **293/293 birim/entegrasyon testi** (18 dosya). Yeni `tests/revision112.test.ts` 17 test: araç/politika/şemada Türkçe-HLTB izi yok; yalnız iki aşama; kaldırılan çağrı ve alan yazımı reddi; bir defalık yükseltme (yedek, kaynak temizliği, durum yeniden değerlendirme, kuyruğa almama, eksik liste alanlarıyla eski kayıt); notların ayrı saklanması, doğrulama, geri alma, silme, içe aktarma ve **ajan izolasyonu** (her okuma aracının çıktısı ve sohbet + otomatik araştırmada modele giden her istek bilinen not metni için tarandı).
- İzolasyon testinin gerçekten koruduğu kontrol edildi: `get_game_info` geçici olarak notu döndürecek şekilde bozulunca iki izolasyon testi başarısız oldu; geri alınınca geçti.
- **34/34 arayüz testi.** Yeni `tests/ui/revision112.spec.ts`: Türkçe sekmesi/filtresi/HLTB/yama düğmesinin yokluğu; Not sekmesinde yazma, otomatik kayıt, sekmeden hemen çıkınca kayıt, yeniden yükleme sonrası korunma, silme; ajan oyun kaydını araçla okurken modele giden isteklerde ve sohbet kayıtlarında notun bulunmaması.
- **Beş Linux Electron senaryosu:** masaüstü köprüsü/otonom/geri al; sekmeli tarayıcı ve köprü yalıtımı; aşamalı araştırma (yalnız DONANIM → ÖZET, özet aşamasında bozuk çağrının onarımı, gerçek IPC yolunda kişisel notun modele gitmemesi); devam/baştan; 1.0.11 biçimli kütüphanenin gerçek yükseltilmesi ve Not sekmesinden yazılan notun yeniden açılışta korunması.
- Bu sürümde yükseltme testi gerçek bir hatayı yakaladı: `sources` alanı olmayan eski kayıt doğrulamadan geçemiyordu. Düzeltildi ve regresyon testi eklendi.
- İsteğe bağlı canlı mağaza testi (gerçek ağ, Linux Electron): Stardew Valley için Steam, GOG ve Xbox bulundu, Epic’te bulunamadı (oyun orada yok); HLTB/Türkçe verisi alınmadı ve HLTB bölümü çizilmedi.
- Windows x64 taşınabilir paket üretildi; paket içindeki 8 dosyanın derlenmiş çıktıyla bayt bayt aynı olduğu ve kaldırılan araç/IPC/sağlayıcı dizgelerinin pakette bulunmadığı doğrulandı (tek eşleşme: yükseltme kodunun eski alan adı tespiti). Ayrıntı `TEST-RAPORU.md`.
- Ölçüm (1.0.11 → 1.0.12, karakter; token değil): her istekte giden araç tarifleri 20.412 → **18.833**, ortak ajan kuralları 1.465 → **1.372**, otomatik aşama talimatları toplamı (Max Payne örneği) 543 → **246**.

Kanıtlar: `TEST-RAPORU.md`, `birim-testleri-1.0.12.txt`, `arayuz-testleri-1.0.12.txt`, `arayuz-sonuclari-1.0.12.json`, `masaustu-test-1.0.12.txt`, `tarayici-test-1.0.12.txt`, `asamali-arastirma-1.0.12.txt`, `devam-masaustu-1.0.12.txt`, `yukseltme-test-1.0.12.txt`, `not-sekmesi-1.0.12.png`, `yukseltme-1.0.12.png`, `asamali-arastirma-1.0.12.png`, `arayuz-1.0.12.png`, `tarayici-1.0.12.png`, `canli-magazalar-1.0.12.txt`, `paket-dogrulama-1.0.12.json`, `paket-taramasi-1.0.12.json`, `guvenlik-taramasi-1.0.12.json`.

## 5. Sınırlar

- **Gerçek Windows, kullanıcının gerçek LM Studio modeli ve gerçek kütüphanesi bu ortamda test edilmedi.** Model yanıtları deterministik test sunucusundan gelir.
- Notlar diğer kütüphane verileri gibi yerel JSON dosyasında şifresiz durur; erişim, Windows kullanıcı hesabının dosya korumasına bağlıdır.
- Not “ajana gönderilmez” garantisi uygulamanın kendi kodu içindir. Kullanıcı not metnini sohbete kendisi yazar veya yapıştırırsa o metin elbette modele gider.
- Kaldırılan özelliklerin eski verisi geçişten sonra uygulamada görünmez; yalnız yükseltme öncesi yedekte ve eski yedeklerde durur.

## Güncelleme

Eski EXE’yi kapat, **1.0.12**’yi aç. Veri klasörünü silme, oyunları yeniden içe aktarma, ara sürüm kurma. Ayarlarını değiştirmen gerekmez.
