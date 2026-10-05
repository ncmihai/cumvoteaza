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

const keyList = (keys: BillKeys) => [keys.deputies && `d:${keys.deputies.toLowerCase().replace(/\s+/g, "")}`, keys.senateL && `l:${keys.senateL.toLowerCase()}`, ...keys.senateB.map((b) => `b:${b.toLowerCase()}`)].filter(Boolean) as string[];

export interface PageGroup {
  /** Every page that names one of the group's identifiers (at most one Chamber page and one Senate page in practice). */
  pages: ParsedDossier[];
  keys: BillKeys;
}

/**
 * Pages to bills: pages that share any identifier are one bill. Two different Chamber pages are never one bill, though:
 * when the Senate sent one bill down twice, the Chamber registered it twice (PL-x 34/2026 and PL-x 35/2026) and both pages name the same Senate number.
 * Each Chamber page keeps its own dossier; a Senate page that names both joins the first.
 */
export function groupPages(pages: ParsedDossier[]): PageGroup[] {
  const parent = pages.map((_, index) => index);
  const chamberPages: number[] = pages.map((page) => (page.source === "cdep" ? 1 : 0));
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const join = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB || chamberPages[rootA]! + chamberPages[rootB]! > 1) return;
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
  const groups = new Map<number, ParsedDossier[]>();
  pages.forEach((page, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), page]));
  return [...groups.values()].map((group) => ({ pages: group, keys: mergeKeys(group.map(keysOfPage)) }));
}

function mergeKeys(all: BillKeys[]): BillKeys {
  const merged: BillKeys = { senateB: [] };
  for (const keys of all) {
    merged.deputies ??= keys.deputies;
    merged.senateL ??= keys.senateL;
    for (const b of keys.senateB) if (!merged.senateB.includes(b)) merged.senateB.push(b);
  }
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
export function mergeDossiers(group: PageGroup): MergedDossier {
  const cdep = group.pages.find((page) => page.source === "cdep");
  const senate = group.pages.find((page) => page.source === "senate");
  const pages = [cdep, senate].filter(Boolean) as ParsedDossier[];

  const registrations: DossierRegistration[] = [];
  for (const page of pages) {
    for (const registration of page.registrations) {
      const index = registrations.findIndex((item) => item.body === registration.body && item.number.toLowerCase() === registration.number.toLowerCase());
      if (index < 0) registrations.push(registration);
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
  const stage = stagePage?.stage ?? cdep?.stage ?? senate?.stage;

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
    character: cdep?.character ?? (senate?.character ? senate.character : undefined),
    urgent: senate?.urgent ?? cdep?.urgent,
    stage,
    summary: cdep?.summary ?? senate?.summary,
    tacitDeadline: senate?.tacitDeadline ?? cdep?.tacitDeadline,
    initiators,
    initiatorCountText: cdep?.initiatorCountText,
    consulted: cdep?.consulted ?? [],
    steps,
    fate: deriveFate({ steps, stage, decisionChamber }),
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
