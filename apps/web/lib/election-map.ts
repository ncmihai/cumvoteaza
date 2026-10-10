/**
 * Sprint 17 (D-041): what the election map computes from the commune results, kept apart from the database and the screen so that it is plain and testable. A commune is `k`, its SIRUTA
 * code (or "abroad:<country>"), `c` its circumscription (1 to 41, Bucharest 42, abroad 43). `r` are the voters on the permanent lists, `p` the voters who came, `v` the valid votes and `i` the
 * null votes; `l` and `x` are the lists (by code) and their votes, the largest first.
 */
export interface MapList {
  code: number;
  /** Empty for the independent candidates, which are added together. */
  name: string;
  independents: boolean;
  partySlug?: string;
  /** The party's colour, where the list is exactly a party we hold. */
  color?: string;
  votes: number;
}

export interface MapArea {
  k: string;
  c: number;
  n: string;
  s: number;
  r: number;
  p: number;
  v: number;
  i: number;
  l: number[];
  x: number[];
}

export type MapMetric = "winner" | "share" | "change" | "turnout" | "invalid";
export const MAP_METRICS: MapMetric[] = ["winner", "share", "change", "turnout", "invalid"];

/** The same circumscription, summed over its communes. */
export function sumByCircumscription(areas: MapArea[]): MapArea[] {
  const sums = new Map<number, MapArea>();
  const votes = new Map<number, Map<number, number>>();
  for (const area of areas) {
    let sum = sums.get(area.c);
    if (!sum) {
      sum = { k: `c${area.c}`, c: area.c, n: "", s: 0, r: 0, p: 0, v: 0, i: 0, l: [], x: [] };
      sums.set(area.c, sum);
      votes.set(area.c, new Map());
    }
    sum.s += area.s;
    sum.r += area.r;
    sum.p += area.p;
    sum.v += area.v;
    sum.i += area.i;
    const own = votes.get(area.c)!;
    area.l.forEach((code, index) => own.set(code, (own.get(code) ?? 0) + (area.x[index] ?? 0)));
  }
  for (const [circumscription, sum] of sums) {
    const ordered = [...votes.get(circumscription)!].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    sum.l = ordered.map((entry) => entry[0]);
    sum.x = ordered.map((entry) => entry[1]);
  }
  return [...sums.values()].sort((a, b) => a.c - b.c);
}

/** The list a commune gave most votes to, with its share of the valid votes and its lead over the second. */
export function leaderOf(area: MapArea): { code: number; share: number; lead: number } | undefined {
  if (area.l.length === 0 || area.v <= 0) return undefined;
  const first = area.x[0] ?? 0;
  const second = area.x[1] ?? 0;
  return { code: area.l[0]!, share: first / area.v, lead: (first - second) / area.v };
}

export function shareOf(area: MapArea, code: number): number | undefined {
  if (area.v <= 0) return undefined;
  const at = area.l.indexOf(code);
  return at < 0 ? 0 : (area.x[at] ?? 0) / area.v;
}

export function turnoutOf(area: MapArea): number | undefined {
  return area.r > 0 ? area.p / area.r : undefined;
}

export function invalidShareOf(area: MapArea): number | undefined {
  return area.p > 0 ? area.i / area.p : undefined;
}

/** The same place in the election before, and the code the list had there (a party's list is found again by the party, not by its code). */
export interface Previous {
  areas: Map<string, MapArea>;
  listCode: number | undefined;
}

/** The value a metric draws for one commune; nothing where the files cannot give it. For "change" it is the list's share minus its share in the election before, in the same place. */
export function metricValue(area: MapArea, metric: MapMetric, listCode: number, previous?: Previous): number | undefined {
  if (metric === "winner") return leaderOf(area)?.lead;
  if (metric === "share") return shareOf(area, listCode);
  if (metric === "change") {
    const before = previous?.listCode === undefined ? undefined : previous.areas.get(area.k);
    const now = shareOf(area, listCode);
    const then = before && previous?.listCode !== undefined ? shareOf(before, previous.listCode) : undefined;
    return now === undefined || then === undefined ? undefined : now - then;
  }
  if (metric === "turnout") return turnoutOf(area);
  return invalidShareOf(area);
}

const PALETTE = ["#0f766e", "#a21caf", "#b45309", "#0369a1", "#be123c", "#4d7c0f", "#7c3aed", "#0e7490"];
const INDEPENDENTS_COLOUR = "#64748b";
export const BRAND_COLOUR = "#4338ca";
/** The map of change uses one pair for every list, blue for what it gained and orange for what it lost: a party's own colour can be a dark grey or close to the other side's. */
export const GAIN_COLOUR = "#0369a1";
export const LOSS_COLOUR = "#c2410c";

/** One colour per list: the party's own where the list is a party we hold, else a colour of the palette in order of votes. A colour already taken moves the list to the next palette colour. */
export function listColours(lists: MapList[]): Map<number, string> {
  const colours = new Map<number, string>();
  const taken = new Set<string>();
  const ordered = [...lists].sort((a, b) => b.votes - a.votes);
  for (const list of ordered) {
    if (list.independents) { colours.set(list.code, INDEPENDENTS_COLOUR); continue; }
    const own = list.color?.toLowerCase();
    if (own && !taken.has(own)) { colours.set(list.code, own); taken.add(own); }
  }
  let next = 0;
  for (const list of ordered) {
    if (colours.has(list.code)) continue;
    while (next < PALETTE.length && taken.has(PALETTE[next]!)) next += 1;
    const colour = PALETTE[next % PALETTE.length]!;
    colours.set(list.code, colour);
    taken.add(colour);
    next += 1;
  }
  return colours;
}

/** The range a ramp spans: the 2nd to the 98th percentile of the values, so that one tiny commune does not wash out the rest. */
export function rampRange(values: number[]): { min: number; max: number } {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return { min: 0, max: 1 };
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))))]!;
  const min = at(0.02);
  const max = at(0.98);
  return max > min ? { min, max } : { min: sorted[0]!, max: sorted[0]! + 1e-9 };
}

/** How strong a colour is, from a faint 0.12 to full. */
export function rampOpacity(value: number, range: { min: number; max: number }): number {
  const fraction = (value - range.min) / (range.max - range.min);
  return 0.12 + 0.88 * Math.min(1, Math.max(0, fraction));
}

export interface AreaPaint {
  fill: string;
  opacity: number;
}

export interface PaintContext {
  metric: MapMetric;
  listCode: number;
  colours: Map<number, string>;
  /** For a ramp: the values it spans. For "change": from zero to the largest change (the same on both sides). */
  range: { min: number; max: number };
  previous?: Previous;
}

/** The colour of one commune: the winner's colour (stronger the larger the lead), a list's own colour for its share, or the brand colour for turnout and null votes. Nothing when there is no value. */
export function paintFor(area: MapArea, context: PaintContext): AreaPaint | undefined {
  const value = metricValue(area, context.metric, context.listCode, context.previous);
  if (value === undefined) return undefined;
  if (context.metric === "change") {
    const strength = Math.abs(value);
    return { fill: value >= 0 ? GAIN_COLOUR : LOSS_COLOUR, opacity: rampOpacity(strength, { min: 0, max: context.range.max }) };
  }
  if (context.metric === "winner") {
    const leader = leaderOf(area);
    return leader ? { fill: context.colours.get(leader.code) ?? INDEPENDENTS_COLOUR, opacity: 0.4 + 0.6 * Math.min(1, leader.lead / 0.3) } : undefined;
  }
  const fill = context.metric === "share" ? context.colours.get(context.listCode) ?? BRAND_COLOUR : BRAND_COLOUR;
  return { fill, opacity: rampOpacity(value, context.range) };
}

/** The lists worth a choice in the picker: the ones that won a share large enough to see, largest first. */
export function pickableLists(lists: MapList[], limit = 14): MapList[] {
  return [...lists].filter((list) => list.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, limit);
}
