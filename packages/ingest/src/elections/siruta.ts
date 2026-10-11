import { parseDelimited } from "./parse";
import { circumscriptionOfCounty } from "./circumscriptions";
import { matchName } from "./areas-2012";

/**
 * The SIRUTA register (the National Institute of Statistics' list of administrative units and their localities, July 2024 version, as the Code for Romania "rezultatevot" repository keeps it): level 1
 * counties, level 2 the units that vote together (municipalities, towns, communes), level 3 the localities (villages, a town's own villages) with the unit they belong to as `parent`.
 * Rezultate Vot's second-round answers are by locality, so a commune's result is the sum of its villages', found here by name within the county.
 */
export interface SettlementIndex {
  /** `<circumscription>|<name>` → the units (SIRUTA codes) that have a locality or a unit of that name: one means the name is unambiguous. */
  byName: Map<string, string[]>;
  /** A unit's SIRUTA code → its name as the register prints it ("MUNICIPIUL ALBA IULIA", "ALBAC"). */
  unitNames: Map<string, string>;
}

export function buildSettlementIndex(csv: string): SettlementIndex {
  const rows = parseDelimited(csv).slice(1);
  const circOfCounty = new Map<string, number>();
  for (const row of rows) {
    if (row[2] !== "1") continue;
    const circumscription = circumscriptionOfCounty((row[5] ?? "").replace(/^JUDE[ŢȚT]UL\s+/i, ""));
    if (circumscription) circOfCounty.set(row[4]!, circumscription);
  }
  const byName = new Map<string, Set<string>>();
  const put = (county: string, name: string, unit: string) => {
    const circumscription = circOfCounty.get(county);
    if (!circumscription) return;
    const key = `${circumscription}|${matchName(name)}`;
    byName.set(key, (byName.get(key) ?? new Set()).add(unit));
  };
  const unitNames = new Map<string, string>();
  for (const row of rows) {
    if (row[2] === "2") {
      put(row[4]!, row[5]!, row[0]!);
      unitNames.set(row[0]!, row[5]!);
    }
    else if (row[2] === "3") put(row[4]!, row[5]!, row[1]!);
  }
  return { byName: new Map([...byName].map(([key, units]) => [key, [...units]])), unitNames };
}

/** The unit a place of that name in that county belongs to, when exactly one does. */
export function unitOfPlace(index: SettlementIndex, circumscription: number, name: string): string | undefined {
  const units = index.byName.get(`${circumscription}|${matchName(name)}`);
  return units?.length === 1 ? units[0] : undefined;
}
