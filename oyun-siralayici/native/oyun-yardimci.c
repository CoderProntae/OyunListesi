/*
 * Oyun Siralayici yardimci programi (Windows).
 *
 * Reads, once per interval, the foreground window (process, path, title,
 * whether it covers its monitor), CPU / RAM / GPU usage (PDH) and prints one
 * JSON line to stdout. Commands arrive on stdin, one per line:
 *   interval <ms>                       tick period
 *   focus <hwnd>                        bring a window back to the front
 *   mute <pid> <0|1>                    mute / unmute a process's audio sessions
 *   muteothers <pid> <0|1> <a.exe;b>    mute every other app except the list,
 *                                       0 restores only what this program muted
 *   follow <gameHwnd> <hwnd>...         keep these windows (the overlay) directly
 *                                       above the game window in the Z order, so
 *                                       they stay "inside" the game: hidden behind
 *                                       any window that covers the game, hidden
 *                                       with it when minimized; "follow 0" stops
 *   rtss <exe> <fps>                    RivaTuner Statistics Server frame limit
 *   nvfps <exe> <fps>                   NVIDIA driver profile "Max Frame Rate"
 *   quit
 * It never injects into games or reads their memory.
 *
 * NVAPI structures below follow NVIDIA's MIT-licensed nvapi.h
 * (Copyright (c) 2019-2026 NVIDIA CORPORATION & AFFILIATES).
 *
 * Each tick also lists the visible top-level windows ("wins"), so a game is
 * recognised as soon as its window exists, without being focused.
 *
 * Build: x86_64-w64-mingw32-gcc -O2 -s -municode -static -o oyun-yardimci.exe
 *        oyun-yardimci.c -lpdh -lole32 -luuid -lpsapi -ladvapi32 -luser32 -ldwmapi
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define COBJMACROS
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <pdh.h>
#include <pdhmsg.h>
#include <dwmapi.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

static CRITICAL_SECTION g_lock;
static HANDLE g_wake;
static char g_queue[24][32768];
static int g_qhead = 0, g_qtail = 0;
static volatile LONG g_quit = 0;
static DWORD g_interval = 1000;
static DWORD g_self = 0;

/* ---------- output ---------- */
static void out_line(const char *s) {
  fputs(s, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}
static void json_wstr(char *dst, size_t cap, const wchar_t *w) {
  char utf8[2048];
  int n = WideCharToMultiByte(CP_UTF8, 0, w ? w : L"", -1, utf8, sizeof utf8, NULL, NULL);
  if (n <= 0) utf8[0] = 0;
  size_t o = 0;
  if (cap < 3) return;
  dst[o++] = '"';
  for (const unsigned char *p = (const unsigned char *)utf8; *p && o + 8 < cap; p++) {
    if (*p == '"' || *p == '\\') {
      dst[o++] = '\\';
      dst[o++] = (char)*p;
    } else if (*p < 0x20) {
      o += snprintf(dst + o, cap - o, "\\u%04x", *p);
    } else
      dst[o++] = (char)*p;
  }
  dst[o++] = '"';
  dst[o] = 0;
}
static void ack(const char *cmd, int ok, const char *message) {
  char line[1024];
  snprintf(line, sizeof line, "{\"t\":\"ack\",\"cmd\":\"%s\",\"ok\":%s,\"message\":\"%s\"}", cmd,
           ok ? "true" : "false", message ? message : "");
  out_line(line);
}

/* ---------- stdin reader thread ---------- */
static DWORD WINAPI reader(LPVOID unused) {
  (void)unused;
  char line[32768];
  while (fgets(line, sizeof line, stdin)) {
    size_t n = strlen(line);
    while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
    EnterCriticalSection(&g_lock);
    int next = (g_qtail + 1) % 64;
    if (next != g_qhead) {
      memcpy(g_queue[g_qtail], line, n + 1);
      g_qtail = next;
    }
    LeaveCriticalSection(&g_lock);
    SetEvent(g_wake);
  }
  InterlockedExchange(&g_quit, 1); /* parent closed the pipe */
  SetEvent(g_wake);
  return 0;
}

/* ---------- process helpers ---------- */
static int process_path(DWORD pid, wchar_t *buf, DWORD cap) {
  buf[0] = 0;
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return 0;
  DWORD size = cap;
  BOOL ok = QueryFullProcessImageNameW(h, 0, buf, &size);
  CloseHandle(h);
  return ok ? 1 : 0;
}
static const wchar_t *base_name(const wchar_t *path) {
  const wchar_t *s = wcsrchr(path, L'\\');
  return s ? s + 1 : path;
}

/* ---------- CPU / memory / GPU ---------- */
static ULONGLONG ft(FILETIME f) { return ((ULONGLONG)f.dwHighDateTime << 32) | f.dwLowDateTime; }
static ULONGLONG g_idle = 0, g_kernel = 0, g_user = 0;
static double cpu_usage(void) {
  FILETIME i, k, u;
  if (!GetSystemTimes(&i, &k, &u)) return -1;
  ULONGLONG di = ft(i) - g_idle, dk = ft(k) - g_kernel, du = ft(u) - g_user;
  int first = g_kernel == 0;
  g_idle = ft(i);
  g_kernel = ft(k);
  g_user = ft(u);
  if (first || dk + du == 0) return -1;
  double v = 100.0 * (1.0 - (double)di / (double)(dk + du));
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
static PDH_HQUERY g_query = NULL;
static PDH_HCOUNTER g_engine = NULL, g_adapter = NULL;
static void pdh_open(void) {
  if (PdhOpenQueryW(NULL, 0, &g_query) != ERROR_SUCCESS) {
    g_query = NULL;
    return;
  }
  if (PdhAddEnglishCounterW(g_query, L"\\GPU Engine(*)\\Utilization Percentage", 0, &g_engine) != ERROR_SUCCESS)
    g_engine = NULL;
  if (PdhAddEnglishCounterW(g_query, L"\\GPU Adapter Memory(*)\\Dedicated Usage", 0, &g_adapter) != ERROR_SUCCESS)
    g_adapter = NULL;
  PdhCollectQueryData(g_query);
}
/* Sums the 3D engine utilisation, overall and for one process. */
static void gpu_usage(DWORD pid, double *total, double *mine, double *vramMB) {
  *total = -1;
  *mine = -1;
  *vramMB = -1;
  if (!g_query) return;
  if (PdhCollectQueryData(g_query) != ERROR_SUCCESS) return;
  wchar_t tag[48];
  swprintf(tag, 48, L"pid_%lu_", (unsigned long)pid);
  if (g_engine) {
    DWORD size = 0, count = 0;
    if (PdhGetFormattedCounterArrayW(g_engine, PDH_FMT_DOUBLE, &size, &count, NULL) == (PDH_STATUS)PDH_MORE_DATA) {
      PDH_FMT_COUNTERVALUE_ITEM_W *items = (PDH_FMT_COUNTERVALUE_ITEM_W *)malloc(size);
      if (items && PdhGetFormattedCounterArrayW(g_engine, PDH_FMT_DOUBLE, &size, &count, items) == ERROR_SUCCESS) {
        double t = 0, m = 0;
        for (DWORD i = 0; i < count; i++) {
          if (!items[i].szName || !wcsstr(items[i].szName, L"engtype_3D")) continue;
          if (items[i].FmtValue.CStatus != PDH_CSTATUS_VALID_DATA && items[i].FmtValue.CStatus != PDH_CSTATUS_NEW_DATA) continue;
          t += items[i].FmtValue.doubleValue;
          if (pid && wcsstr(items[i].szName, tag)) m += items[i].FmtValue.doubleValue;
        }
        *total = t > 100 ? 100 : t;
        *mine = m > 100 ? 100 : m;
      }
      free(items);
    }
  }
  if (g_adapter) {
    DWORD size = 0, count = 0;
    if (PdhGetFormattedCounterArrayW(g_adapter, PDH_FMT_LARGE, &size, &count, NULL) == (PDH_STATUS)PDH_MORE_DATA) {
      PDH_FMT_COUNTERVALUE_ITEM_W *items = (PDH_FMT_COUNTERVALUE_ITEM_W *)malloc(size);
      if (items && PdhGetFormattedCounterArrayW(g_adapter, PDH_FMT_LARGE, &size, &count, items) == ERROR_SUCCESS) {
        double best = 0;
        for (DWORD i = 0; i < count; i++) {
          double v = (double)items[i].FmtValue.largeValue / (1024.0 * 1024.0);
          if (v > best) best = v;
        }
        *vramMB = best;
      }
      free(items);
    }
  }
}

/* ---------- foreground and visible windows ---------- */
typedef struct {
  char *buf;
  size_t len, cap;
} Out;
static void put(Out *o, const char *fmt, ...) {
  va_list ap;
  for (;;) {
    va_start(ap, fmt);
    int n = vsnprintf(o->buf + o->len, o->cap - o->len, fmt, ap);
    va_end(ap);
    if (n < 0) return;
    if (o->len + (size_t)n < o->cap) {
      o->len += (size_t)n;
      return;
    }
    size_t cap = o->cap * 2 + (size_t)n;
    char *b = (char *)realloc(o->buf, cap);
    if (!b) return;
    o->buf = b;
    o->cap = cap;
  }
}
/* Process paths are cached per pid (OpenProcess for every window each second
   would be wasteful). */
static struct {
  DWORD pid;
  wchar_t path[1024];
} g_paths[128];
static int g_pathNext = 0;
static const wchar_t *cached_path(DWORD pid) {
  for (int i = 0; i < 128; i++)
    if (g_paths[i].pid == pid && g_paths[i].path[0]) return g_paths[i].path;
  int i = g_pathNext;
  g_pathNext = (g_pathNext + 1) % 128;
  g_paths[i].pid = pid;
  if (!process_path(pid, g_paths[i].path, 1024)) g_paths[i].path[0] = 0;
  return g_paths[i].path;
}
typedef struct {
  Out *out;
  int count;
} EnumCtx;
static BOOL CALLBACK list_window(HWND w, LPARAM param) {
  EnumCtx *ctx = (EnumCtx *)param;
  if (ctx->count >= 40 || !IsWindowVisible(w) || GetWindow(w, GW_OWNER)) return TRUE;
  LONG_PTR ex = GetWindowLongPtrW(w, GWL_EXSTYLE);
  if (ex & WS_EX_TOOLWINDOW) return TRUE;
  BOOL cloaked = FALSE;
  if (SUCCEEDED(DwmGetWindowAttribute(w, 14 /* DWMWA_CLOAKED */, &cloaked, sizeof cloaked)) && cloaked) return TRUE;
  DWORD pid = 0;
  GetWindowThreadProcessId(w, &pid);
  if (!pid || pid == g_self || pid == GetCurrentProcessId()) return TRUE;
  RECT r;
  GetWindowRect(w, &r);
  int iconic = IsIconic(w);
  if (!iconic && (r.right - r.left < 320 || r.bottom - r.top < 200)) return TRUE;
  const wchar_t *path = cached_path(pid);
  if (!path[0]) return TRUE;
  wchar_t title[256] = L"";
  GetWindowTextW(w, title, 256);
  RECT c = {0};
  GetClientRect(w, &c);
  MapWindowPoints(w, NULL, (POINT *)&c, 2);
  char path8[2400], title8[800];
  json_wstr(path8, sizeof path8, path);
  json_wstr(title8, sizeof title8, title);
  put(ctx->out,
      "%s{\"pid\":%lu,\"hwnd\":\"0x%llx\",\"path\":%s,\"title\":%s,\"iconic\":%s,\"topmost\":%s,"
      "\"rect\":[%ld,%ld,%ld,%ld],\"client\":[%ld,%ld,%ld,%ld]}",
      ctx->count ? "," : "", (unsigned long)pid, (unsigned long long)(ULONG_PTR)w, path8, title8,
      iconic ? "true" : "false", (ex & WS_EX_TOPMOST) ? "true" : "false", r.left, r.top, r.right, r.bottom, c.left,
      c.top, c.right, c.bottom);
  ctx->count++;
  return TRUE;
}
static void tick(void) {
  Out o = {(char *)malloc(16384), 0, 16384};
  if (!o.buf) return;
  char path8[2400], title8[1200];
  wchar_t path[1024] = L"", title[512] = L"", cls[128] = L"";
  HWND w = GetForegroundWindow();
  DWORD pid = 0;
  RECT r = {0}, m = {0};
  int full = 0;
  if (w) {
    GetWindowThreadProcessId(w, &pid);
    GetWindowTextW(w, title, 512);
    GetClassNameW(w, cls, 128);
    process_path(pid, path, 1024);
    GetWindowRect(w, &r);
    HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi;
    mi.cbSize = sizeof mi;
    if (GetMonitorInfoW(mon, &mi)) m = mi.rcMonitor;
    int shell = !wcscmp(cls, L"Progman") || !wcscmp(cls, L"WorkerW") || !wcscmp(cls, L"Shell_TrayWnd");
    full = !shell && !IsIconic(w) && r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
  }
  double cpu = cpu_usage(), gpu, mine, vram;
  gpu_usage(pid, &gpu, &mine, &vram);
  MEMORYSTATUSEX ms;
  ms.dwLength = sizeof ms;
  GlobalMemoryStatusEx(&ms);
  double total = (double)ms.ullTotalPhys / (1024.0 * 1024.0), avail = (double)ms.ullAvailPhys / (1024.0 * 1024.0);
  json_wstr(path8, sizeof path8, path);
  json_wstr(title8, sizeof title8, title);
  put(&o, "{\"t\":\"tick\",\"memUsedMB\":%.0f,\"memTotalMB\":%.0f", total - avail, total);
  if (cpu >= 0) put(&o, ",\"cpu\":%.1f", cpu);
  if (gpu >= 0) put(&o, ",\"gpu\":%.1f", gpu);
  if (vram >= 0) put(&o, ",\"vramMB\":%.0f", vram);
  if (w && pid) {
    put(&o,
        ",\"fg\":{\"pid\":%lu,\"hwnd\":\"0x%llx\",\"path\":%s,\"title\":%s,\"full\":%s,\"self\":%s,"
        "\"mon\":[%ld,%ld,%ld,%ld],\"rect\":[%ld,%ld,%ld,%ld]",
        (unsigned long)pid, (unsigned long long)(ULONG_PTR)w, path8, title8, full ? "true" : "false",
        (g_self && pid == g_self) ? "true" : "false", m.left, m.top, m.right, m.bottom, r.left, r.top, r.right,
        r.bottom);
    if (mine >= 0) put(&o, ",\"gpu\":%.1f", mine);
    put(&o, "}");
  }
  put(&o, ",\"wins\":[");
  EnumCtx ctx = {&o, 0};
  EnumWindows(list_window, (LPARAM)&ctx);
  put(&o, "]}");
  out_line(o.buf);
  free(o.buf);
}

/* ---------- keeping the overlay inside the game ---------- */
static HWND g_game = NULL;
static HWND g_follow[4];
static int g_followCount = 0;
static HWINEVENTHOOK g_moveHook = NULL;
static volatile LONG g_tickNow = 0;
static int is_follower(HWND w) {
  for (int i = 0; i < g_followCount; i++)
    if (g_follow[i] == w) return 1;
  return 0;
}
/* Puts the followers directly above the game window: whatever covers the game
   covers them too. SWP_ASYNCWINDOWPOS: never wait on another thread. */
static void reorder(void) {
  if (!g_game || !g_followCount || !IsWindow(g_game) || IsIconic(g_game)) return;
  int topmost = (GetWindowLongPtrW(g_game, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0;
  HWND last = g_follow[g_followCount - 1], prev = GetWindow(g_game, GW_HWNDPREV);
  if (prev == last && (!topmost || (GetWindowLongPtrW(prev, GWL_EXSTYLE) & WS_EX_TOPMOST))) return; /* in place */
  HWND above = prev;
  while (above && is_follower(above)) above = GetWindow(above, GW_HWNDPREV);
  if (above == NULL) {
    /* nothing above: already right if the first follower sits on the game */
  } else if (!topmost && (GetWindowLongPtrW(above, GWL_EXSTYLE) & WS_EX_TOPMOST))
    above = NULL; /* only topmost windows (taskbar…) above: top of the normal band */
  HWND after = topmost ? HWND_TOPMOST : (above ? above : HWND_TOP);
  const UINT flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  for (int i = 0; i < g_followCount; i++) {
    HWND f = g_follow[i];
    if (!IsWindow(f)) continue;
    SetWindowPos(f, after, 0, 0, 0, 0, flags);
    after = f;
  }
}
static void emit_game(void) {
  if (!g_game || !IsWindow(g_game)) return;
  RECT r, c = {0};
  GetWindowRect(g_game, &r);
  GetClientRect(g_game, &c);
  MapWindowPoints(g_game, NULL, (POINT *)&c, 2);
  char line[320];
  snprintf(line, sizeof line,
           "{\"t\":\"game\",\"hwnd\":\"0x%llx\",\"iconic\":%s,\"rect\":[%ld,%ld,%ld,%ld],\"client\":[%ld,%ld,%ld,%ld]}",
           (unsigned long long)(ULONG_PTR)g_game, IsIconic(g_game) ? "true" : "false", r.left, r.top, r.right,
           r.bottom, c.left, c.top, c.right, c.bottom);
  out_line(line);
}
static void CALLBACK on_event(HWINEVENTHOOK hook, DWORD ev, HWND w, LONG obj, LONG child, DWORD thread,
                              DWORD time) {
  if (obj != OBJID_WINDOW || child != CHILDID_SELF) return;
  if (ev == EVENT_SYSTEM_FOREGROUND) {
    InterlockedExchange(&g_tickNow, 1); /* report focus changes at once */
    reorder();
  } else if (w == g_game) {
    emit_game();
    if (ev == EVENT_SYSTEM_MINIMIZEEND || ev == EVENT_OBJECT_LOCATIONCHANGE) reorder();
  }
}
static void follow(char *args) {
  char *game = strtok(args, " ");
  g_followCount = 0;
  g_game = game ? (HWND)(ULONG_PTR)_strtoui64(game, NULL, 0) : NULL;
  if (g_game && !IsWindow(g_game)) g_game = NULL;
  char *w;
  while (g_game && g_followCount < 4 && (w = strtok(NULL, " ")))
    g_follow[g_followCount++] = (HWND)(ULONG_PTR)_strtoui64(w, NULL, 0);
  if (g_moveHook) UnhookWinEvent(g_moveHook);
  g_moveHook = NULL;
  if (g_game) {
    DWORD pid = 0;
    GetWindowThreadProcessId(g_game, &pid);
    g_moveHook = SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, NULL, on_event, pid, 0,
                                 WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    reorder();
    emit_game();
  }
  ack("follow", 1, "");
}

static void focus_window(const char *arg) {
  HWND w = (HWND)(ULONG_PTR)_strtoui64(arg, NULL, 0);
  if (!w || !IsWindow(w)) {
    ack("focus", 0, "window gone");
    return;
  }
  if (IsIconic(w)) ShowWindow(w, SW_RESTORE);
  DWORD fgThread = GetWindowThreadProcessId(GetForegroundWindow(), NULL), me = GetCurrentThreadId();
  if (fgThread && fgThread != me) AttachThreadInput(me, fgThread, TRUE);
  BOOL ok = SetForegroundWindow(w);
  if (fgThread && fgThread != me) AttachThreadInput(me, fgThread, FALSE);
  ack("focus", ok, "");
}

/* ---------- audio sessions ---------- */
static DWORD g_muted[256];
static int g_mutedCount = 0;
static int was_muted_by_us(DWORD pid) {
  for (int i = 0; i < g_mutedCount; i++)
    if (g_muted[i] == pid) return 1;
  return 0;
}
static int excluded(DWORD pid, const wchar_t *list) {
  wchar_t path[1024];
  if (!list || !*list || !process_path(pid, path, 1024)) return 0;
  wchar_t name[260];
  wcsncpy(name, base_name(path), 259);
  name[259] = 0;
  _wcslwr(name);
  size_t n = wcslen(name);
  const wchar_t *p = list;
  while (*p) {
    const wchar_t *e = wcschr(p, L';');
    size_t len = e ? (size_t)(e - p) : wcslen(p);
    if (len == n && !_wcsnicmp(p, name, n)) return 1;
    if (!e) break;
    p = e + 1;
  }
  return 0;
}
/* others = 0: (un)mute pid's sessions; others = 1: (un)mute every other app. */
static int set_mute(DWORD pid, int mute, int others, const wchar_t *exclude) {
  IMMDeviceEnumerator *en = NULL;
  IMMDeviceCollection *devs = NULL;
  int changed = 0;
  if (FAILED(CoCreateInstance(&CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL, &IID_IMMDeviceEnumerator, (void **)&en)))
    return -1;
  if (SUCCEEDED(IMMDeviceEnumerator_EnumAudioEndpoints(en, eRender, DEVICE_STATE_ACTIVE, &devs))) {
    UINT n = 0;
    IMMDeviceCollection_GetCount(devs, &n);
    for (UINT i = 0; i < n; i++) {
      IMMDevice *dev = NULL;
      IAudioSessionManager2 *mgr = NULL;
      IAudioSessionEnumerator *se = NULL;
      if (FAILED(IMMDeviceCollection_Item(devs, i, &dev))) continue;
      if (SUCCEEDED(IMMDevice_Activate(dev, &IID_IAudioSessionManager2, CLSCTX_ALL, NULL, (void **)&mgr)) &&
          SUCCEEDED(IAudioSessionManager2_GetSessionEnumerator(mgr, &se))) {
        int count = 0;
        IAudioSessionEnumerator_GetCount(se, &count);
        for (int j = 0; j < count; j++) {
          IAudioSessionControl *c = NULL;
          IAudioSessionControl2 *c2 = NULL;
          ISimpleAudioVolume *v = NULL;
          DWORD spid = 0;
          if (FAILED(IAudioSessionEnumerator_GetSession(se, j, &c))) continue;
          if (SUCCEEDED(IAudioSessionControl_QueryInterface(c, &IID_IAudioSessionControl2, (void **)&c2))) {
            IAudioSessionControl2_GetProcessId(c2, &spid);
            int system = IAudioSessionControl2_IsSystemSoundsSession(c2) == S_OK;
            int target = others ? (!system && spid && spid != pid && spid != g_self && spid != GetCurrentProcessId() &&
                                   !excluded(spid, exclude))
                                : (spid == pid);
            if (target && SUCCEEDED(IAudioSessionControl_QueryInterface(c, &IID_ISimpleAudioVolume, (void **)&v))) {
              if (!others) {
                ISimpleAudioVolume_SetMute(v, mute ? TRUE : FALSE, NULL);
                changed++;
              } else if (mute) {
                BOOL was = FALSE;
                ISimpleAudioVolume_GetMute(v, &was);
                if (!was) {
                  ISimpleAudioVolume_SetMute(v, TRUE, NULL);
                  if (g_mutedCount < 256 && !was_muted_by_us(spid)) g_muted[g_mutedCount++] = spid;
                  changed++;
                }
              } else if (was_muted_by_us(spid)) {
                ISimpleAudioVolume_SetMute(v, FALSE, NULL);
                changed++;
              }
              ISimpleAudioVolume_Release(v);
            }
            IAudioSessionControl2_Release(c2);
          }
          IAudioSessionControl_Release(c);
        }
      }
      if (se) IAudioSessionEnumerator_Release(se);
      if (mgr) IAudioSessionManager2_Release(mgr);
      IMMDevice_Release(dev);
    }
    IMMDeviceCollection_Release(devs);
  }
  IMMDeviceEnumerator_Release(en);
  if (others && !mute) g_mutedCount = 0;
  return changed;
}

/* ---------- RivaTuner Statistics Server ---------- */
typedef BOOL (*RtssLoad)(LPCSTR);
typedef BOOL (*RtssSave)(LPCSTR);
typedef BOOL (*RtssSet)(LPCSTR, LPVOID, DWORD);
typedef void (*RtssUpdate)(void);
static void rtss_limit(const char *exe, int fps) {
  wchar_t dir[MAX_PATH] = L"";
  DWORD size = sizeof dir;
  if (RegGetValueW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\WOW6432Node\\Unwinder\\RTSS", L"InstallDir", RRF_RT_REG_SZ, NULL, dir,
                   &size) != ERROR_SUCCESS)
    wcscpy(dir, L"C:\\Program Files (x86)\\RivaTuner Statistics Server");
  wchar_t path[MAX_PATH + 32];
  swprintf(path, MAX_PATH + 32, L"%ls\\RTSSHooks64.dll", dir);
  HMODULE h = LoadLibraryExW(path, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!h) {
    ack("rtss", 0, "RivaTuner Statistics Server bulunamadi");
    return;
  }
  RtssLoad load = (RtssLoad)(void *)GetProcAddress(h, "LoadProfile");
  RtssSave save = (RtssSave)(void *)GetProcAddress(h, "SaveProfile");
  RtssSet set = (RtssSet)(void *)GetProcAddress(h, "SetProfileProperty");
  RtssUpdate update = (RtssUpdate)(void *)GetProcAddress(h, "UpdateProfiles");
  if (!load || !save || !set || !update) {
    ack("rtss", 0, "RTSS arayuzu eksik");
    FreeLibrary(h);
    return;
  }
  DWORD value = (DWORD)(fps < 0 ? 0 : fps);
  load(exe);
  set("FramerateLimit", &value, sizeof value);
  save(exe);
  update();
  FreeLibrary(h);
  ack("rtss", 1, "");
}

/* ---------- NVIDIA driver profile (NVAPI DRS) ---------- */
typedef unsigned int NvU32;
typedef unsigned short NvU16;
typedef unsigned char NvU8;
typedef unsigned long long NvU64;
typedef NvU16 NvUStr[2048];
typedef struct {
  NvU32 valueLength;
  NvU8 valueData[4096];
} NvBinary;
#pragma pack(push, 4)
typedef struct {
  NvU32 version;
  NvUStr settingName;
  NvU32 settingId;
  NvU32 settingType;
  NvU32 settingLocation;
  NvU32 isCurrentPredefined;
  NvU32 isPredefinedValid;
  union {
    NvU32 u32;
    NvBinary bin;
    NvUStr wsz;
    NvU64 u64;
  } predefined;
  union {
    NvU32 u32;
    NvBinary bin;
    NvUStr wsz;
    NvU64 u64;
  } current;
} NvSetting;
#pragma pack(pop)
typedef struct {
  NvU32 version;
  NvU32 isPredefined;
  NvUStr appName;
  NvUStr userFriendlyName;
  NvUStr launcher;
  NvUStr fileInFolder;
  NvU32 flags;
  NvUStr commandLine;
} NvApp;
typedef struct {
  NvU32 version;
  NvUStr profileName;
  NvU32 gpuSupport;
  NvU32 isPredefined;
  NvU32 numOfApps;
  NvU32 numOfSettings;
} NvProfile;
#define NV_VER(t, v) ((NvU32)(sizeof(t) | ((v) << 16)))
typedef void *(*NvQI)(unsigned int);
typedef int (*NvVoid)(void);
typedef int (*NvSession)(void **);
typedef int (*NvSessionOnly)(void *);
typedef int (*NvFindApp)(void *, NvU16 *, void **, NvApp *);
typedef int (*NvCreateProfile)(void *, NvProfile *, void **);
typedef int (*NvCreateApp)(void *, void *, NvApp *);
typedef int (*NvSetSetting)(void *, void *, NvSetting *);
static void nv_limit(const char *exe, int fps) {
  HMODULE h = LoadLibraryW(L"nvapi64.dll");
  if (!h) {
    ack("nvfps", 0, "NVIDIA surucusu bulunamadi");
    return;
  }
  NvQI qi = (NvQI)(void *)GetProcAddress(h, "nvapi_QueryInterface");
  NvVoid init = qi ? (NvVoid)qi(0x0150e828) : NULL;
  NvSession create = qi ? (NvSession)qi(0x0694d52e) : NULL;
  NvSessionOnly loadAll = qi ? (NvSessionOnly)qi(0x375dbd6b) : NULL;
  NvSessionOnly saveAll = qi ? (NvSessionOnly)qi(0xfcbc7e14) : NULL;
  NvSessionOnly destroy = qi ? (NvSessionOnly)qi(0xdad9cff8) : NULL;
  NvFindApp findApp = qi ? (NvFindApp)qi(0xeee566b2) : NULL;
  NvCreateProfile createProfile = qi ? (NvCreateProfile)qi(0xcc176068) : NULL;
  NvCreateApp createApp = qi ? (NvCreateApp)qi(0x4347a9de) : NULL;
  NvSetSetting setSetting = qi ? (NvSetSetting)qi(0x577dd202) : NULL;
  if (!init || !create || !loadAll || !saveAll || !destroy || !findApp || !createProfile || !createApp || !setSetting ||
      init() != 0) {
    ack("nvfps", 0, "NVAPI baslatilamadi");
    return;
  }
  void *session = NULL, *profile = NULL;
  NvApp *app = (NvApp *)calloc(1, sizeof(NvApp));
  NvSetting *setting = (NvSetting *)calloc(1, sizeof(NvSetting));
  NvProfile *info = (NvProfile *)calloc(1, sizeof(NvProfile));
  int status = -1;
  wchar_t name[260];
  MultiByteToWideChar(CP_UTF8, 0, exe, -1, name, 260);
  if (app && setting && info && create(&session) == 0 && loadAll(session) == 0) {
    app->version = NV_VER(NvApp, 4);
    status = findApp(session, (NvU16 *)name, &profile, app);
    if (status == -166 || status == -163 || !profile) { /* not found: own profile + application */
      info->version = NV_VER(NvProfile, 1);
      swprintf((wchar_t *)info->profileName, 2048, L"Oyun Siralayici - %ls", name);
      status = createProfile(session, info, &profile);
      if (status == 0) {
        memset(app, 0, sizeof *app);
        app->version = NV_VER(NvApp, 4);
        wcsncpy((wchar_t *)app->appName, name, 2047);
        status = createApp(session, profile, app);
      }
    }
    if (status == 0 && profile) {
      setting->version = NV_VER(NvSetting, 1);
      setting->settingId = 0x10835002; /* FRL_FPS_ID: "Max Frame Rate" */
      setting->settingType = 0;        /* NVDRS_DWORD_TYPE */
      setting->current.u32 = (NvU32)(fps < 0 ? 0 : fps > 1023 ? 1023 : fps);
      status = setSetting(session, profile, setting);
      if (status == 0) status = saveAll(session);
    }
  }
  if (session) destroy(session);
  free(app);
  free(setting);
  free(info);
  char msg[64];
  snprintf(msg, sizeof msg, "NVAPI %d", status);
  ack("nvfps", status == 0, status == 0 ? "" : msg);
}

/* katman köprüsü tanımları katman_bridge.inc içinde (wmain'den önce) */
static void kb_osd(const char *json);
static void kb_inject(const char *pidStr);
static void kb_eject(void);
static void kb_pump(ULONGLONG now);

/* ---------- commands ---------- */
static void command(char *line) {
  char *cmd = strtok(line, " ");
  if (!cmd) return;
  if (!strcmp(cmd, "quit")) {
    InterlockedExchange(&g_quit, 1);
  } else if (!strcmp(cmd, "interval")) {
    char *a = strtok(NULL, " ");
    int v = a ? atoi(a) : 1000;
    g_interval = (DWORD)(v < 250 ? 250 : v > 10000 ? 10000 : v);
  } else if (!strcmp(cmd, "follow")) {
    follow(strtok(NULL, ""));
  } else if (!strcmp(cmd, "focus")) {
    char *a = strtok(NULL, " ");
    if (a) focus_window(a);
  } else if (!strcmp(cmd, "mute") || !strcmp(cmd, "muteothers")) {
    char *a = strtok(NULL, " "), *b = strtok(NULL, " "), *c = strtok(NULL, "");
    wchar_t list[2048] = L"";
    if (c) MultiByteToWideChar(CP_UTF8, 0, c, -1, list, 2048);
    int n = (a && b) ? set_mute((DWORD)strtoul(a, NULL, 10), atoi(b), cmd[4] == 'o', list) : -1;
    ack(cmd, n >= 0, n < 0 ? "ses aygiti okunamadi" : "");
  } else if (!strcmp(cmd, "osd")) {
    kb_osd(strtok(NULL, ""));
  } else if (!strcmp(cmd, "inject")) {
    kb_inject(strtok(NULL, " "));
  } else if (!strcmp(cmd, "eject")) {
    kb_eject();
  } else if (!strcmp(cmd, "rtss") || !strcmp(cmd, "nvfps")) {
    char *exe = strtok(NULL, " "), *fps = strtok(NULL, " ");
    if (!exe || !fps) {
      ack(cmd, 0, "eksik girdi");
      return;
    }
    if (cmd[0] == 'r')
      rtss_limit(exe, atoi(fps));
    else
      nv_limit(exe, atoi(fps));
  }
}

#include "katman_bridge.inc"

int wmain(int argc, wchar_t **argv) {
  for (int i = 1; i + 1 < argc; i++)
    if (!wcscmp(argv[i], L"--self")) g_self = (DWORD)wcstoul(argv[i + 1], NULL, 10);
  HMODULE user = GetModuleHandleW(L"user32.dll");
  typedef BOOL(WINAPI * DpiCtx)(HANDLE);
  DpiCtx dpi = user ? (DpiCtx)(void *)GetProcAddress(user, "SetProcessDpiAwarenessContext") : NULL;
  if (!dpi || !dpi((HANDLE)-4)) SetProcessDPIAware();
  CoInitializeEx(NULL, COINIT_MULTITHREADED);
  InitializeCriticalSection(&g_lock);
  g_wake = CreateEventW(NULL, FALSE, FALSE, NULL);
  setvbuf(stdout, NULL, _IOFBF, 1 << 16);
  pdh_open();
  out_line("{\"t\":\"hello\",\"v\":2}");
  CreateThread(NULL, 0, reader, NULL, 0, NULL);
  SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, NULL, on_event, 0, 0,
                  WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, NULL, on_event, 0, 0,
                  WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  ULONGLONG next = 0, lastOrder = 0;
  while (!g_quit) {
    ULONGLONG now = GetTickCount64();
    if (now >= next || InterlockedExchange(&g_tickNow, 0)) {
      tick();
      next = now + g_interval;
    }
    if (now - lastOrder >= 250) { /* games that re-raise themselves */
      lastOrder = now;
      reorder();
    }
    kb_pump(now); /* oyun içi katman: durum + komutlar */
    DWORD wait = (DWORD)(next > now ? next - now : 0);
    if (wait > 250) wait = 250;
    MsgWaitForMultipleObjects(1, &g_wake, FALSE, wait, QS_ALLINPUT);
    MSG msg;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    for (;;) {
      char line[32768];
      int have = 0;
      EnterCriticalSection(&g_lock);
      if (g_qhead != g_qtail) {
        memcpy(line, g_queue[g_qhead], sizeof line);
        g_qhead = (g_qhead + 1) % 64;
        have = 1;
      }
      LeaveCriticalSection(&g_lock);
      if (!have) break;
      command(line);
    }
  }
  if (g_mutedCount) set_mute(0, 0, 1, L"");
  CoUninitialize();
  return 0;
}
