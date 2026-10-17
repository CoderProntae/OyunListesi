/* Küçük JSON okuyucu (arena tabanlı, malloc yok): yardımcı süreç, Electron'dan
 * gelen "osd <json>" satırını paylaşımlı bellek yapısına işlerken kullanır.
 * Amaç tam bir JSON uygulaması değil, uygulamanın ürettiği biçimi okumaktır;
 * yine de bozuk girdide asla çökmez (sınır denetimli). */
#ifndef OYUN_KMINIJSON_H
#define OYUN_KMINIJSON_H

#include <stdbool.h>
#include <stddef.h>

typedef enum { KJ_NULL = 0, KJ_BOOL, KJ_NUM, KJ_STR, KJ_ARR, KJ_OBJ } kj_type;

typedef struct kjv {
  kj_type t;
  const char *key; /* nesne üyesiyse adı */
  double num;
  bool boolean;
  const char *str; /* NUL sonlandırmalı değildir: strLen kullan */
  int strLen;
  struct kjv *child;
  struct kjv *next;
} kjv;

typedef struct {
  kjv *nodes;
  int cap;
  int used;
  char *scratch;   /* kaçış çözülmüş dizgeler için geçici alan */
  int scratchCap;
  int scratchUsed;
} kj_arena;

void kj_arena_init(kj_arena *a, kjv *nodes, int cap, char *scratch, int scratchCap);
/* Başarısız olursa NULL döner; metin NUL sonlandırmalıdır. */
const kjv *kj_parse(kj_arena *a, const char *text);
const kjv *kj_get(const kjv *obj, const char *key);
const char *kj_str(const kjv *obj, const char *key, const char *def, int *len);
double kj_num(const kjv *obj, const char *key, double def);
bool kj_bool(const kjv *obj, const char *key, bool def);
int kj_arr_len(const kjv *arr);
const kjv *kj_at(const kjv *arr, int i);

#endif
