/* OpenGL arka ucu (1.1 sabit işlevli boru hattı).
 * Neden 1.1: wglSwapBuffers anında bağlam oyuna aittir; uzantı yüklemek yerine
 * her sürücüde bulunan çekirdek çağrılarla çiziyoruz. Böylece hem eski GL
 * oyunları (Doom 3, Quake 4, GTA: San Andreas) hem de GL üstünde çalışan
 * sarmalayıcılar (DXVK değil ama Wine'ın wined3d'i) desteklenir.
 * Fonksiyon imleçleri opengl32.dll'den dinamik alınır: DLL'imiz opengl32'yi
 * kendisi çekmez, oyunun yüklediği sürücüyü kullanır. */
#include "katman.h"
#include <stdlib.h>
#include <string.h>

typedef unsigned int GLenum;
typedef unsigned int GLbitfield;
typedef int GLint;
typedef int GLsizei;
typedef float GLfloat;
typedef double GLdouble;
typedef unsigned char GLubyte;
typedef void GLvoid;

#define GL_FALSE 0
#define GL_TRUE 1
#define GL_TRIANGLES 0x0004
#define GL_BLEND 0x0BE2
#define GL_DEPTH_TEST 0x0B71
#define GL_LIGHTING 0x0B50
#define GL_CULL_FACE 0x0B44
#define GL_TEXTURE_2D 0x0DE1
#define GL_ALPHA_TEST 0x0BC0
#define GL_SCISSOR_TEST 0x0C11
#define GL_STENCIL_TEST 0x0B90
#define GL_FOG 0x0B60
#define GL_DITHER 0x0BD0
#define GL_SRC_ALPHA 0x0302
#define GL_ONE_MINUS_SRC_ALPHA 0x0303
#define GL_PROJECTION 0x1701
#define GL_MODELVIEW 0x1700
#define GL_TEXTURE_ENV 0x2300
#define GL_TEXTURE_ENV_MODE 0x2200
#define GL_MODULATE 0x2100
#define GL_LUMINANCE_ALPHA 0x190A
#define GL_UNPACK_ALIGNMENT 0x0CF5
#define GL_UNPACK_ROW_LENGTH 0x0CF2
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_TEXTURE_WRAP_S 0x2802
#define GL_TEXTURE_WRAP_T 0x2803
#define GL_LINEAR 0x2601
#define GL_CLAMP 0x2900
#define GL_TEXTURE_BINDING_2D 0x8069
#define GL_DEPTH_WRITEMASK 0x0B72
#define GL_VIEWPORT 0x0BA2
#define GL_COLOR_BUFFER_BIT 0x4000

typedef void (*glEnable_t)(GLenum);
typedef void (*glDisable_t)(GLenum);
typedef void (*glBlendFunc_t)(GLenum, GLenum);
typedef void (*glTexEnvi_t)(GLenum, GLenum, GLint);
typedef void (*glMatrixMode_t)(GLenum);
typedef void (*glLoadIdentity_t)(void);
typedef void (*glOrtho_t)(GLdouble, GLdouble, GLdouble, GLdouble, GLdouble, GLdouble);
typedef void (*glGenTextures_t)(GLsizei, unsigned int *);
typedef void (*glDeleteTextures_t)(GLsizei, const unsigned int *);
typedef void (*glBindTexture_t)(GLenum, unsigned int);
typedef void (*glTexImage2D_t)(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const GLvoid *);
typedef void (*glTexSubImage2D_t)(GLenum, GLint, GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, const GLvoid *);
typedef void (*glTexParameteri_t)(GLenum, GLenum, GLint);
typedef void (*glPixelStorei_t)(GLenum, GLint);
typedef void (*glGetIntegerv_t)(GLenum, GLint *);
typedef void (*glGetTexEnviv_t)(GLenum, GLenum, GLint *);
typedef void (*glGetBooleanv_t)(GLenum, GLubyte *);
typedef void (*glViewport_t)(GLint, GLint, GLsizei, GLsizei);
typedef void (*glDepthMask_t)(GLubyte);
typedef void (*glColorMask_t)(GLubyte, GLubyte, GLubyte, GLubyte);
typedef void (*glEnableClientState_t)(GLenum);
typedef void (*glDisableClientState_t)(GLenum);
typedef void (*glVertexPointer_t)(GLint, GLenum, GLsizei, const GLvoid *);
typedef void (*glTexCoordPointer_t)(GLint, GLenum, GLsizei, const GLvoid *);
typedef void (*glColorPointer_t)(GLint, GLenum, GLsizei, const GLvoid *);
typedef void (*glDrawArrays_t)(GLenum, GLint, GLsizei);

#define GL_ARRAY_VERTEX 0x8074
#define GL_ARRAY_TEXTURE_COORD 0x8078
#define GL_ARRAY_COLOR 0x8076

typedef struct {
  float x, y;
  float u, v;
  GLubyte r, g, b, a;
} kvgl;

typedef struct {
  kbackend be;
  bool ok;
  HMODULE gl;
  glEnable_t Enable;
  glDisable_t Disable;
  glBlendFunc_t BlendFunc;
  glTexEnvi_t TexEnvi;
  glMatrixMode_t MatrixMode;
  glLoadIdentity_t LoadIdentity;
  glOrtho_t Ortho;
  glGenTextures_t GenTextures;
  glDeleteTextures_t DeleteTextures;
  glBindTexture_t BindTexture;
  glTexImage2D_t TexImage2D;
  glTexSubImage2D_t TexSubImage2D;
  glTexParameteri_t TexParameteri;
  glPixelStorei_t PixelStorei;
  glGetIntegerv_t GetIntegerv;
  glGetTexEnviv_t GetTexEnviv;
  glGetBooleanv_t GetBooleanv;
  glViewport_t Viewport;
  glDepthMask_t DepthMask;
  glColorMask_t ColorMask;
  glEnableClientState_t EnableClientState;
  glDisableClientState_t DisableClientState;
  glVertexPointer_t VertexPointer;
  glTexCoordPointer_t TexCoordPointer;
  glColorPointer_t ColorPointer;
  glDrawArrays_t DrawArrays;
  unsigned int tex;
  uint32_t atlasGen;
  int texW, texH;
  uint8_t *expand; /* R8 → LA çifti tamponu */
  size_t expandCap;
  kvgl *verts;
  uint32_t vertCap;
  /* kaydedilen durum */
  GLubyte sBlend, sDepth, sLight, sCull, sTex2D, sAlphaTest, sScissor, sStencil, sFog, sDither;
  GLint sTexBinding, sViewport[4], sEnvMode;
  GLubyte sDepthMask;
  bool saved;
} begl;

static void *glfn(begl *b, const char *n) { return b->gl ? (void *)GetProcAddress(b->gl, n) : NULL; }

static bool gl_load(begl *b) {
  b->gl = GetModuleHandleW(L"opengl32.dll");
  if (!b->gl) b->gl = LoadLibraryW(L"opengl32.dll");
  if (!b->gl) {
    KAT_LOG("GL: opengl32.dll bulunamadi");
    return false;
  }
#define LOAD(field, name) b->field = (gl##field##_t)glfn(b, name);
  LOAD(Enable, "glEnable");
  LOAD(Disable, "glDisable");
  LOAD(BlendFunc, "glBlendFunc");
  LOAD(TexEnvi, "glTexEnvi");
  LOAD(MatrixMode, "glMatrixMode");
  LOAD(LoadIdentity, "glLoadIdentity");
  LOAD(Ortho, "glOrtho");
  LOAD(GenTextures, "glGenTextures");
  LOAD(DeleteTextures, "glDeleteTextures");
  LOAD(BindTexture, "glBindTexture");
  LOAD(TexImage2D, "glTexImage2D");
  LOAD(TexSubImage2D, "glTexSubImage2D");
  LOAD(TexParameteri, "glTexParameteri");
  LOAD(PixelStorei, "glPixelStorei");
  LOAD(GetIntegerv, "glGetIntegerv");
  LOAD(GetTexEnviv, "glGetTexEnviv");
  LOAD(GetBooleanv, "glGetBooleanv");
  LOAD(Viewport, "glViewport");
  LOAD(DepthMask, "glDepthMask");
  LOAD(ColorMask, "glColorMask");
  LOAD(EnableClientState, "glEnableClientState");
  LOAD(DisableClientState, "glDisableClientState");
  LOAD(VertexPointer, "glVertexPointer");
  LOAD(TexCoordPointer, "glTexCoordPointer");
  LOAD(ColorPointer, "glColorPointer");
  LOAD(DrawArrays, "glDrawArrays");
#undef LOAD
  if (!b->Enable || !b->BlendFunc || !b->TexImage2D || !b->DrawArrays || !b->Ortho || !b->BindTexture) {
    KAT_LOG("GL: zorunlu fonksiyonlar alinamadi");
    return false;
  }
  return true;
}

static uint8_t *expand_la(begl *b, const uint8_t *src, int w, int h, int srcPitch) {
  size_t need = (size_t)w * (size_t)h * 2;
  if (b->expandCap < need) {
    free(b->expand);
    b->expand = (uint8_t *)malloc(need);
    b->expandCap = b->expand ? need : 0;
    if (!b->expand) return NULL;
  }
  for (int y = 0; y < h; y++) {
    const uint8_t *s = src + (size_t)y * srcPitch;
    uint8_t *d = b->expand + (size_t)y * w * 2;
    for (int x = 0; x < w; x++) {
      d[2 * x] = s[x];
      d[2 * x + 1] = s[x];
    }
  }
  return b->expand;
}

static bool make_tex_gl(begl *b, const kfont *f) {
  if (!b->tex && b->GenTextures) {
    b->GenTextures(1, &b->tex);
  }
  if (!b->tex) return false;
  b->BindTexture(GL_TEXTURE_2D, b->tex);
  b->TexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  b->TexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  b->TexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP);
  b->TexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP);
  if (b->PixelStorei) b->PixelStorei(GL_UNPACK_ALIGNMENT, 1);
  uint8_t *px = expand_la(b, f->pixels, f->atlasW, f->atlasH, f->atlasW);
  if (!px) return false;
  b->TexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE_ALPHA, f->atlasW, f->atlasH, 0, GL_LUMINANCE_ALPHA, 0x1401 /*UNSIGNED_BYTE*/, px);
  b->texW = f->atlasW;
  b->texH = f->atlasH;
  b->atlasGen = f->gen;
  return true;
}

static bool upload_dirty_gl(begl *b, const kfont *f) {
  if (!b->tex || f->gen != b->atlasGen) return make_tex_gl(b, f);
  if (!f->dirtyValid || !f->pixels) return true;
  int x0 = f->dirty.x < 0 ? 0 : (int)f->dirty.x;
  int y0 = f->dirty.y < 0 ? 0 : (int)f->dirty.y;
  int x1 = (int)(f->dirty.x + f->dirty.w);
  int y1 = (int)(f->dirty.y + f->dirty.h);
  if (x1 > f->atlasW) x1 = f->atlasW;
  if (y1 > f->atlasH) y1 = f->atlasH;
  if (x1 <= x0 || y1 <= y0) {
    font_reset_dirty((kfont *)f);
    return true;
  }
  b->BindTexture(GL_TEXTURE_2D, b->tex);
  if (b->PixelStorei) b->PixelStorei(GL_UNPACK_ALIGNMENT, 1);
  uint8_t *px = expand_la(b, f->pixels + (size_t)y0 * f->atlasW + x0, x1 - x0, y1 - y0, f->atlasW);
  if (!px) return false;
  b->TexSubImage2D(GL_TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, GL_LUMINANCE_ALPHA, 0x1401, px);
  font_reset_dirty((kfont *)f);
  return true;
}

static bool begl_begin(kbackend *self, void *target, int vpW, int vpH) {
  (void)target;
  begl *b = (begl *)self;
  if (!b->ok) return false;
  b->GetBooleanv(GL_BLEND, &b->sBlend);
  b->GetBooleanv(GL_DEPTH_TEST, &b->sDepth);
  b->GetBooleanv(GL_LIGHTING, &b->sLight);
  b->GetBooleanv(GL_CULL_FACE, &b->sCull);
  b->GetBooleanv(GL_TEXTURE_2D, &b->sTex2D);
  b->GetBooleanv(GL_ALPHA_TEST, &b->sAlphaTest);
  b->GetBooleanv(GL_SCISSOR_TEST, &b->sScissor);
  b->GetBooleanv(GL_STENCIL_TEST, &b->sStencil);
  b->GetBooleanv(GL_FOG, &b->sFog);
  b->GetBooleanv(GL_DITHER, &b->sDither);
  if (b->GetIntegerv) {
    b->GetIntegerv(GL_TEXTURE_BINDING_2D, &b->sTexBinding);
    b->GetIntegerv(GL_VIEWPORT, b->sViewport);
    if (b->GetTexEnviv) b->GetTexEnviv(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, &b->sEnvMode);
  }
  if (b->GetBooleanv) {
    GLubyte dm = GL_TRUE;
    b->GetBooleanv(GL_DEPTH_WRITEMASK, &dm);
    b->sDepthMask = dm;
  }
  b->saved = true;

  b->Viewport(0, 0, vpW, vpH);
  b->MatrixMode(GL_PROJECTION);
  b->LoadIdentity();
  b->Ortho(0.0, (GLdouble)vpW, (GLdouble)vpH, 0.0, -1.0, 1.0); /* ekran: y aşağı */
  b->MatrixMode(GL_MODELVIEW);
  b->LoadIdentity();
  b->Disable(GL_DEPTH_TEST);
  b->Disable(GL_LIGHTING);
  b->Disable(GL_CULL_FACE);
  b->Disable(GL_ALPHA_TEST);
  b->Disable(GL_SCISSOR_TEST);
  b->Disable(GL_STENCIL_TEST);
  b->Disable(GL_FOG);
  b->Enable(GL_BLEND);
  b->BlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  b->Enable(GL_TEXTURE_2D);
  if (b->DepthMask) b->DepthMask(GL_FALSE);
  if (b->ColorMask) b->ColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  if (b->TexEnvi) b->TexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE);
  return true;
}

static bool begl_draw(kbackend *self, const kdraw *d, const kfont *f) {
  begl *b = (begl *)self;
  if (!b->ok || !d || !d->count) return false;
  if (!upload_dirty_gl(b, f)) return false;
  uint32_t n = d->count;
  if (b->vertCap < n) {
    free(b->verts);
    b->verts = (kvgl *)malloc((size_t)n * sizeof(kvgl));
    b->vertCap = b->verts ? n : 0;
    if (!b->verts) return false;
  }
  for (uint32_t i = 0; i < n; i++) {
    const kvert *s = &d->verts[i];
    b->verts[i].x = s->pos.x;
    b->verts[i].y = s->pos.y;
    b->verts[i].u = s->uv.x;
    b->verts[i].v = s->uv.y;
    b->verts[i].r = s->col.r;
    b->verts[i].g = s->col.g;
    b->verts[i].b = s->col.b;
    b->verts[i].a = s->col.a;
  }
  b->BindTexture(GL_TEXTURE_2D, b->tex);
  b->EnableClientState(GL_ARRAY_VERTEX);
  b->EnableClientState(GL_ARRAY_TEXTURE_COORD);
  b->EnableClientState(GL_ARRAY_COLOR);
  b->VertexPointer(2, 0x1406 /*FLOAT*/, sizeof(kvgl), &b->verts[0].x);
  b->TexCoordPointer(2, 0x1406, sizeof(kvgl), &b->verts[0].u);
  b->ColorPointer(4, 0x1401 /*UNSIGNED_BYTE*/, sizeof(kvgl), &b->verts[0].r);
  b->DrawArrays(GL_TRIANGLES, 0, (GLsizei)n);
  b->DisableClientState(GL_ARRAY_COLOR);
  b->DisableClientState(GL_ARRAY_TEXTURE_COORD);
  b->DisableClientState(GL_ARRAY_VERTEX);
  return true;
}

static void begl_end(kbackend *self) {
  begl *b = (begl *)self;
  if (!b->saved) return;
  b->saved = false;
  if (b->sBlend) b->Enable(GL_BLEND);
  else
    b->Disable(GL_BLEND);
  if (b->sDepth) b->Enable(GL_DEPTH_TEST);
  else
    b->Disable(GL_DEPTH_TEST);
  if (b->sLight) b->Enable(GL_LIGHTING);
  else
    b->Disable(GL_LIGHTING);
  if (b->sCull) b->Enable(GL_CULL_FACE);
  else
    b->Disable(GL_CULL_FACE);
  if (b->sTex2D) b->Enable(GL_TEXTURE_2D);
  else
    b->Disable(GL_TEXTURE_2D);
  if (b->sAlphaTest) b->Enable(GL_ALPHA_TEST);
  else
    b->Disable(GL_ALPHA_TEST);
  if (b->sScissor) b->Enable(GL_SCISSOR_TEST);
  else
    b->Disable(GL_SCISSOR_TEST);
  if (b->sStencil) b->Enable(GL_STENCIL_TEST);
  else
    b->Disable(GL_STENCIL_TEST);
  if (b->sFog) b->Enable(GL_FOG);
  else
    b->Disable(GL_FOG);
  if (b->sDither) b->Enable(GL_DITHER);
  else
    b->Disable(GL_DITHER);
  if (b->DepthMask) b->DepthMask(b->sDepthMask ? GL_TRUE : GL_FALSE);
  if (b->GetIntegerv && b->BindTexture) b->BindTexture(GL_TEXTURE_2D, (unsigned int)b->sTexBinding);
  if (b->Viewport) b->Viewport(b->sViewport[0], b->sViewport[1], b->sViewport[2], b->sViewport[3]);
  if (b->TexEnvi) b->TexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, b->sEnvMode);
}

static void begl_destroy(kbackend *self) {
  begl *b = (begl *)self;
  if (!b) return;
  if (b->tex && b->DeleteTextures) b->DeleteTextures(1, &b->tex);
  free(b->expand);
  free(b->verts);
  free(b);
}

kbackend *be_gl_create(void) {
  begl *b = (begl *)calloc(1, sizeof(begl));
  if (!b) return NULL;
  b->be.name = "gl";
  b->be.api = 4;
  b->be.begin = begl_begin;
  b->be.draw = begl_draw;
  b->be.end = begl_end;
  b->be.destroy = begl_destroy;
  b->ok = gl_load(b);
  if (!b->ok) {
    free(b);
    return NULL;
  }
  KAT_LOG("OpenGL arka ucu hazir");
  return &b->be;
}
