/* Oyun içi katman köprüsü (yardımcı süreç tarafı).
 * Electron "osd <json>" ile görünüm verisini gönderir; burası paylaşımlı
 * belleğe işler. Katmanın durum ve komutları da buradan Electron'a akar.
 * Bu dosya oyun-yardimci.c içine #include edilir (out_line/ack orada). */

#include "katman/katman.h"
#include "kminijson.h"

static katman_shm *kb_shm = NULL;
static kjv kb_nodes[900];
static char kb_scratch[24576];
static char kb_line[8192];

static void kb_json_escape(char *dst, size_t cap, const char *src) {
  size_t o = 0;
  for (const unsigned char *s = (const unsigned char *)src; *s && o + 7 < cap; s++) {
    unsigned char c = *s;
    if (c == '"' || c == '\\') {
      dst[o++] = '\\';
      dst[o++] = (char)c;
    } else if (c < 0x20) {
      o += (size_t)snprintf(dst + o, cap - o, "\\u%04x", c);
    } else
      dst[o++] = (char)c;
  }
  dst[o] = 0;
}

static void kb_copy(char *dst, size_t cap, const kjv *obj, const char *key) {
  int len = 0;
  const char *s = kj_str(obj, key, NULL, &len);
  if (!s) {
    dst[0] = 0;
    return;
  }
  size_t n = (size_t)len < cap - 1 ? (size_t)len : cap - 1;
  memcpy(dst, s, n);
  dst[n] = 0;
}

/* "osd <json>" */
static void kb_osd(const char *json) {
  if (!kb_shm) kb_shm = shm_open_writer();
  if (!kb_shm) {
    ack("osd", 0, "paylasimli bellek acilamadi");
    return;
  }
  kj_arena arena;
  kj_arena_init(&arena, kb_nodes, sizeof kb_nodes / sizeof kb_nodes[0], kb_scratch, sizeof kb_scratch);
  const kjv *root = kj_parse(&arena, json);
  if (!root || root->t != KJ_OBJ) {
    ack("osd", 0, "bozuk json");
    return;
  }
  if (!shm_lock(kb_shm)) {
    ack("osd", 0, "katman mesgul");
    return;
  }
  katman_shm *m = kb_shm;
  m->pid = (uint32_t)kj_num(root, "pid", 0);
  {
    int len = 0;
    const char *h = kj_str(root, "hwnd", NULL, &len);
    m->gameHwnd = h ? (uint64_t)strtoull(h, NULL, 0) : 0;
  }
  m->mode = (uint32_t)kj_num(root, "mode", 0);
  m->panelOpen = kj_bool(root, "panelOpen", false) ? 1 : 0;
  m->panelTab = (uint32_t)kj_num(root, "panelTab", 0);
  m->scale = (float)kj_num(root, "scale", 1.0);
  m->margin = (int32_t)kj_num(root, "margin", 14);
  m->position = (uint32_t)kj_num(root, "position", 0);
  m->opacity = (uint32_t)kj_num(root, "opacity", 78);
  m->showTitle = kj_bool(root, "showTitle", false) ? 1 : 0;
  m->showNotice = kj_bool(root, "showNotice", true) ? 1 : 0;
  m->toastMs = (uint32_t)kj_num(root, "toastMs", 4200);
  m->hotkeyVk = (uint32_t)kj_num(root, "hotkeyVk", VK_TAB);
  m->hotkeyMods = (uint32_t)kj_num(root, "hotkeyMods", 1);
  m->closeVk = (uint32_t)kj_num(root, "closeVk", VK_ESCAPE);
  kb_copy(m->gameName, sizeof m->gameName, root, "gameName");
  kb_copy(m->noticeText, sizeof m->noticeText, root, "noticeText");
  kb_copy(m->fpsMessage, sizeof m->fpsMessage, root, "fpsMessage");
  const kjv *area = kj_get(root, "area");
  if (area && area->t == KJ_ARR) {
    m->areaX = (int32_t)kj_num(kj_at(area, 0), "", 0);
    m->areaY = (int32_t)kj_num(kj_at(area, 1), "", 0);
    m->areaW = (int32_t)kj_num(kj_at(area, 2), "", 0);
    m->areaH = (int32_t)kj_num(kj_at(area, 3), "", 0);
  }
  /* köşe göstergesi değerleri */
  const kjv *metrics = kj_get(root, "metrics");
  int mn = kj_arr_len(metrics);
  if (mn > KATMAN_MAX_METRICS) mn = KATMAN_MAX_METRICS;
  m->metricCount = 0;
  for (int i = 0; i < mn; i++) {
    const kjv *it = kj_at(metrics, i);
    if (!it) continue;
    katman_metric *mt = &m->metrics[m->metricCount++];
    memset(mt, 0, sizeof *mt);
    kb_copy(mt->label, sizeof mt->label, it, "label");
    kb_copy(mt->value, sizeof mt->value, it, "value");
    kb_copy(mt->unit, sizeof mt->unit, it, "unit");
    mt->level = (uint32_t)kj_num(it, "level", 0);
    mt->icon = (uint32_t)kj_num(it, "icon", 0);
  }
  const kjv *alerts = kj_get(root, "alerts");
  int an = kj_arr_len(alerts);
  if (an > KATMAN_MAX_ALERTS) an = KATMAN_MAX_ALERTS;
  m->alertCount = 0;
  for (int i = 0; i < an; i++) {
    const kjv *it = kj_at(alerts, i);
    if (!it) continue;
    kb_copy(m->alerts[m->alertCount], sizeof m->alerts[0], it, "text");
    m->alertLevel[m->alertCount] = (uint32_t)kj_num(it, "level", 0);
    m->alertCount++;
  }
  /* panel */
  const kjv *tabs = kj_get(root, "tabs");
  int tn = kj_arr_len(tabs);
  if (tn > 6) tn = 6;
  m->tabCount = 0;
  for (int i = 0; i < tn; i++) {
    int len = 0;
    const char *s = NULL;
    const kjv *it = kj_at(tabs, i);
    if (it && it->t == KJ_STR) {
      s = it->str;
      len = it->strLen;
    }
    if (!s) continue;
    size_t n = (size_t)len < sizeof m->tabs[0] - 1 ? (size_t)len : sizeof m->tabs[0] - 1;
    memcpy(m->tabs[m->tabCount], s, n);
    m->tabs[m->tabCount][n] = 0;
    m->tabCount++;
  }
  const kjv *rows = kj_get(root, "rows");
  int rn = kj_arr_len(rows);
  if (rn > KATMAN_MAX_ROWS) rn = KATMAN_MAX_ROWS;
  m->rowCount = 0;
  for (int i = 0; i < rn; i++) {
    const kjv *it = kj_at(rows, i);
    if (!it) continue;
    katman_row *r = &m->rows[m->rowCount++];
    memset(r, 0, sizeof *r);
    r->kind = (uint32_t)kj_num(it, "kind", 0);
    r->flags = (uint32_t)kj_num(it, "flags", 0);
    r->num = (int32_t)kj_num(it, "num", 0);
    r->val = (float)kj_num(it, "val", 0);
    r->min = (float)kj_num(it, "min", 0);
    r->max = (float)kj_num(it, "max", 100);
    r->step = (float)kj_num(it, "step", 1);
    kb_copy(r->id, sizeof r->id, it, "id");
    kb_copy(r->label, sizeof r->label, it, "label");
    kb_copy(r->value, sizeof r->value, it, "value");
    kb_copy(r->hint, sizeof r->hint, it, "hint");
    const kjv *opts = kj_get(it, "options");
    int on = kj_arr_len(opts);
    if (on > KATMAN_MAX_OPTIONS) on = KATMAN_MAX_OPTIONS;
    r->optionCount = 0;
    for (int k = 0; k < on; k++) {
      const kjv *o = kj_at(opts, k);
      if (!o || o->t != KJ_STR) continue;
      size_t n = (size_t)o->strLen < sizeof r->options[0] - 1 ? (size_t)o->strLen : sizeof r->options[0] - 1;
      memcpy(r->options[r->optionCount], o->str, n);
      r->options[r->optionCount][n] = 0;
      r->optionCount++;
    }
  }
  m->seq++;
  shm_unlock(kb_shm);
  ack("osd", 1, "");
}

/* "inject <pid>" */
static void kb_inject(const char *pidStr) {
  DWORD pid = pidStr ? (DWORD)strtoul(pidStr, NULL, 10) : 0;
  if (!pid) {
    ack("inject", 0, "pid yok");
    return;
  }
  char guard[96];
  if (guard_scan_process(pid, guard, sizeof guard)) {
    ack("inject", 0, guard);
    return;
  }
  int bits = 0;
  if (!kat_process_bits(pid, &bits)) {
    ack("inject", 0, "surec okunamadi");
    return;
  }
  wchar_t self[MAX_PATH];
  if (!GetModuleFileNameW(NULL, self, MAX_PATH)) {
    ack("inject", 0, "yardimci yolu yok");
    return;
  }
  wchar_t *slash = wcsrchr(self, L'\\');
  if (slash) *(slash + 1) = 0;
  wchar_t dll[MAX_PATH + 40];
  _snwprintf(dll, sizeof dll / sizeof dll[0], L"%ls%ls", self, bits == 32 ? L"oyun-katman32.dll" : L"oyun-katman64.dll");
  char pathA[MAX_PATH * 2];
  WideCharToMultiByte(CP_UTF8, 0, dll, -1, pathA, sizeof pathA, NULL, NULL);
  char err[128];
  bool ok = kat_inject(pid, pathA, err, sizeof err);
  if (ok && kb_shm && shm_lock(kb_shm)) {
    /* Önceki eject'ten kalan çıkış bayrağı yeni DLL'i anında sökerdi. */
    kb_shm->quit = 0;
    shm_unlock(kb_shm);
  }
  ack("inject", ok ? 1 : 0, ok ? (bits == 32 ? "32" : "64") : err);
}

/* "eject" */
static void kb_eject(void) {
  if (!kb_shm) kb_shm = shm_open_writer();
  if (kb_shm) {
    if (shm_lock(kb_shm)) {
      kb_shm->quit = 1;
      kb_shm->mode = KATMAN_OFF;
      shm_unlock(kb_shm);
    }
  }
  ack("eject", 1, "");
}

/* Katman → Electron: durum + komutlar (ana döngüde çağrılır). */
static ULONGLONG kb_lastPump = 0;
static void kb_pump(ULONGLONG now) {
  if (!kb_shm) return;
  if (now - kb_lastPump < 250) return;
  kb_lastPump = now;
  katman_status st;
  uint32_t state = 0;
  if (shm_lock(kb_shm)) {
    st = kb_shm->status;
    state = st.state;
    shm_unlock(kb_shm);
  } else
    return;
  char msg[300];
  kb_json_escape(msg, sizeof msg, st.message);
  snprintf(kb_line, sizeof kb_line,
           "{\"t\":\"katman\",\"state\":%u,\"api\":%u,\"bits\":%u,\"pid\":%u,\"frames\":%u,\"drawn\":%u,\"verts\":%u,"
           "\"fps\":%.2f,\"ms\":%.3f,\"message\":\"%s\"}",
           state, st.api, st.bits, st.pid, st.frames, st.drawnFrames, st.drawnVerts, st.fps, st.panelMs, msg);
  out_line(kb_line);
  for (;;) {
    katman_cmd c;
    bool have = false;
    if (shm_lock(kb_shm)) {
      if (kb_shm->cmdTail != kb_shm->cmdHead) {
        c = kb_shm->cmds[kb_shm->cmdTail];
        kb_shm->cmdTail = (kb_shm->cmdTail + 1) % KATMAN_MAX_CMDS;
        have = true;
      }
      shm_unlock(kb_shm);
    }
    if (!have) break;
    char id[80], text[200];
    kb_json_escape(id, sizeof id, c.id);
    kb_json_escape(text, sizeof text, c.text);
    snprintf(kb_line, sizeof kb_line, "{\"t\":\"katmancmd\",\"kind\":%u,\"id\":\"%s\",\"num\":%d,\"val\":%.6g,\"text\":\"%s\"}",
             c.kind, id, c.num, c.val, text);
    out_line(kb_line);
  }
}
