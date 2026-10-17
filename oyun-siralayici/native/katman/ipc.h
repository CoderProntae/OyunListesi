/* Oyun Sıralayıcı — oyun içi katman (2.2.0)
 * Paylaşımlı bellek sözleşmesi. TEK DOĞRU KAYNAK bu dosyadır: TypeScript tarafı
 * (shared/katman-ipc.ts) alan kaymalarını buradan üretilen shared/katman-offsets.gen.ts
 * üzerinden okur, elle sayı yazılmaz. Bir alanı değiştirince scripts/build-katman.sh
 * yeniden çalıştırılmalı (offsets.exe → .gen.ts) ve testler koşulmalı.
 *
 * Yazan: yardımcı süreç (oyun-yardimci.exe) — Electron'dan "osd <json>" satırıyla
 *        gelen veriyi buraya işler.
 * Okuyan: oyunun sürecine enjekte edilen katman DLL'i (oyun-katman64/32.dll).
 * Kilit:  busy alanı (RTSS'in dwBusy'si gibi) — çizen taraf 0. biti set eder.
 */
#ifndef OYUN_KATMAN_IPC_H
#define OYUN_KATMAN_IPC_H

#include <stdint.h>

#define KATMAN_SHM_NAME "Local\\OyunSiralayiciKatmanV1"
#define KATMAN_SHM_MAGIC 0x4e4c594b /* 'KYLN' */
#define KATMAN_SHM_VERSION 1
#define KATMAN_SHM_SIZE (1u << 20) /* 1 MB */

#define KATMAN_MAX_ROWS 96
#define KATMAN_MAX_METRICS 24
#define KATMAN_MAX_ALERTS 8
#define KATMAN_MAX_OPTIONS 8
#define KATMAN_MAX_CMDS 32
#define KATMAN_MAX_GLYPHS 1024

/* ---- çizim modu (app → katman) ---- */
enum {
  KATMAN_OFF = 0,     /* katman kapalı: DLL hiçbir şey çizmez */
  KATMAN_HUD = 1,     /* yalnız köşe göstergesi */
  KATMAN_HUD_PANEL = 2 /* gösterge + panel (panel açıkken) */
};

/* ---- panel satırı türleri ---- */
enum {
  KROW_HEADER = 0,  /* sekme/bölüm başlığı */
  KROW_LABEL = 1,   /* salt okunur değer satırı */
  KROW_TOGGLE = 2,  /* anahtar (num: 0/1) */
  KROW_SELECT = 3,  /* seçenek listesi (num: seçili indeks) */
  KROW_SLIDER = 4,  /* kaydırma (val, min, max, step) */
  KROW_NUMBER = 5,  /* sayı girişi (val + value metni) */
  KROW_TEXT = 6,    /* metin girişi (value) */
  KROW_BUTTON = 7,  /* düğme (id → KCMD_ACTION) */
  KROW_LIST = 8,    /* sıralanabilir liste öğesi (num: indeks, flags: seçili) */
  KROW_HINT = 9,    /* açıklama satırı (küçük, soluk) */
  KROW_COLOR = 10   /* renk örneği + metin (num: 0xAARRGGBB) */
};

/* ---- satır bayrakları ---- */
enum {
  KROW_F_DISABLED = 1 << 0, /* desteklenmiyor/gri: hint nedenini söyler */
  KROW_F_DIRTY = 1 << 1,    /* katmanda değiştirildi, uygulamaya gönderildi */
  KROW_F_SELECTED = 1 << 2, /* liste öğesi seçili */
  KROW_F_DANGER = 1 << 3,   /* değer tehlike eşiğinde (kırmızı) */
  KROW_F_WARN = 1 << 4,     /* değer uyarı eşiğinde (sarı) */
  KROW_F_FOCUSED = 1 << 5   /* klavye odağı bu satırda */
};

/* ---- katman → uygulama komutları ---- */
enum {
  KCMD_NONE = 0,
  KCMD_SET = 1,       /* satır değeri değişti: id + num/val/text */
  KCMD_ACTION = 2,    /* düğme/liste eylemi: id + text (ör. "up","down","click") */
  KCMD_PANEL = 3,     /* num: 1 açıldı, 0 kapandı */
  KCMD_READY = 4,     /* DLL yüklendi, kanca kuruldu: text = api adı */
  KCMD_LOST = 5,      /* kanca/çiçim kaybı: text = neden */
  KCMD_ERROR = 6,     /* hata: text = açıklama */
  KCMD_FPS = 7,       /* kancadan ölçülen kare hızı: val = fps, num = kare süresi µs */
  KCMD_QUIT = 8       /* DLL çıkıyor (oyun kapanıyor / eject) */
};

typedef struct {
  uint32_t kind;      /* KROW_* */
  uint32_t flags;     /* KROW_F_* */
  int32_t num;        /* toggle/selection/index ya da renk */
  float val;          /* sayı/kaydırma değeri */
  float min;
  float max;
  float step;
  uint32_t optionCount;
  char id[24];        /* satır kimliği (ASCII) */
  char label[72];     /* UTF-8 */
  char value[40];     /* UTF-8 (görünen değer) */
  char hint[96];      /* UTF-8 (açıklama / neden kapalı) */
  char options[KATMAN_MAX_OPTIONS][40]; /* UTF-8 */
} katman_row;

typedef struct {
  char label[24]; /* UTF-8, ör. "FPS" */
  char value[20]; /* UTF-8, ör. "118" */
  char unit[10];  /* UTF-8, ör. "%" */
  uint32_t level; /* 0 normal, 1 uyarı, 2 tehlike */
  uint32_t icon;  /* 0 yok, 1 saat, 2 pil, 3 sıcaklık */
} katman_metric;

typedef struct {
  uint32_t kind; /* KCMD_* */
  int32_t num;
  float val;
  char id[24];
  char text[64]; /* UTF-8 */
} katman_cmd;

/* Katmanın uygulamaya bildirdiği durum. */
typedef struct {
  uint32_t state;         /* 0 yüklenmedi, 1 yüklendi, 2 kanca kuruldu, 3 çiziyor, 4 hata, 5 kapandı */
  uint32_t api;           /* 0 bilinmiyor, 1 D3D9, 2 D3D11, 3 D3D12, 4 OpenGL, 5 Vulkan */
  uint32_t bits;          /* 32 ya da 64 */
  uint32_t pid;           /* katmanın çalıştığı oyun süreci */
  uint32_t frames;        /* kancanın gördüğü kare sayısı */
  uint32_t drawnFrames;   /* katmanın gerçekten çizdiği kare sayısı */
  uint32_t drawnVerts;    /* son karedeki üçgen köşesi sayısı */
  float fps;              /* kancadan ölçülen fps */
  float frametimeMs;      /* kancadan ölçülen kare süresi */
  float low1;             /* %1 en düşük (kancadan) */
  float panelMs;          /* son çizimin uygulama tarafı süresi (ms) */
  uint32_t lastError;     /* son HRESULT / hata kodu */
  char message[128];      /* UTF-8: durum ya da hata açıklaması */
} katman_status;

typedef struct {
  /* ---- başlık ---- */
  uint32_t magic;
  uint32_t version;
  uint32_t size;   /* sizeof(katman_shm) */
  uint32_t pid;    /* hangi oyun süreci için geçerli */
  uint64_t gameHwnd; /* oyun penceresi: hangi swapchain'e çizileceğini belirler */
  volatile uint32_t busy;  /* bit0: çizen taraf kilidi */
  volatile uint32_t seq;   /* her güncellemede artar */
  volatile uint32_t quit;  /* 1: DLL kendini söksün */

  /* ---- ne çizilsin ---- */
  uint32_t mode;          /* KATMAN_* */
  uint32_t panelOpen;     /* 1: panel açık */
  uint32_t panelTab;      /* açık sekme indeksi */
  uint32_t hotkeyVk;      /* panel kısayolu: sanal tuş kodu */
  uint32_t hotkeyMods;    /* 1 ctrl, 2 alt, 4 shift */
  uint32_t closeVk;       /* panel kapatma tuşu (Esc) */
  float scale;            /* arayüz ölçeği (DPI × kullanıcı ölçeği) */
  int32_t areaX, areaY, areaW, areaH; /* oyunun istemci alanı (fiziksel piksel) */
  uint32_t position;      /* 0 sağ üst, 1 sağ alt, 2 sol üst, 3 sol alt */
  int32_t margin;
  uint32_t opacity;       /* 0..100 arka plan saydamlığı */
  uint32_t showTitle;     /* oyun adı sürekli görünsün */
  uint32_t showNotice;    /* "Şimdi oynanıyor" kayan bildirim */
  uint32_t toastMs;       /* bildirim süresi */

  /* ---- köşe göstergesi ---- */
  uint32_t metricCount;
  katman_metric metrics[KATMAN_MAX_METRICS];
  char gameName[128];    /* UTF-8 */
  char noticeText[128];  /* UTF-8: "Şimdi oynanıyor: …" */
  char fpsMessage[160];  /* UTF-8: "izin gerekiyor" gibi açıklamalar */
  uint32_t alertCount;
  char alerts[KATMAN_MAX_ALERTS][96];
  uint32_t alertLevel[KATMAN_MAX_ALERTS];

  /* ---- panel ---- */
  uint32_t tabCount;
  char tabs[6][40]; /* UTF-8 sekme adları */
  uint32_t rowCount;
  katman_row rows[KATMAN_MAX_ROWS];

  /* ---- katman → uygulama ---- */
  katman_status status;
  volatile uint32_t cmdHead; /* katman yazar */
  volatile uint32_t cmdTail; /* uygulama okur */
  katman_cmd cmds[KATMAN_MAX_CMDS];
} katman_shm;

#endif /* OYUN_KATMAN_IPC_H */
