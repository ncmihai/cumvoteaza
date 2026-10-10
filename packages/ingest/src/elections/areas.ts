import { parseDelimited, toInt } from "./parse";

/**
 * Sprint 17 (D-041): the polling-station files added up per commune instead of per circumscription. Every file the AEP publishes names the commune of each polling station by its SIRUTA code
 * (2024: `uat_siruta`; 2020: `UAT_SIRUTA`; 2016: `SIRUTA`); a station abroad has the code 9999 (2024) or none, and the country is the name. The votes by mail belong to no place and are not here.
 */
export interface AreaResult {
  /** The SIRUTA code of the commune, or "abroad:<country>". */
  key: string;
  circumscriptionNumber: number;
  name: string;
  sections: number;
  /** a1: voters on the permanent lists. */
  registered: number;
  /** b: voters who came. */
  present: number;
  /** e: valid votes, equal to the sum of the lists. */
  valid: number;
  /** f: null votes. */
  invalid: number;
  /** Votes per list, by the list's folded name; every independent candidate is the one entry "independents". */
  votes: Map<string, number>;
}

export interface AreaList {
  name: string;
  independents: boolean;
}

export interface AreaReading {
  areas: AreaResult[];
  lists: Map<string, AreaList>;
  /** Codes the files carry that were changed to the commune's current code, and why. */
  aliases: string[];
  /** Stations the file gives no commune for (kept under "unknown:<circumscription>"). */
  withoutCommune: number;
}

const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const INDEPENDENTS_KEY = "independents";
export const BUCHAREST_SECTORS: Record<string, string> = { "1": "179141", "2": "179150", "3": "179169", "4": "179178", "5": "179187", "6": "179196" };
/** A code the 2020 file uses for a commune that the 2025 register (and the boundaries) number differently: Băneasa in Constanța county. */
const RENUMBERED: Record<string, { to: string; circumscription: number }> = { "63171": { to: "61069", circumscription: 14 } };

/**
 * One chamber's file as areas. `format` "pv" is the portal's minutes file (one row per station and report, the highest version kept); "sections" is the older open-data file.
 */
export function readAreas(text: string, format: "pv" | "sections"): AreaReading {
  const rows = parseDelimited(text);
  const header = (rows[0] ?? []).map((name) => name.trim());
  const find = (...names: string[]) => header.findIndex((column) => names.some((name) => plain(column) === plain(name)));
  const exact = (name: string) => header.findIndex((column) => column.toLowerCase() === name);
  const circNumber = format === "pv" ? find("precinct_county_nce") : find("Numar circumscriptie");
  const sirutaAt = format === "pv" ? find("uat_siruta") : find("UAT_SIRUTA", "SIRUTA");
  const nameAt = format === "pv" ? find("uat_name") : find("UAT", "Localitate");
  const a1 = exact("a1");
  const b = exact("b");
  const e = exact("e");
  const f = exact("f");
  if (circNumber < 0 || sirutaAt < 0 || nameAt < 0 || a1 < 0 || b < 0 || e < 0 || f < 0) throw new Error("The file lacks a column the commune results need (circumscription, SIRUTA, name, a1, b, e, f)");
  let lists: Array<{ index: number; name: string }>;
  if (format === "pv") lists = header.flatMap((column, index) => (column.endsWith("-voturi") ? [{ index, name: column.slice(0, -"-voturi".length).trim() }] : []));
  else {
    let last = -1;
    header.forEach((column, index) => { if (/^[a-g]\d?$/i.test(column)) last = index; });
    lists = header.slice(last + 1).flatMap((name, i) => (name ? [{ index: last + 1 + i, name }] : []));
  }
  if (lists.length === 0) throw new Error("The file has no list columns");
  const precinct = format === "pv" ? find("precinct_nr") : find("Numar sectie votare", "Număr secție de votare");
  const version = find("report_version");
  const type = find("report_type_code");
  let stations = rows.slice(1);
  if (format === "pv") {
    const latest = new Map<string, string[]>();
    for (const row of stations) {
      const key = [row[circNumber], row[sirutaAt], row[precinct], row[type]].join("|");
      const previous = latest.get(key);
      if (!previous || toInt(row[version]) >= toInt(previous[version])) latest.set(key, row);
    }
    stations = [...latest.values()];
  }
  const listNames = new Map<string, AreaList>();
  const areas = new Map<string, AreaResult>();
  const aliases = new Set<string>();
  let withoutCommune = 0;
  for (const row of stations) {
    const code = toInt(row[circNumber]);
    if (!code) continue;
    const circumscriptionNumber = format === "pv" && code >= 44 && code <= 49 ? 42 : code;
    const printedName = (row[nameAt] ?? "").trim();
    let siruta = (row[sirutaAt] ?? "").trim();
    let key: string;
    if (circumscriptionNumber === 43) key = `abroad:${plain(printedName).replace(/ /g, "-") || "unknown"}`;
    else {
      const sector = /sectorul\s*(\d)/.exec(plain(printedName))?.[1];
      if (circumscriptionNumber === 42 && sector && BUCHAREST_SECTORS[sector] && siruta !== BUCHAREST_SECTORS[sector]) {
        aliases.add(`${siruta || "no code"} (${printedName}) → ${BUCHAREST_SECTORS[sector]}: the file gives Bucharest one code, the sector is read from the name`);
        siruta = BUCHAREST_SECTORS[sector];
      }
      const renumbered = RENUMBERED[siruta];
      if (renumbered && renumbered.circumscription === circumscriptionNumber) {
        aliases.add(`${siruta} (${printedName}) → ${renumbered.to}: the commune's code in the 2025 register`);
        siruta = renumbered.to;
      }
      if (!siruta || siruta === "0") { withoutCommune += 1; key = `unknown:${circumscriptionNumber}`; } else key = siruta;
    }
    let area = areas.get(key);
    if (!area) {
      area = { key, circumscriptionNumber, name: key.startsWith("unknown") ? "?" : printedName, sections: 0, registered: 0, present: 0, valid: 0, invalid: 0, votes: new Map() };
      areas.set(key, area);
    }
    area.sections += 1;
    area.registered += toInt(row[a1]);
    area.present += toInt(row[b]);
    area.valid += toInt(row[e]);
    area.invalid += toInt(row[f]);
    for (const { index, name } of lists) {
      const votes = toInt(row[index]);
      if (!votes) continue;
      const independent = /candidat\s+independent|independent/i.test(name);
      const listKey = independent ? INDEPENDENTS_KEY : plain(name);
      if (!listNames.has(listKey)) listNames.set(listKey, { name: independent ? "" : name, independents: independent });
      area.votes.set(listKey, (area.votes.get(listKey) ?? 0) + votes);
    }
  }
  return { areas: [...areas.values()], lists: listNames, aliases: [...aliases].sort(), withoutCommune };
}
