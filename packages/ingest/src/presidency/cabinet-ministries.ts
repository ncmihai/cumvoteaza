import { fold } from "./text";

/**
 * D-057 (Block 1a): what a post in a decree is. "ministrul afacerilor interne", "ministru al administrației și internelor" and "ministru de interne" are one seat over the years, so each is tied to the ministry
 * that exists today under that name's subject; a post whose subject has no ministry today (communications, youth and sport, relations with Parliament, a minister delegate) keeps its printed words and no ministry.
 * The rules are a short ordered list of phrases; the dry run of the import prints every distinct post with the ministry it was given, so a wrong tie is seen before it is saved.
 */
export interface PostInfo {
  /** The post as the page shows it: the printed words, capitalised. */
  title: string;
  /** What two mentions of the same seat share, so a dismissal can find the role it ends: `prim-ministru`, `viceprim-ministru`, `ministry:<slug>`, `post:<words>`. */
  keys: string[];
  /** The ministry (one of the sixteen) this post leads. A minister delegate, a state secretary and a post with no ministry today have none. */
  ministrySlug?: string;
  delegate: boolean;
  secretaryOfState: boolean;
}

const RULES: Array<[slug: string, pattern: RegExp]> = [
  ["externe", /afacerilor externe|\bde externe\b|afacerilor straine/],
  ["interne", /afacerilor interne|administratiei si internelor|internelor si reformei|\bde interne\b|\binternelor\b/],
  ["aparare", /apararii|\baparare\b/],
  ["finante", /finantelor|\bfinante\b/],
  ["munca", /\bmuncii\b|solidaritatii sociale|protectiei sociale|\bfamiliei\b/],
  ["justitie", /\bjustitiei\b(?! sociale)/],
  ["sanatate", /sanatatii/],
  ["cultura", /\bculturii\b/],
  ["agricultura", /agriculturii/],
  ["mediu", /mediului(?! de afaceri)|schimbarilor climatice|\bpadurilor\b/],
  ["transporturi", /transporturilor|\btransporturi\b/],
  ["dezvoltare", /dezvoltarii regionale|dezvoltarii lucrarilor|lucrarilor publice|administratiei publice/],
  ["fonduri-europene", /fondurilor europene|proiectelor europene|fondurilor structurale|fonduri europene/],
  ["educatie", /educatiei|invatamantului/],
  ["economie", /economiei|comertului|intreprinderilor mici|antreprenoriatului|turismului|\bindustriei\b|\bindustriilor\b/],
  ["energie", /energiei/]
];

const foldPost = (raw: string) => fold(raw).replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();

export function describePost(raw: string): PostInfo {
  const folded = foldPost(raw);
  const secretaryOfState = /^secretar de stat/.test(folded);
  const delegate = /\bdelegat\b/.test(folded);
  const keys: string[] = [];
  if (/(?:^|\s)(?:prim-?ministru|primul-?ministru)\b/.test(folded)) keys.push("prim-ministru");
  if (/viceprim|vice prim/.test(folded)) keys.push("viceprim-ministru");
  let ministrySlug: string | undefined;
  // A coordinating post ("ministru de stat pentru coordonarea activităților din domeniile ...") leads no ministry; of several domains in one name the first printed is the ministry's.
  if (!secretaryOfState && !delegate && !/pentru coordonarea/.test(folded)) {
    let best = Infinity;
    for (const [slug, pattern] of RULES) {
      const at = folded.search(pattern);
      if (at >= 0 && at < best) { best = at; ministrySlug = slug; }
    }
  }
  if (ministrySlug) keys.push(`ministry:${ministrySlug}`);
  const topic = folded.replace(/^(?:ministru de stat\s+)?(?:viceprim-?ministru\s+)?(?:ministrul|ministru)(?:\s+(?:al|delegat|interimar))*\s+/, "").replace(/\binterimar\b/g, "").replace(/\s+/g, " ").trim();
  if (!ministrySlug && topic && !keys.includes("prim-ministru") && !keys.includes("viceprim-ministru")) keys.push(`post:${topic}`);
  if (keys.length === 0 && folded) keys.push(`post:${folded}`);
  return { title: titleOf(raw), keys, ...(ministrySlug ? { ministrySlug } : {}), delegate, secretaryOfState };
}

/** "ministru al justiției" → "Ministrul justiției": the form the cabinet pages already use. */
export function titleOf(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim().replace(/^ministru al /i, "ministrul ");
  return text.charAt(0).toLocaleUpperCase("ro") + text.slice(1);
}

/** The ministry the printed words tie to, by the keys two posts share. */
export const sharesSeat = (a: string[], b: string[]) => a.some((key) => b.includes(key));

const SIMPLE_2021 = new Set(["interne", "aparare", "transporturi", "finante", "justitie", "agricultura", "energie", "sanatate", "fonduri-europene", "externe", "mediu", "dezvoltare", "cultura"]);

/** The incarnation of a ministry (2021 onward, where the catalog has them) a post began in, by date and, where a ministry was split in two, by the words. */
export function incarnationIdFor(slug: string, rawPost: string, startsOn: string): string | undefined {
  if (startsOn < "2021-11-25") return undefined;
  const folded = foldPost(rawPost);
  if (SIMPLE_2021.has(slug)) return `ministry-incarnation-${slug}-2021`;
  if (slug === "munca") {
    if (startsOn >= "2024-12-23") return "ministry-incarnation-munca-familie-tineret-solidaritate-2024";
    return /\bfamiliei\b/.test(folded) ? "ministry-incarnation-familie-tineret-egalitate-2021" : "ministry-incarnation-munca-solidaritate-2021";
  }
  if (slug === "economie") {
    if (startsOn >= "2024-12-23") return "ministry-incarnation-economie-digitalizare-antreprenoriat-turism-2024";
    return startsOn >= "2023-06-15" ? "ministry-incarnation-economie-antreprenoriat-turism-2023" : undefined;
  }
  if (slug === "educatie") return startsOn >= "2024-12-23" ? "ministry-incarnation-educatie-cercetare-2024" : "ministry-incarnation-educatie-2021";
  return undefined;
}
