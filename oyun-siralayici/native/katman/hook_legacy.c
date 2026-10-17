/* D3D9 ve OpenGL kancaları.
 *
 * D3D9: iki yol.
 *   1) Erken enjeksiyon — oyun henüz d3d9'u çağırmadıysa IAT'teki
 *      Direct3DCreate9/Ex yakalanır; oradan CreateDevice vtable'ı, oradan da
 *      gerçek cihaz yakalanır. Cihaz ele geçince Present/Reset kancalanır.
 *   2) Geç enjeksiyon — cihaz zaten kurulmuşsa vtable adreslerini okumak için
 *      tek kullanımlık bir kukla cihaz kurulur (DXGI yolundakiyle aynı fikir):
 *      D3D9 cihazları süreçte tek vtable paylaştığı için kuklanın vtable'ı
 *      oyunun cihazının da vtable'ıdır. Kukla, grafik iş parçacığında değilse
 *      PostMessage ile oyunun kendi iş parçacığında kurulur.
 *
 * OpenGL: bağlamı biz yaratmayız; oyunun wglSwapBuffers çağrısı anında bağlam
 * zaten bağlıdır ve hedef arka tampon çizime hazırdır. Bu yüzden IAT'te
 * wglSwapBuffers (ve GDI üzerinden giden eski oyunlar için gdi32!SwapBuffers)
 * yamalanır. wglGetProcAddress ile alınmış bir imleçten çağıran motorlar bu
 * yolla yakalanamaz; onlar için pencere katmanı yedeği devrede kalır.
 *
 * Vulkan ayrı bir mekanizma ister (örtük katman / VK_LAYER), bu dosyada değil.
 */
#include "katman.h"
#include <stdio.h>
#include <string.h>

/* dllmain.c */
extern kui g_ui;
extern katman_shm *g_shm;
extern volatile LONG g_active;

/* ---------------- D3D9 ---------------- */
typedef IDirect3D9 *(WINAPI *Direct3DCreate9_t)(UINT);
typedef HRESULT(WINAPI *Direct3DCreate9Ex_t)(UINT, IDirect3D9Ex **);
typedef HRESULT(STDMETHODCALLTYPE *D9CreateDevice_t)(IDirect3D9 *, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS *,
                                                      IDirect3DDevice9 **);
typedef HRESULT(STDMETHODCALLTYPE *D9Present_t)(IDirect3DDevice9 *, const RECT *, const RECT *, HWND, const RGNDATA *);
typedef HRESULT(STDMETHODCALLTYPE *D9Reset_t)(IDirect3DDevice9 *, D3DPRESENT_PARAMETERS *);

static Direct3DCreate9_t oD9Create9 = NULL;
static Direct3DCreate9Ex_t oD9Create9Ex = NULL;
static D9CreateDevice_t oD9CreateDevice = NULL;
static D9Present_t oD9Present = NULL;
static D9Reset_t oD9Reset = NULL;
static IDirect3DDevice9 *g_d9dev = NULL;
static kbackend *g_be9 = NULL;
static bool g_d9DevHooked = false;
static bool g_d9D3DHooked = false;
static bool g_d9Installed = false;
static LONG g_d9Depth = 0;

static void d9_drop_backend(void) {
  if (g_be9) {
    g_be9->destroy(g_be9);
    g_be9 = NULL;
  }
}

/* Oyunun penceresi: Present'in hedef penceresi yoksa shm'deki pencere. */
static HWND d9_window(HWND override) {
  if (override && IsWindow(override)) return override;
  if (g_shm && g_shm->gameHwnd) {
    HWND h = (HWND)(uintptr_t)g_shm->gameHwnd;
    if (IsWindow(h)) return h;
  }
  return kat_game_window();
}

static void d9_frame(IDirect3DDevice9 *dev, HWND hwndOverride) {
  if (!g_active || !g_shm || g_shm->quit || dxgi_backend_active()) return;
  HWND hwnd = d9_window(hwndOverride);
  if (!hwnd || !IsWindow(hwnd)) return;
  if (g_shm->gameHwnd && (uint64_t)(uintptr_t)hwnd != g_shm->gameHwnd) return; /* ara video vb. */
  if (IsIconic(hwnd)) return;
  if (!g_d9dev) {
    IDirect3DDevice9_AddRef(dev);
    g_d9dev = dev;
    if (shm_lock(g_shm)) {
      if (g_shm->status.state < 2) g_shm->status.state = 2;
      g_shm->status.pid = GetCurrentProcessId();
      g_shm->status.api = 1;
      snprintf(g_shm->status.message, sizeof g_shm->status.message, "D3D9 kancasi kuruldu");
      shm_unlock(g_shm);
    }
    ui_push_command(g_shm, KCMD_READY, "", 0, 0, "d3d9");
  }
  kat_hook_frame_measure();
  if (!g_be9) g_be9 = be_d3d9_create(dev);
  kat_render_into(g_be9, NULL, hwnd);
  if (shm_lock(g_shm)) {
    if (g_shm->status.state < 3) g_shm->status.state = 3;
    g_shm->status.api = 1;
    shm_unlock(g_shm);
  }
}

static HRESULT STDMETHODCALLTYPE hD9Present(IDirect3DDevice9 *dev, const RECT *src, const RECT *dst, HWND override,
                                            const RGNDATA *dirty) {
  if (!oD9Present) return E_FAIL;
  if (g_active && InterlockedIncrement(&g_d9Depth) == 1) {
    d9_frame(dev, override);
    InterlockedDecrement(&g_d9Depth);
  } else if (g_active)
    InterlockedDecrement(&g_d9Depth);
  return oD9Present(dev, src, dst, override, dirty);
}

static HRESULT STDMETHODCALLTYPE hD9Reset(IDirect3DDevice9 *dev, D3DPRESENT_PARAMETERS *pp) {
  if (!oD9Reset) return E_FAIL;
  d9_drop_backend(); /* cihaz sıfırlanırken kaynaklarımızı bırak (DEFAULT havuz) */
  HRESULT hr = oD9Reset(dev, pp);
  if (FAILED(hr)) KAT_LOG("D3D9 Reset basarisiz hr=0x%08lx", (unsigned long)hr);
  return hr;
}

static void d9_hook_device_vtable(IDirect3DDevice9 *dev) {
  if (!dev || g_d9DevHooked) return;
  void **vt = *(void ***)dev;
  if (!vt) return;
  int ip = VIDX(IDirect3DDevice9Vtbl, Present);
  int ir = VIDX(IDirect3DDevice9Vtbl, Reset);
  if (vt[ip] == (void *)hD9Present) {
    g_d9DevHooked = true;
    return;
  }
  oD9Present = (D9Present_t)vt_hook(dev, ip, (void *)hD9Present);
  oD9Reset = (D9Reset_t)vt_hook(dev, ir, (void *)hD9Reset);
  g_d9DevHooked = oD9Present != NULL;
  KAT_LOG("D3D9 cihaz vtable kancasi: Present=%d Reset=%d", oD9Present ? 1 : 0, oD9Reset ? 1 : 0);
}

static HRESULT STDMETHODCALLTYPE hD9CreateDevice(IDirect3D9 *d3d, UINT adapter, D3DDEVTYPE type, HWND hwnd, DWORD flags,
                                                 D3DPRESENT_PARAMETERS *pp, IDirect3DDevice9 **out) {
  if (!oD9CreateDevice) return E_FAIL;
  HRESULT hr = oD9CreateDevice(d3d, adapter, type, hwnd, flags, pp, out);
  if (SUCCEEDED(hr) && out && *out) {
    KAT_LOG("D3D9 CreateDevice yakalandi (hwnd=%p)", (void *)hwnd);
    d9_hook_device_vtable(*out);
  }
  return hr;
}

static void d9_hook_d3d_vtable(IDirect3D9 *d3d) {
  if (!d3d || g_d9D3DHooked) return;
  void **vt = *(void ***)d3d;
  if (!vt) return;
  int ic = VIDX(IDirect3D9Vtbl, CreateDevice);
  if (vt[ic] == (void *)hD9CreateDevice) {
    g_d9D3DHooked = true;
    return;
  }
  oD9CreateDevice = (D9CreateDevice_t)vt_hook(d3d, ic, (void *)hD9CreateDevice);
  g_d9D3DHooked = oD9CreateDevice != NULL;
}

static IDirect3D9 *WINAPI hDirect3DCreate9(UINT sdk) {
  IDirect3D9 *d3d = oD9Create9 ? oD9Create9(sdk) : NULL;
  if (d3d) d9_hook_d3d_vtable(d3d);
  return d3d;
}

static HRESULT WINAPI hDirect3DCreate9Ex(UINT sdk, IDirect3D9Ex **out) {
  if (!oD9Create9Ex) return E_FAIL;
  HRESULT hr = oD9Create9Ex(sdk, out);
  if (SUCCEEDED(hr) && out && *out) d9_hook_d3d_vtable((IDirect3D9 *)*out);
  return hr;
}

/* Kukla cihaz: yalnız vtable'ı okumak için. Oyunun kare iş parçacığında
 * kurulması gerektiğinden (COM/STA) WM_APP+0x52 ile istenir. */
#define WM_KATMAN_D9_KUKLA (WM_APP + 0x52)

static LRESULT CALLBACK d9_dummyWndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY) return 0;
  return DefWindowProcW(h, m, w, l);
}

static void d9_install_dummy(void) {
  if (g_d9DevHooked) return;
  if (kat_under_wine()) {
    /* Wine'da süreç içinde ikinci bir d3d9 cihazı kurmak wined3d'i
       kilitleyebiliyor; testlerde erken enjeksiyon yolu kullanılıyor. */
    KAT_LOG("D3D9 kukla cihaz Wine'da atlandi");
    return;
  }
  HMODULE d9 = GetModuleHandleW(L"d3d9.dll");
  if (!d9) d9 = LoadLibraryW(L"d3d9.dll");
  Direct3DCreate9_t pCreate = d9 ? (Direct3DCreate9_t)GetProcAddress(d9, "Direct3DCreate9") : NULL;
  if (!pCreate) {
    KAT_LOG("Direct3DCreate9 bulunamadi");
    return;
  }
  static WNDCLASSEXW wc;
  if (!wc.cbSize) {
    wc.cbSize = sizeof wc;
    wc.lpfnWndProc = d9_dummyWndProc;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = L"OyunKatmanD9Kukla";
    RegisterClassExW(&wc);
  }
  HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"", WS_OVERLAPPED, 0, 0, 16, 16, NULL, NULL, wc.hInstance, NULL);
  if (!hwnd) return;
  IDirect3D9 *d3d = pCreate(D3D_SDK_VERSION);
  if (!d3d) {
    DestroyWindow(hwnd);
    return;
  }
  D3DPRESENT_PARAMETERS pp;
  memset(&pp, 0, sizeof pp);
  pp.Windowed = TRUE;
  pp.SwapEffect = D3DSWAPEFFECT_DISCARD;
  pp.BackBufferCount = 1;
  pp.BackBufferWidth = 8;
  pp.BackBufferHeight = 8;
  pp.BackBufferFormat = D3DFMT_UNKNOWN;
  pp.PresentationInterval = D3DPRESENT_INTERVAL_IMMEDIATE;
  pp.hDeviceWindow = hwnd;
  IDirect3DDevice9 *dev = NULL;
  DWORD flagTry[3] = {D3DCREATE_HARDWARE_VERTEXPROCESSING, D3DCREATE_MIXED_VERTEXPROCESSING,
                      D3DCREATE_SOFTWARE_VERTEXPROCESSING};
  for (int i = 0; i < 3 && !dev; i++)
    IDirect3D9_CreateDevice(d3d, D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, hwnd, flagTry[i] | D3DCREATE_FPU_PRESERVE, &pp, &dev);
  if (dev) {
    d9_hook_device_vtable(dev);
    IDirect3DDevice9_Release(dev);
  } else
    KAT_LOG("D3D9 kukla cihaz kurulamadi");
  IDirect3D9_Release(d3d);
  DestroyWindow(hwnd);
}

/* ---------------- OpenGL ---------------- */
typedef BOOL(WINAPI *wglSwapBuffers_t)(HDC);
static wglSwapBuffers_t oWglSwap = NULL;
static BOOL(WINAPI *oGdiSwap)(HDC) = NULL;
static kbackend *g_begl = NULL;
static bool g_glInstalled = false;
static bool g_legacySkippedLogged = false;
static LONG g_glDepth = 0;

static void gl_frame(HDC hdc) {
  if (!g_active || !g_shm || g_shm->quit || dxgi_backend_active()) return;
  HWND hwnd = hdc ? WindowFromDC(hdc) : NULL;
  if (!hwnd || !IsWindow(hwnd)) hwnd = d9_window(NULL);
  if (!hwnd || !IsWindow(hwnd)) return;
  if (g_shm->gameHwnd && (uint64_t)(uintptr_t)hwnd != g_shm->gameHwnd) return;
  if (IsIconic(hwnd)) return;
  static bool announced = false;
  if (!announced) {
    announced = true;
    if (shm_lock(g_shm)) {
      if (g_shm->status.state < 2) g_shm->status.state = 2;
      g_shm->status.pid = GetCurrentProcessId();
      g_shm->status.api = 4;
      snprintf(g_shm->status.message, sizeof g_shm->status.message, "OpenGL kancasi kuruldu");
      shm_unlock(g_shm);
    }
    ui_push_command(g_shm, KCMD_READY, "", 0, 0, "opengl");
  }
  kat_hook_frame_measure();
  if (!g_begl) g_begl = be_gl_create();
  kat_render_into(g_begl, NULL, hwnd);
  if (shm_lock(g_shm)) {
    if (g_shm->status.state < 3) g_shm->status.state = 3;
    g_shm->status.api = 4;
    shm_unlock(g_shm);
  }
}

static BOOL WINAPI hWglSwapBuffers(HDC hdc) {
  if (g_active && InterlockedIncrement(&g_glDepth) == 1) {
    gl_frame(hdc);
    InterlockedDecrement(&g_glDepth);
  } else if (g_active)
    InterlockedDecrement(&g_glDepth);
  return oWglSwap ? oWglSwap(hdc) : FALSE;
}

static BOOL WINAPI hGdiSwapBuffers(HDC hdc) {
  /* Yalnız gerçekten bir GL bağlamı varsa çiz: aksi halde her GDI penceresi
     kendi SwapBuffers çağrısında katmanı görürdü. */
  if (g_active && oWglSwap && g_begl && InterlockedIncrement(&g_glDepth) == 1) {
    gl_frame(hdc);
    InterlockedDecrement(&g_glDepth);
  } else if (g_active && oWglSwap && g_begl)
    InterlockedDecrement(&g_glDepth);
  return oGdiSwap ? oGdiSwap(hdc) : FALSE;
}

/* ---------------- kurulum ---------------- */
bool legacy_install_hooks(void) {
  bool any = false;
  /* Oyun DXGI (D3D11/D3D12) kullanıyorsa eski API kancaları kurulmaz: aynı
     kareye iki ayrı arka uç çizemez ve Wine/wined3d gibi OpenGL üstünde
     çalışan D3D sarmalayıcılarında GL kancası yanlış bağlama çizer. */
  if (dxgi_runtime_loaded()) {
    if (!g_legacySkippedLogged) {
      g_legacySkippedLogged = true;
      KAT_LOG("oyun DXGI calisma zamani kullaniyor: D3D9/OpenGL kancalari kurulmuyor");
    }
    return false;
  }
  HMODULE d9 = GetModuleHandleW(L"d3d9.dll");
  if (d9 && !g_d9Installed) {
    /* Erken yol: oyun d3d9'u içe aktarmışsa fabrika fonksiyonları yamalanır. */
    iat_patch_all_loaded("d3d9.dll", "Direct3DCreate9", (void *)hDirect3DCreate9, (void **)&oD9Create9);
    iat_patch_all_loaded("d3d9.dll", "Direct3DCreate9Ex", (void *)hDirect3DCreate9Ex, (void **)&oD9Create9Ex);
    g_d9Installed = true;
    if (!g_d9DevHooked) {
      /* Geç yol: kukla cihazla vtable'ı oku. Oyunun iş parçacığında yapılması
         gerekiyorsa mesaj gönder (DXGI kuklasıyla aynı desen). */
      HWND target = kat_game_window();
      if (target && IsWindow(target)) PostMessageW(target, WM_KATMAN_D9_KUKLA, 0, 0);
      else
        d9_install_dummy();
    }
    any = g_d9DevHooked || oD9Create9 != NULL;
    KAT_LOG("D3D9 kurulumu: iat=%d vtable=%d", oD9Create9 ? 1 : 0, g_d9DevHooked ? 1 : 0);
  }
  HMODULE gl = GetModuleHandleW(L"opengl32.dll");
  if (gl && !g_glInstalled) {
    bool patched = iat_patch_all_loaded("opengl32.dll", "wglSwapBuffers", (void *)hWglSwapBuffers, (void **)&oWglSwap);
    if (!patched) {
      /* Oyun wglSwapBuffers'ı içe aktarmıyorsa GDI üzerinden gidiyor olabilir. */
      patched = iat_patch_all_loaded("gdi32.dll", "SwapBuffers", (void *)hGdiSwapBuffers, (void **)&oGdiSwap);
    }
    g_glInstalled = true;
    any = patched || any;
    KAT_LOG("OpenGL kurulumu: yama=%d", patched ? 1 : 0);
  }
  if (GetModuleHandleW(L"vulkan-1.dll"))
    KAT_LOG("vulkan-1.dll yuklu: Vulkan destegi bir sonraki surumde (ortuk katman gerekiyor)");
  return any;
}

void legacy_uninstall(void) {
  if (g_be9) {
    g_be9->destroy(g_be9);
    g_be9 = NULL;
  }
  if (g_begl) {
    g_begl->destroy(g_begl);
    g_begl = NULL;
  }
  if (g_d9dev) {
    IDirect3DDevice9_Release(g_d9dev);
    g_d9dev = NULL;
  }
}

/* Kukla cihaz isteği: dllmain.c'deki WndProc WM_APP+0x52 ile bunu çağırır,
 * böylece cihaz oyunun kendi iş parçacığında kurulur. */
void legacy_d9_dummy_request(void) { d9_install_dummy(); }
