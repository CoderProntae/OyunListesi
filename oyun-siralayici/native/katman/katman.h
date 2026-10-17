/* Oyun içi katman — iç arayüzler (çizim listesi, yazı tipi, arayüz, arka uçlar).
 * Çizim listesi API'den bağımsızdır: HUD ve panel aynı listeyi üretir, her arka
 * uç (D3D9/11/12, OpenGL, Vulkan) listeyi kendi diliyle çizer. Böylece bir
 * API'de bulunan hata diğerlerinde de aynı davranışı verir. */
#ifndef OYUN_KATMAN_H
#define OYUN_KATMAN_H

#define COBJMACROS
/* D3D12'de yapı döndüren COM metodları (GetDesc, …HandleForHeapStart) için
   mingw'nin satır içi sarmalayıcılarını açar. */
#define WIDL_C_INLINE_WRAPPERS
#include <windows.h>
#include <stdint.h>
#include <stdbool.h>
#include <initguid.h>
#include <d3d9.h>
#include <d3d11.h>
#include <dxgi1_4.h>
#include <d3d12.h>
#include "ipc.h"

#define KAT_LOG(fmt, ...) kat_log(__FILE__, __LINE__, fmt, ##__VA_ARGS__)
uint32_t kat_utf8_decode(const char **p);
int kat_format_number_tr(char *out, size_t n, double v, int decimals);
void kat_format_duration_tr(char *out, size_t n, uint32_t seconds);
void kat_format_clock_tr(char *out, size_t n);
void kat_log(const char *file, int line, const char *fmt, ...);
uint64_t kat_now_us(void);

/* ---------------- renk / geometri ---------------- */
typedef struct {
  float x, y;
} kvec2;
typedef struct {
  float x, y, w, h;
} krect;
typedef union {
  struct {
    uint8_t b, g, r, a;
  };
  uint32_t v;
} kcolor;

static inline kcolor krgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  kcolor c;
  c.r = r;
  c.g = g;
  c.b = b;
  c.a = a;
  return c;
}
/* Tasarımdaki renkler (arayüzdeki CSS ile aynı değerler). */
#define KCOL_BG krgba(12, 14, 20, 214)
#define KCOL_BG_SOLID krgba(12, 14, 20, 255)
#define KCOL_PANEL krgba(16, 19, 27, 246)
#define KCOL_BORDER krgba(255, 255, 255, 28)
#define KCOL_TEXT krgba(238, 242, 250, 255)
#define KCOL_MUTED krgba(168, 178, 196, 255)
#define KCOL_FAINT krgba(126, 136, 154, 255)
#define KCOL_ACCENT krgba(94, 234, 212, 255)
#define KCOL_OK krgba(74, 222, 128, 255)
#define KCOL_WARN krgba(250, 204, 21, 255)
#define KCOL_DANGER krgba(248, 113, 113, 255)
#define KCOL_ROW krgba(255, 255, 255, 12)
#define KCOL_ROW_HOVER krgba(255, 255, 255, 22)
#define KCOL_ROW_SEL krgba(94, 234, 212, 34)

/* ---------------- çizim listesi ---------------- */
typedef struct {
  kvec2 pos;
  kvec2 uv;
  kcolor col;
} kvert;

#define KAT_MAX_VERTS (1 << 17)
/* Düz renk çizimler atlas'ın (0,0) pikselini örnekler: orası her zaman beyaz. */
#define KAT_ATLAS_SIZE 1024
#define KUV_SOLID ((krect){0.5f / KAT_ATLAS_SIZE, 0.5f / KAT_ATLAS_SIZE, 0, 0})
typedef struct {
  kvert *verts;
  uint32_t count;
  uint32_t cap;
  /* kırpma yığını */
  krect clip[8];
  uint32_t clipDepth;
  /* atlas dokusu sürümü: atlas değişince arka uç yeniden yükler */
  uint32_t atlasGen;
} kdraw;

void dl_init(kdraw *d);
void dl_free(kdraw *d);
void dl_reset(kdraw *d);
void dl_push_clip(kdraw *d, krect r);
void dl_pop_clip(kdraw *d);
krect dl_clip(const kdraw *d);
void dl_rect(kdraw *d, krect r, kcolor c, float radius);
void dl_rect_border(kdraw *d, krect r, kcolor c, float radius, float thickness);
void dl_tex(kdraw *d, krect r, krect uv, kcolor c); /* atlas'tan doku parçası */
/* UTF-8 metin. Döner: ölçülen genişlik. outH verilirse yükseklik de yazılır. */
float dl_text(kdraw *d, float x, float y, const char *utf8, float size, kcolor c, uint32_t weight);
float kat_text_width(const char *utf8, float size, uint32_t weight);
float kat_text_height(float size);
/* Metni genişliğe sığdırır: sığmazsa "…" ile kısaltır. */
float dl_text_fit(kdraw *d, float x, float y, const char *utf8, float size, kcolor c, uint32_t weight, float maxW);

/* ---------------- yazı tipi atlası ---------------- */
typedef struct {
  void *impl;      /* kfontImpl (font.c) */
  uint8_t *pixels; /* R8, atlasW × atlasH */
  int atlasW, atlasH;
  uint32_t gen;       /* her yüklemede artar */
  krect dirty;        /* kirli bölge (atlas piksel cinsinden) */
  bool dirtyValid;
  bool ready;
  char faceName[64];
} kfont;

void kat_set_active_font(kfont *f);
kfont *kat_active_font(void);
bool font_init(kfont *f, float baseScale);
void font_free(kfont *f);
/* Bir glifin atlas içindeki yerini verir; gerekse atlas'a basar. false = glif yok. */
bool font_glyph(kfont *f, uint32_t cp, float size, uint32_t weight, krect *uvOut, kvec2 *sizeOut, kvec2 *bearingOut,
                float *advanceOut);
void font_reset_dirty(kfont *f);

/* ---------------- arka uç arayüzü ---------------- */
/* Arka uç arayüzü: begin (hedefi bağla + oyunun durumunu kaydet) → draw →
   end (durumu geri yükle). target API'ye özgüdür (D3D11: ID3D11RenderTargetView*,
   D3D12: arka tampon ID3D12Resource*, D3D9: NULL, GL/VK: NULL). */
typedef struct kbackend {
  const char *name;
  uint32_t api; /* ipc.h: status.api */
  bool (*begin)(struct kbackend *self, void *target, int vpW, int vpH);
  bool (*draw)(struct kbackend *self, const kdraw *d, const kfont *f);
  void (*end)(struct kbackend *self);
  void (*destroy)(struct kbackend *self);
} kbackend;

kbackend *be_d3d11_create(ID3D11Device * dev, ID3D11DeviceContext * ctx);
/* D3D12: kuyruk ExecuteCommandLists kancasından yakalanır. */
kbackend *be_d3d12_create(ID3D12Device * dev, ID3D12CommandQueue * queue);
kbackend *be_d3d9_create(IDirect3DDevice9 * dev);
kbackend *be_gl_create(void);
kbackend *be_vk_create(void);

/* ---------------- paylaşımlı bellek ---------------- */
katman_shm *shm_open_writer(void); /* yardımcı süreç: oluşturur/açar */
katman_shm *shm_open_reader(void); /* DLL: yalnız açar */
void shm_close(katman_shm *m);
/* RTSS tarzı kilit: çizerken busy bit0 set edilir. */
bool shm_lock(katman_shm *m);
void shm_unlock(katman_shm *m);

/* ---------------- arayüz (HUD + panel) ---------------- */
typedef struct {
  float mx, my;      /* fare konumu (istemci alanı, fiziksel piksel) */
  bool lDown, lPressed, lReleased;
  bool wheelUp, wheelDown;
  float scroll;      /* tekerlek miktarı */
  uint32_t keyVk;    /* bu kare basılan tuş (0 = yok) */
  bool keyCtrl, keyShift, keyAlt;
  char typed[8];     /* bu kare girilen karakter (UTF-8, boş = yok) */
} kinput;

typedef struct {
  kdraw draw;
  kfont font;
  katman_shm *shm;
  kinput in;
  /* panel durumu (kalıcı) */
  float panelScroll;
  int panelFocusRow;
  int hoverRow;
  bool textEditing;
  int editingRow;
  char editBuf[64];
  uint32_t caretMs;
  /* ölçüler */
  int vpW, vpH;
  float scale;
  krect panelRect;
  uint64_t t0;
  double lastDrawMs;
  /* fps ölçümü (kancadan) */
  uint64_t frameTimes[240];
  uint32_t frameCount;
  uint32_t frameIdx;
} kui;

void ui_init(kui *u, katman_shm *shm);
void ui_free(kui *u);
/* Bir kare: shm'den görünümü üretir. Döner: çizim yapılacak mı. */
bool ui_frame(kui *u, kbackend *be, bool panelHotkeyPressed);
void ui_push_command(katman_shm *m, uint32_t kind, const char *id, int32_t num, float val, const char *text);
/* Ortak çizim yolu: her kanca kendi hedefini bağlayıp bunu çağırır. */
void kat_render_into(kbackend *be, void *target, HWND hwnd);
HWND kat_game_window(void); /* dllmain.c: alt sınıflandırılan oyun penceresi */
void kat_frame_begin(void);
void kat_frame_end(void);
void kat_hook_frame_measure(void); /* kare süresi ölçümü (hook_dxgi.c) */
bool kat_under_wine(void);

/* ---------------- kanca / enjeksiyon ---------------- */
typedef struct {
  const char *moduleBaseName; /* ör. "EasyAntiCheat.dll" */
  const char *label;          /* kullanıcıya gösterilecek ad */
} kguardEntry;
bool guard_scan_process(DWORD pid, char *found, size_t foundLen); /* true = koruma var */
bool kat_inject(DWORD pid, const char *dllPath, char *err, size_t errLen);
bool kat_eject(DWORD pid, char *err, size_t errLen);
bool kat_process_bits(DWORD pid, int *bits);

/* Kancalar */
bool dxgi_install_hooks(HWND gameWnd);
void dxgi_install_dummy_for_runtime(void);
void dxgi_request_dummy(HWND gameWnd);
void dxgi_uninstall(void);
void dxgi_retry_dummy(void);
void kat_snapshot_modules(void);
void dxgi_backend_retry(IDXGISwapChain *sc, HWND hwnd);
bool dxgi_runtime_loaded(void);  /* oyun bizden önce dxgi/d3d11/d3d12 yükledi mi */
bool dxgi_backend_active(void);  /* DXGI arka ucu çiziyor mu */
bool legacy_install_hooks(void); /* D3D9 + OpenGL (modül yüklüyse) */
void legacy_d9_dummy_request(void); /* WM_APP+0x52 ile oyun iş parçacığında */
HWND kat_game_window(void); /* dllmain.c: alt sınıflandırılan oyun penceresi */
void legacy_d9_dummy_request(void); /* WM_APP+0x52: D3D9 kukla cihazı */
void legacy_uninstall(void);

/* vtable kancası: idx. girdiyi değiştirir, eskisini döndürür. */
void *vt_hook(void *iface, int idx, void *replacement);
bool vt_unhook(void *iface, int idx, void *original);
int vt_index_of(void *vtblStructFieldPtr); /* offsetof/sizeof(void*) */
#define VIDX(vtblType, method) ((int)(((size_t) & (((vtblType *)0)->method)) / sizeof(void *)))

/* IAT yaması: modülün içe aktardığı fonksiyonu değiştirir. */
bool iat_patch_module(HMODULE mod, const char *dllName, const char *funcName, void *replacement, void **original);
/* Döner: en az bir modülün IAT'i yamalandı mı. */
bool iat_patch_all_loaded(const char *dllName, const char *funcName, void *replacement, void **original);

#endif /* OYUN_KATMAN_H */
