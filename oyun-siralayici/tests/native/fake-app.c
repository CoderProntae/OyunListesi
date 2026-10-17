/* Test: paylaşımlı belleği dolduran sahte "uygulama" (gerçekte yardımcı süreç).
 * Katman DLL'inin çizmesi gereken veriyi yazar, durumu geri okur. */
#include "../../native/katman/katman.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static void add_metric(katman_shm *m, const char *label, const char *value, const char *unit, uint32_t level) {
  if (m->metricCount >= KATMAN_MAX_METRICS) return;
  katman_metric *mt = &m->metrics[m->metricCount++];
  snprintf(mt->label, sizeof mt->label, "%s", label);
  snprintf(mt->value, sizeof mt->value, "%s", value);
  snprintf(mt->unit, sizeof mt->unit, "%s", unit);
  mt->level = level;
}

int main(int argc, char **argv) {
  DWORD pid = argc > 1 ? (DWORD)atoi(argv[1]) : 0;
  katman_shm *m = shm_open_writer();
  if (!m) {
    printf("SHM=FAIL\n");
    return 1;
  }
  if (!shm_lock(m)) {
    printf("SHM=LOCKFAIL\n");
    return 1;
  }
  m->pid = pid;
  m->gameHwnd = 0;
  m->mode = KATMAN_HUD;
  m->panelOpen = 0;
  m->showTitle = 1;
  m->showNotice = 1;
  m->toastMs = 4200;
  m->opacity = 78;
  m->scale = 1.0f;
  m->position = 0;
  m->margin = 14;
  m->hotkeyVk = VK_TAB;
  m->hotkeyMods = 1;
  m->closeVk = VK_ESCAPE;
  m->areaW = 1280;
  m->areaH = 720;
  snprintf(m->gameName, sizeof m->gameName, "%s", "Deneme Oyunu");
  snprintf(m->noticeText, sizeof m->noticeText, "%s", "Deneme Oyunu");
  m->metricCount = 0;
  add_metric(m, "FPS", "118", "", 0);
  add_metric(m, "CPU", "34", "%", 0);
  add_metric(m, "GPU", "92", "%", 1);
  add_metric(m, "GPU°", "66", "°C", 0);
  m->seq++;
  shm_unlock(m);
  printf("SHM=OK size=%u\n", (unsigned)sizeof(katman_shm));
  fflush(stdout);
  uint32_t lastState = 999;
  for (int i = 0; i < 240; i++) {
    Sleep(250);
    if (i % 8 == 0 && GetFileAttributesW(L".cache\\katman-test\\stop") != INVALID_FILE_ATTRIBUTES) break;
    uint32_t st = m->status.state;
    if (st != lastState) {
      printf("STATE=%u api=%u bits=%u msg=%s\n", st, m->status.api, m->status.bits, m->status.message);
      fflush(stdout);
      lastState = st;
    }
    uint32_t tail = m->cmdTail;
    while (tail != m->cmdHead) {
      katman_cmd *c = &m->cmds[tail];
      printf("CMD kind=%u id=%s num=%d val=%.2f text=%s\n", c->kind, c->id, c->num, c->val, c->text);
      fflush(stdout);
      tail = (tail + 1) % KATMAN_MAX_CMDS;
      m->cmdTail = tail;
    }
    if (i > 6 && m->status.drawnFrames > 20) break; /* çizim kanıtlandı */
    if (st == 4 || st == 5) break;
  }
  printf("DRAWN=%u VERTS=%u FRAMES=%u FPS_HOOK=%.1f DRAW_MS=%.3f\n", m->status.drawnFrames, m->status.drawnVerts,
         m->status.frames, m->status.fps, m->status.panelMs);
  printf("DONE\n");
  fflush(stdout);
  return 0;
}
