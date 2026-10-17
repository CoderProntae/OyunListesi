/* D3D9 arka ucu: sabit işlevli boru hattı (shader gerekmez). Oyunun kendi
 * cihazında çizilir; durum kaydedilip geri yüklenir. */
#include "katman.h"
#include <d3d9.h>
#include <stdlib.h>
#include <string.h>

#define D3DFVF_KATMAN (D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEX1)
typedef struct {
  float x, y, z;
  DWORD col; /* ARGB */
  float u, v;
} kv9;

typedef struct {
  kbackend be;
  IDirect3DDevice9 *dev;
  IDirect3DTexture9 *tex;
  uint32_t atlasGen;
  int texW, texH;
  bool ok;
  /* kaydedilen durum */
  D3DMATRIX proj, view;
  D3DVIEWPORT9 vp;
  DWORD rs[12];
  DWORD tss[6];
  DWORD samp[4];
  IDirect3DBaseTexture9 *oldTex;
  DWORD oldFvf;
  bool saved;
} be9;

enum {
  RS_ZENABLE = 0,
  RS_FILL,
  RS_CULL,
  RS_LIGHTING,
  RS_ALPHABLEND,
  RS_SRCBLEND,
  RS_DESTBLEND,
  RS_FOG,
  RS_SCISSOR,
  RS_COLORWRITE,
  RS_ALPHATEST,
  RS_STENCILENABLE,
};
enum { TSS_COLOROP = 0, TSS_COLORARG1, TSS_COLORARG2, TSS_ALPHAOP, TSS_ALPHAARG1, TSS_ALPHAARG2 };
enum { SMP_MIN = 0, SMP_MAG, SMP_ADDRU, SMP_ADDRV };

/* R8 atlas → A8L8 satırı (her piksel 2 bayt: L=p, A=p). */
static void expand_la(const uint8_t *src, uint8_t *dst, int n) {
  for (int i = 0; i < n; i++) {
    dst[2 * i] = src[i];
    dst[2 * i + 1] = src[i];
  }
}

static bool make_tex(be9 *b, const kfont *f) {
  if (b->tex) {
    IDirect3DTexture9_Release(b->tex);
    b->tex = NULL;
  }
  /* A8L8: L ve A aynı değer (atlas R8). L8 kullanılamaz; orada alfa 1.0'dır. */
  HRESULT hr = IDirect3DDevice9_CreateTexture(b->dev, (UINT)f->atlasW, (UINT)f->atlasH, 1, 0, D3DFMT_A8L8, D3DPOOL_MANAGED,
                                              &b->tex, NULL);
  if (FAILED(hr) || !b->tex) {
    KAT_LOG("D3D9 atlas dokusu olusturulamadi hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  b->texW = f->atlasW;
  b->texH = f->atlasH;
  D3DLOCKED_RECT lr;
  if (FAILED(IDirect3DTexture9_LockRect(b->tex, 0, &lr, NULL, 0))) return false;
  for (int y = 0; y < f->atlasH; y++)
    expand_la(f->pixels + (size_t)y * f->atlasW, (uint8_t *)lr.pBits + (size_t)y * lr.Pitch, f->atlasW);
  IDirect3DTexture9_UnlockRect(b->tex, 0);
  b->atlasGen = f->gen;
  return true;
}

static bool upload_dirty9(be9 *b, const kfont *f) {
  if (!b->tex || f->gen != b->atlasGen) return make_tex(b, f);
  if (!f->dirtyValid || !f->pixels) return true;
  RECT r = {(LONG)f->dirty.x, (LONG)f->dirty.y, (LONG)(f->dirty.x + f->dirty.w), (LONG)(f->dirty.y + f->dirty.h)};
  if (r.left < 0) r.left = 0;
  if (r.top < 0) r.top = 0;
  if (r.right > f->atlasW) r.right = f->atlasW;
  if (r.bottom > f->atlasH) r.bottom = f->atlasH;
  if (r.right <= r.left || r.bottom <= r.top) {
    font_reset_dirty((kfont *)f);
    return true;
  }
  D3DLOCKED_RECT lr;
  if (FAILED(IDirect3DTexture9_LockRect(b->tex, 0, &lr, &r, 0))) return false;
  for (LONG y = r.top; y < r.bottom; y++)
    expand_la(f->pixels + (size_t)y * f->atlasW + r.left, (uint8_t *)lr.pBits + (size_t)(y - r.top) * lr.Pitch,
              r.right - r.left);
  IDirect3DTexture9_UnlockRect(b->tex, 0);
  font_reset_dirty((kfont *)f);
  return true;
}

static bool be9_begin(kbackend *self, void *target, int vpW, int vpH) {
  (void)target;
  be9 *b = (be9 *)self;
  IDirect3DDevice9 *d = b->dev;
  if (!b->ok) return false;
  /* durumu kaydet */
  IDirect3DDevice9_GetTransform(d, D3DTS_PROJECTION, &b->proj);
  IDirect3DDevice9_GetTransform(d, D3DTS_VIEW, &b->view);
  IDirect3DDevice9_GetViewport(d, &b->vp);
  IDirect3DDevice9_GetRenderState(d, D3DRS_ZENABLE, &b->rs[RS_ZENABLE]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_FILLMODE, &b->rs[RS_FILL]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_CULLMODE, &b->rs[RS_CULL]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_LIGHTING, &b->rs[RS_LIGHTING]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_ALPHABLENDENABLE, &b->rs[RS_ALPHABLEND]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_SRCBLEND, &b->rs[RS_SRCBLEND]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_DESTBLEND, &b->rs[RS_DESTBLEND]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_FOGENABLE, &b->rs[RS_FOG]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_SCISSORTESTENABLE, &b->rs[RS_SCISSOR]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_COLORWRITEENABLE, &b->rs[RS_COLORWRITE]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_ALPHATESTENABLE, &b->rs[RS_ALPHATEST]);
  IDirect3DDevice9_GetRenderState(d, D3DRS_STENCILENABLE, &b->rs[RS_STENCILENABLE]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_COLOROP, &b->tss[TSS_COLOROP]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_COLORARG1, &b->tss[TSS_COLORARG1]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_COLORARG2, &b->tss[TSS_COLORARG2]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_ALPHAOP, &b->tss[TSS_ALPHAOP]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_ALPHAARG1, &b->tss[TSS_ALPHAARG1]);
  IDirect3DDevice9_GetTextureStageState(d, 0, D3DTSS_ALPHAARG2, &b->tss[TSS_ALPHAARG2]);
  IDirect3DDevice9_GetSamplerState(d, 0, D3DSAMP_MINFILTER, &b->samp[SMP_MIN]);
  IDirect3DDevice9_GetSamplerState(d, 0, D3DSAMP_MAGFILTER, &b->samp[SMP_MAG]);
  IDirect3DDevice9_GetSamplerState(d, 0, D3DSAMP_ADDRESSU, &b->samp[SMP_ADDRU]);
  IDirect3DDevice9_GetSamplerState(d, 0, D3DSAMP_ADDRESSV, &b->samp[SMP_ADDRV]);
  IDirect3DDevice9_GetTexture(d, 0, &b->oldTex);
  IDirect3DDevice9_GetFVF(d, &b->oldFvf);
  b->saved = true;
  /* DrawPrimitiveUP, veri düzenini cihazın FVF'inden okur: bu yüzden şart. */
  IDirect3DDevice9_SetFVF(d, D3DFVF_KATMAN);

  /* kendi durumumuz */
  D3DVIEWPORT9 vp = {0, 0, (DWORD)vpW, (DWORD)vpH, 0.0f, 1.0f};
  IDirect3DDevice9_SetViewport(d, &vp);
  D3DMATRIX proj;
  memset(&proj, 0, sizeof proj);
  proj._11 = 2.0f / (float)vpW;
  proj._22 = -2.0f / (float)vpH;
  proj._33 = 1.0f;
  proj._41 = -1.0f;
  proj._42 = 1.0f;
  proj._44 = 1.0f;
  D3DMATRIX ident;
  memset(&ident, 0, sizeof ident);
  ident._11 = ident._22 = ident._33 = ident._44 = 1.0f;
  IDirect3DDevice9_SetTransform(d, D3DTS_PROJECTION, &proj);
  IDirect3DDevice9_SetTransform(d, D3DTS_VIEW, &ident);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ZENABLE, FALSE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_FILLMODE, D3DFILL_SOLID);
  IDirect3DDevice9_SetRenderState(d, D3DRS_CULLMODE, D3DCULL_NONE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_LIGHTING, FALSE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ALPHABLENDENABLE, TRUE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
  IDirect3DDevice9_SetRenderState(d, D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
  IDirect3DDevice9_SetRenderState(d, D3DRS_FOGENABLE, FALSE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_SCISSORTESTENABLE, FALSE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_COLORWRITEENABLE, 0xF);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ALPHATESTENABLE, FALSE);
  IDirect3DDevice9_SetRenderState(d, D3DRS_STENCILENABLE, FALSE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLOROP, D3DTOP_MODULATE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_MAGFILTER, D3DTEXF_LINEAR);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_ADDRESSU, D3DTADDRESS_CLAMP);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_ADDRESSV, D3DTADDRESS_CLAMP);
  return true;
}

static bool be9_draw(kbackend *self, const kdraw *d, const kfont *f) {
  be9 *b = (be9 *)self;
  if (!b->ok || !d || !d->count) return false;
  if (!upload_dirty9(b, f)) return false;
  uint32_t n = d->count;
  kv9 *v = (kv9 *)malloc((size_t)n * sizeof(kv9));
  if (!v) return false;
  for (uint32_t i = 0; i < n; i++) {
    const kvert *s = &d->verts[i];
    v[i].x = s->pos.x;
    v[i].y = s->pos.y;
    v[i].z = 0.0f;
    v[i].col = ((DWORD)s->col.a << 24) | ((DWORD)s->col.r << 16) | ((DWORD)s->col.g << 8) | s->col.b;
    v[i].u = s->uv.x;
    v[i].v = s->uv.y;
  }
  IDirect3DDevice9_SetTexture(b->dev, 0, (IDirect3DBaseTexture9 *)b->tex);
  HRESULT hr = IDirect3DDevice9_DrawPrimitiveUP(b->dev, D3DPT_TRIANGLELIST, n / 3, v, sizeof(kv9));
  free(v);
  if (FAILED(hr)) {
    KAT_LOG("D3D9 cizim basarisiz hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  return true;
}

static void be9_end(kbackend *self) {
  be9 *b = (be9 *)self;
  IDirect3DDevice9 *d = b->dev;
  if (!b->saved) return;
  b->saved = false;
  IDirect3DDevice9_SetTransform(d, D3DTS_PROJECTION, &b->proj);
  IDirect3DDevice9_SetTransform(d, D3DTS_VIEW, &b->view);
  IDirect3DDevice9_SetViewport(d, &b->vp);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ZENABLE, b->rs[RS_ZENABLE]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_FILLMODE, b->rs[RS_FILL]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_CULLMODE, b->rs[RS_CULL]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_LIGHTING, b->rs[RS_LIGHTING]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ALPHABLENDENABLE, b->rs[RS_ALPHABLEND]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_SRCBLEND, b->rs[RS_SRCBLEND]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_DESTBLEND, b->rs[RS_DESTBLEND]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_FOGENABLE, b->rs[RS_FOG]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_SCISSORTESTENABLE, b->rs[RS_SCISSOR]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_COLORWRITEENABLE, b->rs[RS_COLORWRITE]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_ALPHATESTENABLE, b->rs[RS_ALPHATEST]);
  IDirect3DDevice9_SetRenderState(d, D3DRS_STENCILENABLE, b->rs[RS_STENCILENABLE]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLOROP, b->tss[TSS_COLOROP]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLORARG1, b->tss[TSS_COLORARG1]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_COLORARG2, b->tss[TSS_COLORARG2]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAOP, b->tss[TSS_ALPHAOP]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAARG1, b->tss[TSS_ALPHAARG1]);
  IDirect3DDevice9_SetTextureStageState(d, 0, D3DTSS_ALPHAARG2, b->tss[TSS_ALPHAARG2]);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_MINFILTER, b->samp[SMP_MIN]);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_MAGFILTER, b->samp[SMP_MAG]);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_ADDRESSU, b->samp[SMP_ADDRU]);
  IDirect3DDevice9_SetSamplerState(d, 0, D3DSAMP_ADDRESSV, b->samp[SMP_ADDRV]);
  IDirect3DDevice9_SetFVF(d, b->oldFvf);
  IDirect3DDevice9_SetTexture(d, 0, b->oldTex);
  if (b->oldTex) IDirect3DBaseTexture9_Release(b->oldTex);
  b->oldTex = NULL;
}

static void be9_destroy(kbackend *self) {
  be9 *b = (be9 *)self;
  if (!b) return;
  if (b->tex) IDirect3DTexture9_Release(b->tex);
  if (b->dev) IDirect3DDevice9_Release(b->dev);
  free(b);
}

kbackend *be_d3d9_create(IDirect3DDevice9 *dev) {
  if (!dev) return NULL;
  be9 *b = (be9 *)calloc(1, sizeof(be9));
  if (!b) return NULL;
  b->be.name = "d3d9";
  b->be.api = 1;
  b->be.begin = be9_begin;
  b->be.draw = be9_draw;
  b->be.end = be9_end;
  b->be.destroy = be9_destroy;
  b->dev = dev;
  IDirect3DDevice9_AddRef(dev);
  b->ok = true;
  KAT_LOG("D3D9 arka ucu hazir");
  return &b->be;
}
