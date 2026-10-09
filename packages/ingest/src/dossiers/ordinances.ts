import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { RawCache } from "../coverage/raw-cache";
import { legislatieToken, parseLegislatieSearch, searchLegislatieRaw, type LegislatieAct } from "./gazette-lookup";

/**
 * Sprint 12b (D-033): the Government ordinance (an urgency ordinance, OUG, or an ordinary one, OG) that an approval bill approves. The bill's title names it
 * ("aprobarea Ordonanţei de urgenţă a Guvernului nr.144/2024 ..."); the ordinance itself (its date, title, Official Gazette number and date, the text) comes from
 * the legislative portal, legislatie.just.ro.
 */
export type OrdinanceKind = "urgency" | "ordinary";

export interface OrdinanceRef {
  kind: OrdinanceKind;
  number: string;
  year: number;
  /** The words of the bill's title that follow the ordinance's number: the ordinance's own title, used to find it when the number alone does not. */
  hint?: string;
}

export interface FoundOrdinance extends OrdinanceRef {
  issuedOn: string;
  title: string;
  issuer: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  /** The portal's page of the act (its text). */
  link: string;
  portalId?: string;
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };
const isoOf = (day: string, month: string, year: string) => (MONTHS[fold(month)] ? `${year}-${MONTHS[fold(month)]}-${day.padStart(2, "0")}` : undefined);

export const refKey = (ref: OrdinanceRef) => `${ref.kind === "urgency" ? "oug" : "og"}-${ref.number}-${ref.year}`;
export const refLabel = (ref: OrdinanceRef) => `${ref.kind === "urgency" ? "OUG" : "OG"} ${ref.number}/${ref.year}`;

/**
 * The ordinance a bill approves, read from its title. Only a title that says "aprobarea" counts, and only the ordinance named right after it: the title goes on to
 * name what that ordinance amends ("... nr. 5/2026 pentru modificarea Ordonanţei Guvernului nr. 27/2011 ..."), and those are not approved here. The Chamber's
 * titles misspell "urgenţă" as "urgenţã"; the diacritics are folded away so both read the same.
 */
export function approvedOrdinanceOf(title: string): OrdinanceRef | undefined {
  const text = fold(title);
  const match = /aprobarea\s+ordonant(?:a|ei|ele)\s+(de\s+urgent[a-z]*\s+)?(?:a\s+)?guvernului\s*(?:romaniei\s*)?(?:nr\.?\s*)?(\d+)\s*\/\s*(\d{4})/.exec(text);
  if (!match) return undefined;
  const after = text.slice(match.index + match[0].length).replace(/^[^a-z0-9]+/, "");
  return { kind: match[1] ? "urgency" : "ordinary", number: String(Number(match[2])), year: Number(match[3]), ...(after ? { hint: after.slice(0, 220) } : {}) };
}

const STOP_WORDS = new Set(["privind", "pentru", "precum", "modificarea", "completarea", "modificarii", "completarii", "unele", "unor", "masuri", "norme", "normative", "prevederi", "romaniei", "guvernului", "legii", "ordonantei", "urgenta", "domeniul", "domeniului", "activitatea", "activitatii", "aprobarea", "instituirea", "stabilirea"]);

/** The most distinctive words of an ordinance's title (long, not boilerplate), in the order the title has them. */
export function titleWordsOf(hint: string | undefined, max = 6): string[] {
  const words = (hint ?? "").split(/[^a-z0-9]+/).filter((word) => word.length >= 7 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set(words)].slice(0, max);
}

/** The act of the portal's answer that is this ordinance: the type, the number and the year of its own date must all agree (the portal returns every act with that number, of any year). */
export function ordinanceFromActs(acts: LegislatieAct[], ref: OrdinanceRef): FoundOrdinance | undefined {
  for (const act of acts) {
    if (!fold(act.issuer).startsWith("guvern")) continue;
    const type = fold(act.type);
    if (type !== (ref.kind === "urgency" ? "ordonanta de urgenta" : "ordonanta")) continue;
    const head = /^\s*ORDONAN[ȚŢT]Ă(?:\s+DE\s+URGEN[ȚŢT]Ă)?\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+(\S+)\s+(\d{4})\s+(.*?)\s+EMITENT\b/i.exec(act.text);
    if (!head || Number(head[1]) !== Number(ref.number) || Number(head[4]) !== ref.year) continue;
    const issuedOn = isoOf(head[2]!, head[3]!, head[4]!);
    if (!issuedOn) continue;
    const published = /Publicat\s+în\s+MONITORUL\s+OFICIAL\s+nr\.\s*([0-9A-Za-z.]+)\s+din\s+(\d{1,2})\s+(\S+)\s+(\d{4})/i.exec(act.text);
    const gazetteOn = published ? isoOf(published[2]!, published[3]!, published[4]!) : undefined;
    return {
      ...ref,
      issuedOn,
      title: head[5]!.replace(/\s+/g, " ").trim(),
      issuer: "Guvernul României",
      ...(published && gazetteOn ? { gazetteNumber: published[1]!.replace(/\.$/, ""), gazetteOn } : {}),
      link: act.link,
      ...(act.link.match(/DetaliiDocument\/(\d+)/)?.[1] ? { portalId: act.link.match(/DetaliiDocument\/(\d+)/)![1]! } : {})
    };
  }
  return undefined;
}

/** The raw `<a:Legi>` blocks of an answer, in order (the same order `parseLegislatieSearch` returns the acts). */
function rawBlocks(xml: string): string[] {
  return [...xml.matchAll(/<a:Legi>[\s\S]*?<\/a:Legi>/g)].map((match) => match[0]);
}

export interface FetchOrdinancesResult {
  refs: number;
  cached: number;
  found: number;
  notFound: Array<{ ref: string; reason: string }>;
  fetchedNow: number;
  skippedNoNetwork: number;
  /** Set when the portal kept answering with an error: the run stopped there, and running it again continues from what is saved. */
  stoppedBy?: string;
}

/** v2: the number and type search, then up to six distinctive words of the title. A note without the version came from the plain number search and is tried again. */
/** One search, asked again (after 5, 20 and 60 seconds) when the portal answers with a server error or the connection fails. */
async function searchWithRetry(token: string, query: Parameters<typeof searchLegislatieRaw>[1]): Promise<string> {
  const pauses = [5_000, 20_000, 60_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await searchLegislatieRaw(token, query);
    } catch (error) {
      if (attempt >= pauses.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, pauses[attempt]));
    }
  }
}

const NOT_FOUND = '<notfound strategy="2"/>';

/**
 * Looks each ordinance up on the portal and saves what it answered under `data/coverage/raw/legislatie-ordinance`: the act's own record, byte for byte, or a
 * "not found" note. One search per page of ten acts (at most three pages), `delayMs` apart; what is saved is never fetched again. Without `live` nothing is fetched.
 */
export async function fetchOrdinances(options: { repoRoot: string; refs: OrdinanceRef[]; live: boolean; limit?: number; delayMs: number; log?: (line: string) => void }): Promise<FetchOrdinancesResult> {
  const cache = new RawCache(`${options.repoRoot}/data/coverage/raw`);
  const log = options.log ?? (() => {});
  const result: FetchOrdinancesResult = { refs: options.refs.length, cached: 0, found: 0, notFound: [], fetchedNow: 0, skippedNoNetwork: 0 };
  let token = "";
  let requests = 0;
  const wait = () => new Promise((resolve) => setTimeout(resolve, options.delayMs));
  for (const ref of options.refs) {
    const key = refKey(ref);
    const savedBody = await cache.read("legislatie-ordinance", key);
    if (savedBody && savedBody.toString("utf8") !== "<notfound/>") { result.cached += 1; continue; }
    if (!options.live || (options.limit !== undefined && result.fetchedNow >= options.limit)) { result.skippedNoNetwork += 1; continue; }
    token ||= await legislatieToken();
    let saved = false;
    const tries: Array<{ title: string }> = [{ title: ref.kind === "urgency" ? "ordonanta de urgenta" : "ordonanta" }, ...titleWordsOf(ref.hint).map((word) => ({ title: word }))];
    for (const [index, attempt] of tries.entries()) {
      if (saved) break;
      if (requests > 0) await wait();
      requests += 1;
      let xml: string;
      try {
        xml = await searchWithRetry(token, { year: ref.year, number: ref.number, title: attempt.title });
      } catch (error) {
        result.stoppedBy = `${refLabel(ref)}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
      const acts = parseLegislatieSearch(xml);
      const found = ordinanceFromActs(acts, ref);
      if (found) {
        const block = rawBlocks(xml)[acts.findIndex((act) => act.link === found.link)] ?? "";
        await cache.write("legislatie-ordinance", key, Buffer.from(block, "utf8"), { url: `${found.link}`, status: 200 });
        saved = true;
        result.fetchedNow += 1;
        log(`${refLabel(ref)} ← ${found.link}${index > 0 ? ` (by the word "${attempt.title}")` : ""}`);
      }
    }
    if (result.stoppedBy) break;
    if (!saved) {
      await cache.write("legislatie-ordinance", key, Buffer.from(NOT_FOUND, "utf8"), { url: "http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP", status: 404 });
      result.fetchedNow += 1;
      log(`${refLabel(ref)}: not found on the portal`);
    }
  }
  for (const ref of options.refs) {
    const body = await cache.read("legislatie-ordinance", refKey(ref));
    if (!body) continue;
    if (body.toString("utf8").startsWith("<notfound")) result.notFound.push({ ref: refLabel(ref), reason: "the portal answered with no such ordinance (by number and type, then by words of its title)" });
    else result.found += 1;
  }
  return result;
}

/** What the saved answer for one ordinance says, or undefined when it was not found or nothing is saved. */
export async function readSavedOrdinance(repoRoot: string, ref: OrdinanceRef): Promise<FoundOrdinance | undefined | "not_found"> {
  const body = await new RawCache(`${repoRoot}/data/coverage/raw`).read("legislatie-ordinance", refKey(ref));
  if (!body) return undefined;
  const text = body.toString("utf8");
  if (text.startsWith("<notfound")) return "not_found";
  return ordinanceFromActs(parseLegislatieSearch(`<r>${text}</r>`), ref);
}

export interface ApprovalBill {
  billId: string;
  slug: string;
  title: string;
  ref: OrdinanceRef;
}

/** Every bill whose title says it approves a Government ordinance. */
export async function loadApprovalBills(db: DbClient): Promise<ApprovalBill[]> {
  const rows = await db.execute<{ id: string; slug: string; title: string }>(sql`select id, slug, title from bills where title ~* 'aprobarea\\s+ordonan' order by id`);
  return [...rows].flatMap((row) => {
    const ref = approvedOrdinanceOf(row.title);
    return ref ? [{ billId: row.id, slug: row.slug, title: row.title, ref }] : [];
  });
}

export function uniqueRefs(bills: ApprovalBill[]): OrdinanceRef[] {
  const seen = new Map<string, OrdinanceRef>();
  for (const bill of bills) seen.set(refKey(bill.ref), bill.ref);
  return [...seen.values()].sort((a, b) => b.year - a.year || Number(b.number) - Number(a.number));
}

export interface ImportOrdinancesResult {
  persisted: boolean;
  approvalBills: number;
  ordinances: number;
  linked: number;
  notFoundOnPortal: number;
  notFetchedYet: number;
  written: { ordinances: number; links: number };
}

/**
 * Writes `government_ordinances` and `bill_ordinances` from the saved answers and the bills' titles; offline apart from the database. A bill whose ordinance
 * the portal does not have keeps its row with the reference from the title and no link; one not fetched yet is left out until it is.
 */
export async function importOrdinances(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportOrdinancesResult> {
  const bills = await loadApprovalBills(db);
  const found = new Map<string, FoundOrdinance>();
  const status = new Map<string, "found" | "not_found">();
  let notFetchedYet = 0;
  for (const ref of uniqueRefs(bills)) {
    const saved = await readSavedOrdinance(options.repoRoot, ref);
    if (saved === undefined) { notFetchedYet += 1; continue; }
    if (saved === "not_found") { status.set(refKey(ref), "not_found"); continue; }
    found.set(refKey(ref), saved);
    status.set(refKey(ref), "found");
  }
  const links = bills.flatMap((bill) => (status.has(refKey(bill.ref)) ? [{ bill, state: status.get(refKey(bill.ref))! }] : []));
  const result: ImportOrdinancesResult = { persisted: options.persist, approvalBills: bills.length, ordinances: found.size, linked: links.length, notFoundOnPortal: links.filter((link) => link.state === "not_found").length, notFetchedYet, written: { ordinances: 0, links: 0 } };
  if (!options.persist) return result;
  await db.transaction(async (tx) => {
    const ordinanceRows = [...found.values()].map((item) => ({
      id: `ordinance-${refKey(item)}`,
      kind: item.kind,
      number: item.number,
      year: item.year,
      issuedOn: item.issuedOn,
      title: item.title.slice(0, 1500),
      issuer: item.issuer,
      gazetteNumber: item.gazetteNumber ?? null,
      gazetteOn: item.gazetteOn ?? null,
      portalUrl: item.link,
      portalId: item.portalId ?? null,
      readAt: new Date()
    }));
    for (let i = 0; i < ordinanceRows.length; i += 200) {
      await tx.insert(schema.governmentOrdinances).values(ordinanceRows.slice(i, i + 200)).onConflictDoUpdate({
        target: schema.governmentOrdinances.id,
        set: { title: sql`excluded.title`, issuedOn: sql`excluded.issued_on`, gazetteNumber: sql`excluded.gazette_number`, gazetteOn: sql`excluded.gazette_on`, portalUrl: sql`excluded.portal_url`, portalId: sql`excluded.portal_id`, readAt: sql`excluded.read_at` }
      });
    }
    result.written.ordinances = ordinanceRows.length;
    const linkRows = links.map(({ bill, state }) => ({ billId: bill.billId, kind: bill.ref.kind, number: bill.ref.number, year: bill.ref.year, ordinanceId: state === "found" ? `ordinance-${refKey(bill.ref)}` : null }));
    for (let i = 0; i < linkRows.length; i += 300) {
      await tx.insert(schema.billOrdinances).values(linkRows.slice(i, i + 300)).onConflictDoUpdate({
        target: [schema.billOrdinances.billId, schema.billOrdinances.kind, schema.billOrdinances.number, schema.billOrdinances.year],
        set: { ordinanceId: sql`excluded.ordinance_id` }
      });
    }
    result.written.links = linkRows.length;
  });
  return result;
}
