import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { parseLegislatieSearch } from "../dossiers/gazette-lookup";
import { classifyDecree } from "./decree-types";

/**
 * Sprint 14 (D-037): one presidential decree from the legislative portal's record, and the type its title gives it. The portal's record holds the title ("DECRET nr. 794 din 6 octombrie 2026
 * privind desemnarea candidatului ... EMITENT Președintele României PUBLICAT ÎN Monitorul Oficial nr. 842 din 06 octombrie 2026"), the text of the decree (which names the people it concerns,
 * decorated private persons among them, so the text is never stored in the database) and the signature at its end.
 */
const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };

export const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

export interface DecreeRecord {
  number: number;
  year: number;
  issuedOn: string;
  /** What follows the date: "privind desemnarea candidatului la funcția de prim-ministru". */
  subject: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  portalUrl: string;
  portalId?: string;
  /** Who signed it, from the signature at the end: "KLAUS-WERNER IOHANNIS", "ILIE-GAVRIL BOLOJAN" (interim), "NICUȘOR-DANIEL DAN". */
  signer?: string;
  signedAsInterim?: boolean;
  /** The decree's own text, used by the readers of named offices; not stored. */
  text: string;
}

const isoOf = (day: string, month: string, year: string) => {
  const mm = MONTHS[fold(month)];
  return mm ? `${year}-${mm}-${day.padStart(2, "0")}` : undefined;
};

/** The signature that closes the text: "PREȘEDINTELE ROMÂNIEI KLAUS-WERNER IOHANNIS București, 22 noiembrie 2021. Nr. 1.123." */
export function signatureOf(text: string): { name: string; interim: boolean } | undefined {
  // Closed by the place and date, or, on a decree the Prime Minister countersigns, by "În temeiul art. 100 alin. (2) ... contrasemnăm acest decret".
  const match = /PRE[SȘŞ]EDINTELE ROM[AÂ]NIEI\s*(-\s*interimar\s*-)?\s*([A-ZĂÂÎȘŞȚŢ][A-ZĂÂÎȘŞȚŢ.\- ]{3,50}?)\s+(?:Bucure[sșş]ti,|[ÎI]n temeiul art\. 100)/.exec(text);
  return match ? { name: match[2]!.replace(/\s+/g, " ").trim(), interim: Boolean(match[1]) } : undefined;
}

/** The decrees of the President in a page of the portal's answer; any other act (a decree of another body, a law that mentions a decree) is left out. */
export function parseDecreePage(xml: string): DecreeRecord[] {
  const records: DecreeRecord[] = [];
  for (const act of parseLegislatieSearch(xml)) {
    // The portal writes the issuer with a question mark where the letter ș should be ("Pre?edintele României").
    if (fold(act.type) !== "decret" || !/pre.?edintele rom.?niei/.test(fold(act.issuer))) continue;
    const head = /DECRET\s+nr\.\s*([\d.]+)\s*\*{0,2}\)?\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţĂÂÎȘŞȚŢ]+)\s+(\d{4})\s*(.*?)\s*EMITENT/s.exec(act.title);
    if (!head) continue;
    const issuedOn = isoOf(head[2]!, head[3]!, head[4]!);
    const number = Number(head[1]!.replace(/\./g, ""));
    if (!issuedOn || !Number.isFinite(number)) continue;
    const published = /PUBLICAT\s+[ÎI]N\s+Monitorul\s+Oficial\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(act.title);
    const signature = signatureOf(act.text);
    const portalId = /DetaliiDocument\/(\d+)/.exec(act.link)?.[1];
    records.push({
      number,
      year: Number(head[4]),
      issuedOn,
      subject: head[5]!.replace(/\s+/g, " ").trim(),
      ...(published ? { gazetteNumber: published[1]!, gazetteOn: isoOf(published[2]!, published[3]!, published[4]!) ?? undefined } : {}),
      portalUrl: act.link,
      ...(portalId ? { portalId } : {}),
      ...(signature ? { signer: signature.name, signedAsInterim: signature.interim } : {}),
      text: act.text
    });
  }
  return records;
}

export interface ImportDecreesResult {
  persisted: boolean;
  pagesRead: number;
  decrees: number;
  duplicates: number;
  from?: string;
  to?: string;
  byYear: Array<{ year: number; decrees: number; highestNumber: number; missingNumbers: number }>;
  byKind: Array<{ kind: string; decrees: number }>;
  unclassified: { decrees: number; share: number; topSubjects: Array<{ subject: string; count: number }> };
  signers: Array<{ signer: string; interim: boolean; decrees: number; first: string; last: string }>;
  withoutGazette: number;
  written: number;
}

/** Every decree of the saved pages, one per (year, number); a decree that appears on two pages is counted once. */
export async function readSavedDecrees(repoRoot: string): Promise<{ pages: number; decrees: DecreeRecord[]; duplicates: number }> {
  const dir = path.join(repoRoot, "data/coverage/raw/legislatie-decrees");
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".xml")).sort();
  } catch {
    names = [];
  }
  const byRef = new Map<string, DecreeRecord>();
  let duplicates = 0;
  for (const name of names) {
    for (const record of parseDecreePage(await readFile(path.join(dir, name), "utf8"))) {
      const key = `${record.year}-${record.number}`;
      if (byRef.has(key)) duplicates += 1;
      else byRef.set(key, record);
    }
  }
  return { pages: names.length, decrees: [...byRef.values()], duplicates };
}

/**
 * Writes `presidential_decrees` from the saved catalog pages (offline). Decrees before `since` are not kept (the pages below the run's end hold older decrees in no order).
 * The report says how many decrees each year has and which numbers are missing from 1 to the highest, how many titles no rule typed, and who signed from when to when.
 */
export async function importDecrees(db: DbClient, options: { repoRoot: string; persist: boolean; since: string }): Promise<ImportDecreesResult> {
  const { pages, decrees: all, duplicates } = await readSavedDecrees(options.repoRoot);
  const decrees = all.filter((decree) => decree.issuedOn >= options.since).sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.number - b.number);
  const years = new Map<number, number[]>();
  for (const decree of decrees) years.set(decree.year, [...(years.get(decree.year) ?? []), decree.number]);
  const byYear = [...years].sort((a, b) => a[0] - b[0]).map(([year, numbers]) => {
    const present = new Set(numbers);
    const highest = Math.max(...numbers);
    return { year, decrees: present.size, highestNumber: highest, missingNumbers: highest - present.size };
  });
  const rows = decrees.map((decree) => {
    const type = classifyDecree(decree.subject);
    return { decree, type, row: { id: `decree-${decree.year}-${decree.number}`, number: decree.number, year: decree.year, issuedOn: decree.issuedOn, subject: decree.subject, kind: type.kind, action: type.action ?? null, gazetteNumber: decree.gazetteNumber ?? null, gazetteOn: decree.gazetteOn ?? null, signer: decree.signer ?? null, signedAsInterim: decree.signedAsInterim ?? false, portalUrl: decree.portalUrl, portalId: decree.portalId ?? null, readAt: new Date() } satisfies typeof schema.presidentialDecrees.$inferInsert };
  });
  const kinds = new Map<string, number>();
  const others = new Map<string, number>();
  for (const { decree, type } of rows) {
    kinds.set(type.kind, (kinds.get(type.kind) ?? 0) + 1);
    if (type.kind === "other") {
      const shape = fold(decree.subject).replace(/\d+/g, "N").slice(0, 120);
      others.set(shape, (others.get(shape) ?? 0) + 1);
    }
  }
  const signers = new Map<string, { signer: string; interim: boolean; decrees: number; first: string; last: string }>();
  for (const { decree } of rows) {
    if (!decree.signer) continue;
    const key = `${decree.signer}|${decree.signedAsInterim ? "interim" : ""}`;
    const current = signers.get(key);
    signers.set(key, { signer: decree.signer, interim: Boolean(decree.signedAsInterim), decrees: (current?.decrees ?? 0) + 1, first: current && current.first < decree.issuedOn ? current.first : decree.issuedOn, last: current && current.last > decree.issuedOn ? current.last : decree.issuedOn });
  }
  const unclassified = kinds.get("other") ?? 0;
  const result: ImportDecreesResult = {
    persisted: options.persist,
    pagesRead: pages,
    decrees: rows.length,
    duplicates,
    ...(rows.length ? { from: decrees[0]!.issuedOn, to: decrees.at(-1)!.issuedOn } : {}),
    byYear,
    byKind: [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, decrees: count })),
    unclassified: { decrees: unclassified, share: rows.length ? Math.round((unclassified / rows.length) * 1000) / 10 : 0, topSubjects: [...others].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([subject, count]) => ({ subject, count })) },
    signers: [...signers.values()].sort((a, b) => a.first.localeCompare(b.first)),
    withoutGazette: rows.filter(({ decree }) => !decree.gazetteNumber).length,
    written: 0
  };
  if (!options.persist || rows.length === 0) return result;
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 400) {
      await tx.insert(schema.presidentialDecrees).values(rows.slice(i, i + 400).map((item) => item.row)).onConflictDoUpdate({
        target: [schema.presidentialDecrees.year, schema.presidentialDecrees.number],
        set: { issuedOn: sql`excluded.issued_on`, subject: sql`excluded.subject`, kind: sql`excluded.kind`, action: sql`excluded.action`, gazetteNumber: sql`excluded.gazette_number`, gazetteOn: sql`excluded.gazette_on`, signer: sql`excluded.signer`, signedAsInterim: sql`excluded.signed_as_interim`, portalUrl: sql`excluded.portal_url`, portalId: sql`excluded.portal_id`, readAt: sql`excluded.read_at` }
      });
    }
  });
  result.written = rows.length;
  return result;
}
