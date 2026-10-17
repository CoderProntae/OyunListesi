#!/bin/sh
# Oyun içi katman DLL'lerini derler (mingw-w64 gerekir):
#   resources/overlay/oyun-katman64.dll  (64 bit oyunlar)
#   resources/overlay/oyun-katman32.dll  (32 bit oyunlar)
# Ayrıca shared/katman-offsets.gen.ts üretilir (paylaşımlı bellek düzeni):
# TypeScript tarafı alan kaymalarını elle SAYMAZ, buradan okur.
set -e
cd "$(dirname "$0")/.."
SRC="native/katman/dllmain.c native/katman/util.c native/katman/draw.c native/katman/font.c native/katman/ui.c \
native/katman/hook.c native/katman/hook_dxgi.c native/katman/hook_legacy.c native/katman/be_d3d11.c \
native/katman/be_d3d12.c native/katman/be_d3d9.c native/katman/be_gl.c native/katman/shaders.c"
FLAGS="-O2 -Wall -Wno-unused-function -Wno-unused-variable -static-libgcc -DUNICODE -D_UNICODE -DNDEBUG"
LIBS="-luuid -lpsapi -lgdi32 -luser32"
mkdir -p resources/overlay
echo "• katman64"
x86_64-w64-mingw32-gcc -shared $FLAGS -I native/katman -o resources/overlay/oyun-katman64.dll $SRC $LIBS \
  -Wl,--enable-stdcall-fixup -Wl,--kill-at
echo "• katman32"
i686-w64-mingw32-gcc -shared -m32 $FLAGS -I native/katman -o resources/overlay/oyun-katman32.dll $SRC $LIBS \
  -Wl,--enable-stdcall-fixup 2>/dev/null || echo "  (32 bit derlenemedi: 64 bit DLL ile devam)"
if [ "${KATMAN_TEST:-0}" = "1" ]; then
  echo "• katman64 (test derlemesi, statik d3d11)"
  x86_64-w64-mingw32-gcc -shared $FLAGS -DKATMAN_TEST_D3D11 -I native/katman -o /tmp/oyun-katman64-test.dll $SRC $LIBS -ld3d11 -Wl,--kill-at
fi
ls -la resources/overlay/oyun-katman*.dll
