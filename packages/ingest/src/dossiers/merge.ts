import { fold } from "./step-typing";
import { deriveFate } from "./fate";
import type { DossierDocumentLink, DossierFate, DossierInitiator, DossierRegistration, DossierStep, ParsedDossier, StepChamber } from "./types";

/** The identifiers one bill goes by: "PL-x 56/2026", "L535/2025", "B678/2025". Pages that share one are the same bill. */
export interface BillKeys {
  deputies?: string;
  senateL?: string;
  senateB: string[];
}

const year = (date: string | undefined, fallback?: number) => (date ? Number(date.slice(0, 4)) : fallback);

/** The identifiers a page names for its bill, in the spelling the rest of the project uses. */
export function keysOfPage(page: ParsedDossier): BillKeys {
  const keys: BillKeys = { senateB: [] };
  const self = page.selfId;
  if (self && /^PL-x/i.test(self)) keys.deputies = self.replace(/^pl-x/i, "PL-x");
  for (const registration of page.registrations) {
    if (registration.body === "cdep" && /^PLX\d+\/\d{4}$/i.test(registration.number)) keys.deputies ??= `PL-x ${Number(registration.number.slice(3).split("/")[0])}/${registration.number.split("/")[1]}`;
    if (registration.body === "senate") {
      const match = registration.number.match(/^([A-Z]+)(\d+)$/i);
      if (!match) continue;
      const y = registration.year ?? year(registration.date) ?? Number(self?.match(/\/(\d{4})$/)?.[1]);
      if (!y) continue;
      const value = `${match[1]!.toUpperCase()}${Number(match[2])}/${y}`;
      if (match[1]!.toUpperCase() === "L") keys.senateL ??= value;
      else if (!keys.senateB.includes(value)) keys.senateB.push(value);
    }
  }
  // A Senate page's own heading is authoritative for its own number.
  if (self && /^L\d+\/\d{4}$/i.test(self)) keys.senateL = self.toUpperCase();
  if (self && /^B\d+\/\d{4}$/i.test(self) && !keys.senateB.includes(self.toUpperCase())) keys.senateB.push(self.toUpperCase());
  return keys;
}

export const keyList = (keys: BillKeys) => [keys.deputies && `d:${keys.deputies.toLowerCase().replace(/\s+/g, "")}`, keys.senateL && `l:${keys.senateL.toLowerCase()}`, ...keys.senateB.map((b) => `b:${b.toLowerCase()}`)].filter(Boolean) as string[];

export interface PageGroup {
  /** Every page that names one of the group's identifiers (at most one Chamber page and one Senate page in practice). */
  pages: ParsedDossier[];
  keys: BillKeys;
}

/** The ordinance a "bill approving an ordinance" names first ("OUG nr.74/2025" -> "74/2025"); undefined when the title names none. Two pages that approve different ordinances are not one bill. */
/**
 * The laws a title names, as "number/year" ("Legii nr.58/1934", "Ordonanței nr.26/2013"). Two pages whose titles both name laws and share none are not one bill:
 * the Chamber prints a Senate number with the year of another date, and the Senate lists a Chamber number without checking the year, so one number can reach two different bills.
 */
export function lawReferences(title: string | undefined): Set<string> {
  const found = new Set<string>();
  for (const match of fold(title ?? "").matchAll(/(?<![\d/])(\d{1,4})\s*\/\s*(\d{4})(?!\d)/g)) found.add(`${Number(match[1])}/${match[2]}`);
  return found;
}

// Words that open nearly every title: they say nothing about the subject.
const TITLE_FILLER = new Set(["pentru", "privind", "legii", "legea", "proiect", "propunere", "legislativa", "modificarea", "completarea", "aprobarea", "unele", "normative", "precum", "prin", "care", "ordonantei", "urgenta", "guvernului", "ordonanta", "completare", "modificare", "masuri", "alineatului", "articolului", "republicata", "publicata", "monitorul", "oficial", "romaniei", "partea", "ulterioare", "completarile", "modificarile"]);

/** The first four letters of each word of five or more that carries the subject ("educatiei" and "educatia" meet). */
function titleStems(title: string | undefined): Set<string> {
  return new Set(fold(title ?? "").split(/[^a-z0-9]+/).filter((word) => word.length >= 5 && !TITLE_FILLER.has(word) && !/^\d+$/.test(word)).map((word) => word.slice(0, 4)));
}

/**
 * Two titles that cannot be the same bill: no law in common and no word that carries the subject in common. A law number is often mistyped on one side ("16/1991" and "61/1991"), so different
 * laws alone decide nothing when the subject words agree; and a title with fewer than three subject words and no law named is too short to tell.
 */
export const titlesNameDifferentLaws = (a: string | undefined, b: string | undefined): boolean => {
  const first = lawReferences(a);
  const second = lawReferences(b);
  if ([...first].some((reference) => second.has(reference))) return false;
  const [stemsA, stemsB] = [titleStems(a), titleStems(b)];
  const noSubjectInCommon = ![...stemsA].some((stem) => stemsB.has(stem));
  if (first.size > 0 && second.size > 0) return noSubjectInCommon;
  return stemsA.size >= 3 && stemsB.size >= 3 && noSubjectInCommon;
};

export function approvedOrdinance(title: string | undefined): string | undefined {
  const match = fold(title ?? "").match(/(?:ordon+a\w*|oug|o\.u\.g\.|og)\s*(?:de urgenta\s*)?(?:a guvernului\s*)?nr\.?\s*(\d+)\s*\/\s*(\d{4})/);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

/**
 * Pages to bills: pages that share any identifier are one bill. Two different Chamber pages are never one bill, though:
 * when the Senate sent one bill down twice, the Chamber registered it twice (PL-x 34/2026 and PL-x 35/2026) and both pages name the same Senate number.
 * Each Chamber page keeps its own dossier; a Senate page that names both joins the first.
 * `bridges` are pairs of keys the owner has said belong to one bill: the pages that own them are joined (still never two Chamber pages).
 */
export function groupPages(pages: ParsedDossier[], bridges: Array<[string, string]> = []): PageGroup[] {
  const parent = pages.map((_, index) => index);
  const chamberPages: number[] = pages.map((page) => (page.source === "cdep" ? 1 : 0));
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const join = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB || chamberPages[rootA]! + chamberPages[rootB]! > 1) return;
    // A page that carries another bill's number by mistake (the Chamber printed L588/2025 on a bill that approves a different ordinance) must not pull that bill's dossier in.
    const ordinanceA = approvedOrdinance(pages[a]!.title);
    const ordinanceB = approvedOrdinance(pages[b]!.title);
    if (ordinanceA && ordinanceB && ordinanceA !== ordinanceB) return;
    if (titlesNameDifferentLaws(pages[a]!.title, pages[b]!.title)) return;
    parent[rootB] = rootA;
    chamberPages[rootA] = chamberPages[rootA]! + chamberPages[rootB]!;
  };
  const owner = new Map<string, number>();
  pages.forEach((page, index) => {
    for (const key of keyList(keysOfPage(page))) {
      const seen = owner.get(key);
      if (seen === undefined) owner.set(key, index);
      else join(seen, index);
    }
  });
  // Owner-linked bills (data/curated/bill-links.json) carry both numbers on the stored bill; the two pages name only their own, so the link joins them.
  for (const [first, second] of bridges) {
    const [x, y] = [owner.get(first), owner.get(second)];
    if (x !== undefined && y !== undefined) join(x, y);
  }
  const groups = new Map<number, ParsedDossier[]>();
  pages.forEach((page, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), page]));
  const result = [...groups.values()].map((group) => ({ pages: group, keys: mergeKeys(group) }));
  // A Senate page that names a Chamber number whose own page is in another group (the titles refused the join) was wrong about it: it keeps no claim on that number.
  const chamberNumbers = new Set(result.flatMap((group) => (group.pages.some((page) => page.source === "cdep") ? [group.keys.deputies?.toLowerCase()] : [])));
  for (const group of result) if (!group.pages.some((page) => page.source === "cdep") && group.keys.deputies && chamberNumbers.has(group.keys.deputies.toLowerCase())) delete group.keys.deputies;
  return result;
}

/** The Chamber's page is the authority for its own PL-x number and the Senate's page for its own L number: the number each prints for the other carries a guessed year. */
function mergeKeys(pages: ParsedDossier[]): BillKeys {
  const keysOf = (source: ParsedDossier["source"]) => pages.filter((page) => page.source === source).map(keysOfPage);
  const [cdep, senate] = [keysOf("cdep"), keysOf("senate")];
  const merged: BillKeys = { senateB: [] };
  merged.deputies = [...cdep, ...senate].find((keys) => keys.deputies)?.deputies;
  merged.senateL = [...senate, ...cdep].find((keys) => keys.senateL)?.senateL;
  for (const keys of [...senate, ...cdep]) for (const b of keys.senateB) if (!merged.senateB.includes(b)) merged.senateB.push(b);
  if (!merged.deputies) delete merged.deputies;
  if (!merged.senateL) delete merged.senateL;
  return merged;
}

export interface MergedDossier {
  keys: BillKeys;
  title?: string;
  pages: Array<{ source: "cdep" | "senate"; url: string }>;
  registrations: DossierRegistration[];
  initiativeType?: string;
  initiativeKind?: ParsedDossier["initiativeKind"];
  firstChamber?: "deputies" | "senate";
  decisionChamber?: "deputies" | "senate";
  /** The pages say so themselves (the Senate's "Prima cameră", the Chamber's "Camera decizionala"); otherwise the value is worked out from the registration dates or from the other chamber. */
  firstChamberStated: boolean;
  decisionChamberStated: boolean;
  character?: string;
  urgent?: boolean;
  stage?: string;
  summary?: string;
  tacitDeadline?: string;
  initiators: DossierInitiator[];
  initiatorCountText?: string;
  /** The documents the Chamber page lists under "Consultati" (explanatory memorandum, outside opinions). */
  consulted: DossierDocumentLink[];
  steps: DossierStep[];
  fate: DossierFate;
  unrecognised: string[];
}

/** The earliest registration says which chamber the bill started in (the Chamber's initiative register and its own number count for the Chamber). */
function firstChamberFrom(registrations: DossierRegistration[]): "deputies" | "senate" | undefined {
  const dated = registrations
    .filter((item): item is DossierRegistration & { date: string } => Boolean(item.date) && item.body !== "government")
    .map((item) => ({ chamber: item.body === "senate" ? ("senate" as const) : ("deputies" as const), date: item.date }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return dated[0]?.chamber;
}

/**
 * One bill from its pages. Each chamber's own page is authoritative for that chamber's steps (the other page prints them
 * in short); the Presidency's steps come from both, once. Initiators come from the Chamber page when it lists member
 * profiles (exact), otherwise from the Senate page (names).
 */
/**
 * The fate from the stage line of the page that has seen the latest step. The law's number is printed by the Chamber's page ("Lege 180/2022") while the Senate's page of the same bill can still read
 * "Trimis la Cameră pentru dezbatere"; where the chosen line has no law number, the other page's line is tried, and used only for the number it states.
 */
function fateOf(input: Parameters<typeof deriveFate>[0], otherStages: Array<string | undefined>) {
  const fate = deriveFate(input);
  if (fate.lawNumber) return fate;
  for (const stage of otherStages) {
    if (!stage || stage === input.stage) continue;
    const retry = deriveFate({ ...input, stage });
    if (retry.lawNumber) return { ...retry };
  }
  return fate;
}

export function mergeDossiers(group: PageGroup): MergedDossier {
  const cdep = group.pages.find((page) => page.source === "cdep");
  const senate = group.pages.find((page) => page.source === "senate");
  const pages = [cdep, senate].filter(Boolean) as ParsedDossier[];

  const registrations: DossierRegistration[] = [];
  for (const page of pages) {
    for (const registration of page.registrations) {
      const index = registrations.findIndex((item) => item.body === registration.body && item.number.toLowerCase() === registration.number.toLowerCase());
      if (index < 0) registrations.push(registration);
      // The Senate's own page is the authority for its own registrations (the Chamber prints the date of the B registration beside the L number).
      else if (page.source === "senate" && registration.body === "senate") registrations[index] = registration;
      else if (!registrations[index]!.date && registration.date) registrations[index] = { ...registrations[index]!, date: registration.date };
    }
  }

  let steps: DossierStep[];
  if (cdep && senate) {
    const president = [...senate.steps, ...cdep.steps].filter((step) => step.chamber === "president");
    const seen = new Set<string>();
    const presidentOnce = president.filter((step) => {
      const key = `${step.type}|${step.occurredOn}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
    steps = [
      ...cdep.steps.filter((step) => step.chamber === "deputies"),
      ...senate.steps.filter((step) => step.chamber === "senate"),
      ...presidentOnce,
      ...[...cdep.steps, ...senate.steps].filter((step) => step.chamber === "unknown")
    ];
  } else if (senate && !cdep && keysOfPage(senate).deputies && !group.keys.deputies) {
    // The Senate page names a Chamber number whose own page belongs to another bill (the Senate looked it up without the year): the Chamber's steps it lists are that bill's, not this one's.
    steps = senate.steps.filter((step) => step.chamber === "senate");
  } else steps = [...(cdep ?? senate)!.steps];

  const firstChamber = senate?.firstChamber ?? cdep?.firstChamber ?? firstChamberFrom(registrations);
  const rank = (step: DossierStep) => (step.chamber === firstChamber ? 0 : step.chamber === "president" ? 3 : step.chamber === "unknown" || step.chamber === "joint" ? 1 : 2);
  steps = steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => a.step.occurredOn.localeCompare(b.step.occurredOn) || rank(a.step) - rank(b.step) || a.index - b.index)
    .map(({ step }, order) => ({ ...step, order }));

  // The stage line of the page that has seen the latest step.
  const latest = (page: ParsedDossier | undefined) => page?.steps.reduce((max, step) => (step.occurredOn > max ? step.occurredOn : max), "") ?? "";
  const stagePage = latest(senate) >= latest(cdep) ? (senate ?? cdep) : cdep;
  // A blank stage cell (the Chamber leaves it empty for some bills) is no stage: the other page's line is used.
  const stage = stagePage?.stage || cdep?.stage || senate?.stage || undefined;

  const memberFirst = (list: DossierInitiator[]) => list.filter((item) => item.kind === "member").length > 0;
  const initiators = cdep && memberFirst(cdep.initiators) ? cdep.initiators : senate && senate.initiators.length ? senate.initiators : cdep?.initiators ?? [];
  // The decisional chamber is always the one that was not the first notified (art. 75): the page says so when it can, and otherwise it follows from the first chamber.
  const decisionChamber = cdep?.decisionChamber ?? senate?.decisionChamber ?? (firstChamber === "senate" ? "deputies" : firstChamber === "deputies" ? "senate" : undefined);

  return {
    keys: group.keys,
    title: cdep?.title ?? senate?.title,
    pages: pages.map((page) => ({ source: page.source, url: page.sourceUrl })),
    registrations,
    initiativeType: cdep?.initiativeType ?? senate?.initiativeType,
    initiativeKind: cdep?.initiativeKind ?? senate?.initiativeKind,
    firstChamber,
    decisionChamber,
    firstChamberStated: Boolean(senate?.firstChamber ?? cdep?.firstChamber),
    decisionChamberStated: Boolean(cdep?.decisionChamber ?? senate?.decisionChamber),
    character: cdep?.character ?? (senate?.character ? senate.character : undefined),
    urgent: senate?.urgent ?? cdep?.urgent,
    stage,
    summary: cdep?.summary ?? senate?.summary,
    tacitDeadline: senate?.tacitDeadline ?? cdep?.tacitDeadline,
    initiators,
    initiatorCountText: cdep?.initiatorCountText,
    consulted: cdep?.consulted ?? [],
    steps,
    fate: fateOf({ steps, stage, decisionChamber }, [cdep?.stage, senate?.stage]),
    unrecognised: pages.flatMap((page) => page.unrecognised)
  };
}

/** "ordinar", "ordinara", "organic", "organica", "constitutional" to the values the `bills.law_type` column holds. */
export function lawTypeOf(character: string | undefined): "ordinary" | "organic" | "constitutional" | undefined {
  const folded = fold(character ?? "");
  if (/^ordinar/.test(folded)) return "ordinary";
  if (/^organic/.test(folded)) return "organic";
  if (/^constitu/.test(folded)) return "constitutional";
  return undefined;
}
