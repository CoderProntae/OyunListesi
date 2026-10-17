# Ajan desteği — 11 bulgunun düzeltmeleri (1.0.9)

**15 Ekim 2026 · Durum: uygulandı ve yerel testlerle doğrulandı.**

Önceki `AGENT-DESTEK-INCELEMESI-1.0.8.md` / `.json` dosyaları, düzeltmeden **önceki** davranışın tarihsel kanıtıdır. Bu sürüm kullanıcının sonraki açık düzeltme talebiyle hazırlandı. Kişisel kütüphaneye erişilmedi; bütün testler geçici verilerle yapıldı.

## Kapatılan bulgular

| Kimlik | Düzeltme | Doğrulama |
|---|---|---|
| A01 | AI karşılaştırması artık düzey ve bileşene özel anahtarla saklanır. Disk/RAM/diğer düzey değişikliği GPU sonucunu silmez. İlgili gerçek GPU veya GPU gereksinimi değişirse sonuç uygulanmaz. Eski genel anahtardaki snapshot da bileşen bazında okunur; yeni sonuç uydurulmaz. | İlgisiz değişiklikler, ilgili değişiklik, eski anahtar, eski/güncel araç girdisi, diske yazıp yeniden açma. |
| A02 | `minimum/recommended/optimum.raw` geldiğinde metin gerçek karşılaştırma alanlarına ayrıştırılır. O düzeyin eski ayrıştırılmış alanları taşınmaz. Açık yapılandırılmış alanlar ayrıştırma sonucuna üstün gelir. Ayrıştırılamayan metin belirsiz kalır; eski değer sessizce kullanılmaz. | Üç düzey, noktalı virgüllü metin, HTML/Türkçe etiketler, açık alan önceliği, ayrıştırılamayan metin. |
| A03 | Gereksinimin isteğe bağlı sayısal/metin alanında `null` alanı temizler. Alanı göndermemek korur; `0` ayrı gerçek sayısal değerdir. Temizlenen alan yeniden açmada ve sağlayıcı yenilemesinde geri gelmez. | RAM, VRAM, disk, DirectX, CPU, GPU, OS, Vulkan; geri al, kalıcılık, yenilemede koruma. |
| A04 | Mağaza bağlantısı ve mağaza kontrol durumu birlikte güncellenir. `storeChecks` ajan tarafından da yazılabilir. Mağazalar adına göre bağımsız birleştirilir. Eski negatifin arkasındaki yeni doğrulanmış ürün düğmesi görünür; arama URL’si ürün sayfasına dönüşmez. Açık negatif/belirsiz kontrol eski eşleşme bağlantısını kaldırır. | Gerçek React StoreCards render’ı; eski/yeni tarihler, pozitif/negatif geçiş, farklı mağazanın korunması, arama URL’si, sağlayıcı yenilemesi; tarayıcıda gerçek ajan çağrısı sonrası düğme. |
| A05 | HLTB kısmi güncellemesi mevcut iç nesneyle birleştirilir. Yalnız `main` yazılabilir; diğer süreler ve kaynak tarihleri korunur. İlk kayıtta tarih atanır ve durum süreye göre belirlenebilir. | Kısmi yazma, geçici hata, geri alma, yeniden açma, arayüzde 6/10/20 saat korunması. |
| A06 | Altı araç eklendi: `create_group`, `edit_group`, `delete_group`, `create_series`, `rename_series`, `dissolve_series`. Var olan Store işlemlerini kullanır. Grup silme/seri dağıtma oyunları silmez. | Tam ajan yürütmesi, native ve JSON döngüsü, doğrulama, isteğe bağlı onay/ret, geri alma. |
| A07 | Araçların modele verilen JSON şeması artık gerçek Zod doğrulayıcısından üretilir. HLTB kaynak güncelleme tarihi, mağaza kaynak/tarih alanları, nullable gereksinimler ve sayfalama sınırları aynı sözleşmededir. | 25 native şemanın bağımsız AJV derlemesi; geçerli örneklerin hem AJV hem Zod kabulü; limit 0/1/100/101 karşılaştırması. Kayıt içeriğine bağlı kurallar ayrıca çalışma anında doğrulanır. |
| A08 | Araştırılmış CPU/GPU sonucu kaba uygulama tahminini değiştirebilir. Kayıt sonrası dönen `applied:true` gerçekten tabloda uygulanan sonucu ifade eder. Uygulanamaz sonuç hata döner ve yazılmaz. | Kaba GPU pass → araştırılmış fail; araç sonucu/tablo eşitliği, geri alma, gerçek tarayıcı tablosu. |
| A09 | Ayrı özet aracındaki “önceden açıklama gerekli” engeli kaldırıldı. Açıklama varsa kullanılır, yoksa model mevcut oyun bilgisinden yararlanabilir; belirsiz ayrıntı uydurmama talimatı korunur. Özet işlemi de geri alınabilir. | Açıklamasız çağrının LM yardımcısına ulaşması, kayıt ve geri alma. Model cevabı testte deterministik taklittir. |
| A10 | Eksik gerçek CPU/GPU ile AI karşılaştırması kabul edilmez. Boşluk ve bilinmiyor/algılanamadı etiketleri ele alınır. Önceden hatalı kaydedilmiş olumlu AI sonucu da eksik donanıma uygulanmaz. | Beş boş/bilinmeyen CPU örneği, eski kayıt, eksik gereksinim; tarayıcıda sahte tik oluşmaması. |
| A11 | HLTB `found` yazarken en az bir sayısal süre gerekir. Başka alanlarla aynı çağrıdaki geçersiz yazma atomik olarak reddedilir. Araştırmanın tamamlanma kontrolü eski kayıtlarda da yalnız durum bayrağına değil gerçek süre alanına bakar. | Boş found reddi, gerçek sayısal sıfırın ayrı tutulması, eski boş kayıtla incomplete, süre eklenince done. |

## Davranış sözleşmesi

- **Sayısal RAM/disk/VRAM/DirectX hesapları rastgele bir AI etiketiyle ezilmez.** Yanlış gerçek değer `update_game_info` ile gereksinimde veya Ayarlar → Donanım bölümünde düzeltilir. CPU/GPU araştırma sonuçlarının bu kaba performans tahminlerine üstün gelmesi ise artık desteklenir.
- Bir karşılaştırmanın kaydı/uygulanması, gerçek oyun performansının bağımsız ölçüldüğü anlamına gelmez. FPS veya model doğruluğu garantisi yoktur.
- `raw` bir gereksinim düzeyinin yeni metnidir. Sadece bir alan değişecekse o alanı gönder; komple yeni metin gönderiliyorsa eski alanlar taşınmaz. Ayrıştırılamayan bilgiyi yapılandırılmış alanla kaydetmek hâlâ mümkündür.
- `stores` ve `storeChecks` mağaza adına göre güncellenir; `[]` ilgili koleksiyonu temizler. Aynı çağrıdaki açık `storeChecks` sonucu önceliklidir. Pozitif durum için ürün URL biçimi gerekir; ayrıca fetch/alıntı/kaynak zorunluluğu eklenmedi.
- HLTB saati uydurulmaz. Veri alınamadıysa `unavailable`, eşleşen veri yoksa `not_found` kullanılır. Mevcut saatler kısmi güncellemede korunur.
- Otonom varsayılan, isteğe bağlı onay, Ctrl+Z, durdurma, yedekler ve sohbet ayrımı korunur. Yeni keyfî araç tur kotası yoktur. Araç sayısı 19’dan **25**’e çıktı.
- Native şemaların ölçülen JSON uzunluğu **19.048 karakterdir**. Bu bir token ölçümü değildir. 1.0.8’in çıktı ayarını aynen gönderme davranışı korunur; bağlam veya çıktı ayarı kendiliğinden değiştirilmez.

## Test kanıtı

- `tests/revision109.test.ts`: **44** yeni regresyon testi.
- Tüm birim/entegrasyon: **247/247**, `docs/birim-testleri-1.0.9.txt`.
- `tests/ui/revision109.spec.ts`: **3** yeni Playwright testi; tüm UI **30/30**. Gerçek HTTP/SSE taklit model, gerçek ajan servisi ve Chromium arayüzü kullanıldı.
- TypeScript ve üretim derlemesi geçti.
- Linux Electron açılış/IPC/geri alma; aşamalı araştırma; eski kayıt geçişi/durdurma/yeniden açma; sekmeli tarayıcı/IPC ayrımı geçti.
- Aşamalı araştırmada **9 HTTP isteğinin tamamında seçilen 16128** sınırı korundu.
- Windows x64 portable üretildi; paket içindeki **8 derlenmiş dosya byte eşleşti**, PE mimarisi `0x8664`.
- Kilitli bağımlılıklar için `npm audit`: **0 bildirilen açık**. Bu, tam güvenlik garantisi değildir.

**Sınır:** Gerçek Windows çalıştırması, kullanıcının LM Studio modeli, gerçek kullanıcı kütüphanesi, yeni canlı mağaza/yama doğrulaması bu sürümde test edilmedi. Fixture sonuçları gerçek oyun performansı veya yama varlığı iddiası değildir. Önceki HTTP 500’ün kesin sunucu içi nedeni hâlâ kanıtlanmış değildir.

## Güncelleme

1. Eski uygulamayı kapat; dilersen Ayarlar → Veriler & yedekler’den JSON yedeği al.
2. `Oyun-Siralayici-1.0.9-Portable.exe` dosyasını aç. Önceki ara sürümleri kurmak gerekmez. `%APPDATA%\Oyun Siralayici\` klasörünü silme, oyunları tekrar içe aktarma.
3. Daha önce eksik/yanlış kalan oyunu seçip **Araştır** kullan. Düzeltmeler eski bilgileri kendiliğinden uydurup doldurmaz; tamamlanmış bütün araştırmalar otomatik yeniden başlatılmaz.
