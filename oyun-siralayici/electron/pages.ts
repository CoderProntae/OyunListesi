import { z } from "zod";
import type { PageEvidence } from "./research";
export const pageArgs = z
  .object({
    url: z.string().url().max(3000),
    offset: z.number().int().nonnegative().optional(),
    length: z.number().int().min(1).max(100000).optional(),
    find: z.string().min(1).max(300).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();
export function pageSection(page: PageEvidence, raw: unknown) {
  const a = pageArgs.parse(raw);
  let start = Math.min(a.offset || 0, page.text.length);
  let found: boolean | undefined;
  if (a.find) {
    const match = page.text
      .toLocaleLowerCase()
      .indexOf(a.find.toLocaleLowerCase(), start);
    found = match >= 0;
    if (found) start = match;
  }
  const end = Math.min(page.text.length, start + (a.length || 8000));
  return {
    url: page.url,
    title: page.title,
    retrievedAt: page.retrievedAt,
    text: page.text.slice(start, end),
    offset: start,
    endOffset: end,
    totalChars: page.text.length,
    hasMore: end < page.text.length,
    nextOffset: end < page.text.length ? end : null,
    ...(found === undefined ? {} : { find: a.find, found }),
    ...(end < page.text.length
      ? {
          continueWith: {
            tool: "fetch_page",
            arguments: { url: page.url, offset: end, length: a.length || 8000 },
          },
        }
      : {}),
    notice:
      "Bu bir sayfa bölümüdür; tam okunabilir metin bu sohbetin oturum önbelleğinde. Devam için nextOffset, ilgili bölüme atlamak için find kullan. Aynı offset aynı bölümdür.",
  };
}
