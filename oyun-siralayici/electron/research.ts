import { z } from "zod";
import { gameSchema, requirementsSchema, completionTimesSchema } from "./validation";
import type { Game, Source } from "../shared/types";
import { parseRequirements, requirementsText } from "./requirements";
import { isStoreProductLink } from "../shared/links";
import { hasCompletionHours } from "../shared/catalog-state";
const nonempty = (v: object) => Object.keys(v).length > 0;
export const personalPatch = gameSchema
  .pick({
    name: true,
    tags: true,
    rating: true,
    status: true,
    inPlayList: true,
    playHours: true,
  })
  .partial()
  .strict()
  .refine(nonempty, "En az bir alan gerekli.");
const requirementPatch = requirementsSchema
  .partial()
  .extend(
    Object.fromEntries(
      Object.entries(requirementsSchema.shape)
        .filter(([key]) => key !== "raw")
        .map(([key, schema]) => [key, schema.nullable().optional()]),
    ) as {
      [K in Exclude<keyof typeof requirementsSchema.shape, "raw">]: z.ZodOptional<
        z.ZodNullable<(typeof requirementsSchema.shape)[K]>
      >;
    },
  )
  .strict()
  .refine(nonempty)
  .describe(
    "Kısmi güncelleme: yalnızca verilen alanlar değişir, diğerleri korunur. null alanı temizler. raw verilirse yalnızca metinde geçen alanlar güncellenir; açık alanlar metindekinin önüne geçer.",
  );
const requirementValueFields = [
  "os",
  "cpu",
  "gpu",
  "ramGB",
  "vramGB",
  "storageGB",
  "directX",
  "vulkan",
] as const;
export const researchPatch = gameSchema
  .pick({
    storeChecks: true,
    appId: true,
    year: true,
    genres: true,
    platforms: true,
    developers: true,
    publishers: true,
    description: true,
    aiSummary: true,
    metacritic: true,
    steamScore: true,
    steamReviewCount: true,
    price: true,
    stores: true,
    screenshots: true,
    trailer: true,
  })
  .partial()
  .extend({
    hltb: completionTimesSchema.partial().strict().refine(nonempty).optional(),
    minimum: requirementPatch.optional(),
    recommended: requirementPatch.optional(),
  })
  .strict()
  .refine(nonempty, "En az bir alan gerekli.");
const reference = z
  .object({
    url: z.string().url().max(3000),
    title: z.string().max(300).optional(),
    quote: z.string().max(2000).optional(),
    fields: z.array(z.string().max(60)).max(40).optional(),
  })
  .strict();
export const researchArgs = z
  .object({
    gameId: z.string().min(1).max(100),
    patch: researchPatch,
    sources: z.array(reference).max(100).optional(),
    evidence: z.array(reference).max(100).optional(),
  })
  .strict();
export type PageEvidence = {
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
};
export function fieldPaths(patch: any): string[] {
  return Object.entries(patch).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v).map((x) => k + "." + x)
      : [k],
  );
}
export function prepareResearch(
  game: Game,
  raw: unknown,
  pages: Map<string, PageEvidence> = new Map(),
): Partial<Game> {
  const a = researchArgs.parse(raw),
    paths = fieldPaths(a.patch),
    at = new Date().toISOString();
  // References enrich the record. They are not a prerequisite or a proof gate.
  const sources: Source[] = [...(a.sources || []), ...(a.evidence || [])].map((e) => {
    const page = pages.get(e.url);
    return {
      url: page?.url || e.url,
      title: (e.title || page?.title || new URL(e.url).hostname).slice(0, 300),
      kind: "agent",
      checkedAt: page?.retrievedAt || at,
      ...(e.quote ? { quote: e.quote } : {}),
      fields: e.fields?.filter((f) => paths.includes(f)).length
        ? e.fields.filter((f) => paths.includes(f))
        : paths,
    };
  });
  const patch: any = {
    ...a.patch,
    updatedAt: at,
    aiEditedAt: at,
    aiEditedFields: [...new Set([...(game.aiEditedFields || []), ...paths])],
  };
  for (const key of ["minimum", "recommended"] as const) {
    const incoming = a.patch[key];
    if (!incoming) continue;
    // Partial update: only the fields given in this call change. A raw text
    // fills just the fields it mentions; every other saved value of the level
    // stays. (Up to 1.0.14 a raw such as "Storage: 0.81 GB" replaced the whole
    // level and erased CPU/GPU/RAM/VRAM/OS.) null still clears one field.
    const { raw: text, ...explicit } = incoming;
    const parsed: Record<string, unknown> = {};
    if (text?.trim()) {
      const values = parseRequirements(text) as unknown as Record<string, unknown>;
      for (const field of requirementValueFields)
        if (values[field] !== undefined && values[field] !== "")
          parsed[field] = values[field];
    }
    patch[key] = { ...game[key], ...parsed, ...explicit };
    for (const field of Object.keys(parsed)) paths.push(`${key}.${field}`);
    for (const field of Object.keys(requirementsSchema.shape))
      if (patch[key][field] === null) delete patch[key][field];
    const value = (field: string) =>
      (explicit as any)[field] !== undefined ? (explicit as any)[field] : parsed[field];
    if (incoming.availability === "not_published") {
      // Explicit absence is not an invitation to invent a recommended configuration.
      patch[key] = { raw: "", availability: "not_published" };
      for (const field of Object.keys(requirementsSchema.shape))
        paths.push(`${key}.${field}`);
    } else {
      if (
        requirementValueFields.some((field) => ![undefined, null].includes(value(field)))
      )
        if (patch[key].availability === "not_published") delete patch[key].availability;
      if (incoming.unpublished === undefined && patch[key].unpublished)
        patch[key].unpublished = patch[key].unpublished.filter((field: string) =>
          [undefined, null].includes(value(field)),
        );
      if (patch[key].unpublished) {
        for (const field of patch[key].unpublished) {
          delete patch[key][field];
          paths.push(`${key}.${field}`);
        }
      }
    }
    patch[key].raw = requirementsText(patch[key]);
  }
  if (a.patch.hltb) {
    patch.hltb = {
      ...game.hltb,
      ...a.patch.hltb,
      checkedAt: a.patch.hltb.checkedAt || at,
    };
    if (!patch.hltb.status)
      patch.hltb.status = hasCompletionHours(patch.hltb) ? "found" : "unavailable";
    if (patch.hltb.status === "found" && !hasCompletionHours(patch.hltb))
      throw new Error(
        "HLTB bulundu sonucu için en az bir gerçek süre değeri gerekli. Veri yoksa not_found veya unavailable kullan.",
      );
  }
  if (a.patch.stores || a.patch.storeChecks) {
    const checks = new Map((game.storeChecks || []).map((c) => [c.store, c]));
    // Store writes are upserts; [] explicitly clears that collection.
    patch.stores = a.patch.stores?.length === 0 ? [] : [...game.stores];
    for (const store of a.patch.stores || []) {
      const saved = { ...store, checkedAt: store.checkedAt || at };
      patch.stores = [
        ...patch.stores.filter((s: Game["stores"][number]) => s.name !== store.name),
        saved,
      ];
      if (["Steam", "GOG", "Epic Games", "Xbox"].includes(store.name)) {
        const found = store.verified && isStoreProductLink(store.name, store.url);
        checks.set(store.name as any, {
          store: store.name as any,
          status: found ? "found" : "review",
          checkedAt: saved.checkedAt,
          source: store.source || "AI araştırması",
          ...(found ? { url: store.url } : {}),
        });
      }
    }
    if (a.patch.storeChecks?.length === 0) checks.clear();
    for (const check of a.patch.storeChecks || []) {
      if (check.status === "found") {
        const url =
          check.url ||
          patch.stores.find((s: Game["stores"][number]) => s.name === check.store)?.url;
        if (!url || !isStoreProductLink(check.store, url))
          throw new Error("Bulunan mağaza için gerçek ürün bağlantısı gerekli.");
        const old = patch.stores.find(
          (s: Game["stores"][number]) => s.name === check.store,
        );
        patch.stores = [
          ...patch.stores.filter((s: Game["stores"][number]) => s.name !== check.store),
          {
            ...(old?.url === url ? old : {}),
            name: check.store,
            url,
            verified: true,
            source: check.source,
            checkedAt: check.checkedAt,
          },
        ];
        checks.set(check.store, { ...check, url });
      } else {
        checks.set(check.store, { ...check, url: undefined });
        // A fresh negative/ambiguous result must not retain a clickable old match.
        patch.stores = patch.stores.filter(
          (s: Game["stores"][number]) => s.name !== check.store,
        );
      }
    }
    patch.storeChecks = [...checks.values()];
    // Preserve only the edited shops on later provider refreshes. Editing Steam
    // must not freeze unrelated GOG/Epic/Xbox checks or prices.
    for (const root of ["stores", "storeChecks"]) {
      const index = paths.indexOf(root);
      if (index >= 0) paths.splice(index, 1);
    }
    const names = new Set([
      ...(a.patch.stores || []).map((s) => s.name),
      ...(a.patch.storeChecks || []).map((c) => c.store),
    ]);
    for (const name of names) {
      const standard = ["Steam", "GOG", "Epic Games", "Xbox"].includes(name);
      paths.push(standard ? `stores.${name}` : "stores");
      if (standard) paths.push(`storeChecks.${name}`);
    }
    if (a.patch.stores?.length === 0) paths.push("stores");
    if (a.patch.storeChecks?.length === 0) paths.push("storeChecks");
  }
  patch.aiEditedFields = [...new Set([...(game.aiEditedFields || []), ...paths])];
  patch.sources = [...game.sources, ...sources].slice(-100);
  return gameSchema.parse({ ...game, ...patch });
}
// Preserve autonomous edits even when no reference was supplied; Steam refresh fills other fields.
export function preserveResearchFields(
  current: Game,
  incoming: Partial<Game>,
): Partial<Game> {
  const patch: any = structuredClone(incoming),
    evidence = current.sources.filter((s) => s.kind === "agent");
  const roots = new Set([
    "hltb",
    "appId",
    "year",
    "genres",
    "platforms",
    "developers",
    "publishers",
    "description",
    "aiSummary",
    "metacritic",
    "steamScore",
    "steamReviewCount",
    "price",
    "stores",
    "storeChecks",
    "screenshots",
    "trailer",
  ]);
  const req = new Set([
    "availability",
    "unpublished",
    "raw",
    "os",
    "cpu",
    "gpu",
    "ramGB",
    "vramGB",
    "storageGB",
    "directX",
    "vulkan",
  ]);
  const fields = new Set([
    ...(current.aiEditedFields || []),
    ...evidence.flatMap((s) => s.fields || []),
  ]);
  for (const field of fields) {
    const [key, child, ...rest] = field.split(".");
    if (
      ["stores", "storeChecks"].includes(key) &&
      child &&
      !rest.length &&
      ["Steam", "GOG", "Epic Games", "Xbox"].includes(child)
    ) {
      const nameKey = key === "stores" ? "name" : "store";
      const currentItems = (current as any)[key] || [];
      const saved = currentItems.find((item: any) => item[nameKey] === child);
      patch[key] = [
        ...(patch[key] || currentItems).filter((item: any) => item[nameKey] !== child),
        ...(saved ? [structuredClone(saved)] : []),
      ];
      continue;
    }
    if (
      rest.length ||
      !(
        (roots.has(key) && !child) ||
        (["minimum", "recommended"].includes(key) && req.has(child)) ||
        (key === "hltb" &&
          [
            "status",
            "main",
            "mainExtra",
            "completionist",
            "allStyles",
            "url",
            "sourceUrl",
            "via",
            "checkedAt",
            "attemptedAt",
            "sourceUpdatedAt",
            "message",
          ].includes(child))
      )
    )
      continue;
    if (child) {
      patch[key] = {
        ...(patch[key] || current[key as keyof Game]),
        [child]: (current as any)[key]?.[child],
      };
      if (key === "minimum" || key === "recommended")
        patch[key].raw = (current as any)[key].raw;
    } else if (key === "stores" && Array.isArray(patch.stores)) {
      patch.stores = [
        ...current.stores,
        ...patch.stores.filter(
          (s: Game["stores"][number]) => !current.stores.some((c) => c.name === s.name),
        ),
      ];
    } else patch[key] = structuredClone((current as any)[key]);
  }
  if (patch.sources)
    patch.sources = [
      ...patch.sources.filter((s: Source) => s.kind !== "agent"),
      ...evidence,
    ].slice(-100);
  return patch;
}
