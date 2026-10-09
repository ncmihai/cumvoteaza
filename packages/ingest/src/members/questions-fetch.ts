import path from "node:path";
import * as cheerio from "cheerio";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";

/**
 * Sprint 13c (D-036): the Chamber's questions ("întrebări", type A) and interpellations ("interpelări", type B) to the Government. The Chamber lists a year at a time
 * (`interpelari.lista?tip=A&dat=2026&idl=1`: number, date and title of each) and gives each item its own page (`interpelari.detalii?idi=<n>&idl=1`) with the deputy,
 * the addressee, the dates and the PDFs of the text and of the answer. Only the detail page names the addressee, so every item of the legislature is requested once.
 */
export type QuestionKind = "question" | "interpellation";

const BASE = "https://www.cdep.ro/ords/pls/parlam/";
export const questionListUrl = (kind: QuestionKind, year: number) => `${BASE}interpelari.lista?tip=${kind === "question" ? "A" : "B"}&dat=${year}&idl=1`;
export const questionUrl = (idi: string) => `${BASE}interpelari.detalii?idi=${idi}&idl=1`;

export interface QuestionListItem {
  idi: string;
  kind: QuestionKind;
  /** "819B" for an interpellation, "3676A" for a question. */
  number: string;
  registeredOn: string;
  title: string;
}

/** The rows of one year's list: `<a href="interpelari.detalii?idi=82395&idl=1">Interpelarea nr.929B/10.02.2026</a><br>title`. */
export function parseQuestionList(html: string, kind: QuestionKind): QuestionListItem[] {
  const $ = cheerio.load(html);
  const items: QuestionListItem[] = [];
  const seen = new Set<string>();
  $("a[href*='interpelari.detalii']").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const idi = /idi=(\d+)/.exec(href)?.[1];
    const label = $(element).text().replace(/\s+/g, " ").trim();
    const match = /nr\.\s*(\d+[AB])\s*\/\s*(\d{2})\.(\d{2})\.(\d{4})/i.exec(label);
    if (!idi || !match || seen.has(idi)) return;
    seen.add(idi);
    // The title is the text of the same cell after the link.
    const cell = $(element).closest("td");
    const title = cell.clone().children("b").remove().end().text().replace(/\s+/g, " ").trim();
    items.push({ idi, kind, number: match[1]!.toUpperCase(), registeredOn: `${match[4]}-${match[3]}-${match[2]}`, title });
  });
  return items;
}

export interface FetchQuestionsResult {
  lists: { wanted: number; cached: number; fetchedNow: number };
  items: number;
  inScope: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: Array<{ key: string; error: string }>;
  stoppedBy?: string;
}

/**
 * Saves the year lists (types A and B, from `since`'s year to this year) and then each item's page of the legislature, newest first, `limit` requests at most, one at a time.
 * Without `live` nothing is requested. A list of the current year is saved once and refreshed with `--refresh-lists` (the updater's job later).
 */
export async function fetchQuestions(options: { repoRoot: string; live: boolean; since: string; limit: number; delayMs: number; refreshLists?: boolean; log?: (line: string) => void }): Promise<FetchQuestionsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 60_000, retries: 1 });
  const firstYear = Number(options.since.slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  const result: FetchQuestionsResult = { lists: { wanted: 0, cached: 0, fetchedNow: 0 }, items: 0, inScope: 0, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const all: QuestionListItem[] = [];
  try {
    for (let year = firstYear; year <= thisYear; year += 1) {
      for (const kind of ["question", "interpellation"] as const) {
        const key = `${kind === "question" ? "A" : "B"}-${year}`;
        result.lists.wanted += 1;
        const saved = await cache.has("cdep-question-list", key);
        if (saved && !(options.refreshLists && year === thisYear)) result.lists.cached += 1;
        else if (options.live) {
          const response = await fetcher.get(questionListUrl(kind, year));
          if (response.status !== 200) throw new Error(`The Chamber answered ${response.status} for the ${key} list`);
          await cache.write("cdep-question-list", key, response.body, { url: questionListUrl(kind, year), status: 200 });
          result.lists.fetchedNow += 1;
          options.log?.(`list ${key}: ${Math.round(response.body.byteLength / 1024)} KB`);
        }
        const body = await cache.read("cdep-question-list", key);
        if (body) all.push(...parseQuestionList(decodeOfficialBytes(body), kind));
      }
    }
    result.items = all.length;
    const inScope = all.filter((item) => item.registeredOn >= options.since).sort((a, b) => Number(b.idi) - Number(a.idi));
    result.inScope = inScope.length;
    const todo: QuestionListItem[] = [];
    for (const item of inScope) {
      if (await cache.has("cdep-question", item.idi)) result.cached += 1;
      else todo.push(item);
    }
    result.remaining = todo.length;
    if (!options.live) return result;
    for (const item of todo) {
      try {
        const response = await fetcher.get(questionUrl(item.idi));
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const html = decodeOfficialBytes(response.body, response.contentType);
        if (!/Informa[tţț]ii privind (interpelarea|[iî]ntrebarea)/i.test(html)) throw new Error("the page is not a question or interpellation page");
        await cache.write("cdep-question", item.idi, response.body, { url: questionUrl(item.idi), status: 200 });
        result.fetchedNow += 1;
        result.remaining -= 1;
        if (result.fetchedNow % 100 === 0) options.log?.(`${result.fetchedNow} pages saved, ${result.remaining} to go`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push({ key: item.idi, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
