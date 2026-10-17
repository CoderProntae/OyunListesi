## 2.2.1

**Oyun içi panel düzeltildi**
- Ctrl + Tab paneli artık her durumda kapanıyor: aynı kısayola bir daha basmak, Esc, panelin dışına tıklamak ve "Kapat" düğmesi aynı işi yapıyor. 2.2.0'da oyun içinde bir ayar değiştirdiğinde katman sökülüp yeniden kurulmaya çalışılıyordu; "çık" işareti kaldığı için yeni katman anında kendini kapatıyor, panel kapanmıyor ve Ctrl + Tab bazen tamamen çalışmaz oluyordu. Artık oyun içindeyken katman sökülmüyor, değişiklik aynı karede uygulanıyor.
- FPS satırı boş ("-") kalmıyor: kareyi oyunun içinde ölçtüğümüz için FPS doğrudan kancadan geliyor. Ölçüm yoksa nedeni yazılıyor: "izin" (Windows izin vermiyor), "…" (ölçüm başlıyor), "—" (bu oyun ölçülemiyor).

**DirectX 9 ve OpenGL oyunları da oyunun içinde**
- DirectX 9 ile çalışan oyunlarda (2004–2013 dönemi) gösterge ve panel artık oyunun kendi karesinin içinde çiziliyor.
- OpenGL ile çalışan oyunlarda (Doom 3, Quake 4, eski Minecraft, birçok bağımsız oyun) aynı şekilde oyunun içinde çiziliyor.
- İki arka uç da oyunun çizim durumunu kaydedip geri yüklüyor: oyunun görüntüsüne, ayarlarına ya da dosyalarına dokunulmuyor. D3D9 için cihaz vtable'ı (Present/Reset) ve Direct3DCreate9 kancası, OpenGL için wglSwapBuffers kancası kullanılıyor.
- Doğrulama: sahte D3D9 ve sahte OpenGL oyunlarıyla uçtan uca testler (yerleştirme → kanca → çizim) otomatik koşuyor; D3D12 testiyle birlikte üçü de çizilen kare sayısını doğruluyor.
- Vulkan bir sonraki sürümde: Windows'a örtük katman (implicit layer) kaydı gerekiyor, hazırlığı sürüyor. Vulkan oyunlarında şimdilik pencere katmanı kullanılıyor.
