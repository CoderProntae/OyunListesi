// Game title comparison shared by HowLongToBeat, Metacritic and the game
// detector. A plain normalized equality is the default. One extra rule covers
// episodes and DLC chapters: stores often drop the episode's own subtitle
// ("Life is Strange - Episode 2") while HowLongToBeat or Metacritic keep it
// ("Life is Strange: Episode 2 - Out of Time"). That rule only applies when the
// shorter title ENDS with an episode marker and number, so "Life is Strange"
// never matches "Life is Strange: Before the Storm" or "Life is Strange 2".
const MARKERS = new Set([
  "episode",
  "ep",
  "chapter",
  "part",
  "act",
  "volume",
  "vol",
  "book",
  "season",
  "bolum",
  "kisim",
]);
const WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};
const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};
export function titleTokens(title: string): string[] {
  const raw = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return raw.map((t, i) => {
    const afterMarker = i > 0 && MARKERS.has(raw[i - 1]);
    if (afterMarker && WORDS[t]) return WORDS[t];
    if (ROMAN[t] && (afterMarker || (i === raw.length - 1 && i > 0))) return ROMAN[t];
    return t;
  });
}
export const titleKey = (title: string) => titleTokens(title).join(" ");
const endsWithEpisode = (t: string[]) =>
  t.length >= 2 && MARKERS.has(t[t.length - 2]) && /^\d+$/.test(t[t.length - 1]);
export function titleMatch(a: string, b: string) {
  const x = titleTokens(a),
    y = titleTokens(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!endsWithEpisode(short) || !short.every((t, i) => long[i] === t)) return false;
  const rest = long.slice(short.length);
  return rest.length > 0 && !/^\d+$/.test(rest[0]);
}
// "A: B - Episode 2" → ["A: B", "A"]: possible names of the base game.
export function baseTitles(title: string) {
  const out: string[] = [];
  let rest = title.trim();
  for (let i = 0; i < 3; i++) {
    const m = rest.match(/^(.*\S)\s*(?:\s[-–—]\s|:\s)\s*\S.*$/);
    if (!m || m[1].length < 2) break;
    rest = m[1].trim();
    out.push(rest);
  }
  return out;
}
// The part of a DLC title after its base game's name ("Episode 2").
export function titleRemainder(title: string, base: string) {
  const t = titleTokens(title),
    b = titleTokens(base);
  if (b.length && b.length < t.length && b.every((x, i) => t[i] === x))
    return t.slice(b.length).join(" ");
  return "";
}
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  oca: 1,
  sub: 2,
  nis: 4,
  haz: 6,
  tem: 7,
  agu: 8,
  eyl: 9,
  eki: 10,
  kas: 11,
  ara: 12,
};
// Store dates such as "24 Mar, 2015", "Mar 24, 2015", "24 Mart 2015" or
// "2015-03-24" → "2015-03-24". Undefined when day/month/year are not all clear.
export function parseStoreDate(value?: string): string | undefined {
  if (!value) return;
  const iso = value.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const clean = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i");
  const year = clean.match(/\b((?:19|20)\d{2})\b/)?.[1];
  const month = clean.match(/\b([a-z]{3})[a-z]*\.?\b/g)?.map((w) => MONTHS[w.slice(0, 3)]);
  const m = month?.find(Boolean);
  const day = clean.replace(year || "", " ").match(/\b(\d{1,2})\b/)?.[1];
  if (!year || !m || !day || Number(day) < 1 || Number(day) > 31) return;
  return `${year}-${String(m).padStart(2, "0")}-${day.padStart(2, "0")}`;
}
export function formatDateTR(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const names = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ];
  return `${d} ${names[m - 1]} ${y}`;
}
