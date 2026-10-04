import { parseCdepDayVotes, parseCdepSittingDays } from "./cdep-official-votes";
import { decodeOfficialBytes, type RawCache } from "./raw-cache";
import { FetchStoppedError, type PoliteFetcher } from "./polite-fetcher";

export const CDEP_SITTING_DAYS_URL = (year: number, month: number) => `https://www.cdep.ro/ords/pls/steno/evot2015.zile_vot?lu=${month}&an=${year}`;
export const CDEP_DAY_URL = (compactDate: string) => `https://www.cdep.ro/ords/pls/steno/evot2015.xml?par1=1&par2=${compactDate}`;

export interface ListFetchOptions {
  from: string;
  to: string;
  cache: RawCache;
  fetcher: PoliteFetcher;
  /** Fetch again whatever concerns days on or after this date (use it for the current month). */
  refreshSince?: string;
  /** Ask for every calendar day instead of trusting CDEP's list of sitting days (about 650 requests for two years). */
  allDays?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface ListFetchResult {
  /** Days the lists name (or all days with `allDays`). */
  days: string[];
  requested: number;
  cached: number;
  failures: Array<{ key: string; error: string }>;
  /** Set when the run ended early; everything fetched so far is kept and the next run resumes. */
  stopped?: string;
  /** Dry run only: requests the run would make; a lower bound when month lists are not cached yet. */
  planned?: number;
}

export function monthsBetween(from: string, to: string): Array<{ year: number; month: number; key: string }> {
  const months: Array<{ year: number; month: number; key: string }> = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > endKey) break;
    months.push({ year, month, key });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}

/** CDEP: the list of sitting days of each month, then one vote-list XML per sitting day. Resumable: cached files are kept. */
export async function fetchCdepLists(options: ListFetchOptions): Promise<ListFetchResult> {
  const { from, to, cache, fetcher, refreshSince, dryRun } = options;
  const log = options.log ?? (() => {});
  const result: ListFetchResult = { days: [], requested: 0, cached: 0, failures: [], planned: dryRun ? 0 : undefined };
  const wanted = (day: string) => day >= from && day <= to;
  const plan = (count = 1) => {
    if (result.planned !== undefined) result.planned += count;
  };

  try {
    let days: string[] = [];
    if (options.allDays) {
      days = daysBetween(from, to);
    } else {
      for (const { year, month, key } of monthsBetween(from, to)) {
        const stale = refreshSince !== undefined && `${key}-31` >= refreshSince;
        let body = !stale ? await cache.read("cdep-sitting-days", key) : undefined;
        if (body) {
          result.cached += 1;
        } else if (dryRun) {
          plan();
        } else {
          const url = CDEP_SITTING_DAYS_URL(year, month);
          try {
            const response = await fetcher.get(url);
            result.requested += 1;
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            body = response.body;
            await cache.write("cdep-sitting-days", key, body, { url, status: response.status });
            log(`CDEP sitting days ${key}: ${parseCdepSittingDays(decodeOfficialBytes(body)).length} days`);
          } catch (error) {
            if (error instanceof FetchStoppedError) throw error;
            result.failures.push({ key: `sitting-days ${key}`, error: error instanceof Error ? error.message : String(error) });
            log(`CDEP sitting days ${key}: FAILED ${result.failures.at(-1)!.error}`);
          }
        }
        if (body) days.push(...parseCdepSittingDays(decodeOfficialBytes(body)).filter(wanted));
      }
      days = [...new Set(days)].sort();
    }
    result.days = days;

    for (const day of days) {
      const compact = day.replaceAll("-", "");
      const stale = refreshSince !== undefined && day >= refreshSince;
      if (!stale && (await cache.has("cdep-day", compact))) {
        result.cached += 1;
        continue;
      }
      if (dryRun) {
        plan();
        continue;
      }
      const url = CDEP_DAY_URL(compact);
      try {
        const response = await fetcher.get(url);
        result.requested += 1;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const votes = parseCdepDayVotes(decodeOfficialBytes(response.body, response.contentType));
        await cache.write("cdep-day", compact, response.body, { url, status: response.status });
        log(`CDEP ${day}: ${votes.length} votes`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failures.push({ key: `day ${day}`, error: error instanceof Error ? error.message : String(error) });
        log(`CDEP ${day}: FAILED ${result.failures.at(-1)!.error}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }
  return result;
}
