import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { classifyDecree } from "./decree-types";
import { decreePageText, textKey } from "./decree-texts";
import { classifyAppointment } from "./appointments";
import { fold, namedPersons, parseDecreePage, signatureOf, type DecreeRecord } from "./decrees";
import { parseDecreeList } from "./portal-search";

export interface MonthCheck {
  month: string;
  portalCount: number;
  read: number;
}

export interface SavedDecrees {
  listPages: number;
  soapPages: number;
  textPages: number;
  decrees: Array<DecreeRecord & { signerInferred?: boolean }>;
  duplicates: number;
  months: MonthCheck[];
}

const dirOf = (repoRoot: string, kind: string) => path.join(repoRoot, "data/coverage/raw", kind);
async function names(dir: string, extension: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(extension)).sort();
  } catch {
    return [];
  }
}

const signerFold = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z]+/g, " ").trim();
const marks = (name: string) => (name.normalize("NFD").match(/\p{M}/gu) ?? []).length;

/**
 * The portal prints a signer's name in several spellings across the years (with and without diacritics, with the cedilla or the comma below): "TRAIAN BASESCU" and "TRAIAN BĂSESCU", "LAURENŢIU" and
 * "LAURENȚIU". They are one person, so every spelling becomes the best one: no cedilla (ş ţ are the old, wrong forms), then the most diacritics, then the most decrees.
 */
export function unifySignerSpellings(decrees: Array<{ signer?: string }>): void {
  const spellings = new Map<string, Map<string, number>>();
  for (const decree of decrees) {
    if (!decree.signer) continue;
    const key = signerFold(decree.signer);
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(decree.signer, (counts.get(decree.signer) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const best = new Map<string, string>();
  for (const [key, counts] of spellings) {
    const ranked = [...counts].sort((a, b) => Number(/[şţŞŢ]/.test(a[0])) - Number(/[şţŞŢ]/.test(b[0])) || marks(b[0]) - marks(a[0]) || b[1] - a[1]);
    best.set(key, ranked[0]![0]);
  }
  for (const decree of decrees) if (decree.signer) decree.signer = best.get(signerFold(decree.signer))!;
}

/**
 * Every decree the saved pages hold, one per (year, number): the portal's month lists are the catalog (and count their month, so a month can be checked), the web service's pages and the
 * saved decree pages add the text and the signature where we have them. A decree whose signature we did not read gets its signer from the decrees signed before and after it, when both
 * were signed by the same person in the same capacity; across a change of President it gets none.
 */
export async function readSavedDecrees(repoRoot: string): Promise<SavedDecrees> {
  const map = new Map<string, DecreeRecord & { signerInferred?: boolean }>();
  let duplicates = 0;
  const monthTotals = new Map<string, number>();
  const listNames = await names(dirOf(repoRoot, "legislatie-decree-list"), ".html");
  for (const name of listNames) {
    const parsed = parseDecreeList(await readFile(path.join(dirOf(repoRoot, "legislatie-decree-list"), name), "utf8"));
    const month = /^m(\d{4}-\d{2})-/.exec(name)?.[1];
    if (month) monthTotals.set(month, Math.max(monthTotals.get(month) ?? 0, parsed.total));
    for (const decree of parsed.decrees) {
      const key = `${decree.year}-${decree.number}`;
      if (map.has(key)) duplicates += 1;
      else map.set(key, decree);
    }
  }
  const soapNames = await names(dirOf(repoRoot, "legislatie-decrees"), ".xml");
  for (const name of soapNames) {
    for (const decree of parseDecreePage(await readFile(path.join(dirOf(repoRoot, "legislatie-decrees"), name), "utf8"))) {
      const key = `${decree.year}-${decree.number}`;
      const known = map.get(key);
      if (!known) map.set(key, decree);
      else {
        known.text ||= decree.text;
        known.signer ??= decree.signer;
        known.signedAsInterim ??= decree.signedAsInterim;
        known.gazetteNumber ??= decree.gazetteNumber;
        known.gazetteOn ??= decree.gazetteOn;
      }
    }
  }
  const byPortalId = new Map([...map.values()].filter((decree) => decree.portalId).map((decree) => [decree.portalId!, decree]));
  const textNames = await names(dirOf(repoRoot, "legislatie-decree-text"), ".html");
  let textPages = 0;
  for (const [portalId, decree] of byPortalId) {
    if (!textNames.includes(`${textKey(portalId)}.html`)) continue;
    textPages += 1;
    const text = decreePageText(await readFile(path.join(dirOf(repoRoot, "legislatie-decree-text"), `${textKey(portalId)}.html`), "utf8"));
    decree.text = text;
    const signature = signatureOf(text);
    if (signature) { decree.signer = signature.name; decree.signedAsInterim = signature.interim; }
  }
  unifySignerSpellings([...map.values()]);
  // Signer by the neighbours.
  const ordered = [...map.values()].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.number - b.number);
  const signedIndexes = ordered.flatMap((decree, index) => (decree.signer ? [index] : []));
  let cursor = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const decree = ordered[index]!;
    if (decree.signer) continue;
    while (cursor < signedIndexes.length && signedIndexes[cursor]! < index) cursor += 1;
    const before = ordered[signedIndexes[cursor - 1] ?? -1];
    const after = ordered[signedIndexes[cursor] ?? -1];
    if (before && after && before.signer === after.signer && Boolean(before.signedAsInterim) === Boolean(after.signedAsInterim)) {
      decree.signer = before.signer;
      decree.signedAsInterim = Boolean(before.signedAsInterim);
      decree.signerInferred = true;
    }
  }
  const readByMonth = new Map<string, number>();
  for (const decree of ordered) readByMonth.set(decree.issuedOn.slice(0, 7), (readByMonth.get(decree.issuedOn.slice(0, 7)) ?? 0) + 1);
  const months = [...monthTotals].sort((a, b) => a[0].localeCompare(b[0])).map(([month, portalCount]) => ({ month, portalCount, read: readByMonth.get(month) ?? 0 }));
  return { listPages: listNames.length, soapPages: soapNames.length, textPages, decrees: ordered, duplicates, months };
}

export interface ImportDecreesResult {
  persisted: boolean;
  listPages: number;
  soapPages: number;
  textPages: number;
  decrees: number;
  duplicates: number;
  from?: string;
  to?: string;
  portalCount: number;
  monthsChecked: number;
  monthsShort: MonthCheck[];
  byYear: Array<{ year: number; decrees: number; highestNumber: number; missingNumbers: number }>;
  byKind: Array<{ kind: string; decrees: number }>;
  unclassified: { decrees: number; share: number; topSubjects: Array<{ subject: string; count: number }> };
  signers: Array<{ signer: string; interim: boolean; decrees: number; inferred: number; first: string; last: string }>;
  withoutSigner: number;
  withoutGazette: number;
  peopleNamed: number;
  peopleMatchedToPeople: number;
  written: number;
}

/**
 * Writes `presidential_decrees` and the people named by the office-holding ones, from the saved pages (offline). Decrees before `since` are not kept.
 * The report says how many decrees each month and year has against the portal's own count and which numbers are missing from 1 to the highest, how many titles no rule typed, and who signed from when to when.
 */
export async function importDecrees(db: DbClient, options: { repoRoot: string; persist: boolean; since: string }): Promise<ImportDecreesResult> {
  const saved = await readSavedDecrees(options.repoRoot);
  const decrees = saved.decrees.filter((decree) => decree.issuedOn >= options.since);
  const years = new Map<number, number[]>();
  for (const decree of decrees) years.set(decree.year, [...(years.get(decree.year) ?? []), decree.number]);
  const byYear = [...years].sort((a, b) => a[0] - b[0]).map(([year, numbers]) => {
    const present = new Set(numbers);
    const highest = Math.max(...numbers);
    return { year, decrees: present.size, highestNumber: highest, missingNumbers: highest - present.size };
  });
  const readAt = new Date();
  const rows = decrees.map((decree) => {
    const type = classifyDecree(decree.subject);
    return { decree, type, row: { id: `decree-${decree.year}-${decree.number}`, number: decree.number, year: decree.year, issuedOn: decree.issuedOn, subject: decree.subject, kind: type.kind, action: type.action ?? null, gazetteNumber: decree.gazetteNumber ?? null, gazetteOn: decree.gazetteOn ?? null, signer: decree.signer ?? null, signedAsInterim: decree.signedAsInterim ?? false, signerInferred: decree.signerInferred ?? false, portalUrl: decree.portalUrl, portalId: decree.portalId ?? null, readAt } satisfies typeof schema.presidentialDecrees.$inferInsert };
  });
  // The people named by the office-holding kinds; linked to our `people` when the name, written as a slug, is exactly one's id.
  const knownPeople = new Set([...(await db.execute<{ id: string }>(sql`select id from people`))].map((row) => row.id));
  const slugOf = (name: string) => fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const personRows: Array<typeof schema.presidentialDecreePersons.$inferInsert> = [];
  for (const { decree, type, row } of rows) {
    namedPersons(type.kind, decree.text).forEach((person, position) => {
      const personId = `person-${slugOf(person.name)}`;
      const facts = classifyAppointment(type.kind, person.sentence);
      personRows.push({ decreeId: row.id, position, name: person.name, role: person.role, personId: knownPeople.has(personId) ? personId : null, action: facts.action, office: facts.office, title: facts.title ?? null });
    });
  }
  const kinds = new Map<string, number>();
  const others = new Map<string, number>();
  for (const { decree, type } of rows) {
    kinds.set(type.kind, (kinds.get(type.kind) ?? 0) + 1);
    if (type.kind === "other") {
      const shape = fold(decree.subject).replace(/\d+/g, "N").slice(0, 120);
      others.set(shape, (others.get(shape) ?? 0) + 1);
    }
  }
  const signers = new Map<string, { signer: string; interim: boolean; decrees: number; inferred: number; first: string; last: string }>();
  for (const { decree } of rows) {
    if (!decree.signer) continue;
    const key = `${decree.signer}|${decree.signedAsInterim ? "interim" : ""}`;
    const current = signers.get(key);
    signers.set(key, { signer: decree.signer, interim: Boolean(decree.signedAsInterim), decrees: (current?.decrees ?? 0) + 1, inferred: (current?.inferred ?? 0) + (decree.signerInferred ? 1 : 0), first: current && current.first < decree.issuedOn ? current.first : decree.issuedOn, last: current && current.last > decree.issuedOn ? current.last : decree.issuedOn });
  }
  const unclassified = kinds.get("other") ?? 0;
  const monthsInScope = saved.months.filter((month) => `${month.month}-01` >= options.since.slice(0, 7) + "-01");
  const result: ImportDecreesResult = {
    persisted: options.persist,
    listPages: saved.listPages,
    soapPages: saved.soapPages,
    textPages: saved.textPages,
    decrees: rows.length,
    duplicates: saved.duplicates,
    ...(rows.length ? { from: decrees[0]!.issuedOn, to: decrees.at(-1)!.issuedOn } : {}),
    portalCount: monthsInScope.reduce((sum, month) => sum + month.portalCount, 0),
    monthsChecked: monthsInScope.length,
    monthsShort: monthsInScope.filter((month) => month.read < month.portalCount),
    byYear,
    byKind: [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, decrees: count })),
    unclassified: { decrees: unclassified, share: rows.length ? Math.round((unclassified / rows.length) * 1000) / 10 : 0, topSubjects: [...others].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([subject, count]) => ({ subject, count })) },
    signers: [...signers.values()].sort((a, b) => a.first.localeCompare(b.first)),
    withoutSigner: rows.filter(({ decree }) => !decree.signer).length,
    withoutGazette: rows.filter(({ decree }) => !decree.gazetteNumber).length,
    peopleNamed: personRows.length,
    peopleMatchedToPeople: personRows.filter((row) => row.personId).length,
    written: 0
  };
  if (!options.persist || rows.length === 0) return result;
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 400) {
      await tx.insert(schema.presidentialDecrees).values(rows.slice(i, i + 400).map((item) => item.row)).onConflictDoUpdate({
        target: [schema.presidentialDecrees.year, schema.presidentialDecrees.number],
        set: { issuedOn: sql`excluded.issued_on`, subject: sql`excluded.subject`, kind: sql`excluded.kind`, action: sql`excluded.action`, gazetteNumber: sql`excluded.gazette_number`, gazetteOn: sql`excluded.gazette_on`, signer: sql`excluded.signer`, signedAsInterim: sql`excluded.signed_as_interim`, signerInferred: sql`excluded.signer_inferred`, portalUrl: sql`excluded.portal_url`, portalId: sql`excluded.portal_id`, readAt: sql`excluded.read_at` }
      });
    }
    const ids = rows.map((item) => item.row.id);
    for (let i = 0; i < ids.length; i += 500) await tx.execute(sql`delete from presidential_decree_persons where decree_id in (${sql.join(ids.slice(i, i + 500).map((id) => sql`${id}`), sql`, `)})`);
    for (let i = 0; i < personRows.length; i += 500) await tx.insert(schema.presidentialDecreePersons).values(personRows.slice(i, i + 500));
  });
  result.written = rows.length;
  return result;
}
