#!/bin/sh
# Builds the Windows helper used by the game detector (needs mingw-w64).
set -e
cd "$(dirname "$0")/.."
x86_64-w64-mingw32-gcc -O2 -s -municode -static -Wall -Wextra -Wno-unused-parameter \
  -o resources/overlay/oyun-yardimci.exe native/oyun-yardimci.c native/katman/util.c native/katman/hook.c native/kminijson.c \
  -lpdh -lole32 -luuid -lpsapi -ladvapi32 -luser32 -ldwmapi
