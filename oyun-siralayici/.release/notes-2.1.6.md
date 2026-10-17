## 2.1.6

**Oyun katmanı: oyunun üstünde kalıyor**
- Bazı oyunlar kendi pencerelerini sürekli en üste taşıyor (Unreal Engine 5 ile yapılan tam ekran oyunlar, örneğin Little Nightmares 3). Katman bu yüzden oyunun arkasında kalıyordu: köşedeki gösterge oyunda görünmüyor, başka bir programa geçince bir an görünüp kayboluyor, Ctrl + Tab ile açılan panel oyunun arkasında açılıyordu. Artık oyun öndeyken katman pencereleri de en üstte tutuluyor ve bu sıra saniyede bir yeniden kuruluyor.
- Davranışın öbür yarısı aynı kaldı: başka bir program öne geçtiği anda katman en üstten çıkıyor, oyun penceresinin hemen üstünde durmaya devam ediyor. Yani katman başka programların üstüne çıkmıyor.
- Oyun "Tam ekran" modunda çalışıyorsa (ekran kartının doğrudan çizdiği mod) hiçbir program oyunun üstüne çizemez. Köşedeki gösterge için oyunun görüntü ayarlarında "Kenarlıksız / Pencereli tam ekran" (Borderless) modunu seç.
