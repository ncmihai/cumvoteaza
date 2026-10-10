import { parseDelimited, toInt } from "./parse";

/**
 * The 2012 parliamentary elections (the first with uninominal colleges since 1992), from the AEP's spreadsheets on data.gov.ro converted to CSV by tools/xlsx/xls-to-csv.py: the votes of every
 * competitor (party, alliance, minority organisation or independent candidate) summed per circumscription and chamber, and the mandates each competitor's candidates won, counted from the candidates'
 * file ("Mandat Atribuit"). The result has the shape the other elections have, a list in a circumscription with its votes and mandates, so the pages and the party pages read it the same way.
 * The polling-station file of 2012 names the commune but not its SIRUTA code, so there is no map by commune for 2012.
 */
export interface LegacyRow {
  chamber: "deputies" | "senate";
  circumscriptionNumber: number;
  circumscription: string;
  listName: string;
  votes: number;
  mandates: number;
}

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The votes by competitor and circumscription ("Tip Colegiu" cd or s) and the mandates by competitor, circumscription and chamber (a candidate has a Senate college or a Deputies college). */
export function readLegacy2012(circumscriptionsText: string, candidatesText: string): LegacyRow[] {
  const votes = parseDelimited(circumscriptionsText).slice(1);
  const candidates = parseDelimited(candidatesText).slice(1);
  const rows = new Map<string, LegacyRow>();
  const key = (chamber: string, circumscription: number, list: string) => `${chamber}|${circumscription}|${fold(list)}`;
  for (const row of votes) {
    const chamber = (row[2] ?? "").trim().toLowerCase() === "s" ? "senate" as const : "deputies" as const;
    const number = toInt(row[0]);
    const list = (row[18] ?? "").trim();
    if (!number || !list) continue;
    const id = key(chamber, number, list);
    const previous = rows.get(id);
    rows.set(id, previous ? { ...previous, votes: previous.votes + toInt(row[19]) } : { chamber, circumscriptionNumber: number, circumscription: (row[1] ?? "").trim(), listName: list, votes: toInt(row[19]), mandates: 0 });
  }
  for (const row of candidates) {
    const mandates = toInt(row[9]);
    if (mandates <= 0) continue;
    const chamber = (row[4] ?? "").trim() !== "" ? "senate" as const : "deputies" as const;
    const number = toInt(row[2]);
    const list = (row[1] ?? "").trim();
    const id = key(chamber, number, list);
    const found = rows.get(id);
    if (found) found.mandates += mandates;
    else rows.set(id, { chamber, circumscriptionNumber: number, circumscription: (row[3] ?? "").trim(), listName: list, votes: 0, mandates });
  }
  return [...rows.values()];
}
