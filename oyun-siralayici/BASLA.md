# Oyun Sıralayıcı 1.0.13 — Başlangıç

**Türkçe · Windows 10/11 x64 · Tek taşınabilir EXE**

## 1. Güncelle ve aç

1. Eski Oyun Sıralayıcı’yı kapat.
2. `Oyun-Siralayici-1.0.13-Portable.exe` dosyasını aç. Kurulum yoktur; Node.js, Python, .NET veya ayrı WebView gerekmez. İlk açılış birkaç saniye sürebilir.
3. Veri klasörünü silme: **`%APPDATA%\Oyun Siralayici\`** aynı kalır. Oyunların, sıraların, koleksiyonların, ayarların ve sohbetlerin korunur. Oyunları yeniden içe aktarma. İki sürümü aynı anda çalıştırma.

> EXE üretildi ve içindeki uygulamanın Windows x64 olduğu doğrulandı; gerçek Windows üzerinde çalıştırılması bu ortamda test edilmedi. Paket dijital imzasızdır, SmartScreen uyarısı görebilirsin. Güvenlik yazılımını kapatma; dosyayı `SHA256.txt` ile karşılaştır.

## 2. 1.0.13’te ne değişti?

**“Ne kadar sürer?” bölümü geri geldi**

1.0.12’de yalnızca otomatik araştırmanın süre aşaması kaldırılacaktı. Süre bölümü ise yanlışlıkla tamamen kaldırılmıştı. 1.0.13 bunu düzeltir.

1. Kütüphaneden bir oyuna tıkla.
2. **Genel bakış** sekmesinde aşağı kaydır: **Ne kadar sürer?** bölümünde **Ana hikâye**, **Hikâye + yan içerik** ve **%100 tamamlama** saatleri görünür.
3. Altında verinin nereden ve ne zaman alındığı yazar. Düğmeler: **Süreleri yenile**, **HLTB oyun sayfası** ve gerekirse **Verinin alındığı sayfa**.

- Süreler oyun eklenince ve bilgiler yenilenince kendiliğinden alınır; AI modeli gerekmez.
- Bunlar HowLongToBeat topluluk süreleridir, senin oynama süren değildir.
- AI ajanı da süreleri yenileyebilir veya düzeltebilir (önceki sürümlerdeki gibi).

**1.0.12’nin sildiği süreler: senin bir şey yapman gerekmez**

1. 1.0.13’ü ilk açtığında, 1.0.12’nin sildiği süreler otomatik yedeklerden geri yüklenir (genellikle 1.0.12’nin aldığı `…-yukseltme-oncesi.json` yedeğinden). İnternet gerekmez. Yedek dosyaları değiştirilmez.
2. Yedekte süresi bulunmayan oyunların (ör. 1.0.12 açıkken eklediğin veya yenilediğin oyunlar) yalnızca süreleri arka planda internetten alınır. Bu sırada üstte **Oyun süreleri tamamlanıyor** şeridi görünür. Mağaza bilgileri ve araştırma durumları değişmez.
3. İstersen şeritteki **Durdur** düğmesine basabilirsin; kalan oyunların süreleri bir sonraki açılışta tamamlanır. İnternet yoksa hiçbir oyun hatalı işaretlenmez; bir sonraki açılışta yeniden denenir.
4. Bir oyunda hâlâ süre yoksa: **Genel bakış → Ne kadar sürer? → Süreleri yenile**. Bazı oyunlar için HowLongToBeat’te kayıt bulunmayabilir; uygulama sayı uydurmaz.

**1.0.12’den aynen kalanlar**

- **Türkçe** sekmesi ve Türkçe dil/yama özellikleri kaldırılmış olarak kalır.
- Otomatik araştırma yalnızca **Donanım → Özet** aşamalarından oluşur; “DİL VE SÜRE” aşaması geri gelmedi. Araştırmanın tamamlanması sürelere bağlı değildir.
- **Not** sekmesi aynen durur (aşağıya bak).

## 3. Not sekmesi

1. Kütüphaneden bir oyuna tıkla.
2. Sekmelerden **Not**’u seç (sıra: **Genel bakış · Mağazalar · Sistem · Not**).
3. Kutuya notunu yaz. Yazmayı bıraktığın anda kendiliğinden kaydedilir; sağ üstte **Kaydedildi** ve saat görünür. Kaydet düğmesi yoktur.
4. Notu silmek için kutudaki metni tamamen sil.

- Not sekmesinde yalnız not vardır; puan veya başka alan yoktur. En fazla 20.000 karakter.
- **AI ajanı bu notu göremez ve değiştiremez.** Not; sohbete, otomatik araştırmaya, ajan araçlarına ve uygulama tarayıcısına gönderilmez.
- **Ctrl+Z** notunu geri almaz (yalnız oyun/koleksiyon/seri işlemlerini geri alır). Yanlışlıkla sildiğin bir oyunu Ctrl+Z ile geri getirirsen notu da yerindedir.
- **Ayarlar → Veriler & yedekler → Tam JSON yedeği** notlarını da içerir. CSV/metin dışa aktarımı notları içermez.

**1.0.11 veya daha eskisinden geliyorsan:** ilk açılışta eski Türkçe dil/yama bilgileri bir kez temizlenir; süreler korunur. Bundan hemen önce dosyanın dokunulmamış kopyası **Ayarlar → Veriler & yedekler → Otomatik yedekler** listesine (`…-yukseltme-oncesi.json`) eklenir. Hiçbir oyun kendiliğinden yeniden araştırmaya alınmaz. Boş duran varsayılan **Türkçe Yama Yok** koleksiyonu kaldırılır; içine oyun koyduysan koleksiyon silinmez.

## 4. Listeyi ekle ve Steam oyunlarını seç

1. **Liste aktar** düğmesine bas; metni yapıştır veya TXT/CSV dosyası seç.
2. İlk/son satırı, oyun adlarını ve yinelenenleri kontrol et.
3. İstediğin satırda **Steam seç** ile doğru ürünü kendin seç. Seçmediğin satır zorla bir Steam oyununa eşleştirilmez; Steam dışı oyun da eklenebilir.
4. **Onayla ve içe aktar** düğmesine bas. Yeni oyunlar **Oynama Listesi**’ne girer; mağaza bilgileri arka planda toplanır.
5. Sonradan değiştirmek için oyunun **Mağazalar → Steam oyununu seç** düğmesini kullan.

Sıralama: oyun tutamacını sürükle, Ctrl/Shift ile çoklu seç, Alt+↑/↓ ile taşı. **Sonraki Oyun** listendeki ilk bitmemiş oyundur.

## 5. Donanımı kontrol et

1. **Ayarlar → Donanım** bölümünde CPU, GPU, RAM, oyun diski ve boş alanı kontrol et. Windows ilk açılışta algılamayı dener; yanlış/eksik alanı düzelt.
2. Bir oyunun **Sistem** sekmesinde minimum ve önerilen gereksinimler bilgisayarınla karşılaştırılır.
   - **✓ / ✕:** kayıtlı karşılaştırma sonucu.
   - **AI** etiketi: belirsiz karşılaştırmayı model araştırıp kaydetti; açıklaması hücrenin ipucundadır.
   - **Yayımlanmamış:** kaynak o gereksinimi vermemiş; uygulama uydurmaz.

Sonuçlar FPS veya kusursuz çalışma garantisi değildir. Donanımı değiştirirsen ilgili oyunda **Araştır** ile yenileyebilirsin.

## 6. Otomatik AI araştırması

1. LM Studio’da araç kullanımına uygun bir model yükle; Developer/Local Server sunucusunu başlat.
2. **Ayarlar → LM Studio** içinde `http://127.0.0.1:1234/v1` adresini test et, modeli seç ve kaydet. API anahtarı yalnızca sunucun istiyorsa gerekir.
3. Oyun eklendiğinde araştırma kendiliğinden başlar (varsayılan açık). Sıra: **Donanım → Özet**. Özet ayarı kapalıysa yalnız donanım aşaması çalışır.
4. Oyun ayrıntısındaki araştırma satırında: **Araştır**, **Durdur**, **Araştırmaya devam et**, **Baştan araştır**, **Araştırma geçmişi**.

**Durdur ve devam et**

1. Model takılırsa **Durdur**’a bas. O ana kadar gerçekten kaydedilen sonuçlar silinmez.
2. Devam etmek için **Araştırmaya devam et**’e bas veya aynı **Araştırma geçmişi** sohbetine “Devam et” yaz. Tamamlanmış aşama tekrarlanmaz.
3. En baştan yapmak istersen **Baştan araştır**. **İstatistikler → Tüm oyunları yeniden araştır** bütün kütüphaneyi baştan araştırır; kaldığın yerden devam için kullanma.

Modelin yalnız “tamamladım” yazması yetmez; uygulama gerçekten kaydedilmiş gereksinimleri ve karşılaştırmaları kontrol eder. Model bağlı değilse araştırma bekler; alanlar doldurulmuş gibi gösterilmez.

**Otonom çalışma:** ajan varsayılan olarak izin sormadan ekleme, düzenleme, silme ve sıralama yapabilir. İstersen **Ayarlar → Ajan & güvenlik → İşlem öncesi onay iste** seçeneğini aç. **Ctrl+Z** son kütüphane değişikliğini geri alır.

**Çıktı sınırı ve bağlam:** “Maksimum çıktı tokenı” bir yanıtın üst sınırıdır ve aynen gönderilir (ör. 16128). Modelin toplam bağlam kapasitesi (LM Studio’daki Context Length) ayrı bir şeydir. Bu sürüm bu ayarları değiştirmez.

## 7. Mağazalar, süreler ve tarayıcı

- **Mağazalar** sekmesi: Steam, GOG, Epic (EGData topluluk kataloğu) ve Xbox / Microsoft Store. Gerçek ürün bağlantıları uygulamanın tarayıcısında açılır. Xbox kaydı Game Pass üyeliği demek değildir. Birden fazla sürüm varsa seçim ayrıntıları açılır.
- **Ne kadar sürer?** (Genel bakış): süreler önce GOG ürün sayfasındaki HowLongToBeat bölümünden, yoksa Codepotatoes topluluk API’sinden, o da yoksa HowLongToBeat oyun sayfasından okunur. Resmi bir HowLongToBeat API’si değildir; site değişirse veya erişimi engellerse süre “alınamadı” görünür.
- **Tarayıcı** (üst menü): adres yaz, sekme ekle, geri/ileri git. Ctrl+L adres, Ctrl+T yeni sekme, Ctrl+W kapat. İndirilen dosyalar otomatik çalıştırılmaz. SteamDB yalnızca doğrudan bağlantıdır.

## 8. Yedekler ve gizlilik

- **Ayarlar → Veriler & yedekler:** JSON/CSV/metin dışa aktarımı, elle yedek ve geri yükleme. Tam yedek için JSON kullan (oyunlar, ayarlar, sohbetler ve notlar). API anahtarları ve kapak dosyaları JSON’a girmez.
- Telemetri yoktur. Mağaza ve süre aramalarında oyun adları (varsa Steam kimliği) ilgili mağazalara, Codepotatoes topluluk API’sine ve gerekirse arama sağlayıcısı ile HowLongToBeat’e gider. AI araştırmasında oyun bilgisi, donanım karşılaştırması ve araç çıktıları seçtiğin model sunucusuna gider; **Not sekmesindeki notlar gitmez.** Uzak bir LM adresi seçersen işlem o sunucuda yapılır.
- İnternet yoksa kayıtlı listeler, bilgiler ve süreler kullanılabilir; yeni mağaza/süre/web bilgisi alınamaz.
- Testler: 313 birim/entegrasyon ve 36 arayüz testi, beş Linux Electron senaryosu ve gerçek internetle süre testi geçti. Gerçek Windows ve senin LM Studio modelinle uçtan uca test yapılmadı. Ayrıntı: kaynak ZIP’indeki `TEST-RAPORU.md`.

## Kısayollar

Ctrl+K komut paleti · Ctrl+I liste aktar · Ctrl+N tek oyun ekle · Ctrl+Z geri al · Alt+↑/↓ sırala · Enter mesaj gönder · Shift+Enter yeni satır.

## Kaynaktan derleme

Hazır EXE kullanıcısının bu adımı yapması gerekmez. Kaynak ZIP’ini aç, Node.js 22.12+ kur ve proje klasöründe çalıştır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Derle.ps1
```

Alternatif: `Derle.cmd`. Çıktı `Yayin\Oyun-Siralayici-1.0.13-Portable.exe`. Mimari ve bağımlılıklar `README.md`; teknik koşullar `SINIRLAR.md` içindedir.
