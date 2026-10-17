/* DXGI kancaları: Present / Present1 / ResizeBuffers.
 * Kanca, arayüzün vtable'ı üzerinde yapılır (kod yamama yok): DXGI'nin
 * swapchain sınıfları süreçte tek bir vtable paylaştığı için, DLL oyun
 * başladıktan SONRA yüklense bile var olan swapchain'ler de yakalanır.
 * Aynı yerde D3D12'nin komut kuyruğu (ExecuteCommandLists) yakalanır:
 * DX12'de çizim, oyunun kendi kuyruğuna Present'ten hemen önce gönderilmelidir. */
#include "katman.h"
#include <stdio.h>
#include <stdlib.h>
#include <psapi.h>
#include <string.h>

typedef HRESULT(WINAPI *Present_t)(IDXGISwapChain *, UINT, UINT);
typedef HRESULT(WINAPI *Present1_t)(IDXGISwapChain1 *, UINT, UINT, const DXGI_PRESENT_PARAMETERS *);
typedef HRESULT(WINAPI *ResizeBuffers_t)(IDXGISwapChain *, UINT, UINT, UINT, DXGI_FORMAT, UINT);
typedef void(STDMETHODCALLTYPE *ExecLists_t)(ID3D12CommandQueue *, UINT, ID3D12CommandList *const *);
typedef HRESULT(WINAPI *CreateSwapChain_t)(IDXGIFactory *, IUnknown *, DXGI_SWAP_CHAIN_DESC *, IDXGISwapChain **);
typedef HRESULT(WINAPI *CreateSwapChainForHwnd_t)(IDXGIFactory2 *, IUnknown *, HWND, const DXGI_SWAP_CHAIN_DESC1 *,
                                                  const DXGI_SWAP_CHAIN_FULLSCREEN_DESC *, IDXGIOutput *,
                                                  IDXGISwapChain1 **);

/* Grafik DLL'lerini STATİK içe aktarmıyoruz: enjekte edilen bir DLL sürecin
 * modül listesini ve çalışma zamanı seçimini değiştirmemeli. Hepsi gerekince
 * yüklenir. */
typedef HRESULT(WINAPI *D3D11CreateDevice_t)(IDXGIAdapter *, D3D_DRIVER_TYPE, HMODULE, UINT, const D3D_FEATURE_LEVEL *,
                                             UINT, UINT, ID3D11Device **, D3D_FEATURE_LEVEL *, ID3D11DeviceContext **);
typedef HRESULT(WINAPI *D3D12CreateDevice_t)(IUnknown *, D3D_FEATURE_LEVEL, REFIID, void **);
typedef HRESULT(WINAPI *CreateDXGIFactory1_t)(UINT, REFIID, void **);
typedef HRESULT(WINAPI *CreateDXGIFactory2_t)(UINT, REFIID, void **);
static void *load_fn(const wchar_t *mod, const char *name) {
  HMODULE h = LoadLibraryW(mod);
  return h ? (void *)GetProcAddress(h, name) : NULL;
}

/* Enjeksiyondan ÖNCE yüklü olan modüller: oyunun gerçek çalışma zamanını
   söyler (kendi DLL'imizin çektiği DLL'ler değil). */
#define KAT_MOD_SNAP 160
static wchar_t g_snapNames[KAT_MOD_SNAP][40];
static int g_snapCount = 0;
void kat_snapshot_modules(void) {
  HMODULE mods[KAT_MOD_SNAP];
  DWORD needed = 0;
  if (!EnumProcessModules(GetCurrentProcess(), mods, sizeof mods, &needed)) return;
  int n = (int)(needed / sizeof(HMODULE));
  if (n > KAT_MOD_SNAP) n = KAT_MOD_SNAP;
  for (int i = 0; i < n; i++) {
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(mods[i], path, MAX_PATH)) continue;
    const wchar_t *base = wcsrchr(path, L'\\');
    base = base ? base + 1 : path;
    wcsncpy(g_snapNames[g_snapCount], base, 39);
    g_snapNames[g_snapCount][39] = 0;
    for (wchar_t *c = g_snapNames[g_snapCount]; *c; c++)
      if (*c >= L'A' && *c <= L'Z') *c += 32;
    g_snapCount++;
  }
}
static bool kat_was_loaded(const wchar_t *lower) {
  for (int i = 0; i < g_snapCount; i++)
    if (!wcscmp(g_snapNames[i], lower)) return true;
  return false;
}

/* ileri bildirimler */
static HRESULT STDMETHODCALLTYPE hPresent(IDXGISwapChain *, UINT, UINT);
static HRESULT STDMETHODCALLTYPE hPresent1(IDXGISwapChain1 *, UINT, UINT, const DXGI_PRESENT_PARAMETERS *);
static HRESULT STDMETHODCALLTYPE hResize(IDXGISwapChain *, UINT, UINT, UINT, DXGI_FORMAT, UINT);
static HRESULT STDMETHODCALLTYPE hCreateSwapChain(IDXGIFactory *, IUnknown *, DXGI_SWAP_CHAIN_DESC *, IDXGISwapChain **);
static HRESULT STDMETHODCALLTYPE hCreateSwapChainForHwnd(IDXGIFactory2 *, IUnknown *, HWND, const DXGI_SWAP_CHAIN_DESC1 *,
                                                         const DXGI_SWAP_CHAIN_FULLSCREEN_DESC *, IDXGIOutput *,
                                                         IDXGISwapChain1 **);

static Present_t oPresent = NULL;
static Present1_t oPresent1 = NULL;
static ResizeBuffers_t oResize = NULL;
static ExecLists_t oExec = NULL;

static void STDMETHODCALLTYPE hExecLists(ID3D12CommandQueue *q, UINT n, ID3D12CommandList *const *lists);

static ID3D11Device *g_dev11 = NULL;
static kbackend *g_backend = NULL;
static IDXGISwapChain *g_chain = NULL;
static ID3D12CommandQueue *g_queue = NULL;
static ID3D12Device *g_dx12dev = NULL;
static bool g_execHooked = false;
static bool g_installed = false;
static LONG g_presentDepth = 0;
static uint32_t g_failedFrames = 0;

/* dllmain.c */
extern kui g_ui;
extern katman_shm *g_shm;
extern volatile LONG g_active;
void kat_frame_begin(void);
void kat_frame_end(void);

/* ---------------- kare ölçümü (kancadan) ---------------- */
static uint64_t g_lastPresent = 0;
static double g_frameWindow[120];
static uint32_t g_frameWindowN = 0;
static uint64_t g_reportAt = 0;

static void frame_measure(void) {
  uint64_t now = kat_now_us();
  if (g_lastPresent) {
    double ms = (double)(now - g_lastPresent) / 1000.0;
    if (ms > 0 && ms < 10000) {
      if (g_frameWindowN < sizeof g_frameWindow / sizeof g_frameWindow[0]) g_frameWindow[g_frameWindowN++] = ms;
      else {
        memmove(g_frameWindow, g_frameWindow + 1, sizeof(double) * (g_frameWindowN - 1));
        g_frameWindow[g_frameWindowN - 1] = ms;
      }
    }
  }
  g_lastPresent = now;
  if (now < g_reportAt) return;
  g_reportAt = now + 1000000; /* saniyede bir bildir */
  if (!g_shm || g_frameWindowN < 4) return;
  double sum = 0, worst = 0;
  for (uint32_t i = 0; i < g_frameWindowN; i++) {
    sum += g_frameWindow[i];
    if (g_frameWindow[i] > worst) worst = g_frameWindow[i];
  }
  double avg = sum / (double)g_frameWindowN;
  double fps = avg > 0 ? 1000.0 / avg : 0;
  /* %1 en düşük: en yavaş karelerin ortalaması */
  double sorted[120];
  memcpy(sorted, g_frameWindow, sizeof(double) * g_frameWindowN);
  for (uint32_t i = 1; i < g_frameWindowN; i++) {
    double v = sorted[i];
    uint32_t j = i;
    while (j && sorted[j - 1] > v) {
      sorted[j] = sorted[j - 1];
      j--;
    }
    sorted[j] = v;
  }
  uint32_t take = (uint32_t)(g_frameWindowN / 100.0 * 1.0);
  if (!take) take = 1;
  if (take > g_frameWindowN) take = g_frameWindowN;
  double lowSum = 0;
  for (uint32_t i = 0; i < take; i++) lowSum += sorted[g_frameWindowN - 1 - i];
  double low1 = lowSum / (double)take;
  low1 = low1 > 0 ? 1000.0 / low1 : 0;
  (void)worst;
  if (shm_lock(g_shm)) {
    g_shm->status.fps = (float)fps;
    g_shm->status.frametimeMs = (float)avg;
    g_shm->status.low1 = (float)low1;
    g_shm->status.frames++;
    shm_unlock(g_shm);
  }
  ui_push_command(g_shm, KCMD_FPS, "", 0, (float)fps, NULL);
  g_frameWindowN = 0;
}

/* Diğer kancalar (D3D9 / OpenGL) aynı kare ölçümünü kullanır. */
void kat_hook_frame_measure(void) { frame_measure(); }

/* Oyun bizden ÖNCE bir DXGI çalışma zamanı yüklediyse oyun D3D11/D3D12'dir:
   D3D9/OpenGL kancaları kurulmaz. (Wine'da wined3d OpenGL üstünde çalıştığı
   için opengl32 her zaman yüklüdür; bu kural olmadan GL kancası wined3d'in
   kendi bağlamına çizmeye kalkardı.) */
bool dxgi_runtime_loaded(void) {
  return kat_was_loaded(L"dxgi.dll") || kat_was_loaded(L"d3d11.dll") || kat_was_loaded(L"d3d12.dll");
}

bool dxgi_backend_active(void) { return g_backend != NULL; }

bool kat_under_wine(void) {
  HMODULE nt = GetModuleHandleW(L"ntdll.dll");
  return nt && GetProcAddress(nt, "wine_get_version") != NULL;
}

/* ---------------- arka uç kurulumu ---------------- */
static bool setup_backend(IDXGISwapChain *sc, HWND hwnd) {
  ID3D11Device *dev11 = NULL;
  ID3D11DeviceContext *ctx11 = NULL;
  HRESULT hr = IDXGISwapChain_GetDevice(sc, &IID_ID3D11Device, (void **)&dev11);
  if (SUCCEEDED(hr) && dev11) {
    if (g_dev11) { ID3D11Device_Release(g_dev11); g_dev11 = NULL; }
    g_dev11 = dev11;
    ID3D11Device_AddRef(dev11);
    ID3D11Device_GetImmediateContext(dev11, &ctx11);
    hr = ctx11 ? S_OK : E_FAIL;
    if (SUCCEEDED(hr) && ctx11) {
      g_backend = be_d3d11_create(dev11, ctx11);
      ID3D11DeviceContext_Release(ctx11);
    }
    ID3D11Device_Release(dev11);
    if (g_backend) {
      KAT_LOG("D3D11 bulundu (hwnd=%p)", (void *)hwnd);
      return true;
    }
  }
  /* D3D12: kuyruk gerekli; önce ExecuteCommandLists kancası kurulur */
  ID3D12Device *dev12 = NULL;
  hr = IDXGISwapChain_GetDevice(sc, &IID_ID3D12Device, (void **)&dev12);
  if (SUCCEEDED(hr) && dev12) {
    if (!g_execHooked) {
      D3D12_COMMAND_QUEUE_DESC qd;
      memset(&qd, 0, sizeof qd);
      qd.Type = D3D12_COMMAND_LIST_TYPE_COPY; /* yalnız vtable'ı okumak için */
      qd.Flags = D3D12_COMMAND_QUEUE_FLAG_NONE;
      ID3D12CommandQueue *tmp = NULL;
      if (SUCCEEDED(ID3D12Device_CreateCommandQueue(dev12, &qd, &IID_ID3D12CommandQueue, (void **)&tmp)) && tmp) {
        oExec = (ExecLists_t)vt_hook(tmp, VIDX(ID3D12CommandQueueVtbl, ExecuteCommandLists), (void *)hExecLists);
        ID3D12CommandQueue_Release(tmp);
        g_execHooked = true;
        KAT_LOG("D3D12 bulundu, ExecuteCommandLists kancası kuruldu (hwnd=%p)", (void *)hwnd);
      } else
        KAT_LOG("D3D12 geçici kuyruk oluşturulamadı hr=0x%08lx", (unsigned long)hr);
    }
    if (g_dx12dev) { ID3D12Device_Release(g_dx12dev); g_dx12dev = NULL; }
    g_dx12dev = dev12; /* referans bizde kalır */
    if (g_queue) {
      g_backend = be_d3d12_create(g_dx12dev, g_queue);
      if (g_backend) KAT_LOG("D3D12 arka ucu hazır");
    }
    return g_backend != NULL;
  }
  KAT_LOG("swapchain cihazı tanınmadı (D3D11/D3D12 değil)");
  return false;
}

/* ---------------- Present gövdesi ---------------- */
static void draw_into(IDXGISwapChain *sc, HWND hwnd) {
  if (!g_backend) {
    if (!setup_backend(sc, hwnd)) return;
    if (!g_backend) return; /* D3D12'de kuyruk bekleniyor */
  }
  RECT rc;
  if (!GetClientRect(hwnd, &rc)) return;
  int w = rc.right - rc.left, h = rc.bottom - rc.top;
  if (w < 32 || h < 32) return;
  g_ui.vpW = w;
  g_ui.vpH = h;
  kat_frame_begin(); /* girdi + shm okuma + çizim listesi */
  if (!g_ui.draw.count) {
    kat_frame_end();
    return;
  }
  bool drew = false;
  if (g_backend->api == 2) { /* D3D11 */
    ID3D11Texture2D *bb = NULL;
    HRESULT hrBb = IDXGISwapChain_GetBuffer(sc, 0, &IID_ID3D11Texture2D, (void **)&bb);
    if (SUCCEEDED(hrBb) && bb) {
      ID3D11Device *dev = g_dev11;
      ID3D11RenderTargetView *rtv = NULL;
      HRESULT hrRtv = dev ? ID3D11Device_CreateRenderTargetView(dev, (ID3D11Resource *)bb, NULL, &rtv) : E_FAIL;
      if (SUCCEEDED(hrRtv) && rtv) {
        if (g_backend->begin(g_backend, rtv, w, h)) {
          drew = g_backend->draw(g_backend, &g_ui.draw, &g_ui.font);
          g_backend->end(g_backend);
        } else
          KAT_LOG("d3d11 begin reddetti");
        ID3D11RenderTargetView_Release(rtv);
      } else
        KAT_LOG("RTV olusturulamadi dev=%p hr=0x%08lx", (void *)dev, (unsigned long)hrRtv);
      ID3D11Texture2D_Release(bb);
    } else
      KAT_LOG("arka tampon alinamadi hr=0x%08lx", (unsigned long)hrBb);
  } else if (g_backend->api == 3) { /* D3D12 */
    ID3D12Resource *bb = NULL;
    if (SUCCEEDED(IDXGISwapChain_GetBuffer(sc, 0, &IID_ID3D12Resource, (void **)&bb)) && bb) {
      if (g_backend->begin(g_backend, bb, w, h)) {
        drew = g_backend->draw(g_backend, &g_ui.draw, &g_ui.font);
        g_backend->end(g_backend);
      }
      ID3D12Resource_Release(bb);
    }
  }
  /* Tanı günlüğü: oyunun kare iş parçacığında dosyaya yazmak pahalıdır, bu
     yüzden ilk 3 kare ve sonra dakikada bir. */
  static uint64_t lastDiag = 0;
  static int diagCount = 0;
  uint64_t nowUs = kat_now_us();
  if (diagCount < 3 || nowUs - lastDiag > 60000000) {
    lastDiag = nowUs;
    diagCount++;
    KAT_LOG("tani: vp=%dx%d verts=%u drew=%d backend=%s mode=%u metrics=%u", w, h, g_ui.draw.count, drew ? 1 : 0,
            g_backend ? g_backend->name : "yok", g_shm->mode, g_shm->metricCount);
  }
  if (drew && shm_lock(g_shm)) {
    g_shm->status.drawnFrames++;
    g_shm->status.drawnVerts = g_ui.draw.count;
    shm_unlock(g_shm);
  }
  kat_frame_end();
}

static void present_body(IDXGISwapChain *sc);

static void present_common(IDXGISwapChain *sc) {
  if (!g_active || !sc) return;
  if (InterlockedIncrement(&g_presentDepth) != 1) {
    InterlockedDecrement(&g_presentDepth);
    return;
  }
  /* mingw, MSVC'nin __try/__except söz dizimini desteklemediği için burada
     yapılandırılmış dışlama yok; bunun yerine her çağrı doğrulanır, hata
     sayaçları tutulur ve katman tek komutla (shm->quit) sökülebilir. */
  present_body(sc);
  InterlockedDecrement(&g_presentDepth);
}

static void present_body(IDXGISwapChain *sc) {
  {
    if (!g_shm || g_shm->quit) {
      return;
    }
    HWND hwnd = NULL;
    IDXGISwapChain1 *sc1 = NULL;
    if (SUCCEEDED(IDXGISwapChain_QueryInterface(sc, &IID_IDXGISwapChain1, (void **)&sc1)) && sc1) {
      IDXGISwapChain1_GetHwnd(sc1, &hwnd);
      IDXGISwapChain1_Release(sc1);
    }
    if (!hwnd) {
      DXGI_SWAP_CHAIN_DESC sd;
      memset(&sd, 0, sizeof sd);
      if (SUCCEEDED(IDXGISwapChain_GetDesc(sc, &sd))) hwnd = sd.OutputWindow;
    }
    if (!hwnd) {
      return;
    }
    if (g_shm->gameHwnd && (uint64_t)(uintptr_t)hwnd != g_shm->gameHwnd) {
      /* başka bir pencere (ör. ara video, başlatıcı): çizme */
      return;
    }
    if (IsIconic(hwnd)) {
      return;
    }
    if (!g_chain) {
      g_chain = sc;
      if (shm_lock(g_shm)) {
        g_shm->status.state = 2;
        g_shm->status.pid = GetCurrentProcessId();
        snprintf(g_shm->status.message, sizeof g_shm->status.message, "Kanca kuruldu");
        shm_unlock(g_shm);
      }
      ui_push_command(g_shm, KCMD_READY, "", 0, 0, "dxgi");
    }
    frame_measure();
    draw_into(sc, hwnd);
    if (shm_lock(g_shm)) {
      if (g_shm->status.state < 3) g_shm->status.state = 3;
      g_shm->status.api = g_backend ? g_backend->api : 0;
      shm_unlock(g_shm);
    }
    g_failedFrames = 0;
  }
}

static HRESULT STDMETHODCALLTYPE hPresent(IDXGISwapChain *sc, UINT sync, UINT flags) {
  present_common(sc);
  return oPresent(sc, sync, flags);
}

static HRESULT STDMETHODCALLTYPE hPresent1(IDXGISwapChain1 *sc1, UINT sync, UINT flags,
                                           const DXGI_PRESENT_PARAMETERS *params) {
  present_common((IDXGISwapChain *)sc1);
  return oPresent1(sc1, sync, flags, params);
}

/* ---------------- fabrika düzeyi kanca ----------------
 * Kukla cihaz kurmadan da çalışır: oyun swapchain'ini SONRADAN kurarsa
 * (enjeksiyon erken yapıldıysa) buradan yakalanır. */
typedef HRESULT(WINAPI *CreateFactory0_t)(REFIID, void **);
typedef HRESULT(WINAPI *CreateFactory1_t)(UINT, REFIID, void **);
typedef HRESULT(WINAPI *CreateFactory2_t)(UINT, REFIID, void **);
static CreateFactory0_t oFactory0;
static CreateFactory1_t oFactory1;
static CreateFactory2_t oFactory2;
static bool g_factoryHooked = false;
static bool g_dummyDone = false;

static void hook_swapchain(IDXGISwapChain *sc) {
  if (!sc || g_chain == sc) return;
  KAT_LOG("swapchain yakalandi: %p", (void *)sc);
  if (!oPresent) {
    oPresent = (Present_t)vt_hook(sc, VIDX(IDXGISwapChainVtbl, Present), (void *)hPresent);
    oResize = (ResizeBuffers_t)vt_hook(sc, VIDX(IDXGISwapChainVtbl, ResizeBuffers), (void *)hResize);
  }
  IDXGISwapChain1 *sc1 = NULL;
  if (!oPresent1 && SUCCEEDED(IDXGISwapChain_QueryInterface(sc, &IID_IDXGISwapChain1, (void **)&sc1)) && sc1) {
    oPresent1 = (Present1_t)vt_hook(sc1, VIDX(IDXGISwapChain1Vtbl, Present1), (void *)hPresent1);
    IDXGISwapChain1_Release(sc1);
  }
  g_installed = oPresent != NULL;
}

static CreateSwapChain_t oFactory_cs;
static CreateSwapChainForHwnd_t oFactory_csHwnd;

/* Oyunun ELİNDEKİ arayüz işaretçisinin vtable'ı yamalanır: bazı ortamlar
 * QueryInterface'te ayrı nesne döndürebildiği için kendi QueryInterface'imizin
 * sonucu yerine doğrudan oyunun aldığı işaretçi kullanılır. IDXGIFactory2/3/4
 * vtable düzeni CreateSwapChainForHwnd'a kadar aynıdır. */
static void hook_factory(void *f, int level) {
  if (!f) return;
  if (!g_factoryHooked) {
    g_factoryHooked = true;
    KAT_LOG("fabrika vtable yamalaniyor (seviye=%d)", level);
  }
  void *o0 = vt_hook(f, VIDX(IDXGIFactoryVtbl, CreateSwapChain), (void *)hCreateSwapChain);
  if (o0 && !oFactory_cs) oFactory_cs = (CreateSwapChain_t)o0;
  if (level >= 2) {
    void *o2 = vt_hook(f, VIDX(IDXGIFactory2Vtbl, CreateSwapChainForHwnd), (void *)hCreateSwapChainForHwnd);
    if (o2 && !oFactory_csHwnd) oFactory_csHwnd = (CreateSwapChainForHwnd_t)o2;
  }
}

static HRESULT STDMETHODCALLTYPE hCreateSwapChain(IDXGIFactory *f, IUnknown *dev, DXGI_SWAP_CHAIN_DESC *desc,
                                                  IDXGISwapChain **out) {
  HRESULT hr = oFactory_cs(f, dev, desc, out);
  if (SUCCEEDED(hr) && out) hook_swapchain(*out);
  return hr;
}

static HRESULT STDMETHODCALLTYPE hCreateSwapChainForHwnd(IDXGIFactory2 *f, IUnknown *dev, HWND hwnd,
                                                         const DXGI_SWAP_CHAIN_DESC1 *desc,
                                                         const DXGI_SWAP_CHAIN_FULLSCREEN_DESC *fs, IDXGIOutput *out,
                                                         IDXGISwapChain1 **sc) {
  HRESULT hr = oFactory_csHwnd(f, dev, hwnd, desc, fs, out, sc);
  KAT_LOG("CreateSwapChainForHwnd cagrildi hr=0x%08lx", (unsigned long)hr);
  if (SUCCEEDED(hr) && sc) hook_swapchain((IDXGISwapChain *)*sc);
  return hr;
}

static HRESULT STDMETHODCALLTYPE hFactory0(REFIID riid, void **out) {
  HRESULT hr = oFactory0(riid, out);
  if (SUCCEEDED(hr) && out) hook_factory(*out, 0);
  return hr;
}
static HRESULT STDMETHODCALLTYPE hFactory1(UINT flags, REFIID riid, void **out) {
  HRESULT hr = oFactory1(flags, riid, out);
  if (SUCCEEDED(hr) && out) hook_factory(*out, 1);
  return hr;
}
static HRESULT STDMETHODCALLTYPE hFactory2(UINT flags, REFIID riid, void **out) {
  HRESULT hr = oFactory2(flags, riid, out);
  KAT_LOG("CreateDXGIFactory2 cagrildi hr=0x%08lx", (unsigned long)hr);
  if (SUCCEEDED(hr) && out) hook_factory(*out, 2);
  return hr;
}

static bool g_iatDone = false;
static void install_factory_hooks(void) {
  if (g_iatDone) return;
  g_iatDone = true;
  iat_patch_all_loaded("dxgi.dll", "CreateDXGIFactory", (void *)hFactory0, (void **)&oFactory0);
  iat_patch_all_loaded("dxgi.dll", "CreateDXGIFactory1", (void *)hFactory1, (void **)&oFactory1);
  iat_patch_all_loaded("dxgi.dll", "CreateDXGIFactory2", (void *)hFactory2, (void **)&oFactory2);
  KAT_LOG("fabrika kancalari kuruldu (0=%p 1=%p 2=%p)", (void *)oFactory0, (void *)oFactory1, (void *)oFactory2);
}

static HRESULT STDMETHODCALLTYPE hResize(IDXGISwapChain *sc, UINT count, UINT w, UINT h, DXGI_FORMAT fmt, UINT flags) {
  if (sc == g_chain) {
    KAT_LOG("ResizeBuffers %ux%u", w, h);
    if (g_backend && g_backend->api == 3) {
      /* D3D12 arka ucu arka tampon görünümlerini tutuyor: yeniden kurulsun */
      kbackend *old = g_backend;
      g_backend = NULL;
      if (old) old->destroy(old);
      if (g_queue && g_dx12dev) g_backend = be_d3d12_create(g_dx12dev, g_queue);
    }
    g_lastPresent = 0;
    g_frameWindowN = 0;
  }
  return oResize(sc, count, w, h, fmt, flags);
}

static void STDMETHODCALLTYPE hExecLists(ID3D12CommandQueue *q, UINT n, ID3D12CommandList *const *lists) {
  if (!g_queue && q) {
    D3D12_COMMAND_QUEUE_DESC d = ID3D12CommandQueue_GetDesc(q);
    if (d.Type == D3D12_COMMAND_LIST_TYPE_DIRECT) {
      ID3D12CommandQueue_AddRef(q);
      g_queue = q;
      KAT_LOG("D3D12 doğrudan kuyruk yakalandı");
    }
  }
  oExec(q, n, lists);
}

/* ---------------- kurulum ---------------- */
static LRESULT CALLBACK dummyWndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY) return 0;
  return DefWindowProcW(h, m, w, l);
}

/* Kukla cihaz: yalnız vtable adreslerini okumak için kurulur ve hemen
 * bırakılır. Oyunun kullandığı çalışma zamanıyla AYNI tür seçilir: D3D12
 * oyunlarında D3D11 kukla cihazı kurmak (Wine/vkd3d gibi ortamlarda) kilitlenmeye
 * yol açabiliyor, gerçek sürücülerde de gereksiz bir ikinci bağlam yaratıyor. */
static IDXGISwapChain *make_d3d11_dummy(HWND hwnd) {
  ID3D11Device *dev = NULL;
  ID3D11DeviceContext *ctx = NULL;
#ifdef KATMAN_TEST_D3D11
  /* Test derlemesi: wined3d'in süreç başında yüklenmiş olmasını garantiler ve
     kukla cihazı statik bağlar (Wine'ın geç yükleme kilitlemesi testi etkilemez). */
  D3D11CreateDevice_t pCreate = D3D11CreateDevice;
#else
  D3D11CreateDevice_t pCreate = (D3D11CreateDevice_t)load_fn(L"d3d11.dll", "D3D11CreateDevice");
  if (!pCreate) {
    KAT_LOG("d3d11.dll yuklenemedi");
    return NULL;
  }
#endif
  HRESULT hr = pCreate(NULL, D3D_DRIVER_TYPE_HARDWARE, NULL, 0, NULL, 0, D3D11_SDK_VERSION, &dev, NULL, &ctx);
  if (FAILED(hr)) hr = pCreate(NULL, D3D_DRIVER_TYPE_WARP, NULL, 0, NULL, 0, D3D11_SDK_VERSION, &dev, NULL, &ctx);
  if (FAILED(hr) || !dev) {
    KAT_LOG("kukla D3D11 cihazı kurulamadi hr=0x%08lx", (unsigned long)hr);
    return NULL;
  }
  IDXGIFactory *factory = NULL;
  IDXGISwapChain *sc = NULL;
    CreateDXGIFactory1_t pF1 = (CreateDXGIFactory1_t)load_fn(L"dxgi.dll", "CreateDXGIFactory1");
  if (pF1 && SUCCEEDED(pF1(0, &IID_IDXGIFactory, (void **)&factory)) && factory) {
    DXGI_SWAP_CHAIN_DESC sd;
    memset(&sd, 0, sizeof sd);
    sd.BufferCount = 1;
    sd.BufferDesc.Width = 8;
    sd.BufferDesc.Height = 8;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = hwnd;
    sd.SampleDesc.Count = 1;
    sd.Windowed = TRUE;
    sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
    if (FAILED(IDXGIFactory_CreateSwapChain(factory, (IUnknown *)dev, &sd, &sc))) sc = NULL;
  }
  if (factory) IDXGIFactory_Release(factory);
  if (ctx) ID3D11DeviceContext_Release(ctx);
  ID3D11Device_Release(dev);
  return sc;
}

static IDXGISwapChain *make_d3d12_dummy(HWND hwnd) {
  ID3D12Device *dev = NULL;
    D3D12CreateDevice_t pCreate12 = (D3D12CreateDevice_t)load_fn(L"d3d12.dll", "D3D12CreateDevice");
  if (!pCreate12) {
    KAT_LOG("d3d12.dll yuklenemedi");
    return NULL;
  }
  HRESULT hr = pCreate12(NULL, D3D_FEATURE_LEVEL_11_0, &IID_ID3D12Device, (void **)&dev);
  if (FAILED(hr) || !dev) {
    KAT_LOG("kukla D3D12 cihazı kurulamadi hr=0x%08lx", (unsigned long)hr);
    return NULL;
  }
  D3D12_COMMAND_QUEUE_DESC qd;
  memset(&qd, 0, sizeof qd);
  qd.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
  ID3D12CommandQueue *q = NULL;
  ID3D12Device_CreateCommandQueue(dev, &qd, &IID_ID3D12CommandQueue, (void **)&q);
  IDXGISwapChain1 *sc1 = NULL;
  if (q) {
    IDXGIFactory2 *factory = NULL;
        CreateDXGIFactory2_t pF2 = (CreateDXGIFactory2_t)load_fn(L"dxgi.dll", "CreateDXGIFactory2");
    if (pF2 && SUCCEEDED(pF2(0, &IID_IDXGIFactory2, (void **)&factory)) && factory) {
      DXGI_SWAP_CHAIN_DESC1 sd;
      memset(&sd, 0, sizeof sd);
      sd.BufferCount = 2;
      sd.Width = 8;
      sd.Height = 8;
      sd.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
      sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
      sd.SampleDesc.Count = 1;
      sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
      if (FAILED(IDXGIFactory2_CreateSwapChainForHwnd(factory, (IUnknown *)q, hwnd, &sd, NULL, NULL, &sc1))) sc1 = NULL;
    }
    if (factory) IDXGIFactory2_Release(factory);
  }
  if (q) ID3D12CommandQueue_Release(q);
  ID3D12Device_Release(dev);
  return (IDXGISwapChain *)sc1;
}

#define WM_KATMAN_KUKLA (WM_APP + 0x51)

/* Oyunun ana iş parçacığından çağrılır (WndProc içinden). */
bool kat_under_wine(void);
static bool running_under_wine(void) {
  static int cached = -1;
  if (cached < 0) {
    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    cached = (ntdll && GetProcAddress(ntdll, "wine_get_version")) ? 1 : 0;
  }
  return cached == 1;
}

void dxgi_install_dummy_for_runtime(void) {
  if (g_dummyDone || g_chain) return;
#ifndef KATMAN_TEST_D3D11
  if (running_under_wine()) {
    /* Wine/vkd3d+wined3d aynı süreçte ikinci bir grafik cihazı kurulumunu
       kilitleyebiliyor; gerçek Windows'ta bu yol standart ve güvenlidir. */
    KAT_LOG("wine algilandi: kukla cihaz yolu atlandi");
    g_dummyDone = true;
    return;
  }
#endif
  WNDCLASSW wc;
  memset(&wc, 0, sizeof wc);
  wc.lpfnWndProc = dummyWndProc;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"OyunSiralayiciKatmanDummy";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"", WS_POPUP, 0, 0, 8, 8, NULL, NULL, wc.hInstance, NULL);
  if (!hwnd) return;
  IDXGISwapChain *sc = GetModuleHandleW(L"d3d12.dll") ? make_d3d12_dummy(hwnd) : make_d3d11_dummy(hwnd);
  g_dummyDone = sc != NULL;
  if (sc) {
    hook_swapchain(sc);
    KAT_LOG("kukla kanca kuruldu (ana is parcacigi, Present=%p)", (void *)oPresent);
    IDXGISwapChain_Release(sc);
    g_installed = oPresent != NULL;
  }
  DestroyWindow(hwnd);
  UnregisterClassW(wc.lpszClassName, wc.hInstance);
}

bool dxgi_install_hooks(HWND gameWnd) {
  if (g_installed) return true;
  WNDCLASSW wc;
  memset(&wc, 0, sizeof wc);
  wc.lpfnWndProc = dummyWndProc;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"OyunSiralayiciKatmanDummy";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"", WS_POPUP, 0, 0, 8, 8, NULL, NULL, wc.hInstance, NULL);
  if (!hwnd) {
    KAT_LOG("geçici pencere oluşturulamadı");
    return false;
  }
  install_factory_hooks();
  bool ok = oFactory1 != NULL || oFactory2 != NULL || g_factoryHooked;
  /* Oyun zaten bir grafik API'si yüklediyse swapchain'i de vardır: kukla cihazla
     vtable okunur. Grafik DLL'i henüz yoksa fabrika kancası ilk swapchain'i
     yakalar; kukla cihaz kurulmaz (gereksiz ve bazı ortamlarda riskli). */
  /* D3D11 yüklüyse kukla cihaz hemen kurulabilir (aynı çalışma zamanı, güvenli).
     D3D12 için kukla kurulum, oyunun kendi cihazını kurmasıyla çakışabildiğinden
     iş parçacığına ertelenir (dxgi_retry_dummy); fabrika kancası zaten erken
     enjeksiyonda ilk swapchain'i yakalar. */
  if (kat_was_loaded(L"d3d11.dll") || kat_was_loaded(L"d3d12.dll")) {
#ifdef KATMAN_TEST_D3D11
    KAT_LOG("test derlemesi: kukla cihaz simdiki is parcaciginda");
    dxgi_install_dummy_for_runtime();
#else
    /* Geç enjeksiyon: kukla cihazı oyunun ana iş parçacığı kurdurur. */
    KAT_LOG("gec enjeksiyon: kukla kanca ana is parcacigina istendi");
    if (gameWnd) PostMessageW(gameWnd, WM_KATMAN_KUKLA, 0, 0);
#endif
  } else
    KAT_LOG("grafik DLL'i henüz yuklu degil: fabrika kancasi bekleyecek");
  DestroyWindow(hwnd);
  UnregisterClassW(wc.lpszClassName, wc.hInstance);
  g_installed = ok;
  return ok;
}

/* Grafik DLL'i sonradan yüklendiyse kukla kurulumu ana iş parçacığına istenir. */
void dxgi_request_dummy(HWND gameWnd) {
  if (g_dummyDone || g_chain || g_installed) return;
  if (!GetModuleHandleW(L"d3d12.dll") && !GetModuleHandleW(L"d3d11.dll")) return;
  if (gameWnd) PostMessageW(gameWnd, WM_KATMAN_KUKLA, 0, 0);
}

void dxgi_uninstall(void) {
  if (!g_installed) return;
  /* vtable'ları geri almak için orijinal adresler yeterli */
  g_installed = false;
  if (g_backend) {
    g_backend->destroy(g_backend);
    g_backend = NULL;
  }
  if (g_queue) {
    ID3D12CommandQueue_Release(g_queue);
    g_queue = NULL;
  }
  if (g_dx12dev) {
    ID3D12Device_Release(g_dx12dev);
    g_dx12dev = NULL;
  }
}
