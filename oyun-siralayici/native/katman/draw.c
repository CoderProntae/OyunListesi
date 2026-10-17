/* Çizim listesi: API'den bağımsız üçgen üretimi (kırpma dahil).
 * Bütün koordinatlar oyunun istemci alanında fiziksel pikseldir. */
#include "katman.h"
#include <math.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

void dl_init(kdraw *d) {
  memset(d, 0, sizeof *d);
  d->cap = 4096;
  d->verts = (kvert *)malloc(d->cap * sizeof(kvert));
  d->clip[0] = (krect){-1e9f, -1e9f, 2e9f, 2e9f};
  d->clipDepth = 0;
}
void dl_free(kdraw *d) {
  free(d->verts);
  d->verts = NULL;
  d->count = d->cap = 0;
}
void dl_reset(kdraw *d) {
  d->count = 0;
  d->clipDepth = 0;
  d->clip[0] = (krect){-1e9f, -1e9f, 2e9f, 2e9f};
}
krect dl_clip(const kdraw *d) { return d->clip[d->clipDepth]; }
void dl_push_clip(kdraw *d, krect r) {
  krect p = dl_clip(d);
  /* kesişim */
  float x0 = r.x > p.x ? r.x : p.x;
  float y0 = r.y > p.y ? r.y : p.y;
  float x1 = (r.x + r.w) < (p.x + p.w) ? (r.x + r.w) : (p.x + p.w);
  float y1 = (r.y + r.h) < (p.y + p.h) ? (r.y + r.h) : (p.y + p.h);
  krect c = {x0, y0, x1 > x0 ? x1 - x0 : 0, y1 > y0 ? y1 - y0 : 0};
  if (d->clipDepth + 1 < sizeof d->clip / sizeof d->clip[0]) d->clipDepth++;
  d->clip[d->clipDepth] = c;
}
void dl_pop_clip(kdraw *d) {
  if (d->clipDepth) d->clipDepth--;
}

static bool grow(kdraw *d, uint32_t need) {
  if (d->count + need <= d->cap) return true;
  uint32_t cap = d->cap ? d->cap : 4096;
  while (cap < d->count + need) cap *= 2;
  if (cap > KAT_MAX_VERTS) return false;
  kvert *v = (kvert *)realloc(d->verts, cap * sizeof(kvert));
  if (!v) return false;
  d->verts = v;
  d->cap = cap;
  return true;
}

/* Üçgeni geçerli kırpma dikdörtgenine göre kırparak ekler. */
static void emit_tri_clipped(kdraw *d, kvert a, kvert b, kvert c) {
  kvert in[3] = {a, b, c};
  int n = 3;
  krect r = dl_clip(d);
  if (r.w <= 0 || r.h <= 0) return;
  const float x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  /* 4 yarı düzlem: sol, sağ, üst, alt */
  for (int axis = 0; axis < 4 && n; axis++) {
    kvert out[8];
    int m = 0;
    for (int i = 0; i < n; i++) {
      kvert cur = in[i], nxt = in[(i + 1) % n];
      float dc, dn;
      switch (axis) {
      case 0:
        dc = cur.pos.x - x0;
        dn = nxt.pos.x - x0;
        break;
      case 1:
        dc = x1 - cur.pos.x;
        dn = x1 - nxt.pos.x;
        break;
      case 2:
        dc = cur.pos.y - y0;
        dn = nxt.pos.y - y0;
        break;
      default:
        dc = y1 - cur.pos.y;
        dn = y1 - nxt.pos.y;
        break;
      }
      bool cin = dc >= 0, nin = dn >= 0;
      if (cin) {
        if (m < 8) out[m++] = cur;
      }
      if (cin != nin) {
        float t = dc / (dc - dn);
        kvert cut;
        cut.pos.x = cur.pos.x + (nxt.pos.x - cur.pos.x) * t;
        cut.pos.y = cur.pos.y + (nxt.pos.y - cur.pos.y) * t;
        cut.uv.x = cur.uv.x + (nxt.uv.x - cur.uv.x) * t;
        cut.uv.y = cur.uv.y + (nxt.uv.y - cur.uv.y) * t;
        cut.col.v = cur.col.v;
        if (m < 8) out[m++] = cut;
      }
    }
    n = m;
    for (int i = 0; i < n && i < 3; i++) in[i] = out[i];
    if (n > 3) { /* kırpma çokgen üretti: üçgenlere böl */
      if (!grow(d, (uint32_t)(n - 2) * 3)) return;
      for (int i = 1; i + 1 < n; i++) {
        d->verts[d->count++] = out[0];
        d->verts[d->count++] = out[i];
        d->verts[d->count++] = out[i + 1];
      }
      return;
    }
  }
  if (n == 3 && grow(d, 3)) {
    d->verts[d->count++] = in[0];
    d->verts[d->count++] = in[1];
    d->verts[d->count++] = in[2];
  }
}

static kvert mkvert(float x, float y, float u, float v, kcolor c) {
  kvert o;
  o.pos.x = x;
  o.pos.y = y;
  o.uv.x = u;
  o.uv.y = v;
  o.col = c;
  return o;
}

/* Doku parçası (uv = atlas içinde 0..1) ya da düz renk (uv = {0,0}-{0,0}, atlas'ın
 * 0,0 pikseli her zaman beyaz olduğu için düz renk çıkar). */
void dl_tex(kdraw *d, krect r, krect uv, kcolor c) {
  if (r.w <= 0 || r.h <= 0) return;
  emit_tri_clipped(d, mkvert(r.x, r.y, uv.x, uv.y, c), mkvert(r.x + r.w, r.y, uv.x + uv.w, uv.y, c),
                   mkvert(r.x + r.w, r.y + r.h, uv.x + uv.w, uv.y + uv.h, c));
  emit_tri_clipped(d, mkvert(r.x, r.y, uv.x, uv.y, c), mkvert(r.x + r.w, r.y + r.h, uv.x + uv.w, uv.y + uv.h, c),
                   mkvert(r.x, r.y + r.h, uv.x, uv.y + uv.h, c));
}

static int corner_segments(float radius) {
  int s = (int)(radius * 0.6f);
  if (s < 3) s = 3;
  if (s > 14) s = 14;
  return s;
}

void dl_rect(kdraw *d, krect r, kcolor c, float radius) {
  if (r.w <= 0 || r.h <= 0) return;
  float maxR = (r.w < r.h ? r.w : r.h) * 0.5f;
  if (radius > maxR) radius = maxR;
  const krect zeroUv = KUV_SOLID;
  if (radius <= 0.5f) {
    dl_tex(d, r, zeroUv, c);
    return;
  }
  /* orta + 4 kenar */
  dl_tex(d, (krect){r.x + radius, r.y, r.w - 2 * radius, r.h}, zeroUv, c);
  dl_tex(d, (krect){r.x, r.y + radius, radius, r.h - 2 * radius}, zeroUv, c);
  dl_tex(d, (krect){r.x + r.w - radius, r.y + radius, radius, r.h - 2 * radius}, zeroUv, c);
  /* 4 köşe yayı */
  const float cx[4] = {r.x + radius, r.x + r.w - radius, r.x + r.w - radius, r.x + radius};
  const float cy[4] = {r.y + radius, r.y + radius, r.y + r.h - radius, r.y + r.h - radius};
  const float a0[4] = {(float)M_PI, (float)(-M_PI / 2), 0.0f, (float)(M_PI / 2)};
  int seg = corner_segments(radius);
  for (int q = 0; q < 4; q++) {
    float start = a0[q];
    for (int i = 0; i < seg; i++) {
      float t0 = start + (float)(M_PI / 2) * (float)i / (float)seg;
      float t1 = start + (float)(M_PI / 2) * (float)(i + 1) / (float)seg;
      kvert center = mkvert(cx[q], cy[q], KUV_SOLID.x, KUV_SOLID.y, c);
      kvert p0 = mkvert(cx[q] + cosf(t0) * radius, cy[q] + sinf(t0) * radius, KUV_SOLID.x, KUV_SOLID.y, c);
      kvert p1 = mkvert(cx[q] + cosf(t1) * radius, cy[q] + sinf(t1) * radius, KUV_SOLID.x, KUV_SOLID.y, c);
      emit_tri_clipped(d, center, p0, p1);
    }
  }
}

void dl_rect_border(kdraw *d, krect r, kcolor c, float radius, float t) {
  if (r.w <= t * 2 || r.h <= t * 2) return;
  float maxR = (r.w < r.h ? r.w : r.h) * 0.5f;
  if (radius > maxR) radius = maxR;
  float inner = radius - t;
  if (inner < 0) inner = 0;
  krect ir = {r.x + t, r.y + t, r.w - 2 * t, r.h - 2 * t};
  /* dış ve iç yay noktaları arasında şerit */
  int seg = corner_segments(radius);
  const float cx[4] = {r.x + radius, r.x + r.w - radius, r.x + r.w - radius, r.x + radius};
  const float cy[4] = {r.y + radius, r.y + radius, r.y + r.h - radius, r.y + r.h - radius};
  const float icx[4] = {ir.x + inner, ir.x + ir.w - inner, ir.x + ir.w - inner, ir.x + inner};
  const float icy[4] = {ir.y + inner, ir.y + inner, ir.y + ir.h - inner, ir.y + ir.h - inner};
  const float a0[4] = {(float)M_PI, (float)(-M_PI / 2), 0.0f, (float)(M_PI / 2)};
  for (int q = 0; q < 4; q++) {
    for (int i = 0; i < seg; i++) {
      float t0 = a0[q] + (float)(M_PI / 2) * (float)i / (float)seg;
      float t1 = a0[q] + (float)(M_PI / 2) * (float)(i + 1) / (float)seg;
      kvert o0 = mkvert(cx[q] + cosf(t0) * radius, cy[q] + sinf(t0) * radius, KUV_SOLID.x, KUV_SOLID.y, c);
      kvert o1 = mkvert(cx[q] + cosf(t1) * radius, cy[q] + sinf(t1) * radius, KUV_SOLID.x, KUV_SOLID.y, c);
      kvert i0 = mkvert(icx[q] + cosf(t0) * inner, icy[q] + sinf(t0) * inner, KUV_SOLID.x, KUV_SOLID.y, c);
      kvert i1 = mkvert(icx[q] + cosf(t1) * inner, icy[q] + sinf(t1) * inner, KUV_SOLID.x, KUV_SOLID.y, c);
      emit_tri_clipped(d, o0, i0, i1);
      emit_tri_clipped(d, o0, i1, o1);
    }
  }
  /* düz kenarlar (yayların arasındaki boşluklar) */
  const krect zero = KUV_SOLID;
  float spanW = r.w - 2 * radius, spanH = r.h - 2 * radius;
  dl_tex(d, (krect){r.x + radius, r.y, spanW, t}, zero, c);
  dl_tex(d, (krect){r.x + radius, r.y + r.h - t, spanW, t}, zero, c);
  dl_tex(d, (krect){r.x, r.y + radius, t, spanH}, zero, c);
  dl_tex(d, (krect){r.x + r.w - t, r.y + radius, t, spanH}, zero, c);
}

/* ---------------- metin ---------------- */
static bool glyph(kfont *f, uint32_t cp, float size, uint32_t weight, krect *uv, kvec2 *gs, kvec2 *bear, float *adv) {
  return font_glyph(f, cp, size, weight, uv, gs, bear, adv);
}

float kat_text_height(float size) { return size * 1.28f; }

float kat_text_width(const char *utf8, float size, uint32_t weight) {
  if (!utf8 || !*utf8) return 0;
  kfont *f = kat_active_font();
  if (!f || !f->ready) return 0;
  float x = 0;
  const char *p = utf8;
  while (*p) {
    uint32_t cp = kat_utf8_decode(&p);
    if (!cp) break;
    krect uv;
    kvec2 gs, bear;
    float adv = 0;
    if (glyph(f, cp, size, weight, &uv, &gs, &bear, &adv)) x += adv;
    else if (cp == ' ')
      x += size * 0.28f;
  }
  return x;
}

float dl_text(kdraw *d, float x, float y, const char *utf8, float size, kcolor c, uint32_t weight) {
  if (!utf8 || !*utf8) return 0;
  kfont *f = kat_active_font();
  if (!f || !f->ready) return 0;
  float cx = x;
  const char *p = utf8;
  float baseline = y + size * 0.94f; /* üst kenardan taban çizgisine */
  while (*p) {
    uint32_t cp = kat_utf8_decode(&p);
    if (!cp) break;
    if (cp == '\n') break;
    krect uv;
    kvec2 gs, bear;
    float adv = 0;
    if (!glyph(f, cp, size, weight, &uv, &gs, &bear, &adv)) {
      if (cp == ' ') cx += size * 0.28f;
      continue;
    }
    if (gs.x > 0.5f && gs.y > 0.5f) {
      krect r = {cx + bear.x, baseline - bear.y, gs.x, gs.y};
      dl_tex(d, r, uv, c);
    }
    cx += adv;
  }
  d->atlasGen = f->gen;
  return cx - x;
}

float dl_text_fit(kdraw *d, float x, float y, const char *utf8, float size, kcolor c, uint32_t weight, float maxW) {
  if (!utf8) return 0;
  float w = kat_text_width(utf8, size, weight);
  if (w <= maxW || maxW <= 0) return dl_text(d, x, y, utf8, size, c, weight);
  char buf[256];
  size_t n = strlen(utf8);
  if (n >= sizeof buf) n = sizeof buf - 1;
  memcpy(buf, utf8, n);
  buf[n] = 0;
  float dots = kat_text_width("\xe2\x80\xa6", size, weight);
  /* bayt sınırında kes */
  while (n > 0) {
    n--;
    while (n > 0 && ((unsigned char)buf[n] & 0xC0) == 0x80) n--;
    buf[n] = 0;
    if (kat_text_width(buf, size, weight) + dots <= maxW) break;
  }
  buf[n] = 0;
  char out[280];
  snprintf(out, sizeof out, "%s\xe2\x80\xa6", buf);
  return dl_text(d, x, y, out, size, c, weight);
}

/* ---------------- yazı tipi erişimi ---------------- */
static kfont *g_font = NULL;
void kat_set_active_font(kfont *f) { g_font = f; }
kfont *kat_active_font(void) { return g_font; }
