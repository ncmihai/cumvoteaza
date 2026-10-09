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
