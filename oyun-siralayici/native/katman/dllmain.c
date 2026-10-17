/* Katman DLL girişi: yükleme, kanca kurulumu, girdi toplama, sökülme.
 *
 * Oyunun sürecinde çalışıyoruz; iki kural her şeyin önünde:
 *  1) Oyunun kare sunumunu (Present) asla bekletme — çizim bütçesi ~1 ms.
 *  2) Kendi hatamız oyunu çökertmesin: çizim 64 bit derlemede SEH ile sarılı,
 *     5 ardışık hatada katman kendini kapatır ve uygulamaya bildirir. */
#include "katman.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

kui g_ui;
katman_shm *g_shm = NULL;
volatile LONG g_active = 0;

static HMODULE g_self = NULL;
static HANDLE g_thread = NULL;
static HWND g_gameWnd = NULL;
static WNDPROC g_origWndProc = NULL;
static volatile LONG g_wheel = 0;
static volatile LONG g_typedLen = 0;
static char g_typed[24];
static volatile LONG g_keyVk = 0;
static bool g_tabWasDown = false;
static bool g_escWasDown = false;
static bool g_lWasDown = false;
static uint32_t g_lastLegacyScan = 0;

typedef struct {
  DWORD pid;
  HWND best;
  long area;
} findCtx;

static BOOL CALLBACK find_largest_window(HWND h, LPARAM lp) {
  findCtx *c = (findCtx *)lp;
  DWORD p = 0;
  GetWindowThreadProcessId(h, &p);
  if (p != c->pid || !IsWindowVisible(h)) return TRUE;
  RECT r;
  GetClientRect(h, &r);
  long a = (r.right - r.left) * (r.bottom - r.top);
  if (a > c->area) {
    c->area = a;
    c->best = h;
  }
  return TRUE;
}

/* ---------------- WndProc alt sınıflandırması ----------------
 * Panel açıkken fare/klavye iletileri oyuna İLETİLMEZ (Steam'in yaptığı gibi);
 * kapalıyken her şey aynen geçer, yalnız tekerlek ve karakterler dinlenir. */
static LRESULT CALLBACK kat_wndproc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
  bool panelOpen = g_shm && g_shm->panelOpen && g_active;
  switch (msg) {
  case WM_MOUSEWHEEL: {
    int delta = GET_WHEEL_DELTA_WPARAM(wp);
    InterlockedExchangeAdd(&g_wheel, (LONG)delta);
    if (panelOpen) return 0;
    break;
  }
  case WM_CHAR: {
    if (panelOpen) {
      LONG len = g_typedLen;
      if (len < (LONG)sizeof g_typed - 8) {
        int n = WideCharToMultiByte(CP_UTF8, 0, (LPCWSTR)&wp, 1, g_typed + len, (int)sizeof g_typed - len - 1, NULL, NULL);
        if (n > 0) {
          g_typed[len + n] = 0;
          InterlockedExchange(&g_typedLen, len + n);
        }
      }
      return 0;
    }
    break;
  }
  case WM_KEYDOWN:
  case WM_SYSKEYDOWN:
    if (panelOpen) {
      InterlockedExchange(&g_keyVk, (LONG)wp);
      if (wp == VK_ESCAPE || wp == VK_TAB || wp == VK_RETURN || wp == VK_UP || wp == VK_DOWN || wp == VK_LEFT ||
          wp == VK_RIGHT || wp == VK_BACK)
        return 0;
    }
    break;
  case WM_LBUTTONDOWN:
  case WM_LBUTTONUP:
  case WM_RBUTTONDOWN:
  case WM_RBUTTONUP:
  case WM_MBUTTONDOWN:
  case WM_MBUTTONUP:
  case WM_MOUSEMOVE:
    if (panelOpen) return 0;
    break;
  case WM_NCDESTROY:
    g_gameWnd = NULL;
    break;
  case WM_APP + 0x51: /* kukla cihaz: grafik API'sinin kendi iş parçacığında */
    dxgi_install_dummy_for_runtime();
    return 0;
  case WM_APP + 0x52: /* D3D9 kukla cihazı: oyunun iş parçacığında */
    legacy_d9_dummy_request();
    return 0;
  default:
    break;
  }
  return g_origWndProc ? CallWindowProcW(g_origWndProc, h, msg, wp, lp) : DefWindowProcW(h, msg, wp, lp);
}

static void subclass_game_window(void) {
  if (g_origWndProc || !g_shm) return;
  HWND hwnd = NULL;
  if (g_shm->gameHwnd) hwnd = (HWND)(uintptr_t)g_shm->gameHwnd;
  if (!hwnd) {
    /* sürecin en büyük görünür penceresi */
    findCtx ctx;
    ctx.pid = GetCurrentProcessId();
    ctx.best = NULL;
    ctx.area = 0;
    EnumWindows(find_largest_window, (LPARAM)&ctx);
    hwnd = ctx.best;
  }
  if (!hwnd || !IsWindow(hwnd)) return;
  g_gameWnd = hwnd;
  g_origWndProc = (WNDPROC)SetWindowLongPtrW(hwnd, GWLP_WNDPROC, (LONG_PTR)kat_wndproc);
  if (!g_origWndProc) KAT_LOG("WndProc alt sınıflandırması kurulamadı (%lu)", GetLastError());
  else
    KAT_LOG("WndProc bağlandı (hwnd=%p)", (void *)hwnd);
}

static void unsubclass(void) {
  if (g_gameWnd && g_origWndProc) {
    WNDPROC cur = (WNDPROC)GetWindowLongPtrW(g_gameWnd, GWLP_WNDPROC);
    if (cur == kat_wndproc) SetWindowLongPtrW(g_gameWnd, GWLP_WNDPROC, (LONG_PTR)g_origWndProc);
  }
  g_origWndProc = NULL;
  g_gameWnd = NULL;
}

/* ---------------- kare öncesi/sonrası ---------------- */
void kat_frame_begin(void) {
  kui *u = &g_ui;
  memset(&u->in, 0, sizeof u->in);
  /* fare */
  POINT p;
  if (GetCursorPos(&p) && g_gameWnd && ScreenToClient(g_gameWnd, &p)) {
    u->in.mx = (float)p.x;
    u->in.my = (float)p.y;
  } else {
    u->in.mx = -1;
    u->in.my = -1;
  }
  bool l = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
  u->in.lDown = l && g_shm && g_shm->panelOpen;
  u->in.lPressed = u->in.lDown && !g_lWasDown;
  u->in.lReleased = !u->in.lDown && g_lWasDown;
  g_lWasDown = u->in.lDown;
  LONG wheel = InterlockedExchange(&g_wheel, 0);
  u->in.scroll = (float)wheel / (float)WHEEL_DELTA;
  u->in.wheelUp = wheel > 0;
  u->in.wheelDown = wheel < 0;
  u->in.keyCtrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
  u->in.keyShift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
  u->in.keyAlt = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
  u->in.keyVk = (uint32_t)InterlockedExchange(&g_keyVk, 0);
  LONG tl = InterlockedExchange(&g_typedLen, 0);
  if (tl > 0 && tl < (LONG)sizeof g_typed) {
    memcpy(u->in.typed, g_typed, (size_t)tl);
    u->in.typed[tl] = 0;
  }
  /* panel kısayolu: kenar algılama */
  bool hotkey = false;
  if (g_shm) {
    uint32_t vk = g_shm->hotkeyVk ? g_shm->hotkeyVk : VK_TAB;
    bool needCtrl = (g_shm->hotkeyMods & 1) != 0, needAlt = (g_shm->hotkeyMods & 2) != 0, needShift = (g_shm->hotkeyMods & 4) != 0;
    bool down = (GetAsyncKeyState((int)vk) & 0x8000) != 0;
    bool mods = (!needCtrl || u->in.keyCtrl) && (!needAlt || u->in.keyAlt) && (!needShift || u->in.keyShift);
    if (down && mods && !g_tabWasDown) hotkey = true;
    g_tabWasDown = down;
    /* Esc ile kapatma */
    bool esc = (GetAsyncKeyState(VK_ESCAPE) & 0x8000) != 0;
    if (esc && !g_escWasDown && g_shm->panelOpen && !u->in.keyVk) ui_push_command(g_shm, KCMD_PANEL, "", 0, 0, "close");
    g_escWasDown = esc;
  }
  u->t0 = kat_now_us();
  ui_frame(u, NULL, hotkey);
}

/* D3D9 / OpenGL kancaları bu yoldan çizer: hedef API'ye özgüdür (D3D9 ve GL
 * için NULL: bağlam zaten oyunda kuruludur). */
void kat_render_into(kbackend *be, void *target, HWND hwnd) {
  if (!be || !g_active || !hwnd || !IsWindow(hwnd)) return;
  RECT rc;
  if (!GetClientRect(hwnd, &rc)) return;
  int w = rc.right - rc.left, h = rc.bottom - rc.top;
  if (w < 32 || h < 32) return;
  g_ui.vpW = w;
  g_ui.vpH = h;
  kat_frame_begin();
  if (!g_ui.draw.count) {
    kat_frame_end();
    return;
  }
  bool drew = false;
  if (be->begin(be, target, w, h)) {
    drew = be->draw(be, &g_ui.draw, &g_ui.font);
    be->end(be);
  }
  static uint64_t lastDiag = 0;
  static int diagCount = 0;
  uint64_t nowUs = kat_now_us();
  if (diagCount < 3 || nowUs - lastDiag > 60000000) {
    lastDiag = nowUs;
    diagCount++;
    KAT_LOG("tani(%s): vp=%dx%d verts=%u drew=%d mode=%u", be->name, w, h, g_ui.draw.count, drew ? 1 : 0,
            g_shm ? g_shm->mode : 0);
  }
  if (drew && g_shm && shm_lock(g_shm)) {
    g_shm->status.drawnFrames++;
    g_shm->status.drawnVerts = g_ui.draw.count;
    g_shm->status.api = be->api;
    shm_unlock(g_shm);
  }
  kat_frame_end();
}

HWND kat_game_window(void) { return g_gameWnd; }

void kat_frame_end(void) {
  if (!g_shm) return;
  double ms = (double)(kat_now_us() - g_ui.t0) / 1000.0;
  g_ui.lastDrawMs = ms;
  if (shm_lock(g_shm)) {
    g_shm->status.panelMs = (float)ms;
    shm_unlock(g_shm);
  }
}

/* ---------------- başlatma iş parçacığı ---------------- */
static void scan_late_modules(void) {
  uint32_t now = (uint32_t)GetTickCount();
  if (now - g_lastLegacyScan < 2000) return;
  g_lastLegacyScan = now;
  if (GetModuleHandleW(L"d3d9.dll") || GetModuleHandleW(L"opengl32.dll")) legacy_install_hooks();
}

static DWORD WINAPI kat_thread(LPVOID param) {
  (void)param;
  if (GetEnvironmentVariableW(L"KATMAN_IDLE", NULL, 0)) {
    KAT_LOG("KATMAN_IDLE: katman hicbir sey yapmiyor");
    return 0;
  }
  kat_snapshot_modules();
  KAT_LOG("katman yüklendi (pid=%lu, %d bit, %d modül)", GetCurrentProcessId(), (int)sizeof(void *) * 8, 0);
  /* shm hazır olana kadar bekle (uygulama yazar) */
  for (int i = 0; i < 200 && !g_shm; i++) {
    g_shm = shm_open_reader();
    if (!g_shm) Sleep(50);
  }
  if (!g_shm) {
    KAT_LOG("paylaşımlı bellek bulunamadı, katman çıkıyor");
    FreeLibraryAndExitThread(g_self, 1);
    return 1;
  }
  if (g_shm->pid && g_shm->pid != GetCurrentProcessId()) KAT_LOG("uyarı: shm başka bir süreç için (pid=%lu)", g_shm->pid);
  ui_init(&g_ui, g_shm);
  subclass_game_window();
  bool hooked = dxgi_install_hooks(g_gameWnd);
  KAT_LOG("adim: dxgi kurulumu bitti (hooked=%d)", hooked ? 1 : 0);
  if (GetModuleHandleW(L"d3d9.dll") || GetModuleHandleW(L"opengl32.dll")) hooked = legacy_install_hooks() || hooked;
  KAT_LOG("adim: legacy denemesi bitti");
  KAT_LOG("adim: aktif bayrak yaziliyor");
  InterlockedExchange(&g_active, hooked ? 1 : 0);
  if (shm_lock(g_shm)) {
    g_shm->status.state = hooked ? 1 : 4;
    g_shm->status.bits = (uint32_t)sizeof(void *) * 8;
    g_shm->status.pid = GetCurrentProcessId();
    snprintf(g_shm->status.message, sizeof g_shm->status.message, hooked ? "Kanca bekleniyor" : "Kanca kurulamadi");
    shm_unlock(g_shm);
  }
  if (!hooked) ui_push_command(g_shm, KCMD_ERROR, "", 0, 0, "kanca kurulamadi");
  /* bekçi döngü: çıkış isteği, geç yüklenen modüller, durum kalbi */
  for (int i = 0; i < 60 * 60 * 12; i++) { /* en çok 12 saat */
    Sleep(500);
    if (!g_shm) break;
    if (g_shm->quit) {
      KAT_LOG("çıkış istendi, katman sökülüyor");
      break;
    }
    scan_late_modules();
    if (!g_origWndProc) subclass_game_window();
    /* Kanca ilk denemede kurulamadıysa (ör. oyun grafik DLL'ini geç yükledi)
       yeniden dene; kurulduysa bir daha dokunma. */
    if (!g_active) {
      dxgi_request_dummy(g_gameWnd);
      bool hooked = g_active || dxgi_install_hooks(g_gameWnd);
      if (GetModuleHandleW(L"d3d9.dll") || GetModuleHandleW(L"opengl32.dll")) hooked = legacy_install_hooks() || hooked;
      if (hooked) {
        InterlockedExchange(&g_active, 1);
        if (shm_lock(g_shm)) {
          g_shm->status.state = 1;
          snprintf(g_shm->status.message, sizeof g_shm->status.message, "Kanca bekleniyor");
          shm_unlock(g_shm);
        }
      }
    }
    if ((i % 4) == 0 && shm_lock(g_shm)) {
      g_shm->status.bits = (uint32_t)sizeof(void *) * 8;
      g_shm->status.lastError = 0;
      shm_unlock(g_shm);
    }
  }
  InterlockedExchange(&g_active, 0);
  if (shm_lock(g_shm)) {
    g_shm->status.state = 5;
    snprintf(g_shm->status.message, sizeof g_shm->status.message, "Katman kapatildi");
    shm_unlock(g_shm);
  }
  ui_push_command(g_shm, KCMD_QUIT, "", 0, 0, NULL);
  unsubclass();
  dxgi_uninstall();
  legacy_uninstall();
  ui_free(&g_ui);
  KAT_LOG("katman söküldü");
  Sleep(200);
  FreeLibraryAndExitThread(g_self, 0);
  return 0;
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, LPVOID reserved) {
  (void)reserved;
  if (reason == DLL_PROCESS_ATTACH) {
    g_self = (HMODULE)h;
    DisableThreadLibraryCalls(h);
    /* DllMain içinde modül listesi OKUNMAZ: yükleyici kilidi (loader lock)
       altında başka DLL yüklemesi kilitlemeye yol açar. Anlık görüntü iş
       parçacığında alınır. */
    g_thread = CreateThread(NULL, 0, kat_thread, NULL, 0, NULL);
    if (g_thread) CloseHandle(g_thread);
  } else if (reason == DLL_PROCESS_DETACH) {
    InterlockedExchange(&g_active, 0);
    unsubclass();
  }
  return TRUE;
}

/* Dışa aktarılan küçük bir yoklama: yardımcı süreç enjeksiyonun tuttuğunu
   LoadLibrary dönüşünden bağımsız doğrulayabilsin. */
__declspec(dllexport) uint32_t KatmanProbe(void) { return KATMAN_SHM_VERSION; }
