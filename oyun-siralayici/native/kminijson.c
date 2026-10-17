#include "kminijson.h"
#include <string.h>
#include <stdlib.h>

void kj_arena_init(kj_arena *a, kjv *nodes, int cap, char *scratch, int scratchCap) {
  a->nodes = nodes;
  a->cap = cap;
  a->used = 0;
  a->scratch = scratch;
  a->scratchCap = scratchCap;
  a->scratchUsed = 0;
}

typedef struct {
  kj_arena *a;
  const char *p;
  bool bad;
} kj_parser;

static kjv *new_node(kj_parser *ps) {
  if (ps->a->used >= ps->a->cap) {
    ps->bad = true;
    return NULL;
  }
  kjv *n = &ps->a->nodes[ps->a->used++];
  memset(n, 0, sizeof *n);
  return n;
}

static void skip_ws(kj_parser *ps) {
  while (*ps->p == ' ' || *ps->p == '\t' || *ps->p == '\r' || *ps->p == '\n') ps->p++;
}

static kjv *parse_value(kj_parser *ps, int depth);

static char *copy_string(kj_parser *ps, int *outLen) {
  /* ps->p '"' üzerinde */
  ps->p++;
  const char *start = ps->p;
  int need = 0;
  const char *q = ps->p;
  while (*q && *q != '"') {
    if (*q == '\\' && q[1]) q++;
    q++;
    need++;
  }
  if (*q != '"') {
    ps->bad = true;
    return NULL;
  }
  int len = (int)(q - start);
  if (ps->a->scratchUsed + len + 1 > ps->a->scratchCap) {
    ps->bad = true;
    return NULL;
  }
  char *dst = ps->a->scratch + ps->a->scratchUsed;
  ps->a->scratchUsed += len + 1;
  int o = 0;
  const char *r = start;
  while (r < q) {
    char c = *r++;
    if (c == '\\' && r < q) {
      char e = *r++;
      switch (e) {
      case 'n': dst[o++] = '\n'; break;
      case 't': dst[o++] = '\t'; break;
      case 'r': dst[o++] = '\r'; break;
      case 'b': dst[o++] = '\b'; break;
      case 'f': dst[o++] = '\f'; break;
      case 'u': {
        /* BMP dışı nadir: dört onaltılığı atla, '?' koy (uygulama Türkçe metin
           gönderir, \u kaçışları beklenmez) */
        unsigned int cp = 0;
        for (int i = 0; i < 4 && r < q; i++) {
          char h = *r++;
          cp <<= 4;
          if (h >= '0' && h <= '9') cp |= (unsigned)(h - '0');
          else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
          else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
        }
        /* UTF-8 olarak yaz */
        if (cp < 0x80) dst[o++] = (char)cp;
        else if (cp < 0x800) {
          dst[o++] = (char)(0xC0 | (cp >> 6));
          dst[o++] = (char)(0x80 | (cp & 0x3F));
        } else {
          dst[o++] = (char)(0xE0 | (cp >> 12));
          dst[o++] = (char)(0x80 | ((cp >> 6) & 0x3F));
          dst[o++] = (char)(0x80 | (cp & 0x3F));
        }
        break;
      }
      default: dst[o++] = e; break;
      }
    } else
      dst[o++] = c;
  }
  dst[o] = 0;
  *outLen = o;
  ps->p = q + 1;
  return dst;
}

static kjv *parse_value(kj_parser *ps, int depth) {
  if (depth > 12) {
    ps->bad = true;
    return NULL;
  }
  skip_ws(ps);
  kjv *n = new_node(ps);
  if (!n) return NULL;
  char c = *ps->p;
  if (c == '{') {
    n->t = KJ_OBJ;
    ps->p++;
    kjv *tail = NULL;
    skip_ws(ps);
    if (*ps->p == '}') {
      ps->p++;
      return n;
    }
    for (;;) {
      skip_ws(ps);
      if (*ps->p != '"') {
        ps->bad = true;
        return NULL;
      }
      int klen = 0;
      char *key = copy_string(ps, &klen);
      if (!key) return NULL;
      skip_ws(ps);
      if (*ps->p != ':') {
        ps->bad = true;
        return NULL;
      }
      ps->p++;
      kjv *v = parse_value(ps, depth + 1);
      if (!v) return NULL;
      v->key = key;
      if (tail) tail->next = v;
      else n->child = v;
      tail = v;
      skip_ws(ps);
      if (*ps->p == ',') {
        ps->p++;
        continue;
      }
      if (*ps->p == '}') {
        ps->p++;
        return n;
      }
      ps->bad = true;
      return NULL;
    }
  }
  if (c == '[') {
    n->t = KJ_ARR;
    ps->p++;
    kjv *tail = NULL;
    skip_ws(ps);
    if (*ps->p == ']') {
      ps->p++;
      return n;
    }
    for (;;) {
      kjv *v = parse_value(ps, depth + 1);
      if (!v) return NULL;
      if (tail) tail->next = v;
      else n->child = v;
      tail = v;
      skip_ws(ps);
      if (*ps->p == ',') {
        ps->p++;
        continue;
      }
      if (*ps->p == ']') {
        ps->p++;
        return n;
      }
      ps->bad = true;
      return NULL;
    }
  }
  if (c == '"') {
    int len = 0;
    char *s = copy_string(ps, &len);
    if (!s) return NULL;
    n->t = KJ_STR;
    n->str = s;
    n->strLen = len;
    return n;
  }
  if (!strncmp(ps->p, "true", 4)) {
    ps->p += 4;
    n->t = KJ_BOOL;
    n->boolean = true;
    return n;
  }
  if (!strncmp(ps->p, "false", 5)) {
    ps->p += 5;
    n->t = KJ_BOOL;
    n->boolean = false;
    return n;
  }
  if (!strncmp(ps->p, "null", 4)) {
    ps->p += 4;
    n->t = KJ_NULL;
    return n;
  }
  if (c == '-' || (c >= '0' && c <= '9')) {
    char *end = NULL;
    n->num = strtod(ps->p, &end);
    if (end == ps->p) {
      ps->bad = true;
      return NULL;
    }
    ps->p = end;
    n->t = KJ_NUM;
    return n;
  }
  ps->bad = true;
  return NULL;
}

const kjv *kj_parse(kj_arena *a, const char *text) {
  if (!text) return NULL;
  kj_parser ps;
  ps.a = a;
  ps.p = text;
  ps.bad = false;
  kjv *root = parse_value(&ps, 0);
  if (ps.bad) return NULL;
  return root;
}

const kjv *kj_get(const kjv *obj, const char *key) {
  if (!obj || obj->t != KJ_OBJ) return NULL;
  for (kjv *c = obj->child; c; c = c->next)
    if (c->key && !strcmp(c->key, key)) return c;
  return NULL;
}

const char *kj_str(const kjv *obj, const char *key, const char *def, int *len) {
  const kjv *v = kj_get(obj, key);
  if (!v || v->t != KJ_STR) return def;
  if (len) *len = v->strLen;
  return v->str;
}

double kj_num(const kjv *obj, const char *key, double def) {
  const kjv *v = kj_get(obj, key);
  if (!v) return def;
  if (v->t == KJ_NUM) return v->num;
  if (v->t == KJ_BOOL) return v->boolean ? 1 : 0;
  return def;
}

bool kj_bool(const kjv *obj, const char *key, bool def) {
  const kjv *v = kj_get(obj, key);
  if (!v || v->t != KJ_BOOL) return def;
  return v->boolean;
}

int kj_arr_len(const kjv *arr) {
  if (!arr || arr->t != KJ_ARR) return 0;
  int n = 0;
  for (kjv *c = arr->child; c; c = c->next) n++;
  return n;
}

const kjv *kj_at(const kjv *arr, int i) {
  if (!arr || arr->t != KJ_ARR) return NULL;
  int k = 0;
  for (kjv *c = arr->child; c; c = c->next, k++)
    if (k == i) return c;
  return NULL;
}
