/* Yazı tipi atlası: stb_truetype ile Windows'un Segoe UI yazı tipi (Türkçe
 * karakterler dahil), atlas'a basılır ve arka uçlar dokuyu yükler. Yazı tipi
 * dosyası çalışma anında okunur, uygulamayla birlikte DAĞITILMAZ (lisans). */
#include "katman.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#define STBTT_malloc(x, u) ((void)(u), malloc(x))
#define STBTT_free(x, u) ((void)(u), free(x))
#define STBTT_assert(x)                                                                                                  \
  do {                                                                                                                   \
    if (!(x)) KAT_LOG("stbtt assert: %s", #x);                                                                           \
  } while (0)
#include "stb_truetype.h"

#define ATLAS_W 1024
#define ATLAS_H 1024
#define CACHE_SLOTS 8192
#define CACHE_MASK (CACHE_SLOTS - 1)
#define PAD 1

typedef struct {
  uint32_t cp;
  int32_t sizeQ; /* size × 4 */
  uint32_t weight;
  int32_t x, y, w, h;
  float ox, oy, adv;
  bool used;
} kglyph;

typedef struct {
  stbtt_fontinfo info[2];
  unsigned char *fileData[2];
  bool have[2];
  kglyph cache[CACHE_SLOTS];
  int shelfX, shelfY, shelfH;
} kfontImpl;

static bool load_font_file(const wchar_t *name, unsigned char **out, size_t *len) {
  wchar_t dir[MAX_PATH];
  DWORD got = GetEnvironmentVariableW(L"SystemRoot", dir, MAX_PATH);
  wchar_t path[MAX_PATH * 2];
  if (got && got < MAX_PATH)
    _snwprintf(path, sizeof path / sizeof path[0], L"%ls\\Fonts\\%ls", dir, name);
  else
    _snwprintf(path, sizeof path / sizeof path[0], L"C:\\Windows\\Fonts\\%ls", name);
  HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  if (h == INVALID_HANDLE_VALUE) return false;
  LARGE_INTEGER sz;
  if (!GetFileSizeEx(h, &sz) || sz.QuadPart <= 0 || sz.QuadPart > 40 * 1024 * 1024) {
    CloseHandle(h);
    return false;
  }
  unsigned char *buf = (unsigned char *)malloc((size_t)sz.QuadPart);
  DWORD read = 0;
  if (!buf || !ReadFile(h, buf, (DWORD)sz.QuadPart, &read, NULL) || read != (DWORD)sz.QuadPart) {
    free(buf);
    CloseHandle(h);
    return false;
  }
  CloseHandle(h);
  *out = buf;
  *len = (size_t)sz.QuadPart;
  return true;
}

static const wchar_t *REGULAR_FACES[] = {L"segoeui.ttf", L"tahoma.ttf", L"arial.ttf", L"DejaVuSans.ttf", L"liberation-sans-regular.ttf"};
static const wchar_t *BOLD_FACES[] = {L"seguisb.ttf", L"segoeuib.ttf", L"tahomabd.ttf", L"arialbd.ttf", L"DejaVuSans-Bold.ttf",
                                      L"liberation-sans-bold.ttf"};

bool font_init(kfont *f, float baseScale) {
  (void)baseScale;
  kfontImpl *im = (kfontImpl *)calloc(1, sizeof(kfontImpl));
  if (!im) return false;
  f->impl = im;
  for (size_t i = 0; i < sizeof REGULAR_FACES / sizeof REGULAR_FACES[0]; i++) {
    size_t len = 0;
    if (load_font_file(REGULAR_FACES[i], &im->fileData[0], &len)) {
      if (stbtt_InitFont(&im->info[0], im->fileData[0], stbtt_GetFontOffsetForIndex(im->fileData[0], 0))) {
        im->have[0] = true;
        snprintf(f->faceName, sizeof f->faceName, "regular");
        break;
      }
      free(im->fileData[0]);
      im->fileData[0] = NULL;
    }
  }
  for (size_t i = 0; i < sizeof BOLD_FACES / sizeof BOLD_FACES[0]; i++) {
    size_t len = 0;
    if (load_font_file(BOLD_FACES[i], &im->fileData[1], &len)) {
      if (stbtt_InitFont(&im->info[1], im->fileData[1], stbtt_GetFontOffsetForIndex(im->fileData[1], 0))) {
        im->have[1] = true;
        break;
      }
      free(im->fileData[1]);
      im->fileData[1] = NULL;
    }
  }
  f->atlasW = ATLAS_W;
  f->atlasH = ATLAS_H;
  f->pixels = (uint8_t *)calloc((size_t)ATLAS_W * ATLAS_H, 1);
  if (!f->pixels) {
    font_free(f);
    return false;
  }
  /* Sol üstteki 4×4 alan her zaman beyaz: düz renk çizimler burayı örnekler. */
  for (int y = 0; y < 4; y++)
    for (int x = 0; x < 4; x++) f->pixels[(size_t)y * ATLAS_W + x] = 255;
  im->shelfX = 6;
  im->shelfY = 6;
  im->shelfH = 0;
  f->gen = 1;
  f->ready = true;
  f->dirty = (krect){0, 0, (float)ATLAS_W, (float)ATLAS_H};
  f->dirtyValid = true;
  if (!im->have[0]) {
    /* Yazı tipi yoksa metin çizilmez ama kutular/arka planlar çizilmeye devam
       eder: katman hiç görünmez kalmasın diye atlas yine de hazırlanır. */
    KAT_LOG("uyarı: sistem yazı tipi bulunamadı, yalnız şekiller çizilecek");
    return true;
  }
  if (!im->have[1]) { /* kalın yok: normal yazı tipiyle devam */
    im->info[1] = im->info[0];
    im->have[1] = true;
  }
  KAT_LOG("yazı tipi hazır (%d bayt atlas)", ATLAS_W * ATLAS_H);
  return true;
}

void font_free(kfont *f) {
  if (!f) return;
  kfontImpl *im = (kfontImpl *)f->impl;
  if (im) {
    free(im->fileData[0]);
    free(im->fileData[1]);
    free(im);
  }
  free(f->pixels);
  memset(f, 0, sizeof *f);
}

void font_reset_dirty(kfont *f) { f->dirtyValid = false; }

static void mark_dirty(kfont *f, int x, int y, int w, int h) {
  krect r = {(float)x, (float)y, (float)w, (float)h};
  if (!f->dirtyValid) {
    f->dirty = r;
    f->dirtyValid = true;
    return;
  }
  float x0 = f->dirty.x < r.x ? f->dirty.x : r.x;
  float y0 = f->dirty.y < r.y ? f->dirty.y : r.y;
  float x1 = (f->dirty.x + f->dirty.w) > (r.x + r.w) ? (f->dirty.x + f->dirty.w) : (r.x + r.w);
  float y1 = (f->dirty.y + f->dirty.h) > (r.y + r.h) ? (f->dirty.y + f->dirty.h) : (r.y + r.h);
  f->dirty = (krect){x0, y0, x1 - x0, y1 - y0};
}

static uint32_t hash_key(uint32_t cp, int32_t sizeQ, uint32_t weight) {
  uint32_t h = cp * 2654435761u;
  h ^= (uint32_t)sizeQ * 40503u;
  h ^= weight * 2246822519u;
  h ^= h >> 13;
  return h & CACHE_MASK;
}

static bool place(kfontImpl *im, kfont *f, int w, int h, int *px, int *py) {
  if (im->shelfX + w + PAD > ATLAS_W) {
    im->shelfX = 6;
    im->shelfY += im->shelfH + PAD;
    im->shelfH = 0;
  }
  if (im->shelfY + h + PAD > ATLAS_H) {
    /* atlas doldu: sıfırla (arayüzde kullanılan boyut sayısı az, nadir olur) */
    memset(f->pixels, 0, (size_t)ATLAS_W * ATLAS_H);
    for (int y = 0; y < 4; y++)
      for (int x = 0; x < 4; x++) f->pixels[(size_t)y * ATLAS_W + x] = 255;
    memset(im->cache, 0, sizeof im->cache);
    im->shelfX = 6;
    im->shelfY = 6;
    im->shelfH = 0;
    f->gen++;
    mark_dirty(f, 0, 0, ATLAS_W, ATLAS_H);
    KAT_LOG("atlas doldu, sıfırlandı (gen=%u)", f->gen);
  }
  *px = im->shelfX;
  *py = im->shelfY;
  im->shelfX += w + PAD;
  if (h > im->shelfH) im->shelfH = h;
  return true;
}

bool font_glyph(kfont *f, uint32_t cp, float size, uint32_t weight, krect *uvOut, kvec2 *sizeOut, kvec2 *bearingOut,
                float *advanceOut) {
  if (!f || !f->ready) return false;
  kfontImpl *im = (kfontImpl *)f->impl;
  if (!im || size <= 0 || size > 200) return false;
  int32_t sizeQ = (int32_t)(size * 4.0f + 0.5f);
  weight = weight ? 1 : 0;
  uint32_t slot = hash_key(cp, sizeQ, weight);
  for (uint32_t probe = 0; probe < CACHE_SLOTS; probe++) {
    uint32_t i = (slot + probe) & CACHE_MASK;
    kglyph *g = &im->cache[i];
    if (!g->used) break;
    if (g->cp == cp && g->sizeQ == sizeQ && g->weight == weight) {
      if (uvOut) *uvOut = (krect){(float)g->x / ATLAS_W, (float)g->y / ATLAS_H, (float)g->w / ATLAS_W, (float)g->h / ATLAS_H};
      if (sizeOut) *sizeOut = (kvec2){(float)g->w, (float)g->h};
      if (bearingOut) *bearingOut = (kvec2){g->ox, g->oy};
      if (advanceOut) *advanceOut = g->adv;
      return g->w > 0;
    }
  }
  /* yeni glif */
  stbtt_fontinfo *info = &im->info[weight];
  float scale = stbtt_ScaleForPixelHeight(info, size);
  int x0, y0, x1, y1;
  int adv = 0, lsb = 0;
  stbtt_GetCodepointHMetrics(info, (int)cp, &adv, &lsb);
  float advPx = adv * scale;
  x0 = y0 = x1 = y1 = 0;
  stbtt_GetCodepointBitmapBoxSubpixel(info, (int)cp, scale, scale, 0, 0, &x0, &y0, &x1, &y1);
  if (x1 <= x0 || y1 <= y0) {
    /* glif yok (ör. boşluk): yalnız ilerleme kullanılır */
    x0 = y0 = x1 = y1 = 0;
  }
  int w = x1 - x0, h = y1 - y0;
  kglyph ng;
  ng.cp = cp;
  ng.sizeQ = sizeQ;
  ng.weight = weight;
  ng.ox = (float)x0;
  ng.oy = (float)-y0; /* taban çizgisinin üstünde pozitif */
  ng.adv = advPx;
  if (w > 0 && h > 0) {
    int px, py;
    if (!place(im, f, w, h, &px, &py)) return false;
    uint8_t *dst = f->pixels + (size_t)py * ATLAS_W + px;
    stbtt_MakeCodepointBitmapSubpixel(info, dst, w, h, ATLAS_W, scale, scale, 0, 0, (int)cp);
    ng.x = px;
    ng.y = py;
    ng.w = w;
    ng.h = h;
    mark_dirty(f, px - PAD, py - PAD, w + PAD * 2, h + PAD * 2);
  } else {
    ng.x = 0;
    ng.y = 0;
    ng.w = 0;
    ng.h = 0;
  }
  ng.used = true;
  for (uint32_t probe = 0; probe < CACHE_SLOTS; probe++) {
    uint32_t i = (slot + probe) & CACHE_MASK;
    if (!im->cache[i].used) {
      im->cache[i] = ng;
      break;
    }
  }
  if (uvOut) *uvOut = (krect){(float)ng.x / ATLAS_W, (float)ng.y / ATLAS_H, (float)ng.w / ATLAS_W, (float)ng.h / ATLAS_H};
  if (sizeOut) *sizeOut = (kvec2){(float)ng.w, (float)ng.h};
  if (bearingOut) *bearingOut = (kvec2){ng.ox, ng.oy};
  if (advanceOut) *advanceOut = ng.adv;
  return ng.w > 0;
}
