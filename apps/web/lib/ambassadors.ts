import { placeOf, type Place } from "./places";

/**
 * Who has been Romania's ambassador where: read from the President's decrees, which name an ambassador to a post ("al României în Republica Franceză") and recall one from it. A decree does not say who sits in an embassy
 * today, so a post's present holder is the last person named to it with no recall or replacement after, shown with the date of the decree, and the page says how old that is. The text of a decree's line is free text
 * ("în Haiti, cu reședința la Havana", "în Regatul Thailandei şi în Republica Democrată Populară Laos", a line that names two people), so it is read by a few explicit rules; a line the rules cannot place is kept apart
 * with its decree and never given a post by guess.
 */
export interface AmbassadorRow {
  name: string;
  action: string;
  title?: string;
  decreeId: string;
  decreeNumber: number;
  decreeYear: number;
  issuedOn: string;
  portalUrl: string;
  signer?: string;
}

/** "main": the first post a line names; "also": another post named in the same line (held at the same time). */
export type PostRole = "main" | "also";

/** `residence` is the city the decree says the ambassador lives in ("cu reședința la Havana"), as the decree words it: it is not worked out whether that is in the country or in another one. */
export interface PostRef { place: Place; role: PostRole; residence?: string }

export interface ParsedPosts {
  posts: PostRef[];
  /** The decree's text in our catalog is cut short (it ends in "…"): the posts read are only those before the cut. */
  truncated: boolean;
  /** Phrases the rules read as a post but that are in no list of places. */
  unplaced: string[];
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[`'’]/g, " ").replace(/[^a-z0-9,.()\- ]+/g, " ").replace(/\s+/g, " ").trim();

/** Where the part of the line that concerns this person starts: after their name when the line names several people, else at the start. */
function clauseStart(text: string, personName: string): number {
  const name = fold(personName);
  const at = name ? text.indexOf(name) : -1;
  return at > 25 ? at + name.length : 0;
}

const MARKER = /(?:al romaniei|a romaniei|misiunii romaniei|misiunii permanente a romaniei|aceeasi calitate|ambasador nerezident)\s+(?:si\s+)?(?:in|pe langa|la)\s+/;
const EXTRA_MARKER = /\bprecum si din calitatea de [a-z ,]*?(?:al|a) romaniei\s+(?:in|pe langa|la)\s+/;
const STOP = /(?:,?\s*cu (?:resedinta|sediul) (?:la|in)|\s+precum si\b|\s+si domnul\b|\s+si doamna\b|\s+se recheama\b|\s+se acrediteaza\b|\s+domnul\b|\s+doamna\b|\s+prin decretul\b|\s+si isi va\b|\s+incepand\b|\s*[.;(])/;

/** The text of the posts up to the first sign that something else begins. */
function cut(text: string): string {
  const stop = STOP.exec(text);
  return (stop ? text.slice(0, stop.index) : text).replace(/[,\s]+$/, "").trim();
}

/**
 * One or several places from a phrase: the whole phrase first; then a list ("A, B, C și D", "A și în B", "A și B") cut at its commas and joiners, each piece looked up whole first so that a name with its own "și"
 * ("Bosnia și Herțegovina") survives. A piece in no list comes back as text.
 */
function placesIn(phrase: string): Array<Place | string> {
  const whole = placeOf(phrase);
  if (whole) return [whole];
  const chunks = phrase.split(/\s*,\s*(?:in\s+|pe langa\s+)?|\s+si\s+(?:in|pe langa)\s+/).map((chunk) => chunk.trim()).filter(Boolean);
  if (chunks.length > 1) return chunks.flatMap((chunk) => placesIn(chunk));
  // Two places joined by "și", where one of them may itself hold a "și" ("Republica Dominicană și Republica Trinidad și Tobago"): every "și" is tried as the join.
  for (const join of phrase.matchAll(/\s+si\s+/g)) {
    const left = placeOf(phrase.slice(0, join.index));
    const right = placeOf(phrase.slice(join.index + join[0].length));
    if (left && right) return [left, right];
  }
  return [phrase];
}

export function postsOf(title: string | undefined, personName: string): ParsedPosts {
  if (!title) return { posts: [], truncated: false, unplaced: [] };
  const truncated = /…|\.\.\.\s*$/.test(title);
  const text = fold(title);
  const clause = text.slice(clauseStart(text, personName));
  const marker = MARKER.exec(clause);
  if (!marker) return { posts: [], truncated, unplaced: [title] };
  const after = clause.slice(marker.index + marker[0].length);
  const extra = EXTRA_MARKER.exec(after);
  const mainText = extra ? after.slice(0, extra.index) : after;
  const residence = /,?\s*cu (?:resedinta|sediul) (?:la|in) ([^,.;(]+)/.exec(mainText)?.[1]?.trim();
  const extraText = extra ? after.slice(extra.index + extra[0].length) : "";

  const posts: PostRef[] = [];
  const unplaced: string[] = [];
  const read = (phrase: string, first: boolean, last: boolean) => {
    const found = placesIn(phrase);
    found.forEach((item, index) => {
      if (typeof item === "string") {
        // The last phrase of a text cut short is cut with it: that is not a failure of the rules.
        if (!(truncated && last && index === found.length - 1)) unplaced.push(item);
        return;
      }
      posts.push({ place: item, role: first && index === 0 ? "main" : "also", ...(residence ? { residence } : {}) });
    });
  };
  const main = cut(mainText);
  if (main) read(main, true, !extraText);
  if (extraText) read(cut(extraText), false, true);
  return { posts, truncated, unplaced };
}

/* ---------------------------------------------------------------- timelines */

export interface DecreeRef { id: string; number: number; year: number; issuedOn: string; url: string }

export interface HolderPeriod {
  name: string;
  /** The date of the decree that named the person to the post (not the day they arrived); unknown when only a recall is in the catalog. */
  startedOn?: string;
  startDecree?: DecreeRef;
  /** A later decree that named the same person to the post again. */
  reappointedBy: DecreeRef[];
  endedOn?: string;
  endDecree?: DecreeRef;
  /** "recalled": a decree recalled the person from the post; "replaced": another person was named without a recall of this one in the catalog; "open": the last holder named. */
  ended: "recalled" | "replaced" | "open";
  role: PostRole;
  /** The city of residence the decree names, as worded there. */
  residence?: string;
  /** The other posts named in the same decree line. */
  alsoIn: string[];
  /** Named as acting (interim), not as the holder. */
  acting?: boolean;
}

/** A person named to a post more than this many years ago, with no recall or replacement in the catalog, is not shown as the holder now: the decrees just stop saying anything about the post. */
export const LAPSE_YEARS = 8;

export interface PlaceTimeline {
  place: Place;
  /** Newest first. */
  holders: HolderPeriod[];
  /** The person last named to the post, with no recall or replacement after, when that is at most LAPSE_YEARS ago. */
  current?: HolderPeriod;
  /** Whole years since the current holder was named, when known. */
  currentAgeYears?: number;
  /** The person last named, with no recall or replacement after, when that is further back than LAPSE_YEARS. */
  lapsed?: HolderPeriod;
}

export interface TimelineResult {
  timelines: PlaceTimeline[];
  /** Decree lines no post could be read from, or only partly. */
  unplaced: Array<{ row: AmbassadorRow; phrases: string[]; truncated: boolean }>;
}

const ref = (row: AmbassadorRow): DecreeRef => ({ id: row.decreeId, number: row.decreeNumber, year: row.decreeYear, issuedOn: row.issuedOn, url: row.portalUrl });
/** The same person under two spellings of the name: all the words of the shorter name are in the longer one, in any order ("Tiberiu Nițu" and "Tiberiu-Mihail Nițu", "Vasile Manea Dragulin" and "Manea-Dragulin Vasile"). */
export function sameName(a: string, b: string): boolean {
  const words = (name: string) => new Set(fold(name).split(/[\s\-]+/).filter(Boolean));
  const [left, right] = [words(a), words(b)];
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  return small.size >= 2 && [...small].every((word) => large.has(word));
}

type Kind = "appointed" | "recalled";
const kindOf = (action: string): Kind | undefined => (action === "appointment" || action === "reappointment" || action === "interim" ? "appointed" : action === "recall" || action === "release" || action === "dismissal" || action === "resignation" ? "recalled" : undefined);

/** Whole years between two ISO dates. */
export function yearsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years -= 1;
  return Math.max(0, years);
}

type PeriodEvent = { role: PostRole; residence?: string; alsoIn: string[]; kind: Kind; row: AmbassadorRow };

/** The holders of one post from its events, which must already be in time order: a person named starts a period; a recall of the same person ends it; another person named without a recall ends it as "replaced". */
function periodsFrom(events: PeriodEvent[]): { closed: HolderPeriod[]; open?: HolderPeriod } {
  const closed: HolderPeriod[] = [];
  let open: HolderPeriod | undefined;
  for (const event of events) {
    const acting = event.row.action === "interim";
    if (event.kind === "appointed") {
      if (open && sameName(open.name, event.row.name)) {
        open.reappointedBy.push(ref(event.row));
        continue;
      }
      if (open) closed.push({ ...open, ended: "replaced", endedOn: event.row.issuedOn, endDecree: ref(event.row) });
      open = { name: event.row.name, startedOn: event.row.issuedOn, startDecree: ref(event.row), reappointedBy: [], ended: "open", role: event.role, ...(event.residence ? { residence: event.residence } : {}), alsoIn: event.alsoIn, ...(acting ? { acting } : {}) };
    } else if (open && sameName(open.name, event.row.name)) {
      closed.push({ ...open, ended: "recalled", endedOn: event.row.issuedOn, endDecree: ref(event.row) });
      open = undefined;
    } else {
      // A recall of someone whose appointment to this post is not in the catalog.
      closed.push({ name: event.row.name, reappointedBy: [], ended: "recalled", endedOn: event.row.issuedOn, endDecree: ref(event.row), role: event.role, ...(event.residence ? { residence: event.residence } : {}), alsoIn: event.alsoIn });
    }
  }
  return { closed, ...(open ? { open } : {}) };
}

const byTime = (a: { row: AmbassadorRow; kind: Kind }, b: { row: AmbassadorRow; kind: Kind }) =>
  a.row.issuedOn.localeCompare(b.row.issuedOn) || (a.kind === b.kind ? 0 : a.kind === "recalled" ? -1 : 1) || a.row.decreeNumber - b.row.decreeNumber;

export function buildTimelines(rows: AmbassadorRow[], today: string): TimelineResult {
  type Event = { place: Place; role: PostRole; residence?: string; alsoIn: string[]; kind: Kind; row: AmbassadorRow };
  const events: Event[] = [];
  const unplaced: TimelineResult["unplaced"] = [];
  for (const row of rows) {
    const kind = kindOf(row.action);
    if (!kind) continue;
    const parsed = postsOf(row.title, row.name);
    if (parsed.posts.length === 0 || parsed.unplaced.length > 0) unplaced.push({ row, phrases: parsed.unplaced, truncated: parsed.truncated });
    for (const post of parsed.posts) {
      events.push({ place: post.place, role: post.role, ...(post.residence ? { residence: post.residence } : {}), alsoIn: parsed.posts.filter((other) => other !== post).map((other) => other.place.key), kind, row });
    }
  }
  // In time order; on the same day a recall comes before an appointment, so that a decree that swaps one person for another does not read as a replacement.
  events.sort(byTime);

  const byPlace = new Map<string, { place: Place; events: Event[] }>();
  for (const event of events) {
    const entry = byPlace.get(event.place.key) ?? { place: event.place, events: [] };
    byPlace.set(event.place.key, entry);
    entry.events.push(event);
  }

  const timelines: PlaceTimeline[] = [...byPlace.values()].map(({ place, events: placeEvents }) => {
    const { closed, open } = periodsFrom(placeEvents);
    const holders = [...closed, ...(open ? [open] : [])].sort((a, b) => (b.endedOn ?? "9999").localeCompare(a.endedOn ?? "9999") || (b.startedOn ?? "").localeCompare(a.startedOn ?? ""));
    const age = open?.startedOn ? yearsBetween(open.startedOn, today) : undefined;
    const lapsed = open && age !== undefined && age > LAPSE_YEARS;
    return { place, holders, ...(open && !lapsed ? { current: open } : {}), ...(lapsed ? { lapsed: open } : {}), ...(age !== undefined ? { currentAgeYears: age } : {}) };
  });
  return { timelines, unplaced };
}


export interface OfficeTimeline {
  /** Newest first. */
  holders: HolderPeriod[];
  current?: HolderPeriod;
}

/**
 * The timeline of an office with one seat (the Prosecutor General, the chief of the DNA, the President of the High Court): everyone the decrees name to it, one after the other. Every line of the office is one post, so
 * a line that names a person is read without the rules for places. The seat is shown as held now only by the person last named with no recall or replacement after.
 */
export function buildOfficeTimeline(rows: AmbassadorRow[]): OfficeTimeline {
  const events = rows.flatMap((row) => { const kind = kindOf(row.action); return kind ? [{ role: "main" as const, alsoIn: [], kind, row }] : []; }).sort(byTime);
  const { closed, open } = periodsFrom(events);
  const holders = [...closed, ...(open ? [open] : [])].sort((a, b) => (b.endedOn ?? "9999").localeCompare(a.endedOn ?? "9999") || (b.startedOn ?? "").localeCompare(a.startedOn ?? ""));
  return { holders, ...(open ? { current: open } : {}) };
}
