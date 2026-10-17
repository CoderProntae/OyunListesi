/* Arayüz: köşe göstergesi (HUD), "Şimdi oynanıyor" bildirimi ve Ctrl+Tab paneli.
 * Görünüm, uygulamadaki CSS ile aynı ölçülerde (em tabanlı) kurulur; verilerin
 * tamamı paylaşımlı bellekten gelir, yani metinler ve iş kuralları TypeScript
 * tarafında kalır — burada yalnız çizim ve tıklama karşılığı vardır. */
#include "katman.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ---------------- ölçüler ---------------- */
static float em(const kui *u, float e) { return 13.0f * u->scale * e; }

static float text_w(const char *s, float size, uint32_t weight) { return kat_text_width(s, size, weight); }

static kcolor with_alpha(kcolor c, float a) {
  c.a = (uint8_t)(c.a * (a < 0 ? 0 : a > 1 ? 1 : a));
  return c;
}

/* Harf aralıklı metin (CSS letter-spacing karşılığı). */
static float text_spaced(kdraw *d, float x, float y, const char *s, float size, kcolor c, uint32_t weight, float spacing) {
  if (!s || !*s) return 0;
  float cx = x;
  char one[8];
  const char *p = s;
  while (*p) {
    const char *start = p;
    uint32_t cp = kat_utf8_decode(&p);
    size_t n = (size_t)(p - start);
    if (n >= sizeof one) n = sizeof one - 1;
    memcpy(one, start, n);
    one[n] = 0;
    cx += dl_text(d, cx, y, one, size, c, weight);
    cx += spacing;
  }
  return cx - x - spacing;
}
static float text_spaced_w(const char *s, float size, uint32_t weight, float spacing) {
  float w = text_w(s, size, weight);
  size_t n = strlen(s);
  size_t chars = 0;
  for (size_t i = 0; i < n; i++)
    if (((unsigned char)s[i] & 0xC0) != 0x80) chars++;
  if (chars) w += spacing * (float)(chars - 1);
  return w;
}

/* ---------------- köşe göstergesi ---------------- */
typedef struct {
  float w, h;
  float padX, padY, gap, radius;
  bool hasTitle, hasAlert;
} hudLayout;

static void hud_measure(kui *u, const katman_shm *m, hudLayout *L) {
  L->padX = em(u, 0.75f);
  L->padY = em(u, 0.6f);
  L->gap = em(u, 0.35f);
  L->radius = em(u, 0.75f);
  L->hasTitle = m->showTitle && m->gameName[0];
  L->hasAlert = m->alertCount > 0;
  float base = 13.0f * u->scale;
  uint32_t rows = m->metricCount > KATMAN_MAX_METRICS ? KATMAN_MAX_METRICS : m->metricCount;
  /* iki sütun: etiketler ve değerler ayrı ayrı ölçülür */
  float labelW[2] = {0, 0}, valueW[2] = {0, 0};
  for (uint32_t i = 0; i < rows; i++) {
    const katman_metric *mt = &m->metrics[i];
    uint32_t c = i % 2;
    float lw = text_spaced_w(mt->label, base * 0.72f, 1, base * 0.72f * 0.06f);
    float vw = text_w(mt->value, base, 1);
    if (mt->unit[0]) vw += text_w(mt->unit, base * 0.8f, 0) + em(u, 0.1f);
    if (lw > labelW[c]) labelW[c] = lw;
    if (vw > valueW[c]) valueW[c] = vw;
  }
  float metricsW = labelW[0] + em(u, 0.3f) + valueW[0];
  if (rows > 1) metricsW += em(u, 0.9f) + labelW[1] + em(u, 0.3f) + valueW[1];
  uint32_t metricRows = (rows + 1) / 2;
  float metricsH = metricRows > 0 ? metricRows * kat_text_height(base) + (metricRows - 1) * em(u, 0.18f) : 0;
  float titleH = 0;
  if (L->hasTitle) titleH = kat_text_height(base * 0.62f) + kat_text_height(base * 0.95f) + em(u, 0.1f);
  float alertH = 0;
  float alertW = 0;
  if (L->hasAlert) {
    alertH = kat_text_height(base * 0.8f) + em(u, 0.3f);
    alertW = text_w(m->alerts[0], base * 0.8f, 1);
  }
  float contentW = metricsW;
  if (titleH) {
    float tw = text_w(m->gameName, base * 0.95f, 1);
    if (tw > 19.0f * base) tw = 19.0f * base;
    if (tw + em(u, 0.7f) > contentW) contentW = tw + em(u, 0.7f);
    float sw = text_spaced_w("ŞİMDİ OYNANIYOR", base * 0.62f, 1, base * 0.62f * 0.12f);
    if (sw + em(u, 0.7f) > contentW) contentW = sw + em(u, 0.7f);
  }
  if (alertW > contentW) contentW = alertW;
  L->w = contentW + L->padX * 2;
  L->h = L->padY * 2 + metricsH + (titleH ? titleH + L->gap : 0) + (alertH ? alertH + L->gap : 0);
  if (L->w < em(u, 7.5f)) L->w = em(u, 7.5f);
}

static void hud_draw(kui *u, const katman_shm *m, krect box) {
  kdraw *d = &u->draw;
  float base = 13.0f * u->scale;
  float alpha = m->opacity > 100 ? 1.0f : (float)m->opacity / 100.0f;
  dl_rect(d, box, with_alpha(KCOL_BG_SOLID, alpha), box.h < em(u, 2) ? 0 : em(u, 0.75f));
  dl_rect_border(d, box, KCOL_BORDER, em(u, 0.75f), 1.0f * u->scale);
  float x = box.x + em(u, 0.75f), y = box.y + em(u, 0.6f);
  float maxTextW = box.w - em(u, 1.5f);

  if (m->alertCount && m->alerts[0][0]) {
    kcolor c = m->alertLevel[0] >= 2 ? KCOL_DANGER : KCOL_WARN;
    dl_rect(d, (krect){x, y, maxTextW, kat_text_height(base * 0.8f) + em(u, 0.2f)}, with_alpha(c, 0.14f), em(u, 0.4f));
    dl_text_fit(d, x + em(u, 0.4f), y + em(u, 0.1f), m->alerts[0], base * 0.8f, c, 1, maxTextW - em(u, 0.8f));
    y += kat_text_height(base * 0.8f) + em(u, 0.2f) + em(u, 0.35f);
  }
  if (m->showTitle && m->gameName[0]) {
    /* sol kenarda vurgu çizgisi (CSS: border-left 0.2em accent) */
    float th = kat_text_height(base * 0.62f) + kat_text_height(base * 0.95f) + em(u, 0.05f);
    dl_rect(d, (krect){x, y, em(u, 0.2f), th}, KCOL_ACCENT, em(u, 0.1f));
    float tx = x + em(u, 0.7f);
    text_spaced(d, tx, y, "ŞİMDİ OYNANIYOR", base * 0.62f, KCOL_MUTED, 1, base * 0.62f * 0.12f);
    y += kat_text_height(base * 0.62f);
    dl_text_fit(d, tx, y, m->gameName, base * 0.95f, KCOL_TEXT, 1, maxTextW - em(u, 0.7f));
    y += kat_text_height(base * 0.95f) + em(u, 0.35f);
  }
  uint32_t rows = m->metricCount > KATMAN_MAX_METRICS ? KATMAN_MAX_METRICS : m->metricCount;
  /* sütun genişlikleri */
  float labelW[2] = {0, 0}, valueW[2] = {0, 0};
  for (uint32_t i = 0; i < rows; i++) {
    const katman_metric *mt = &m->metrics[i];
    uint32_t c = i % 2;
    float lw = text_spaced_w(mt->label, base * 0.72f, 1, base * 0.72f * 0.06f);
    float vw = text_w(mt->value, base, 1);
    if (mt->unit[0]) vw += text_w(mt->unit, base * 0.8f, 0) + em(u, 0.1f);
    if (lw > labelW[c]) labelW[c] = lw;
    if (vw > valueW[c]) valueW[c] = vw;
  }
  float rowH = kat_text_height(base);
  float colGap = em(u, 0.9f);
  float rowGap = em(u, 0.18f);
  for (uint32_t i = 0; i < rows; i++) {
    const katman_metric *mt = &m->metrics[i];
    uint32_t c = i % 2;
    uint32_t r = i / 2;
    float cx = x + (c ? labelW[0] + em(u, 0.3f) + valueW[0] + colGap : 0);
    float cy = y + r * (rowH + rowGap);
    kcolor valCol = mt->level >= 2 ? KCOL_DANGER : mt->level == 1 ? KCOL_WARN : KCOL_TEXT;
    text_spaced(d, cx, cy + (rowH - kat_text_height(base * 0.72f)) * 0.5f, mt->label, base * 0.72f, KCOL_MUTED, 1,
                base * 0.72f * 0.06f);
    float vx = cx + labelW[c] + em(u, 0.3f);
    dl_text(d, vx, cy, mt->value, base, valCol, 1);
    if (mt->unit[0]) dl_text(d, vx + text_w(mt->value, base, 1) + em(u, 0.1f), cy + rowH * 0.12f, mt->unit, base * 0.8f, KCOL_MUTED, 0);
  }
}

/* ---------------- "Şimdi oynanıyor" bildirimi ---------------- */
static uint64_t g_noticeSince = 0;
static char g_noticeText[128] = {0};

static void notice_draw(kui *u, const katman_shm *m, krect area) {
  if (!m->showNotice) return;
  if (strcmp(g_noticeText, m->noticeText) != 0) {
    snprintf(g_noticeText, sizeof g_noticeText, "%s", m->noticeText);
    g_noticeSince = kat_now_us();
  }
  if (!g_noticeText[0]) return;
  uint64_t elapsed = kat_now_us() - g_noticeSince;
  uint32_t total = m->toastMs ? m->toastMs : 4200;
  if (elapsed > (uint64_t)total * 1000) return;
  kdraw *d = &u->draw;
  float base = 13.0f * u->scale;
  /* sağdan kayma: ilk 320 ms girer, son 420 ms çıkar */
  float t = 1.0f;
  if (elapsed < 320000) t = (float)elapsed / 320000.0f;
  else if (elapsed > (uint64_t)(total - 420) * 1000)
    t = (float)((uint64_t)total * 1000 - elapsed) / 420000.0f;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  t = t * t * (3 - 2 * t); /* yumuşatma */
  char small[64];
  snprintf(small, sizeof small, "%s", "ŞİMDİ OYNANIYOR");
  float w = em(u, 1.4f) + text_spaced_w(small, base * 0.62f, 1, base * 0.06f) + text_w(m->noticeText, base * 0.95f, 1) + em(u, 2.2f);
  float h = em(u, 1.2f) + kat_text_height(base * 0.62f) + kat_text_height(base * 0.95f);
  float x = area.x + area.w - w * t - em(u, 1.0f);
  float y = area.y + area.h * 0.42f;
  dl_rect(d, (krect){x, y, w, h}, with_alpha(KCOL_BG_SOLID, 0.92f), em(u, 0.75f));
  dl_rect_border(d, (krect){x, y, w, h}, KCOL_BORDER, em(u, 0.75f), u->scale);
  /* ▶ simgesi için yuvarlak zemin */
  float cx = x + em(u, 1.1f), cy = y + h * 0.5f;
  dl_rect(d, (krect){cx - em(u, 0.55f), cy - em(u, 0.55f), em(u, 1.1f), em(u, 1.1f)}, with_alpha(KCOL_ACCENT, 0.18f), em(u, 0.55f));
  dl_text(d, cx - em(u, 0.3f), cy - kat_text_height(base * 0.8f) * 0.5f, "\xe2\x96\xb6", base * 0.8f, KCOL_ACCENT, 1);
  float tx = x + em(u, 2.0f);
  text_spaced(d, tx, y + em(u, 0.6f), small, base * 0.62f, KCOL_MUTED, 1, base * 0.06f);
  dl_text_fit(d, tx, y + em(u, 0.6f) + kat_text_height(base * 0.62f), m->noticeText, base * 0.95f, KCOL_TEXT, 1, w - em(u, 2.4f));
}

/* ---------------- panel ---------------- */
#define ROW_H(u) (34.0f * (u)->scale)

static krect panel_box(kui *u, krect area) {
  float w = 860.0f * u->scale, h = 620.0f * u->scale;
  if (w > area.w * 0.92f) w = area.w * 0.92f;
  if (h > area.h * 0.92f) h = area.h * 0.92f;
  krect r = {area.x + (area.w - w) * 0.5f, area.y + (area.h - h) * 0.5f, w, h};
  return r;
}

static bool in_rect(float x, float y, krect r) { return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; }

static void draw_switch(kdraw *d, krect r, bool on, bool disabled) {
  kcolor bg = disabled ? krgba(255, 255, 255, 16) : on ? KCOL_ACCENT : krgba(255, 255, 255, 26);
  dl_rect(d, r, bg, r.h * 0.5f);
  float knob = r.h - 4.0f;
  float kx = on ? r.x + r.w - knob - 2.0f : r.x + 2.0f;
  dl_rect(d, (krect){kx, r.y + 2.0f, knob, knob}, disabled ? KCOL_FAINT : KCOL_BG_SOLID, knob * 0.5f);
}

static void draw_button(kdraw *d, krect r, const char *label, bool hover, bool disabled, float scale) {
  dl_rect(d, r, disabled ? KCOL_ROW : hover ? KCOL_ROW_HOVER : KCOL_ROW, 8.0f * scale);
  dl_rect_border(d, r, hover && !disabled ? with_alpha(KCOL_ACCENT, 0.5f) : KCOL_BORDER, 8.0f * scale, scale);
  float size = 12.5f * scale;
  float w = text_w(label, size, 0);
  dl_text(d, r.x + (r.w - w) * 0.5f, r.y + (r.h - kat_text_height(size)) * 0.5f, label, size,
          disabled ? KCOL_FAINT : KCOL_TEXT, 0);
}

static void panel_draw(kui *u, const katman_shm *m, krect area) {
  kdraw *d = &u->draw;
  krect box = panel_box(u, area);
  u->panelRect = box;
  float s = u->scale;
  dl_rect(d, box, KCOL_PANEL, 14.0f * s);
  dl_rect_border(d, box, KCOL_BORDER, 14.0f * s, s);
  /* gölge yerine hafif dış çerçeve */
  dl_rect_border(d, (krect){box.x - 2 * s, box.y - 2 * s, box.w + 4 * s, box.h + 4 * s}, krgba(0, 0, 0, 60), 16.0f * s, 2 * s);

  float headH = 54.0f * s;
  dl_text(d, box.x + 20 * s, box.y + 12 * s, "Oyun katmanı", 16.0f * s, KCOL_TEXT, 1);
  /* kapat düğmesi */
  krect close = {box.x + box.w - 40 * s, box.y + 12 * s, 26 * s, 26 * s};
  bool closeHover = in_rect(u->in.mx, u->in.my, close);
  dl_rect(d, close, closeHover ? KCOL_ROW_HOVER : KCOL_ROW, 8 * s);
  dl_text(d, close.x + 6 * s, close.y + 3 * s, "\xc3\x97", 15.0f * s, closeHover ? KCOL_TEXT : KCOL_MUTED, 0);
  if (u->in.lPressed && closeHover) ui_push_command((katman_shm *)m, KCMD_PANEL, "", 0, 0, "close");

  /* sekmeler */
  float tx = box.x + 20 * s;
  float tabY = box.y + 38 * s;
  for (uint32_t i = 0; i < m->tabCount && i < 6; i++) {
    float w = text_w(m->tabs[i], 12.5f * s, 0) + 20 * s;
    bool sel = m->panelTab == i;
    bool hover = in_rect(u->in.mx, u->in.my, (krect){tx, tabY - 6 * s, w, 20 * s});
    dl_text(d, tx + 10 * s, tabY - 4 * s, m->tabs[i], 12.5f * s, sel ? KCOL_ACCENT : hover ? KCOL_TEXT : KCOL_MUTED, sel ? 1 : 0);
    if (sel) dl_rect(d, (krect){tx + 8 * s, tabY + 12 * s, w - 16 * s, 2 * s}, KCOL_ACCENT, s);
    if (u->in.lPressed && hover) ui_push_command((katman_shm *)m, KCMD_ACTION, "tab", (int32_t)i, 0, "tab");
    tx += w + 6 * s;
  }
  dl_rect(d, (krect){box.x + 1, box.y + headH, box.w - 2, s}, KCOL_BORDER, 0);

  /* gövde */
  krect body = {box.x + 12 * s, box.y + headH + 8 * s, box.w - 24 * s, box.h - headH - 20 * s};
  dl_push_clip(d, body);
  float y = body.y - u->panelScroll;
  uint32_t rows = m->rowCount > KATMAN_MAX_ROWS ? KATMAN_MAX_ROWS : m->rowCount;
  float contentH = 0;
  for (uint32_t i = 0; i < rows; i++) {
    const katman_row *r = &m->rows[i];
    float h = r->kind == KROW_HEADER ? 30 * s : r->kind == KROW_HINT ? 26 * s : ROW_H(u);
    contentH += h;
    krect rr = {body.x, y, body.w, h};
    bool hover = in_rect(u->in.mx, u->in.my, rr);
    bool disabled = (r->flags & KROW_F_DISABLED) != 0;
    kcolor textCol = disabled ? KCOL_FAINT : KCOL_TEXT;
    if (rr.y + h < body.y || rr.y > body.y + body.h) {
      y += h;
      continue;
    }
    switch (r->kind) {
    case KROW_HEADER:
      if (i) dl_rect(d, (krect){body.x, rr.y + 4 * s, body.w, s}, KCOL_BORDER, 0);
      text_spaced(d, body.x + 6 * s, rr.y + 12 * s, r->label, 11.5f * s, KCOL_MUTED, 1, 11.5f * s * 0.1f);
      break;
    case KROW_HINT:
      dl_text_fit(d, body.x + 6 * s, rr.y + 6 * s, r->hint[0] ? r->hint : r->label, 11.5f * s, KCOL_FAINT, 0, body.w - 12 * s);
      break;
    case KROW_TOGGLE: {
      if (hover) dl_rect(d, rr, KCOL_ROW, 8 * s);
      dl_text_fit(d, body.x + 6 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w - 90 * s);
      krect sw = {rr.x + rr.w - 46 * s, rr.y + (h - 22 * s) * 0.5f, 40 * s, 22 * s};
      draw_switch(d, sw, r->num != 0, disabled);
      if (u->in.lPressed && hover && !disabled)
        ui_push_command((katman_shm *)m, KCMD_SET, r->id, r->num ? 0 : 1, 0, NULL);
      break;
    }
    case KROW_SELECT: {
      if (hover) dl_rect(d, rr, KCOL_ROW, 8 * s);
      dl_text_fit(d, body.x + 6 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w * 0.5f);
      const char *val = r->value[0] ? r->value : (r->optionCount ? r->options[r->num < (int32_t)r->optionCount ? r->num : 0] : "");
      float vw = text_w(val, 12.5f * s, 0);
      krect bx = {rr.x + rr.w - vw - 56 * s, rr.y + (h - 26 * s) * 0.5f, vw + 50 * s, 26 * s};
      dl_rect(d, bx, KCOL_ROW, 8 * s);
      dl_rect_border(d, bx, KCOL_BORDER, 8 * s, s);
      dl_text(d, bx.x + 10 * s, bx.y + (bx.h - kat_text_height(12.5f * s)) * 0.5f, val, 12.5f * s, disabled ? KCOL_FAINT : KCOL_TEXT, 0);
      dl_text(d, bx.x + bx.w - 22 * s, bx.y + (bx.h - kat_text_height(12.5f * s)) * 0.5f, "\xe2\x8c\x84", 12.0f * s, KCOL_MUTED, 0);
      if (u->in.lPressed && !disabled) {
        int32_t next = r->optionCount ? (r->num + 1) % (int32_t)r->optionCount : 0;
        ui_push_command((katman_shm *)m, KCMD_SET, r->id, next, 0, NULL);
      }
      break;
    }
    case KROW_SLIDER: {
      if (hover) dl_rect(d, rr, KCOL_ROW, 8 * s);
      dl_text_fit(d, body.x + 6 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w * 0.4f);
      float trackX = rr.x + body.w * 0.45f, trackW = rr.w - body.w * 0.45f - 60 * s;
      float trackY = rr.y + h * 0.5f;
      dl_rect(d, (krect){trackX, trackY - 2 * s, trackW, 4 * s}, KCOL_ROW_HOVER, 2 * s);
      float range = r->max - r->min;
      float t = range > 0 ? (r->val - r->min) / range : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      dl_rect(d, (krect){trackX, trackY - 2 * s, trackW * t, 4 * s}, KCOL_ACCENT, 2 * s);
      dl_rect(d, (krect){trackX + trackW * t - 6 * s, trackY - 6 * s, 12 * s, 12 * s}, KCOL_TEXT, 6 * s);
      char buf[32];
      snprintf(buf, sizeof buf, "%s", r->value[0] ? r->value : "");
      dl_text(d, rr.x + rr.w - 52 * s, rr.y + (h - kat_text_height(12.0f * s)) * 0.5f, buf, 12.0f * s, KCOL_MUTED, 0);
      if (u->in.lDown && hover && !disabled) {
        float nt = (u->in.mx - trackX) / (trackW > 0 ? trackW : 1);
        if (nt < 0) nt = 0;
        if (nt > 1) nt = 1;
        float nv = r->min + nt * range;
        if (r->step > 0) nv = r->min + roundf((nv - r->min) / r->step) * r->step;
        if (fabsf(nv - r->val) > 1e-6f) ui_push_command((katman_shm *)m, KCMD_SET, r->id, 0, nv, NULL);
      }
      break;
    }
    case KROW_NUMBER:
    case KROW_TEXT: {
      if (hover) dl_rect(d, rr, KCOL_ROW, 8 * s);
      dl_text_fit(d, body.x + 6 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w * 0.5f);
      krect bx = {rr.x + rr.w - 130 * s, rr.y + (h - 28 * s) * 0.5f, 124 * s, 28 * s};
      bool editing = u->editingRow == (int)i && u->textEditing;
      dl_rect(d, bx, editing ? with_alpha(KCOL_ACCENT, 0.12f) : KCOL_ROW, 8 * s);
      dl_rect_border(d, bx, editing ? KCOL_ACCENT : KCOL_BORDER, 8 * s, s);
      const char *shown = editing ? u->editBuf : r->value;
      dl_text_fit(d, bx.x + 10 * s, bx.y + (bx.h - kat_text_height(12.5f * s)) * 0.5f, shown, 12.5f * s,
                  disabled ? KCOL_FAINT : KCOL_TEXT, 0, bx.w - 20 * s);
      if (u->in.lPressed && !disabled) {
        if (!editing) {
          u->textEditing = true;
          u->editingRow = (int)i;
          snprintf(u->editBuf, sizeof u->editBuf, "%s", r->value);
        }
      } else if (u->in.lPressed && editing && !in_rect(u->in.mx, u->in.my, bx)) {
        ui_push_command((katman_shm *)m, KCMD_SET, r->id, 0, (float)atof(u->editBuf), u->editBuf);
        u->textEditing = false;
        u->editingRow = -1;
      }
      if (editing) {
        if (u->in.keyVk == VK_RETURN || u->in.keyVk == VK_ESCAPE) {
          if (u->in.keyVk == VK_RETURN)
            ui_push_command((katman_shm *)m, KCMD_SET, r->id, 0, (float)atof(u->editBuf), u->editBuf);
          u->textEditing = false;
          u->editingRow = -1;
        } else if (u->in.keyVk == VK_BACK) {
          size_t n = strlen(u->editBuf);
          if (n) {
            do {
              n--;
            } while (n && ((unsigned char)u->editBuf[n] & 0xC0) == 0x80);
            u->editBuf[n] = 0;
          }
        } else if (u->in.typed[0]) {
          size_t n = strlen(u->editBuf);
          size_t add = strlen(u->in.typed);
          if (n + add < sizeof u->editBuf - 1) {
            memcpy(u->editBuf + n, u->in.typed, add);
            u->editBuf[n + add] = 0;
          }
        }
      }
      break;
    }
    case KROW_BUTTON: {
      krect bx = {rr.x + rr.w - 150 * s, rr.y + (h - 30 * s) * 0.5f, 144 * s, 30 * s};
      if (!r->value[0]) bx = (krect){rr.x + 6 * s, rr.y + (h - 30 * s) * 0.5f, rr.w - 12 * s, 30 * s};
      bool bh = in_rect(u->in.mx, u->in.my, bx);
      draw_button(d, bx, r->label, bh, disabled, s);
      if (r->hint[0]) dl_text_fit(d, rr.x + 6 * s, rr.y + (h - kat_text_height(11.5f * s)) * 0.5f, r->hint, 11.5f * s,
                                  KCOL_FAINT, 0, rr.w - 170 * s);
      if (u->in.lPressed && bh && !disabled) ui_push_command((katman_shm *)m, KCMD_ACTION, r->id, 0, 0, "click");
      break;
    }
    case KROW_LIST: {
      bool sel = (r->flags & KROW_F_SELECTED) != 0;
      dl_rect(d, rr, sel ? KCOL_ROW_SEL : hover ? KCOL_ROW_HOVER : KCOL_ROW, 8 * s);
      if (sel) dl_rect(d, (krect){rr.x, rr.y + 4 * s, 3 * s, h - 8 * s}, KCOL_ACCENT, 1.5f * s);
      dl_text_fit(d, body.x + 14 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w - 120 * s);
      if (r->value[0]) dl_text(d, rr.x + rr.w - 100 * s, rr.y + (h - kat_text_height(12.0f * s)) * 0.5f, r->value,
                               12.0f * s, KCOL_MUTED, 0);
      krect up = {rr.x + rr.w - 60 * s, rr.y + (h - 24 * s) * 0.5f, 26 * s, 24 * s};
      krect down = {rr.x + rr.w - 30 * s, up.y, 26 * s, 24 * s};
      bool uh = in_rect(u->in.mx, u->in.my, up), dh = in_rect(u->in.mx, u->in.my, down);
      dl_rect(d, up, uh ? KCOL_ROW_HOVER : KCOL_ROW, 6 * s);
      dl_rect(d, down, dh ? KCOL_ROW_HOVER : KCOL_ROW, 6 * s);
      dl_text(d, up.x + 7 * s, up.y + 3 * s, "\xe2\x86\x91", 12.0f * s, KCOL_MUTED, 0);
      dl_text(d, down.x + 7 * s, down.y + 3 * s, "\xe2\x86\x93", 12.0f * s, KCOL_MUTED, 0);
      if (u->in.lPressed) {
        if (uh && !disabled) ui_push_command((katman_shm *)m, KCMD_ACTION, r->id, r->num, 0, "up");
        else if (dh && !disabled)
          ui_push_command((katman_shm *)m, KCMD_ACTION, r->id, r->num, 0, "down");
        else if (hover)
          ui_push_command((katman_shm *)m, KCMD_ACTION, r->id, r->num, 0, "select");
      }
      break;
    }
    case KROW_COLOR: {
      kcolor c;
      c.v = (uint32_t)r->num;
      dl_rect(d, (krect){body.x + 6 * s, rr.y + (h - 18 * s) * 0.5f, 18 * s, 18 * s}, c, 5 * s);
      dl_text(d, body.x + 32 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0);
      break;
    }
    default:
      dl_text_fit(d, body.x + 6 * s, rr.y + (h - kat_text_height(12.5f * s)) * 0.5f, r->label, 12.5f * s, textCol, 0,
                  body.w - 12 * s);
      break;
    }
    if (r->flags & KROW_F_DIRTY) dl_rect(d, (krect){rr.x + rr.w - 4 * s, rr.y + 6 * s, 3 * s, h - 12 * s}, KCOL_ACCENT, 1.5f * s);
    y += h;
  }
  dl_pop_clip(d);
  /* kaydırma */
  float maxScroll = contentH - body.h;
  if (maxScroll < 0) maxScroll = 0;
  if (u->in.scroll != 0) {
    u->panelScroll -= u->in.scroll * 42.0f * s;
    u->in.scroll = 0;
  }
  if (u->panelScroll < 0) u->panelScroll = 0;
  if (u->panelScroll > maxScroll) u->panelScroll = maxScroll;
  if (maxScroll > 0) {
    float barH = body.h * (body.h / contentH);
    if (barH < 24 * s) barH = 24 * s;
    float barY = body.y + (body.h - barH) * (u->panelScroll / maxScroll);
    dl_rect(d, (krect){box.x + box.w - 7 * s, barY, 4 * s, barH}, with_alpha(KCOL_TEXT, 0.25f), 2 * s);
  }
  /* alt bilgi: kısayol hatırlatması */
  char foot[128];
  snprintf(foot, sizeof foot, "Kapatmak i\xc3\xa7in Ctrl + Tab ya da Esc");
  dl_text(d, box.x + 20 * s, box.y + box.h - 20 * s, foot, 11.0f * s, KCOL_FAINT, 0);
}

/* ---------------- kare ---------------- */
static uint32_t g_lastSeq = 0;

void ui_init(kui *u, katman_shm *shm) {
  memset(u, 0, sizeof *u);
  u->shm = shm;
  u->scale = 1.0f;
  u->editingRow = -1;
  dl_init(&u->draw);
  if (!font_init(&u->font, 1.0f)) KAT_LOG("yazı tipi başlatılamadı");
  kat_set_active_font(&u->font);
}

void ui_free(kui *u) {
  dl_free(&u->draw);
  font_free(&u->font);
  kat_set_active_font(NULL);
}

bool ui_frame(kui *u, kbackend *be, bool panelHotkey) {
  (void)be;
  katman_shm *m = u->shm;
  dl_reset(&u->draw);
  if (!m) return false;
  /* Ölçüler için kısa bir kopya: kilit altında yalnız okunur. */
  static katman_shm snap;
  bool locked = shm_lock(m);
  if (locked) {
    memcpy(&snap, (const void *)m, sizeof snap);
    snap.busy = 0;
    shm_unlock(m);
  } else
    memcpy(&snap, (const void *)m, sizeof snap); /* kilit alınamadı: yaklaşık kopya */
  if (snap.magic != KATMAN_SHM_MAGIC) return false;
  if (!snap.mode) return false;

  u->scale = snap.scale > 0.2f && snap.scale < 8.0f ? snap.scale : 1.0f;
  /* Çizim uzayı oyunun İSTEMCİ alanıdır (0,0 sol üst). Ölçüler kancadan gelir;
     kanca vermediyse paylaşımlı bellekteki istemci alanı kullanılır. */
  int w = u->vpW, h = u->vpH;
  if (w < 32 || h < 32) {
    w = snap.areaW;
    h = snap.areaH;
  }
  if (w < 32 || h < 32) return false;
  krect area = {0, 0, (float)w, (float)h};

  /* panel kısayolu */
  static bool panelWas = false;
  bool panelNow = snap.panelOpen != 0;
  if (panelHotkey) ui_push_command(m, KCMD_PANEL, "", panelNow ? 0 : 1, 0, panelNow ? "close" : "open");
  if (panelNow != panelWas) {
    u->panelScroll = 0;
    u->textEditing = false;
    u->editingRow = -1;
    panelWas = panelNow;
  }

  if (panelNow && snap.mode >= KATMAN_HUD_PANEL) {
    panel_draw(u, &snap, area);
    /* Panelin dışına tıklemek kapatır (masaüstü pencerelerindeki gibi). */
    if (u->in.lPressed && !in_rect(u->in.mx, u->in.my, u->panelRect))
      ui_push_command(m, KCMD_PANEL, "", 0, 0, "close");
  } else {
    hudLayout L;
    hud_measure(u, &snap, &L);
    float margin = (float)(snap.margin > 0 ? snap.margin : 14);
    float x, y;
    switch (snap.position) {
    case 1:
      x = area.x + area.w - L.w - margin;
      y = area.y + area.h - L.h - margin;
      break;
    case 2:
      x = area.x + margin;
      y = area.y + margin;
      break;
    case 3:
      x = area.x + margin;
      y = area.y + area.h - L.h - margin;
      break;
    default:
      x = area.x + area.w - L.w - margin;
      y = area.y + margin;
      break;
    }
    if (x < area.x) x = area.x;
    if (y < area.y) y = area.y;
    if (snap.metricCount || (snap.showTitle && snap.gameName[0]) || snap.alertCount) hud_draw(u, &snap, (krect){x, y, L.w, L.h});
    notice_draw(u, &snap, area);
  }
  g_lastSeq = snap.seq;
  (void)g_lastSeq;
  return u->draw.count > 0;
}
