import path from "node:path";
import { searchWithRetry } from "../dossiers/ordinances";
import { legislatieToken, parseLegislatieSearch } from "../dossiers/gazette-lookup";
import { RawCache } from "../coverage/raw-cache";

/**
 * Sprint 14 (D-037): the catalog of the President's decrees, from the legislative portal's web service. A search by the word "decret" in the title answers the decrees
 * newest first, ten to a page, and the page number is the only filter that works (the year filter is ignored, a paging request for page 0 answers page 1). So the catalog is read page
 * by page, each page saved byte for byte under `data/coverage/raw/legislatie-decrees` (`p0001.xml`), and a saved page is never asked for again. The order is by date down to about 2014 and
 * mixed beyond, so the run stops at `to`, which the owner (or the check after a run) moves back until a whole window of pages holds nothing from 2014 on.
 */
export const pageKey = (page: number) => `p${String(page).padStart(4, "0")}`;

export interface FetchDecreePagesResult {
  from: number;
  to: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  /** The newest and the oldest decree date of the last page fetched, to watch the run move back in time. */
  lastPageDates?: { newest?: string; oldest?: string };
  failed: number[];
  emptyAt?: number;
  stoppedBy?: string;
}

function datesOf(xml: string): string[] {
  return parseLegislatieSearch(xml)
    .map((act) => /DECRET\s+nr\.\s*[\d.]+\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(act.title))
    .flatMap((match) => (match ? [`${match[3]}-${match[2]!.toLowerCase()}-${match[1]}`] : []));
}

/** Saves pages `from` to `to` of the decree search that are not saved yet, one request every `delayMs`, at most `limit` of them in this run. Without `live` nothing is requested. */
export async function fetchDecreePages(options: { repoRoot: string; live: boolean; from: number; to: number; limit: number; delayMs: number; log?: (line: string) => void }): Promise<FetchDecreePagesResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchDecreePagesResult = { from: options.from, to: options.to, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const todo: number[] = [];
  for (let page = options.from; page <= options.to; page += 1) {
    if (await cache.has("legislatie-decrees", pageKey(page))) result.cached += 1;
    else todo.push(page);
  }
  result.remaining = todo.length;
  if (!options.live) return result;
  const holder = { token: await legislatieToken() };
  let failedInARow = 0;
  for (const page of todo.slice(0, options.limit)) {
    if (failedInARow >= 3) {
      result.stoppedBy = `${failedInARow} pages in a row got errors from the portal (last: page ${result.failed.at(-1)})`;
      break;
    }
    try {
      const xml = await searchWithRetry(holder, { title: "decret", page });
      if (!/<a:Legi>/.test(xml)) {
        result.emptyAt = page;
        result.stoppedBy = `page ${page} holds no acts: the end of the list`;
        break;
      }
      await cache.write("legislatie-decrees", pageKey(page), Buffer.from(xml, "utf8"), { url: "http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP", status: 200 });
      result.fetchedNow += 1;
      result.remaining -= 1;
      failedInARow = 0;
      const dates = datesOf(xml);
      result.lastPageDates = { newest: dates[0], oldest: dates.at(-1) };
      if (result.fetchedNow % 50 === 0) options.log?.(`page ${page}: ${dates[0] ?? "?"} … ${dates.at(-1) ?? "?"} (${result.fetchedNow} saved, ${result.remaining} to go)`);
    } catch {
      result.failed.push(page);
      failedInARow += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }
  return result;
}

export const numberKey = (number: number, page: number) => `n${String(number).padStart(4, "0")}-p${page}`;

export interface FetchDecreesByNumberResult {
  numbers: number;
  requested: number;
  fetchedNow: number;
  cached: number;
  failed: number[];
  stoppedBy?: string;
  lastNumber?: number;
}

/**
 * The by-page catalog above loses decrees: its sort key is the date, so decrees of one day change places between requests and some are never on any page we ask for (about 40% went missing).
 * The portal answers "number N, title with the word decret" with every decree numbered N in any year, newest first, ten to a page, and that list does not shuffle (each decree of a number has
 * its own date). So the catalog is also read number by number: page 1 and, while a page is full and still holds decrees of `since` or later, the next. Each page is saved byte for byte
 * (`n0170-p1.xml`); a saved page is not asked again, and its content says whether to go on.
 */
export async function fetchDecreesByNumber(options: { repoRoot: string; live: boolean; from: number; to: number; limit: number; delayMs: number; since: string; log?: (line: string) => void }): Promise<FetchDecreesByNumberResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchDecreesByNumberResult = { numbers: options.to - options.from + 1, requested: 0, fetchedNow: 0, cached: 0, failed: [] };
  const holder = { token: options.live ? await legislatieToken() : "" };
  let failedInARow = 0;
  const sinceYear = Number(options.since.slice(0, 4));
  for (let number = options.from; number <= options.to; number += 1) {
    for (let page = 1; page <= 6; page += 1) {
      const key = numberKey(number, page);
      let xml: string | undefined;
      const saved = await cache.read("legislatie-decrees", key);
      if (saved) {
        xml = saved.toString("utf8");
        result.cached += 1;
      } else {
        if (!options.live) break;
        if (result.requested >= options.limit) { result.stoppedBy = `request budget of ${options.limit} reached`; return result; }
        if (failedInARow >= 3) { result.stoppedBy = `${failedInARow} requests in a row got errors from the portal (last: number ${number})`; return result; }
        try {
          result.requested += 1;
          xml = await searchWithRetry(holder, { title: "decret", number: String(number), page });
          await cache.write("legislatie-decrees", key, Buffer.from(xml, "utf8"), { url: "http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP", status: 200 });
          result.fetchedNow += 1;
          failedInARow = 0;
          if (result.fetchedNow % 50 === 0) options.log?.(`number ${number}, page ${page} (${result.fetchedNow} saved)`);
        } catch {
          result.failed.push(number);
          failedInARow += 1;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      result.lastNumber = number;
      // Go on to the next page only when this one is full and still reaches back to the years we want.
      const acts = parseLegislatieSearch(xml);
      const years = acts.map((act) => Number(/DECRET\s+nr\.\s*[\d.]+\s*\*{0,2}\)?\s+din\s+\d{1,2}\s+\S+\s+(\d{4})/i.exec(act.title)?.[1])).filter((year) => Number.isFinite(year));
      if (acts.length < 10 || years.length === 0 || Math.min(...years) < sinceYear) break;
    }
  }
  return result;
}
