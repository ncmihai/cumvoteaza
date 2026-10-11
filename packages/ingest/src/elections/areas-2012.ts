import { BUCHAREST_SECTORS, INDEPENDENTS_KEY, type AreaList, type AreaReading, type AreaResult } from "./areas";
import { parseDelimited, toInt } from "./parse";

/**
 * The 2012 elections by commune (Sprint 17, D-041 follow-up). The AEP's polling-station file of 2012 names the locality of each station but gives no SIRUTA code, so the commune is found by its
 * name: the same name, in the same county, as a commune of a later election whose files do carry the code (2016, 2020, 2024 print the same "MUNICIPIUL X", "ORAŞ X" and plain commune names).
 * A name that no later election has (a commune created or renamed since) stays out of the map under "unknown:<county>" and is reported, never guessed.
 */
export interface NameIndexEntry {
  siruta: string;
  /** The printed name in the election the code was read from, for the report. */
  printed: string;
  kind: "municipiul" | "oras" | "comuna";
  /** The name as `matchName` writes it. */
  name: string;
}

/** A name written so that the 2012 and the later spellings meet: no diacritics, â and î as one letter (the 1993 spelling reform), no hyphens, no type word in front. */
export function matchName(value: string): string {
  return value
    .replace(/[âÂ]/g, "î")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .trim()
    .replace(/^(municipiul|muncipiul|orasul|oras|comuna)\s+/, "");
}

/** The kind of a place from its printed name ("municipiul", "oras" or "comuna"), to tell a town from a commune of the same name. */
export function placeKind(value: string): "municipiul" | "oras" | "comuna" {
  const folded = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (/^(municipiul|muncipiul)\b/.test(folded)) return "municipiul";
  if (/^oras(ul)?\b/.test(folded)) return "oras";
  return "comuna";
}

export const indexKey = (circumscription: number, name: string) => `${circumscription}|${placeKind(name)}|${matchName(name)}`;

export interface NameIndex {
  exact: Map<string, NameIndexEntry>;
  byCircumscription: Map<number, NameIndexEntry[]>;
}

/** Builds the (county, kind, name) → SIRUTA index from the commune results of other elections. A name that two codes claim is dropped (it would be a guess). */
export function buildNameIndex(readings: AreaReading[]): { index: NameIndex; ambiguous: string[] } {
  const exact = new Map<string, NameIndexEntry>();
  const ambiguous = new Set<string>();
  for (const reading of readings) {
    for (const area of reading.areas) {
      if (area.key.startsWith("abroad:") || area.key.startsWith("unknown:") || area.circumscriptionNumber === 42 || area.circumscriptionNumber === 43) continue;
      const key = indexKey(area.circumscriptionNumber, area.name);
      const known = exact.get(key);
      if (known && known.siruta !== area.key) ambiguous.add(key);
      else exact.set(key, { siruta: area.key, printed: area.name, kind: placeKind(area.name), name: matchName(area.name) });
    }
  }
  for (const key of ambiguous) exact.delete(key);
  const byCircumscription = new Map<number, NameIndexEntry[]>();
  for (const [key, entry] of exact) {
    const circumscription = Number(key.split("|")[0]);
    byCircumscription.set(circumscription, [...(byCircumscription.get(circumscription) ?? []), entry]);
  }
  return { index: { exact, byCircumscription }, ambiguous: [...ambiguous].sort() };
}

export type MatchHow = "exact" | "name" | "pattern" | "loose";

/** `<county>|<2012 name as matchName writes it>` → the name the later files use: "Roşiorii de Vede" is Roşiori de Vede, "Alexandru Ioan Cuza" is Alexandru I. Cuza (Iaşi), "Unguarş" is Unguraş (Cluj). */
const SPELLINGS: Record<string, string> = {
  "36|rosiorii de vede": "rosiori de vede",
  "24|alexandru ioan cuza": "alexandru i cuza",
  "13|unguars": "unguras"
};

const loose = (name: string) => name.replace(/[ai]/g, "a");
const toPattern = (name: string, collapse: boolean) => new RegExp(`^${(collapse ? loose(name) : name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".")}$`);

/**
 * The commune a 2012 locality is, by the strictest way that finds exactly one: the same kind and name; the same name whatever the kind (the 2012 file leaves "ORAŞ" off some towns); a name with a
 * letter lost to the file's encoding ("MOVILI_A" for Moviliţa); a name with its diacritics stripped, where â and î were typed as a or i ("PATARLAGELE"). Two candidates are no match.
 */
export function resolveLocality(index: NameIndex, circumscription: number, printed: string): { siruta: string; how: MatchHow } | undefined {
  const exact = index.exact.get(indexKey(circumscription, printed));
  if (exact) return { siruta: exact.siruta, how: "exact" };
  const own = index.byCircumscription.get(circumscription) ?? [];
  // Three communes the 2012 file spells in a way no rule above reaches (read against the later files by hand): the same commune, another spelling.
  const name = SPELLINGS[`${circumscription}|${matchName(printed)}`] ?? matchName(printed);
  const only = (found: NameIndexEntry[], how: MatchHow) => (new Set(found.map((entry) => entry.siruta)).size === 1 ? { siruta: found[0]!.siruta, how } : undefined);
  const sameName = own.filter((entry) => entry.name === name);
  if (sameName.length) return only(sameName, "name");
  const pattern = toPattern(name, false);
  const patterned = own.filter((entry) => pattern.test(entry.name));
  if (patterned.length) return only(patterned, "pattern");
  const loosePattern = toPattern(name, true);
  const looser = own.filter((entry) => loosePattern.test(loose(entry.name)));
  return looser.length ? only(looser, "loose") : undefined;
}

export interface Reading2012 {
  deputies: AreaReading;
  senate: AreaReading;
  /** Localities no later election names, with their stations (per chamber it is the same list). */
  unmatched: Array<{ circumscription: number; name: string; sections: number }>;
  /** How many station rows were matched by each way (see `resolveLocality`). */
  matchedBy: Record<MatchHow, number>;
}

const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The section-level file of 2012 as commune results per chamber. Each row is one candidate in one station's college; the station's figures are taken once. */
export function readAreas2012(text: string, index: NameIndex): Reading2012 {
  const rows = parseDelimited(text);
  const header = (rows[0] ?? []).map((name) => name.trim());
  const at = (name: string) => header.indexOf(name);
  const circ = at("numarCircumscriptie");
  const section = at("numarSectie");
  const place = at("Localitate");
  const college = at("numeTipColegiu");
  const registered = at("NrAlegatoriListePermanent");
  const present = at("NrAlegatoriPrezentatiLaUrne");
  const valid = at("TotalVoturiValabilExprimateLaNivelSectie");
  const nulls = at("NrVoturiNule");
  const blanks = at("NrVoturiAlbe");
  const competitor = at("numeCompetitor");
  const votes = at("VoturiCandidat");
  if ([circ, section, place, college, registered, present, valid, nulls, blanks, competitor, votes].some((column) => column < 0)) throw new Error("The 2012 section file lacks a column the commune results need");
  const out: Record<"deputies" | "senate", { areas: Map<string, AreaResult>; lists: Map<string, AreaList>; seen: Set<string> }> = {
    deputies: { areas: new Map(), lists: new Map(), seen: new Set() },
    senate: { areas: new Map(), lists: new Map(), seen: new Set() }
  };
  const unmatched = new Map<string, { circumscription: number; name: string; sections: Set<string> }>();
  const how = new Map<MatchHow, number>();
  for (const row of rows.slice(1)) {
    const circumscription = toInt(row[circ]);
    if (!circumscription) continue;
    const chamber = /senat/i.test(row[college] ?? "") ? "senate" as const : "deputies" as const;
    const printed = (row[place] ?? "").trim();
    let key: string;
    let name = printed;
    if (circumscription === 43) key = `abroad:${plain(printed).replace(/ /g, "-") || "unknown"}`;
    else if (circumscription === 42) {
      const sector = /sectorul\s*(\d)/.exec(plain(printed))?.[1];
      key = sector && BUCHAREST_SECTORS[sector] ? BUCHAREST_SECTORS[sector]! : `unknown:42`;
    } else {
      const found = resolveLocality(index, circumscription, printed);
      if (found) {
        key = found.siruta;
        how.set(found.how, (how.get(found.how) ?? 0) + 1);
      } else {
        key = `unknown:${circumscription}`;
        name = "?";
        const id = `${circumscription}|${printed}`;
        const entry = unmatched.get(id) ?? { circumscription, name: printed, sections: new Set<string>() };
        entry.sections.add(`${row[section]}|${row[college]}`);
        unmatched.set(id, entry);
      }
    }
    const target = out[chamber];
    let area = target.areas.get(key);
    if (!area) {
      area = { key, circumscriptionNumber: circumscription, name, sections: 0, registered: 0, present: 0, valid: 0, invalid: 0, votes: new Map() };
      target.areas.set(key, area);
    }
    const station = `${key}|${circumscription}|${printed}|${row[section]}|${row[college]}`;
    if (!target.seen.has(station)) {
      target.seen.add(station);
      area.sections += 1;
      area.registered += toInt(row[registered]);
      area.present += toInt(row[present]);
      area.valid += toInt(row[valid]);
      area.invalid += toInt(row[nulls]) + toInt(row[blanks]);
    }
    const name2 = (row[competitor] ?? "").trim();
    const independent = name2 === "" || name2.toUpperCase() === "NULL";
    const count = toInt(row[votes]);
    if (!count) continue;
    const listKey = independent ? INDEPENDENTS_KEY : plain(name2);
    if (!target.lists.has(listKey)) target.lists.set(listKey, { name: independent ? "" : name2, independents: independent });
    area.votes.set(listKey, (area.votes.get(listKey) ?? 0) + count);
  }
  const reading = (chamber: "deputies" | "senate"): AreaReading => ({
    areas: [...out[chamber].areas.values()],
    lists: out[chamber].lists,
    aliases: [],
    withoutCommune: [...out[chamber].areas.values()].filter((area) => area.key.startsWith("unknown:")).reduce((sum, area) => sum + area.sections, 0)
  });
  return {
    deputies: reading("deputies"),
    senate: reading("senate"),
    matchedBy: { exact: how.get("exact") ?? 0, name: how.get("name") ?? 0, pattern: how.get("pattern") ?? 0, loose: how.get("loose") ?? 0 },
    unmatched: [...unmatched.values()].map((entry) => ({ circumscription: entry.circumscription, name: entry.name, sections: entry.sections.size })).sort((a, b) => b.sections - a.sections)
  };
}

/** The independent candidates of 2012: in the section file they have no competitor ("NULL") and the circumscription spreadsheets name them by their own name, so the pages would list each as a party. */
export function readIndependents2012(text: string): Set<string> {
  const rows = parseDelimited(text);
  const header = (rows[0] ?? []).map((name) => name.trim());
  const competitor = header.indexOf("numeCompetitor");
  const candidate = header.indexOf("NumeCandidat");
  if (competitor < 0 || candidate < 0) return new Set();
  const names = new Set<string>();
  for (const row of rows.slice(1)) {
    const name = (row[competitor] ?? "").trim();
    if (name === "" || name.toUpperCase() === "NULL") names.add(plain(row[candidate] ?? ""));
  }
  names.delete("");
  return names;
}
