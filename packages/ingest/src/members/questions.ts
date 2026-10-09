import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as cheerio from "cheerio";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { decodeOfficialBytes } from "../coverage/raw-cache";
import { memberId } from "../parsers/roster";
import { questionUrl, type QuestionKind } from "./questions-fetch";

/**
 * Sprint 13c (D-036): one question or interpellation of a deputy, read from its page on the Chamber's site. The page has two tables: "Informaţii privind interpelarea|întrebarea"
 * (number, dates, the asker with a link to the profile, the addressee, the text's PDF) and, when there is an answer, "Informaţii privind răspunsul" (number, date, who it came from, its PDF).
 * The asker is linked by the profile address the page itself gives, never by name.
 */
export interface ParsedAsker {
  /** "Mirela Elena Adomnicăi - deputat PSD", as printed. */
  text: string;
  /** From the profile link: `structura.mp?idm=1&cam=2&leg=2024`. */
  profile?: { chamber: "deputies" | "senate"; legislature: string; officialId: string };
}

export interface ParsedAddressee {
  name: string;
  attention?: string;
}

export interface ParsedQuestion {
  officialId: string;
  kind: QuestionKind;
  number: string;
  title: string;
  registeredOn: string;
  presentedOn?: string;
  communicatedOn?: string;
  askMode?: string;
  textUrl?: string;
  askers: ParsedAsker[];
  addressees: ParsedAddressee[];
  answer?: { number?: string; answeredOn?: string; mode?: string; from?: string; signedBy?: string; url?: string };
}

const clean = (value: string) => value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const isoDate = (value: string | undefined) => {
  const match = /(\d{2})\.(\d{2})\.(\d{4})/.exec(value ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
};
const absolute = (href: string | undefined) => (href ? new URL(href, "https://www.cdep.ro/").toString() : undefined);

/** The lines of a cell: its content split at every `<br>`, each as text (tags removed) and as the bold words it holds. */
function cellLines($: cheerio.CheerioAPI, cell: cheerio.Cheerio<any>): Array<{ text: string; bold: string[] }> {
  const lines: Array<{ text: string; bold: string[] }> = [{ text: "", bold: [] }];
  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.type === "text") lines[lines.length - 1]!.text += (node as unknown as { data: string }).data;
      else if (node.type === "tag") {
        const tag = (node as unknown as { name: string }).name;
        if (tag === "br") lines.push({ text: "", bold: [] });
        else {
          if (tag === "b" || tag === "strong") lines[lines.length - 1]!.bold.push(clean($(node).text()));
          walk((node as unknown as { children: any[] }).children ?? []);
        }
      }
    }
  };
  walk(cell.contents().toArray());
  return lines.map((line) => ({ text: clean(line.text), bold: line.bold.filter(Boolean) })).filter((line) => line.text);
}

export function parseQuestionPage(html: string, officialId: string): ParsedQuestion | undefined {
  const $ = cheerio.load(html);
  const header = clean($(".pageHeaderLinks").first().text());
  const kind: QuestionKind | undefined = /^Interpelarea/i.test(header) ? "interpellation" : /^[ÎI]ntrebarea/i.test(header) ? "question" : undefined;
  const title = clean($("span.headline").first().text());
  if (!kind || !title) return undefined;
  const parsed: ParsedQuestion = { officialId, kind, number: "", title, registeredOn: "", askers: [], addressees: [] };
  let section: "question" | "answer" | undefined;
  $("table tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length === 1 && /Informa[tţț]ii privind\s+r[aă]spunsul/i.test(clean($(row).text()))) {
      section = "answer";
      return;
    }
    if (cells.length === 1 && /Informa[tţț]ii privind\s+(interpelarea|[iî]ntrebarea)/i.test(clean($(row).text()))) {
      section = "question";
      return;
    }
    if (cells.length !== 2 || !section) return;
    const label = clean(cells.eq(0).text()).replace(/:$/, "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const cell = cells.eq(1);
    const text = clean(cell.text());
    if (section === "question") {
      if (label === "nr.inregistrare") parsed.number = text.toUpperCase();
      else if (label === "data inregistrarii") parsed.registeredOn = isoDate(text) ?? "";
      else if (label === "data prezentarii") parsed.presentedOn = isoDate(text);
      else if (label === "data comunicarii") parsed.communicatedOn = isoDate(text);
      else if (label === "mod adresare") parsed.askMode = text;
      else if (label === "adresant") {
        // One asker per profile link; the text after a link up to the next link is the asker's role and party.
        let current: ParsedAsker | undefined;
        const flush = () => {
          if (current) parsed.askers.push({ ...current, text: clean(current.text) });
          current = undefined;
        };
        for (const node of cell.contents().toArray()) {
          const element = node.type === "tag" ? $(node) : undefined;
          const link = element?.is("a") ? element : element?.find("a[href*='structura.mp']").first();
          const href = link?.attr("href") ?? "";
          const profile = /structura\.mp\?([^"]*)/.exec(href);
          if (profile) {
            flush();
            const query = new URLSearchParams(profile[1]!.replace(/&amp;/g, "&"));
            const idm = query.get("idm");
            const cam = query.get("cam");
            const leg = query.get("leg");
            current = { text: clean($(node).text()), ...(idm && cam && leg ? { profile: { chamber: cam === "1" ? "senate" as const : "deputies" as const, legislature: leg, officialId: idm } } : {}) };
          } else if (current) current.text += ` ${clean($(node).text())}`;
        }
        flush();
        if (parsed.askers.length === 0 && text) parsed.askers.push({ text });
      } else if (label === "destinatar") {
        for (const line of cellLines($, cell)) {
          if (/^[iî]n aten[tţț]ia/i.test(line.text)) {
            const last = parsed.addressees.at(-1);
            if (last) last.attention = clean(line.text.replace(/^[iî]n aten[tţț]ia:?/i, ""));
          } else parsed.addressees.push({ name: line.bold[0] ?? line.text });
        }
      } else if (label === "textul interventiei") parsed.textUrl = absolute(cell.find("a[href$='.pdf'], a[href*='.pdf']").first().attr("href"));
    } else {
      parsed.answer ??= {};
      if (label === "nr.inregistrare") parsed.answer.number = text;
      else if (label === "data inregistrarii") parsed.answer.answeredOn = isoDate(text);
      else if (label === "raspuns primit") parsed.answer.mode = text;
      else if (label === "raspuns primit de la") {
        const lines = cellLines($, cell);
        parsed.answer.from = lines[0]?.bold[0] ?? lines[0]?.text;
        const signed = lines.find((line) => /comunicat de/i.test(line.text));
        if (signed) parsed.answer.signedBy = clean(signed.text.replace(/^comunicat de:?/i, ""));
      } else if (label === "textul raspunsului") parsed.answer.url = absolute(cell.find("a[href*='.pdf']").first().attr("href"));
    }
  });
  if (!parsed.number || !parsed.registeredOn) return undefined;
  return parsed;
}

const normalise = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface ImportQuestionsResult {
  persisted: boolean;
  pagesSaved: number;
  parsed: number;
  unreadable: string[];
  questions: number;
  interpellations: number;
  answered: number;
  askerLinks: number;
  askersWithoutMember: number;
  addresseeRows: number;
  addresseesAMinistry: number;
  topAddresseesNotMinistries: Array<{ name: string; count: number }>;
  written: number;
}

/**
 * Writes `parliamentary_questions` and its askers and addressees from the saved pages (offline). Every page is replaced as a whole. An asker is linked to the member whose profile
 * the page links (`structura.mp?idm=&cam=&leg=`); an addressee to the ministry whose name it equals exactly, otherwise it stays text.
 */
export async function importQuestions(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportQuestionsResult> {
  const dir = path.join(options.repoRoot, "data/coverage/raw/cdep-question");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".html"));
  } catch {
    files = [];
  }
  const memberIds = new Set([...(await db.execute<{ id: string }>(sql`select id from members`))].map((row) => row.id));
  const ministryByName = new Map<string, string>();
  for (const row of await db.execute<{ id: string; name: string }>(sql`select id, name from ministries union select ministry_id as id, name from ministry_aliases`)) ministryByName.set(normalise(row.name), row.id);

  const readAt = new Date();
  const questions: Array<typeof schema.parliamentaryQuestions.$inferInsert> = [];
  const askers: Array<typeof schema.parliamentaryQuestionAskers.$inferInsert> = [];
  const addressees: Array<typeof schema.parliamentaryQuestionAddressees.$inferInsert> = [];
  const unreadable: string[] = [];
  const notMinistries = new Map<string, number>();
  let askersWithoutMember = 0;
  for (const name of files) {
    const officialId = name.replace(/\.html$/, "");
    const parsed = parseQuestionPage(decodeOfficialBytes(await readFile(path.join(dir, name))), officialId);
    if (!parsed) {
      unreadable.push(officialId);
      continue;
    }
    const id = `cdep-question-${officialId}`;
    questions.push({
      id, chamber: "deputies", officialId, kind: parsed.kind, number: parsed.number, title: parsed.title, registeredOn: parsed.registeredOn,
      presentedOn: parsed.presentedOn ?? null, communicatedOn: parsed.communicatedOn ?? null, askMode: parsed.askMode ?? null, textUrl: parsed.textUrl ?? null,
      answerNumber: parsed.answer?.number ?? null, answeredOn: parsed.answer?.answeredOn ?? null, answerMode: parsed.answer?.mode ?? null, answerFrom: parsed.answer?.from ?? null,
      answerSignedBy: parsed.answer?.signedBy ?? null, answerUrl: parsed.answer?.url ?? null, sourceUrl: questionUrl(officialId), readAt
    });
    parsed.askers.forEach((asker, position) => {
      // The ids the roster importer gives: the current legislature's number alone, an earlier one's with the legislature's year.
      const linked = asker.profile ? memberId(asker.profile.chamber, asker.profile.legislature === "2024" ? asker.profile.officialId : `${asker.profile.legislature}-${asker.profile.officialId}`) : undefined;
      const known = linked && memberIds.has(linked) ? linked : undefined;
      if (!known) askersWithoutMember += 1;
      askers.push({ questionId: id, position, memberId: known ?? null, askerText: asker.text });
    });
    parsed.addressees.forEach((addressee, position) => {
      const ministryId = ministryByName.get(normalise(addressee.name));
      if (!ministryId) notMinistries.set(addressee.name, (notMinistries.get(addressee.name) ?? 0) + 1);
      addressees.push({ questionId: id, position, name: addressee.name, attention: addressee.attention ?? null, ministryId: ministryId ?? null });
    });
  }
  const result: ImportQuestionsResult = {
    persisted: options.persist,
    pagesSaved: files.length,
    parsed: questions.length,
    unreadable: unreadable.slice(0, 30),
    questions: questions.filter((row) => row.kind === "question").length,
    interpellations: questions.filter((row) => row.kind === "interpellation").length,
    answered: questions.filter((row) => row.answerNumber || row.answerUrl).length,
    askerLinks: askers.length - askersWithoutMember,
    askersWithoutMember,
    addresseeRows: addressees.length,
    addresseesAMinistry: addressees.filter((row) => row.ministryId).length,
    topAddresseesNotMinistries: [...notMinistries].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => ({ name, count })),
    written: 0
  };
  if (!options.persist || questions.length === 0) return result;
  await db.transaction(async (tx) => {
    for (let i = 0; i < questions.length; i += 200) {
      const batch = questions.slice(i, i + 200);
      const ids = batch.map((row) => row.id);
      await tx.insert(schema.parliamentaryQuestions).values(batch).onConflictDoUpdate({
        target: [schema.parliamentaryQuestions.chamber, schema.parliamentaryQuestions.officialId],
        set: {
          kind: sql`excluded.kind`, number: sql`excluded.number`, title: sql`excluded.title`, registeredOn: sql`excluded.registered_on`, presentedOn: sql`excluded.presented_on`, communicatedOn: sql`excluded.communicated_on`,
          askMode: sql`excluded.ask_mode`, textUrl: sql`excluded.text_url`, answerNumber: sql`excluded.answer_number`, answeredOn: sql`excluded.answered_on`, answerMode: sql`excluded.answer_mode`,
          answerFrom: sql`excluded.answer_from`, answerSignedBy: sql`excluded.answer_signed_by`, answerUrl: sql`excluded.answer_url`, sourceUrl: sql`excluded.source_url`, readAt: sql`excluded.read_at`
        }
      });
      await tx.execute(sql`delete from parliamentary_question_askers where question_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      await tx.execute(sql`delete from parliamentary_question_addressees where question_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      const batchIds = new Set(ids);
      const batchAskers = askers.filter((row) => batchIds.has(row.questionId));
      const batchAddressees = addressees.filter((row) => batchIds.has(row.questionId));
      for (let j = 0; j < batchAskers.length; j += 500) await tx.insert(schema.parliamentaryQuestionAskers).values(batchAskers.slice(j, j + 500));
      for (let j = 0; j < batchAddressees.length; j += 500) await tx.insert(schema.parliamentaryQuestionAddressees).values(batchAddressees.slice(j, j + 500));
    }
  });
  result.written = questions.length;
  return result;
}
