import { pageArgs } from "./pages";
import { personalPatch, researchArgs } from "./research";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
const id = z.string().min(1).max(100),
  ids = z.array(id).min(1).max(500),
  text = z.string().min(1).max(1000);
const question = z
  .object({
    id,
    question: z.string().min(1).max(500),
    options: z
      .array(z.object({ id, label: z.string().min(1).max(250) }).strict())
      .min(2)
      .max(6),
    multiple: z.boolean().default(false),
  })
  .strict()
  .refine(
    (q) => new Set(q.options.map((o) => o.id)).size === q.options.length,
    "Seçenek kimlikleri benzersiz olmalı.",
  );

// One contract: native/JSON tool descriptions are generated from the validator.
// Cross-field / existing-record checks remain runtime validations, with repair errors.
function tool(description: string, schema: z.ZodTypeAny, mutation = false) {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as any;
  const { $schema, ...parameters } = json;
  return {
    description,
    schema,
    mutation,
    parameters,
    properties: parameters.properties,
    required: parameters.required || [],
  };
}
const groupFields = {
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icon: z.string().max(30),
};
export const toolSpecs: Record<string, ReturnType<typeof tool>> = {
  edit_game: tool(
    "Tek oyunun kişisel alanlarını (ad, etiketler, puan, durum, kişisel süre) düzenle; birden çok oyun için edit_games. Geri alınabilir.",
    z.object({ gameId: id, patch: personalPatch }).strict(),
    true,
  ),
  update_game_info: tool(
    "Oyun bilgilerini kaydet (patch); sources isteğe bağlı. aiSummary kendi özetindir. Sistem gereksinimleri (minimum/recommended) mağazadan ya da PCGamingWiki'den gelir, bu araçla değiştirilmez. HLTB kısmi güncellemesi diğer süreleri korur; found en az bir süre ister. stores/storeChecks mağaza adına göre birleşir. Otomatik araştırmada yalnız aiSummary. Geri alınabilir.",
    researchArgs,
    true,
  ),
  web_search: tool(
    "Web'de ara; başlık, bağlantı ve özet döndürür.",
    z.object({ query: text }).strict(),
  ),
  fetch_page: tool(
    "Sayfayı bölümler halinde oku (varsayılan 8000 karakter, length ile değişir); hasMore/nextOffset ile devam et, find ile kelimeye atla.",
    pageArgs,
  ),
  list_games: tool(
    "Oyunları kimlik, ad ve durumlarıyla listele; arama ve sayfalama.",
    z
      .object({
        query: z.string().max(300).optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
  ),
  get_list_state: tool(
    "Grup ve seri kimlikleri, oyun sayısı ve ilk 100 oyunun sırası.",
    z.object({}).strict(),
  ),
  get_hardware: tool(
    "Kayıtlı bilgisayar donanımı; boş değerler bilinmiyor demektir, tahmin etme.",
    z.object({}).strict(),
  ),
  edit_games: tool(
    "Birden çok oyunun kişisel alanlarını tek seferde düzenle: items=[{gameId, patch}]. Tek geri alma adımıdır.",
    z
      .object({
        items: z
          .array(z.object({ gameId: id, patch: personalPatch }).strict())
          .min(1)
          .max(200),
      })
      .strict(),
    true,
  ),
  get_game_info: tool(
    "Oyun kaydını getir: gameId ya da en fazla 20 oyun için gameIds. Kimlikleri list_games verir.",
    z
      .object({ gameId: id.optional(), gameIds: z.array(id).min(1).max(20).optional() })
      .strict()
      .refine((v) => !!v.gameId !== !!v.gameIds, "gameId veya gameIds ver."),
  ),
  add_game: tool(
    "Oyun ekle; mağaza bilgisi arka planda gelir. appId verilirse Steam oyunu, yoksa ad mağazalarda tam eşleşmeyle aranır.",
    z
      .object({
        name: z.string().min(1).max(300),
        appId: z.number().int().positive().optional(),
      })
      .strict(),
    true,
  ),
  remove_game: tool(
    "Oyunları sil (geri alınabilir).",
    z.object({ ids }).strict(),
    true,
  ),
  reorder: tool(
    "ids oyunlarını targetId oyununun önüne ya da (after) arkasına taşı.",
    z.object({ ids, targetId: id, after: z.boolean().default(false) }).strict(),
    true,
  ),
  move_to_group: tool(
    "Oyunları gruba taşı; groupId null = grupsuz. Yeni grup için create_group.",
    z.object({ ids, groupId: id.nullable() }).strict(),
    true,
  ),
  create_group: tool(
    "Grup oluştur; dönen id ile move_to_group kullan.",
    z
      .object({
        ...groupFields,
        color: groupFields.color.default("#8b5cf6"),
        icon: groupFields.icon.default("folder"),
      })
      .strict(),
    true,
  ),
  edit_group: tool(
    "Grubun adını, rengini veya simgesini değiştir (kimlik: get_list_state).",
    z
      .object({
        groupId: id,
        patch: z
          .object(groupFields)
          .partial()
          .strict()
          .refine((v) => Object.keys(v).length > 0, "En az bir alan gerekli."),
      })
      .strict(),
    true,
  ),
  delete_group: tool(
    "Grubu sil; oyunlar silinmez.",
    z.object({ groupId: id }).strict(),
    true,
  ),
  create_series: tool(
    "En az iki oyunu seride birleştir; sıraları korunur.",
    z
      .object({
        name: z.string().trim().min(1).max(100),
        ids: ids
          .min(2)
          .refine(
            (v) => new Set(v).size === v.length,
            "Oyun kimlikleri benzersiz olmalı.",
          ),
      })
      .strict(),
    true,
  ),
  rename_series: tool(
    "Seriyi yeniden adlandır (kimlik: get_list_state).",
    z.object({ seriesId: id, name: z.string().trim().min(1).max(100) }).strict(),
    true,
  ),
  dissolve_series: tool(
    "Seriyi dağıt; oyunlar kalır.",
    z.object({ seriesId: id }).strict(),
    true,
  ),
  add_to_play_list: tool(
    "Tüm oyunlar zaten Oynama Listesinde; fromGroup verilirse oyunları o koleksiyondan çıkarır.",
    z.object({ ids, fromGroup: id.optional() }).strict(),
    true,
  ),
  check_compatibility: tool(
    "Kayıtlı gereksinimleri (mağaza ya da PCGamingWiki) donanımla karşılaştır. Yalnız kaynağın yayımladığı bileşenlerin satırı vardır; contextKey o satıra aittir. FPS garantisi değildir.",
    z.object({ gameId: id }).strict(),
  ),
  record_compatibility: tool(
    "Belirsiz CPU/GPU/işletim sistemi satırı için araştırdığın sonucu kaydet; check_compatibility satırının contextKey değerini kullan. RAM/disk/VRAM/DirectX otomatik hesaplanır. Uygulanamayan sonuç hata döner.",
    z
      .object({
        gameId: id,
        contextKey: z.string().max(40000),
        level: z.enum(["minimum", "recommended"]),
        component: z.string().max(300),
        status: z.enum(["pass", "fail", "unknown"]),
        reason: z.string().min(1).max(3000),
        sources: z
          .array(
            z
              .object({ url: z.string().url(), title: z.string().max(300).optional() })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict(),
    true,
  ),
  generate_short_description: tool(
    "Yerel modelle kısa Türkçe oyun özeti oluştur ve kaydet; emin olmadığın ayrıntıyı uydurma.",
    z.object({ gameId: id }).strict(),
    true,
  ),
  refresh_game_info: tool(
    "Mağaza bilgilerini, gereksinimleri ve HowLongToBeat sürelerini yeniden al.",
    z.object({ gameId: id }).strict(),
    true,
  ),
  recommend_similar: tool(
    "Türü benzeyen kütüphane oyunlarını ve donanım durumlarını getir.",
    z.object({ gameId: id }).strict(),
  ),
  ask_user_questions: tool(
    "Kullanıcıya tekli/çoklu seçimli sorular göster; özel cevap ve atla desteklenir.",
    z
      .object({ questions: z.array(question).min(1).max(6) })
      .strict()
      .refine(
        (v) => new Set(v.questions.map((q) => q.id)).size === v.questions.length,
        "Soru kimlikleri benzersiz olmalı.",
      ),
  ),
};
// System requirements come only from the store (1.0.17): the requirement
// fields are not advertised to the model (a sent value is refused with a reason).
{
  const advertised = toolSpecs.update_game_info.parameters.properties?.patch?.properties;
  if (advertised) {
    delete advertised.minimum;
    delete advertised.recommended;
  }
  delete toolSpecs.update_game_info.parameters.properties?.evidence;
}
export const nativeTools = Object.entries(toolSpecs).map(([name, t]) => ({
  type: "function",
  function: { name, description: t.description, parameters: t.parameters },
}));
export function parseJSONToolReply(raw: string) {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(clean);
  return z
    .object({
      message: z.string().max(1000000).default(""),
      tool_calls: z
        .array(
          z.object({
            name: z.string().max(100),
            // Individual malformed calls receive repair feedback; preserve valid siblings.
            arguments: z.unknown().refine((v) => v !== undefined, "arguments gerekli"),
          }),
        )
        .default([]),
    })
    .strict()
    .parse(parsed);
}
