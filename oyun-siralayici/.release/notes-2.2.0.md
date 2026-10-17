## 2.2.0

**Oyun içi katman: gösterge artık oyunun kendi karesinin içinde**
- Bazı oyunlar (ör. Little Nightmares 3) kendi pencerelerini sürekli en üste taşıdığı için köşe göstergesi oyunun arkasında kalıyordu. Bu sürümde gösterge, oyunun grafik arayüzüne (DirectX 11 / DirectX 12) oyunun kendi karesi sunulmadan hemen önce çiziliyor: tam ekran dahil her görüntü modunda, oyunu odağa almadan görünür.
- Ctrl + Tab paneli de oyunun içinde açılır: sekmeler, anahtarlar, kaydırıcılar ve gösterge listesi oyunun üstünde çalışır; düzenlemeler anında kaydedilir. Panel açıkken fare ve klavye oyununa iletilmez.
- Çizim yöntemi Ayarlar → Oyun katmanı → Oyun ve izinler → "Çizim yöntemi" ile seçilir: Otomatik (önce oyunun içi, olmazsa pencere), Her zaman oyunun içinde, Pencere katmanı (eski davranış).
- Enjeksiyon, oyunu tanıyan yardımcı süreç tarafından ve yalnız oyun penceresi görünürken yapılır. Easy Anti-Cheat, BattlEye, Vanguard, XIGNCODE, nProtect, FACEIT gibi korumalardan biri tespit edilirse oyunun sürecine HİÇ dokunulmaz ve pencere katmanına düşülür; nedeni uygulamada yazılır.
- Katman oyunun içine yalnız çizim verisi taşır: oyunun belleği okunmaz, tuş/fare oyunu adına kullanılmaz, dosyalarına yazılmaz. Oyun kapanınca katman kendini söker.
- Doğrulama: sahte D3D12 oyunu ile uçtan uca test (enjeksiyon → kanca → çizim) otomatik koşar; D3D11 çizimi ekran görüntüsüyle doğrulanmıştır. Geç enjeksiyon yolu (kukla cihaz) Wine ikinci bir grafik cihazı kurulumunu desteklemediği için yalnız gerçek Windows'ta doğrulanabilir.
- Bu sürümde OpenGL / Vulkan / D3D9 ile çalışan eski oyunlar için oyun içi çizim YOKTUR; onlarda pencere katmanı kullanılmaya devam eder.
