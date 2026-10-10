import path from "node:path";
import * as cheerio from "cheerio";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { decreePageText } from "./decree-texts";
import { fold } from "./text";

/**
 * Sprint 18 (D-042): the decisions of Parliament that appoint what the President only proposes or has a share in: the directors of the intelligence services (the Chamber and the Senate in joint
 * sitting, on the President's proposal: Constitution art. 65(2)(h)) and the judges of the Constitutional Court named by the two chambers. They are found on the legislative portal by the words of their
 * titles ("pentru numirea directorului Serviciului Român de Informații"), each page is saved byte for byte, and the person is read from the sentence of the decision ("Domnul X se numește în funcția de
 * director al ..."). The names are printed as the decision prints them, often the surname first.
 */
export type DecisionBody = "parliament" | "chamber" | "senate";
export type DecisionOffice = "sri-director" | "sie-director" | "ccr-judge";

export interface DecisionQuery {
  office: DecisionOffice;
  body: DecisionBody;
  /** The portal's id of the issuer: 2 Parliament, 36 the Chamber of Deputies, 40 the Senate. */
  emitent: 2 | 36 | 40;
  title: string;
}

export const DECISION_QUERIES: DecisionQuery[] = [
  { office: "sri-director", body: "parliament", emitent: 2, title: "directorului Serviciului Român de Informații" },
  { office: "sri-director", body: "parliament", emitent: 2, title: "director al Serviciului Român de Informații" },
  { office: "sie-director", body: "parliament", emitent: 2, title: "directorului Serviciului de Informații Externe" },
  { office: "sie-director", body: "parliament", emitent: 2, title: "director al Serviciului de Informații Externe" },
  { office: "ccr-judge", body: "chamber", emitent: 36, title: "judecător la Curtea Constituțională" },
  { office: "ccr-judge", body: "senate", emitent: 40, title: "judecător la Curtea Constituțională" },
  { office: "ccr-judge", body: "parliament", emitent: 2, title: "judecător la Curtea Constituțională" }
];

const BASE = "https://legislatie.just.ro/Public/RezultateCautare";
export const decisionListUrl = (query: DecisionQuery, page: number) => `${BASE}?rezultatePerPagina=5&page=${page}&tipdoc=2&sectiuneact=${query.emitent}&titlu=${encodeURIComponent(query.title)}`;
export const decisionListKey = (query: DecisionQuery, page: number) => `${query.body}-${query.office}-${fold(query.title).replace(/[^a-z0-9]+/g, "-")}-p${page}`;
export const decisionTextKey = (portalId: string) => `h${portalId}`;
export const decisionPageUrl = (portalId: string) => `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };
const isoOf = (day: string, month: string, year: string) => (MONTHS[fold(month)] ? `${year}-${MONTHS[fold(month)]}-${day.padStart(2, "0")}` : undefined);

export interface DecisionListItem {
  portalId: string;
  number: number;
  year: number;
  adoptedOn: string;
  /** What follows the date: "pentru numirea directorului Serviciului Român de Informații". */
  title: string;
  gazetteNumber?: string;
  gazetteOn?: string;
}

/** One page of the portal's result list: the decisions in it ("HOTĂRÂRE nr. 15 din 2 martie 2015pentru numirea ... EMITENT: PARLAMENTUL PUBLICAT ÎN: MONITORUL OFICIAL nr. 151 din 2 martie 2015"). */
export function parseDecisionList(html: string): { total: number; items: DecisionListItem[] } {
  const $ = cheerio.load(html);
  const total = Number(/(\d+)\s*document\(e\)\s*g[aă]sit/i.exec($("body").text().replace(/\s+/g, " "))?.[1] ?? 0);
  const items: DecisionListItem[] = [];
  $(".search_result_item").each((_, element) => {
    const portalId = /DetaliiDocument\/(\d+)/.exec($(element).find("a[href^='/Public/DetaliiDocument/']").first().attr("href") ?? "")?.[1];
    const block = $(element).find("p").eq(1).clone();
    block.find("br").replaceWith(" ");
    const text = block.text().replace(/[ ﻿]/g, " ").replace(/\s+/g, " ").trim();
    const head = /HOT[ĂA]R[ÂÎA]RE\s+nr\.\s*([\d.]+)\s*\*{0,2}\)?\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţĂÂÎȘŞȚŢ]+)\s+(\d{4})\s*(.*?)\s*(?:EMITENT|$)/s.exec(text);
    if (!head || !portalId) return;
    const adoptedOn = isoOf(head[2]!, head[3]!, head[4]!);
    const published = /PUBLICAT\s+[ÎI]N:?\s*MONITORUL\s+OFICIAL\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(text);
    if (!adoptedOn) return;
    items.push({
      portalId,
      number: Number(head[1]!.replace(/\./g, "")),
      year: Number(head[4]),
      adoptedOn,
      title: head[5]!.replace(/\s+/g, " ").trim(),
      ...(published ? { gazetteNumber: published[1]!, gazetteOn: isoOf(published[2]!, published[3]!, published[4]!) ?? undefined } : {})
    });
  });
  return { total, items };
}

export type DecisionAction = "appointment" | "resignation" | "vacancy" | "dismissal" | "other";

export interface DecisionPerson {
  name: string;
  action: DecisionAction;
  sentence: string;
}

const cedilla = (value: string) => value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");
const NAME = "([A-ZĂÂÎȘȚ][\\p{L}'’.-]*(?:\\s+[A-ZĂÂÎȘȚ-][\\p{L}'’.-]*){0,5})";

/** The people a decision names, from the operative sentence (after "Articolul UNIC", before the sentence that says who adopted it). */
export function decisionPersons(text: string): DecisionPerson[] {
  const clean = cedilla(text);
  const start = /adopt[aă]\s+prezenta\s+hot[aă]r[aâî]re\.?\s*\+?\s*(?:Articolul\s+UNIC\s*-?)?/i.exec(clean);
  const body = start ? clean.slice(start.index + start[0].length) : clean;
  const end = body.search(/Aceast[aă]\s+hot[aă]r[aâî]re\s+a\s+fost\s+adoptat[aă]|PRE[SȘ]EDINTELE\s+(CAMEREI|SENATULUI)/i);
  const operative = (end > 0 ? body.slice(0, end) : body).trim();
  const out: DecisionPerson[] = [];
  const sentences = operative.split(/(?<=\.)\s+(?=[A-ZĂÂÎȘȚ+])/).map((sentence) => sentence.replace(/^\+\s*/, "").trim()).filter(Boolean);
  for (const sentence of sentences) {
    // "Domnul X se numește ..." and "Domnul Ioan Vida, profesor universitar, doctor în drept, se numește ..." (a description between the name and the verb).
    const appoint = new RegExp(`(?:Domnul|Doamna)\\s+(?:senator\\s+|deputat\\s+)?${NAME}(?:,[^.]*?)?\\s+se\\s+nume[sș]te`, "u").exec(sentence);
    // "Se ia act de demisia domnului X din funcția ...", "ia act de cererea de demisie a domnului X din funcția ..." and "... ca urmare a demisiei domnului X din funcția ...".
    const resign = new RegExp(`demisi[aei]{1,2}\\s+(?:a\\s+)?(?:domnului|doamnei)\\s+${NAME}\\s+din\\s+func[tț]ia`, "u").exec(sentence);
    const dismiss = new RegExp(`(?:Domnul|Doamna)\\s+${NAME}\\s+se\\s+revoc[aă]`, "u").exec(sentence);
    const vacancy = /(?:se\s+constat[aă]|declar[aă])\s+vacan[tț]|vacan[tț]a\s+func[tț]iei|vacant[aă]\s+(?:aceast[aă]\s+)?func[tț]ia/i.test(sentence);
    if (appoint) out.push({ name: appoint[1]!.trim(), action: "appointment", sentence });
    else if (resign) out.push({ name: resign[1]!.trim(), action: "resignation", sentence });
    else if (dismiss) out.push({ name: dismiss[1]!.trim(), action: "dismissal", sentence });
    else if (vacancy) out.push({ name: "", action: "vacancy", sentence });
  }
  return out;
}

export interface FetchDecisionsResult {
  queries: number;
  requested: number;
  fetchedNow: number;
  decisions: number;
  pagesCached: number;
  pagesMissing: number;
  failed: string[];
  stoppedBy?: string;
}

async function listOf(cache: RawCache, query: DecisionQuery): Promise<DecisionListItem[]> {
  const body = await cache.read("legislatie-decision-list", decisionListKey(query, 1));
  return body ? parseDecisionList(body.toString("utf8")).items : [];
}

/** Saves the result list of every query, then the page of every decision on them. Without `live` nothing is requested. */
export async function fetchDecisions(options: { repoRoot: string; live: boolean; delayMs: number; limit: number; log?: (line: string) => void }): Promise<FetchDecisionsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchDecisionsResult = { queries: DECISION_QUERIES.length, requested: 0, fetchedNow: 0, decisions: 0, pagesCached: 0, pagesMissing: 0, failed: [] };
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 90_000, retries: 1 });
  try {
    for (const query of DECISION_QUERIES) {
      if (!(await cache.has("legislatie-decision-list", decisionListKey(query, 1))) && options.live) {
        const response = await fetcher.get(decisionListUrl(query, 1));
        result.requested += 1;
        if (response.status !== 200) throw new Error(`The portal answered ${response.status} for ${decisionListKey(query, 1)}`);
        await cache.write("legislatie-decision-list", decisionListKey(query, 1), response.body, { url: decisionListUrl(query, 1), status: 200 });
        result.fetchedNow += 1;
      }
    }
    const ids = new Set<string>();
    for (const query of DECISION_QUERIES) for (const item of await listOf(cache, query)) ids.add(item.portalId);
    result.decisions = ids.size;
    for (const id of ids) {
      if (await cache.has("legislatie-decision-text", decisionTextKey(id))) { result.pagesCached += 1; continue; }
      result.pagesMissing += 1;
      if (!options.live) continue;
      try {
        const response = await fetcher.get(decisionPageUrl(id));
        result.requested += 1;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (!/HOT[ĂA]R[ÂÎA]RE/i.test(decodeOfficialBytes(response.body, response.contentType))) throw new Error("the page is not a decision");
        await cache.write("legislatie-decision-text", decisionTextKey(id), response.body, { url: decisionPageUrl(id), status: 200 });
        result.fetchedNow += 1;
        result.pagesMissing -= 1;
        result.pagesCached += 1;
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push(id);
      }
    }
  } catch (error) {
    if (error instanceof FetchStoppedError) result.stoppedBy = error.message;
    else throw error;
  }
  return result;
}

export interface ReadDecision extends DecisionListItem {
  body: DecisionBody;
  office: DecisionOffice;
  persons: DecisionPerson[];
}

/** Every saved decision with the people it names; a decision found by several queries counts once. */
export async function readDecisions(repoRoot: string): Promise<ReadDecision[]> {
  const cache = new RawCache(path.join(repoRoot, "data/coverage/raw"));
  const seen = new Map<string, ReadDecision>();
  for (const query of DECISION_QUERIES) {
    for (const item of await listOf(cache, query)) {
      if (seen.has(item.portalId)) continue;
      // The title must be the office's: a search by words can return a decision about something else that uses them.
      const wanted = query.office === "ccr-judge" ? /curtea constitutionala|curtii constitutionale/ : query.office === "sri-director" ? /serviciului roman de informatii/ : /serviciului de informatii externe/;
      if (!wanted.test(fold(item.title))) continue;
      const page = await cache.read("legislatie-decision-text", decisionTextKey(item.portalId));
      const persons = page ? decisionPersons(decreePageText(decodeOfficialBytes(page))) : [];
      seen.set(item.portalId, { ...item, body: query.body, office: query.office, persons });
    }
  }
  return [...seen.values()].sort((a, b) => a.adoptedOn.localeCompare(b.adoptedOn));
}

export interface ImportDecisionsResult {
  persisted: boolean;
  decisions: number;
  withoutPerson: Array<{ id: string; title: string }>;
  rows: number;
  byOffice: Array<{ office: string; body: string; action: string; count: number }>;
  written: number;
}

/** Writes `parliament_appointments` from the saved decisions (offline apart from the database). */
export async function importDecisions(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportDecisionsResult> {
  const decisions = await readDecisions(options.repoRoot);
  const readAt = new Date();
  const rows: Array<typeof schema.parliamentAppointments.$inferInsert> = [];
  const withoutPerson: ImportDecisionsResult["withoutPerson"] = [];
  const slugOf = (name: string) => fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const knownPeople = new Set([...(await db.execute<{ id: string }>(sql`select id from people`))].map((row) => row.id));
  for (const decision of decisions) {
    if (decision.persons.length === 0) { withoutPerson.push({ id: decision.portalId, title: `${decision.number}/${decision.year} ${decision.title}` }); continue; }
    decision.persons.forEach((person, position) => {
      const personId = person.name ? `person-${slugOf(person.name)}` : "";
      rows.push({
        id: `hp-${decision.portalId}`, position, body: decision.body, number: decision.number, year: decision.year, adoptedOn: decision.adoptedOn, title: decision.title,
        gazetteNumber: decision.gazetteNumber ?? null, gazetteOn: decision.gazetteOn ?? null, office: decision.office, action: person.action, personName: person.name || null,
        personId: personId && knownPeople.has(personId) ? personId : null, sentence: person.sentence.length > 400 ? `${person.sentence.slice(0, 397)}…` : person.sentence,
        portalUrl: decisionPageUrl(decision.portalId), readAt
      });
    });
  }
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(`${row.office}|${row.body}|${row.action}`, (counts.get(`${row.office}|${row.body}|${row.action}`) ?? 0) + 1);
  const result: ImportDecisionsResult = {
    persisted: options.persist, decisions: decisions.length, withoutPerson, rows: rows.length,
    byOffice: [...counts].map(([key, count]) => { const [office, body, action] = key.split("|"); return { office: office!, body: body!, action: action!, count }; }).sort((a, b) => a.office.localeCompare(b.office) || b.count - a.count),
    written: 0
  };
  if (!options.persist || rows.length === 0) return result;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from parliament_appointments`);
    for (let i = 0; i < rows.length; i += 200) await tx.insert(schema.parliamentAppointments).values(rows.slice(i, i + 200));
  });
  result.written = rows.length;
  return result;
}
