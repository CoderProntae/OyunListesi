import { webRequest } from "./network";
import { titleKey, titleMatch } from "../shared/titles";
// Metacritic's own web front end reads this public search service with this
// public key; there is no login or challenge. Used only when the store gives no
// score, and only for one unambiguous title match (year within one year).
const KEY = "1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u";
export interface MetacriticHit {
  // Undefined: Metacritic lists exactly this game but has no critic score for
  // it (too few reviews). Never replaced with another release's score.
  score?: number;
  url: string;
  title: string;
  releaseDate?: string;
}
export async function metacriticScore(
  titles: (string | undefined)[],
  year: number | undefined,
  signal?: AbortSignal,
): Promise<MetacriticHit | undefined> {
  let unscored: MetacriticHit | undefined;
  for (const title of [...new Set(titles.filter((t): t is string => !!t?.trim()))].slice(
    0,
    3,
  )) {
    const url = `https://backend.metacritic.com/finder/metacritic/search/${encodeURIComponent(title)}/web?apiKey=${KEY}&offset=0&limit=20&mcoTypeId=13`;
    const r = await webRequest(url, { signal, maxBytes: 3_000_000 });
    const items: any[] = JSON.parse(r.text)?.data?.items || [];
    const listed = items.filter(
      (i) =>
        i?.type === "game-title" &&
        typeof i.title === "string" &&
        typeof i.slug === "string" &&
        /^[a-z0-9-]+$/.test(i.slug) &&
        titleMatch(i.title, title) &&
        (!year || !i.premiereYear || Math.abs(Number(i.premiereYear) - year) <= 1),
    );
    const scored = (i: any) => Number.isFinite(i.criticScoreSummary?.score);
    const one = (list: any[]) => {
      const exact = list.filter((i) => titleKey(i.title) === titleKey(title));
      return exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : undefined;
    };
    const hit = (pick: any, score?: number): MetacriticHit => ({
      score,
      url: `https://www.metacritic.com/game/${pick.slug}/`,
      title: pick.title,
      releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(pick.releaseDate || "")
        ? pick.releaseDate
        : undefined,
    });
    const pick = one(listed.filter(scored));
    if (pick) return hit(pick, Number(pick.criticScoreSummary.score));
    const bare = one(listed);
    if (bare && !scored(bare)) unscored ??= hit(bare);
  }
  return unscored;
}
