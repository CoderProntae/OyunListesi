/* Yardımcılar: günlük, zaman, paylaşımlı bellek, kilit, UTF-8. */
#include "katman.h"
#include <stdio.h>
#include <stdarg.h>
#include <wchar.h>

static HANDLE g_logFile = INVALID_HANDLE_VALUE;
static CRITICAL_SECTION g_logLock;
static volatile LONG g_logInit = 0;
static uint32_t g_logBytes = 0;
#define KAT_LOG_MAX (512u * 1024u)

/* Günlük, uygulamanın kendi veri klasörüne yazılır: %APPDATA%\\Oyun Siralayici */
static void log_path(wchar_t *out, size_t n) {
  wchar_t dir[MAX_PATH];
  DWORD got = GetEnvironmentVariableW(L"APPDATA", dir, MAX_PATH);
  if (!got || got >= MAX_PATH) got = GetEnvironmentVariableW(L"TEMP", dir, MAX_PATH);
  if (!got || got >= MAX_PATH) {
    _snwprintf(out, n, L"katman-%lu.log", GetCurrentProcessId());
    return;
  }
  wchar_t sub[MAX_PATH * 2];
  _snwprintf(sub, sizeof sub / sizeof sub[0], L"%ls\\Oyun Siralayici", dir);
  CreateDirectoryW(sub, NULL);
  _snwprintf(out, n, L"%ls\\katman-%lu.log", sub, GetCurrentProcessId());
}

void kat_log(const char *file, int line, const char *fmt, ...) {
  if (!InterlockedCompareExchange(&g_logInit, 1, 0)) {
    InitializeCriticalSection(&g_logLock);
    wchar_t p[MAX_PATH * 2];
    log_path(p, sizeof p / sizeof p[0]);
    g_logFile = CreateFileW(p, FILE_APPEND_DATA, FILE_SHARE_READ, NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  }
  if (g_logFile == INVALID_HANDLE_VALUE) return;
  char msg[1024];
  va_list ap;
  va_start(ap, fmt);
  int n = vsnprintf(msg, sizeof msg - 1, fmt, ap);
  va_end(ap);
  if (n < 0) return;
  const char *base = strrchr(file, '/');
  base = base ? base + 1 : file;
  SYSTEMTIME st;
  GetLocalTime(&st);
  char full[1280];
  int m = snprintf(full, sizeof full, "[%02u:%02u:%02u.%03u %lu] %s:%d %s\r\n", st.wHour, st.wMinute, st.wSecond,
                   st.wMilliseconds, GetCurrentThreadId(), base, line, msg);
  if (m <= 0) return;
  EnterCriticalSection(&g_logLock);
  if (g_logBytes > KAT_LOG_MAX) { /* günlük büyümesin: başa dön */
    SetFilePointer(g_logFile, 0, NULL, FILE_BEGIN);
    SetEndOfFile(g_logFile);
    g_logBytes = 0;
  }
  DWORD wrote = 0;
  WriteFile(g_logFile, full, (DWORD)m, &wrote, NULL);
  FlushFileBuffers(g_logFile);
  g_logBytes += wrote;
  LeaveCriticalSection(&g_logLock);
}

uint64_t kat_now_us(void) {
  static LARGE_INTEGER freq = {0};
  LARGE_INTEGER now;
  if (!freq.QuadPart) QueryPerformanceFrequency(&freq);
  QueryPerformanceCounter(&now);
  return (uint64_t)(now.QuadPart * 1000000ull / (freq.QuadPart ? freq.QuadPart : 1));
}

/* ---------------- paylaşımlı bellek ---------------- */
static HANDLE g_shmHandle = NULL;
static const wchar_t *SHM_NAMES[] = {L"Local\\OyunSiralayiciKatmanV1", L"Global\\OyunSiralayiciKatmanV1",
                                     L"OyunSiralayiciKatmanV1"};

static katman_shm *map_shm(bool create) {
  HANDLE h = NULL;
  for (size_t i = 0; i < sizeof SHM_NAMES / sizeof SHM_NAMES[0] && !h; i++) {
    h = create ? CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, KATMAN_SHM_SIZE, SHM_NAMES[i])
               : OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, SHM_NAMES[i]);
    if (!h && create && GetLastError() == ERROR_ACCESS_DENIED)
      h = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, SHM_NAMES[i]); /* zaten var */
    if (h) KAT_LOG("shm acildi (%ls)", SHM_NAMES[i]);
  }
  if (!h) {
    KAT_LOG("shm %s basarisiz err=%lu", create ? "olusturulamadi" : "acilamadi", GetLastError());
    return NULL;
  }
  katman_shm *m = (katman_shm *)MapViewOfFile(h, FILE_MAP_ALL_ACCESS, 0, 0, 0);
  if (!m) {
    KAT_LOG("shm MapViewOfFile basarisiz err=%lu", GetLastError());
    CloseHandle(h);
    return NULL;
  }
  /* Tanıtıcı bilinçli olarak AÇIK tutulur: Windows'ta görünüm (view) eşlemeyi
     yaşatmaya yeter ama Wine'da son tanıtıcı kapanınca adlandırılmış bölüm
     yok oluyor. Açık tutmak her iki tarafta da doğru. */
  g_shmHandle = h;
  if (create && m->magic != KATMAN_SHM_MAGIC) {
    memset(m, 0, sizeof *m);
    m->magic = KATMAN_SHM_MAGIC;
    m->version = KATMAN_SHM_VERSION;
    m->size = (uint32_t)sizeof *m;
    m->scale = 1.0f;
    m->margin = 14;
    m->opacity = 78;
    m->hotkeyVk = VK_TAB;
    m->hotkeyMods = 1;
    m->closeVk = VK_ESCAPE;
    m->toastMs = 4200;
  }
  if (m->magic != KATMAN_SHM_MAGIC || m->version != KATMAN_SHM_VERSION || m->size != sizeof *m) {
    KAT_LOG("shm baslik uymuyor magic=0x%08x (beklenen 0x%08x) version=%u size=%u (beklenen %u)", m->magic,
            KATMAN_SHM_MAGIC, m->version, m->size, (unsigned)sizeof *m);
    UnmapViewOfFile(m);
    return NULL;
  }
  return m;
}
katman_shm *shm_open_writer(void) { return map_shm(true); }
katman_shm *shm_open_reader(void) { return map_shm(false); }
void shm_close(katman_shm *m) {
  if (m) UnmapViewOfFile(m);
  if (g_shmHandle) {
    CloseHandle(g_shmHandle);
    g_shmHandle = NULL;
  }
}
bool shm_lock(katman_shm *m) {
  if (!m) return false;
  for (int i = 0; i < 4000; i++) {
    if (!_interlockedbittestandset((volatile LONG *)&m->busy, 0)) return true;
    if (i > 20) YieldProcessor();
    if (i > 200) Sleep(0);
  }
  return false; /* sahibi takıldı: bu güncellemeyi atla, oyunu bekleme */
}
void shm_unlock(katman_shm *m) {
  if (m) _interlockedbittestandreset((volatile LONG *)&m->busy, 0);
}

/* ---------------- komut halkası (katman → uygulama) ---------------- */
void ui_push_command(katman_shm *m, uint32_t kind, const char *id, int32_t num, float val, const char *text) {
  if (!m) return;
  uint32_t head = m->cmdHead;
  uint32_t next = (head + 1) % KATMAN_MAX_CMDS;
  if (next == m->cmdTail) {
    /* halka dolu: en eski komutu düşür (okuyucu yavaş kaldı) */
    m->cmdTail = (m->cmdTail + 1) % KATMAN_MAX_CMDS;
  }
  katman_cmd *c = &m->cmds[head];
  c->kind = kind;
  c->num = num;
  c->val = val;
  c->id[0] = 0;
  c->text[0] = 0;
  if (id) strncpy(c->id, id, sizeof c->id - 1);
  if (text) strncpy(c->text, text, sizeof c->text - 1);
  c->id[sizeof c->id - 1] = 0;
  c->text[sizeof c->text - 1] = 0;
  MemoryBarrier();
  m->cmdHead = next;
}

/* ---------------- UTF-8 ---------------- */
uint32_t kat_utf8_decode(const char **p) {
  const unsigned char *s = (const unsigned char *)*p;
  uint32_t cp;
  int extra;
  if (s[0] < 0x80) {
    cp = s[0];
    extra = 0;
  } else if ((s[0] & 0xE0) == 0xC0) {
    cp = s[0] & 0x1F;
    extra = 1;
  } else if ((s[0] & 0xF0) == 0xE0) {
    cp = s[0] & 0x0F;
    extra = 2;
  } else if ((s[0] & 0xF8) == 0xF0) {
    cp = s[0] & 0x07;
    extra = 3;
  } else {
    *p += 1;
    return 0xFFFD;
  }
  for (int i = 1; i <= extra; i++) {
    if ((s[i] & 0xC0) != 0x80) {
      *p += 1;
      return 0xFFFD;
    }
    cp = (cp << 6) | (uint32_t)(s[i] & 0x3F);
  }
  *p += extra + 1;
  return cp;
}

/* Sayıyı Türkçe biçimde yazar: 1234.5 → "1.234,5" */
int kat_format_number_tr(char *out, size_t n, double v, int decimals) {
  char tmp[64];
  int len = snprintf(tmp, sizeof tmp, "%.*f", decimals, v);
  if (len <= 0) {
    out[0] = 0;
    return 0;
  }
  char *dot = strchr(tmp, '.');
  size_t intLen = dot ? (size_t)(dot - tmp) : (size_t)len;
  char buf[96];
  size_t o = 0;
  bool neg = tmp[0] == '-';
  size_t start = neg ? 1 : 0;
  if (neg && o < sizeof buf) buf[o++] = '-';
  size_t digits = intLen - start;
  for (size_t i = 0; i < digits && o < sizeof buf - 1; i++) {
    if (i && (digits - i) % 3 == 0) buf[o++] = '.';
    buf[o++] = tmp[start + i];
  }
  if (dot) {
    if (o < sizeof buf - 1) buf[o++] = ',';
    for (size_t i = intLen + 1; i < (size_t)len && o < sizeof buf - 1; i++) buf[o++] = tmp[i];
  }
  buf[o] = 0;
  snprintf(out, n, "%s", buf);
  return (int)o;
}

/* Süre: 3800 sn → "1 sa 3 dk" (uygulamadaki biçimle aynı) */
void kat_format_duration_tr(char *out, size_t n, uint32_t seconds) {
  uint32_t h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60;
  if (h)
    snprintf(out, n, "%u sa %u dk", h, m);
  else if (m)
    snprintf(out, n, "%u dk %u sn", m, s);
  else
    snprintf(out, n, "%u sn", s);
}

void kat_format_clock_tr(char *out, size_t n) {
  SYSTEMTIME st;
  GetLocalTime(&st);
  snprintf(out, n, "%02u:%02u", st.wHour, st.wMinute);
}
