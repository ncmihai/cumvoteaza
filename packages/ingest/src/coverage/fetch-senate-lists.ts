import * as cheerio from "cheerio";
import { decodeOfficialBytes, type RawCache } from "./raw-cache";
import { FetchStoppedError, type PoliteFetcher } from "./polite-fetcher";
import { monthsBetween, type ListFetchResult } from "./fetch-cdep-lists";

export const SENATE_VOTES_URL = "https://www.senat.ro/voturiplen.aspx";
const CALENDAR_TARGET = "ctl00$B_Center$VoturiPlen1$calVOT";
const CALENDAR_EPOCH = Date.parse("2000-01-01T00:00:00Z");

export interface SenateFetchOptions {
  from: string;
  to: string;
  cache: RawCache;
  fetcher: PoliteFetcher;
  refreshSince?: string;
  /** Visit every calendar day, not only those marked as having votes (a check of the marker, about 650 requests for two years). */
  allDays?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** The ASP.NET calendar counts days since 2000-01-01; a month is selected with "V<days of its first day>". */
export function senateMonthArgument(month: string): string {
  return `V${Math.round((Date.parse(`${month}-01T00:00:00Z`) - CALENDAR_EPOCH) / 86_400_000)}`;
}

export function senateDayArgumentToDate(argument: string): string {
  return new Date(CALENDAR_EPOCH + Number(argument) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What the month page says about its days. Every cell is a link; days with votes have a cyan background
 * (observed on 2026-09), and the selected day is grey, which hides its own marker, so it must be visited too.
 */
export function senateCalendarDays(html: string): Map<string, { argument: string; hasVotes: boolean; selected: boolean }> {
  const $ = cheerio.load(html);
  const days = new Map<string, { argument: string; hasVotes: boolean; selected: boolean }>();
  $("table.myCalendar td").each((_, cell) => {
    const match = $(cell).find("a[href]").first().attr("href")?.match(/calVOT','(\d+)'/);
    if (!match) return;
    days.set(senateDayArgumentToDate(match[1]!), {
      argument: match[1]!,
      hasVotes: ($(cell).attr("bgcolor") ?? "").toLowerCase() === "cyan",
      selected: $(cell).hasClass("myCalendarSelector")
    });
  });
  return days;
}

export function senateCalendarForm(html: string, argument: string): URLSearchParams {
  const $ = cheerio.load(html);
  if (!$("table.myCalendar").length) throw new Error("Senate voting calendar missing from the page");
  const form = new URLSearchParams();
  $("input[type=hidden][name]").each((_, element) => {
    form.set($(element).attr("name")!, $(element).attr("value") ?? "");
  });
  $("select[name]").each((_, element) => {
    form.set($(element).attr("name")!, String($(element).val() ?? ""));
  });
  form.set("__EVENTTARGET", CALENDAR_TARGET);
  form.set("__EVENTARGUMENT", argument);
  return form;
}

export function senateSelectedDate(html: string): string | undefined {
  const text = cheerio.load(html)(".voturi-plen-current-date").text();
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

/**
 * senat.ro "Voturi Plen": the month page names the days with votes, the day page lists that day's votes.
 * Resumable: cached month and day pages are kept; a day is saved only when the page confirms its date.
 */
export async function fetchSenateLists(options: SenateFetchOptions): Promise<ListFetchResult> {
  const { from, to, cache, fetcher, refreshSince, dryRun } = options;
  const log = options.log ?? (() => {});
  const result: ListFetchResult = { days: [], requested: 0, cached: 0, failures: [], planned: dryRun ? 0 : undefined };
  let startPage: string | undefined;

  const post = async (html: string, argument: string) => {
    const response = await fetcher.post(SENATE_VOTES_URL, senateCalendarForm(html, argument));
    result.requested += 1;
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    return { body: response.body, html: decodeOfficialBytes(response.body, response.contentType) };
  };
  const initialPage = async () => {
    if (startPage) return startPage;
    const response = await fetcher.get(SENATE_VOTES_URL);
    result.requested += 1;
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    startPage = decodeOfficialBytes(response.body, response.contentType);
    return startPage;
  };

  try {
    for (const { key: month } of monthsBetween(from, to)) {
      try {
        const staleMonth = refreshSince !== undefined && `${month}-31` >= refreshSince;
        const cachedMonth = !staleMonth ? await cache.read("senate-month", month) : undefined;
        let monthHtml = cachedMonth ? decodeOfficialBytes(cachedMonth) : undefined;
        if (monthHtml) {
          result.cached += 1;
        } else if (dryRun) {
          result.planned! += 2;
          continue;
        } else {
          const page = await post(await initialPage(), senateMonthArgument(month));
          if (!page.html.includes("myCalendar")) throw new Error("answer is not the calendar page");
          await cache.write("senate-month", month, page.body, { url: SENATE_VOTES_URL, status: 200 });
          monthHtml = page.html;
          log(`Senate ${month}: ${[...senateCalendarDays(page.html).values()].filter((item) => item.hasVotes).length} days marked with votes`);
        }

        for (const [day, { argument, hasVotes, selected }] of senateCalendarDays(monthHtml)) {
          if (day < from || day > to || !day.startsWith(month)) continue;
          if (!options.allDays && !hasVotes && !selected) continue;
          result.days.push(day);
          const staleDay = refreshSince !== undefined && day >= refreshSince;
          if (!staleDay && (await cache.has("senate-day", day))) {
            result.cached += 1;
            continue;
          }
          if (dryRun) {
            result.planned! += 1;
            continue;
          }
          try {
            const page = await post(monthHtml, argument);
            if (senateSelectedDate(page.html) !== day) throw new Error(`the page did not select ${day} (shows ${senateSelectedDate(page.html) ?? "no date"})`);
            await cache.write("senate-day", day, page.body, { url: `${SENATE_VOTES_URL}#${argument}`, status: 200 });
            log(`Senate ${day}: saved`);
          } catch (error) {
            if (error instanceof FetchStoppedError) throw error;
            result.failures.push({ key: `senate day ${day}`, error: error instanceof Error ? error.message : String(error) });
            log(`Senate ${day}: FAILED ${result.failures.at(-1)!.error}`);
          }
        }
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failures.push({ key: `senate month ${month}`, error: error instanceof Error ? error.message : String(error) });
        log(`Senate ${month}: FAILED ${result.failures.at(-1)!.error}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }
  result.days = [...new Set(result.days)].sort();
  return result;
}
