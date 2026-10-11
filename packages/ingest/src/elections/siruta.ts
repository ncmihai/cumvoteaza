import { parseDelimited } from "./parse";
import { circumscriptionOfCounty } from "./circumscriptions";
import { matchName } from "./areas-2012";

/**
 * The SIRUTA register (the National Institute of Statistics' list of administrative units and their localities, July 2024 version, as the Code for Romania "rezultatevot" repository keeps it): level 1
 * counties, level 2 the units that vote together (municipalities, towns, communes), level 3 the localities (villages, a town's own villages) with the unit they belong to as `parent`.
 * Rezultate Vot's second-round answers are by locality, so a commune's result is the sum of its villages', found here by name within the county.
 *
 * Rezultate Vot lists each unit once under the unit's own name (a locality id below 100,000) and the other localities (villages, and the seat of a commune that is named otherwise) after them
 * (ids from 100,000 on), so a name is looked up among the units for the first kind and among the other localities for the second: "Costești" the commune is not "Costești" the village of its neighbour.
 */
export interface SettlementIndex {
  /** The units (level 2) by `<circumscription>|<name>`. */
  units: NameLookup;
  /** The localities a unit does not carry the name of (level 3), by `<circumscription>|<name>`. */
  villages: NameLookup;
  /** A unit's SIRUTA code → its name as the register prints it ("MUNICIPIUL ALBA IULIA", "ALBAC"). */
  unitNames: Map<string, string>;
}

export interface NameLookup {
  /** The units (SIRUTA codes) of that name: one means the name is unambiguous. */
  exact: Map<string, string[]>;
  /** The same, with â, î and a, i written alike: Rezultate Vot prints "Targoviste" and "Sanpetru" for Târgoviște and Sânpetru. */
  loose: Map<string, string[]>;
}

/** Rezultate Vot's ids of villages start here; the units' are lower. */
export const FIRST_VILLAGE_ID = 100_000;

const looseName = (name: string) => matchName(name).replace(/[ai]/g, "a");

export function buildSettlementIndex(csv: string): SettlementIndex {
  const rows = parseDelimited(csv).slice(1);
  const circOfCounty = new Map<string, number>();
  for (const row of rows) {
    if (row[2] !== "1") continue;
    const circumscription = circumscriptionOfCounty((row[5] ?? "").replace(/^JUDE[ŢȚT]UL\s+/i, ""));
    if (circumscription) circOfCounty.set(row[4]!, circumscription);
  }
  const lookups = { units: { exact: new Map<string, Set<string>>(), loose: new Map<string, Set<string>>() }, villages: { exact: new Map<string, Set<string>>(), loose: new Map<string, Set<string>>() } };
  const put = (kind: "units" | "villages", county: string, name: string, unit: string) => {
    const circumscription = circOfCounty.get(county);
    if (!circumscription) return;
    for (const [map, key] of [[lookups[kind].exact, `${circumscription}|${matchName(name)}`], [lookups[kind].loose, `${circumscription}|${looseName(name)}`]] as const) map.set(key, (map.get(key) ?? new Set()).add(unit));
  };
  const unitNames = new Map<string, string>();
  for (const row of rows) {
    if (row[2] === "2") {
      put("units", row[4]!, row[5]!, row[0]!);
      unitNames.set(row[0]!, row[5]!);
    }
  }
  for (const row of rows) {
    // The locality that carries its unit's name is the unit's own entry in Rezultate Vot, not a village.
    if (row[2] === "3" && matchName(row[5]!) !== matchName(unitNames.get(row[1]!) ?? "")) put("villages", row[4]!, row[5]!, row[1]!);
  }
  const listed = (map: Map<string, Set<string>>) => new Map([...map].map(([key, units]) => [key, [...units]]));
  return {
    units: { exact: listed(lookups.units.exact), loose: listed(lookups.units.loose) },
    villages: { exact: listed(lookups.villages.exact), loose: listed(lookups.villages.loose) },
    unitNames
  };
}

/** The units a name stands for in one lookup: those with that spelling, and only if there are none, those with â and î written as a and i. */
function inLookup(lookup: NameLookup, circumscription: number, name: string): string[] | undefined {
  return lookup.exact.get(`${circumscription}|${matchName(name)}`) ?? lookup.loose.get(`${circumscription}|${looseName(name)}`);
}

/**
 * The unit a place of that name in that county belongs to, when exactly one does. A unit's own entry (`localityId` below 100,000) is looked up among the units, a village among the other localities; the
 * other list is tried only where the first has no such name (a commune merged since 2019 is a village of the register of 2024). Two units are never chosen between.
 */
export function unitOfPlace(index: SettlementIndex, circumscription: number, name: string, localityId?: number): string | undefined {
  const order = localityId === undefined ? [index.units, index.villages] : localityId < FIRST_VILLAGE_ID ? [index.units, index.villages] : [index.villages, index.units];
  if (localityId === undefined) {
    const both = new Set([...(inLookup(order[0]!, circumscription, name) ?? []), ...(inLookup(order[1]!, circumscription, name) ?? [])]);
    return both.size === 1 ? [...both][0] : undefined;
  }
  for (const lookup of order) {
    const found = inLookup(lookup, circumscription, name);
    if (found) return found.length === 1 ? found[0] : undefined;
  }
  return undefined;
}

const orderKey = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The villages whose name two or more units of the county share, placed by the order of Rezultate Vot's list. The list numbers the villages unit by unit and, inside a unit, in alphabetical order, so the
 * villages of one unit follow one another and ascend by name. Of all the ways to give each village a unit that has such a village, the one with the fewest changes of unit (and none going back down the
 * alphabet inside one) is taken, and a village gets its unit only where that way is the only one of that cost; otherwise it stays unplaced. Villages whose name only one unit has are not touched.
 */
export function placeVillagesByOrder(index: SettlementIndex, circumscription: number, listed: Array<{ id: number; name: string }>): Map<number, string> {
  const items = listed
    .filter((place) => place.id >= FIRST_VILLAGE_ID)
    .sort((a, b) => a.id - b.id)
    .flatMap((place) => {
      const units = inLookup(index.villages, circumscription, place.name);
      return units?.length ? [{ id: place.id, key: orderKey(place.name), units }] : [];
    });
  const out = new Map<number, string>();
  if (items.length === 0) return out;
  const step = (from: (typeof items)[number], unit: string, to: (typeof items)[number], next: string) => (unit === next ? (to.key >= from.key ? 0 : 3) : 1);
  const INF = Number.POSITIVE_INFINITY;
  const forward = items.map((item, at) => new Map<string, number>(item.units.map((unit) => [unit, at === 0 ? 0 : INF])));
  for (let at = 1; at < items.length; at += 1) {
    for (const unit of items[at]!.units) forward[at]!.set(unit, Math.min(...items[at - 1]!.units.map((before) => forward[at - 1]!.get(before)! + step(items[at - 1]!, before, items[at]!, unit))));
  }
  const backward = items.map((item) => new Map<string, number>(item.units.map((unit) => [unit, 0])));
  for (let at = items.length - 2; at >= 0; at -= 1) {
    for (const unit of items[at]!.units) backward[at]!.set(unit, Math.min(...items[at + 1]!.units.map((after) => step(items[at]!, unit, items[at + 1]!, after) + backward[at + 1]!.get(after)!)));
  }
  const best = Math.min(...forward[items.length - 1]!.values());
  items.forEach((item, at) => {
    const cheapest = item.units.filter((unit) => forward[at]!.get(unit)! + backward[at]!.get(unit)! === best);
    if (cheapest.length === 1 && item.units.length > 1) out.set(item.id, cheapest[0]!);
  });
  return out;
}
