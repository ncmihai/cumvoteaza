import * as cheerio from "cheerio";
import { parseDeputiesYearlyList, parseSenateYearlyList } from "../sync";
import type { ListFetchResult } from "./fetch-cdep-lists";
import { FetchStoppedError, type PoliteFetcher } from "./polite-fetcher";
import { decodeOfficialBytes, type RawCache } from "./raw-cache";

export const CDEP_BILLS_YEAR_URL = (year: number) => `https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.lista?anp=${year}`;
export const SENATE_BILLS_YEAR_URL = (year: number) => `https://www.senat.ro/Legis/Lista.aspx?an_cls=${year}`;

export interface BillListFetchOptions {
  years: number[];
  sources: Array<"cdep" | "senate">;
  cache: RawCache;
  fetcher: PoliteFetcher;
  refresh?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** The Senate search page is a form: ask for one year, without paging, the way the page's own button does. */
export function senateYearSearchForm(firstHtml: string, searchUrl: string, year: number): { action: string; body: URLSearchParams } {
  const $ = cheerio.load(firstHtml);
  const form = $("form").first();
  if (form.length === 0) throw new Error("Senate search form missing");
  const body = new URLSearchParams();
  form.find("input,select,textarea").each((_, element) => {
    const field = $(element);
    const name = field.attr("name");
    if (!name) return;
    if (element.tagName === "select") {
      const selected = field.find("option[selected]").first();
      if (selected.length) body.set(name, selected.attr("value") ?? selected.text());
    } else if (field.attr("type") === "checkbox") {
      if (field.attr("checked") !== undefined) body.set(name, field.attr("value") ?? "on");
    } else if (!["submit", "button"].includes(field.attr("type") ?? "")) {
      body.set(name, field.attr("value") ?? "");
    }
  });
  body.set("ctl00$B_Center$Lista$ddAni", String(year));
  body.set("ctl00$B_Center$Lista$chkFaraPaginare", "on");
  body.set("__EVENTTARGET", "ctl00$B_Center$Lista$btnCauta2");
  body.set("__EVENTARGUMENT", "");
  return { action: new URL(form.attr("action") || searchUrl, searchUrl).toString(), body };
}

/** Yearly bill lists of both chambers, saved raw. One request per Chamber year, two per Senate year. Resumable. */
export async function fetchBillLists(options: BillListFetchOptions): Promise<ListFetchResult> {
  const { years, cache, fetcher, dryRun } = options;
  const log = options.log ?? (() => {});
  const result: ListFetchResult = { days: [], requested: 0, cached: 0, failures: [], planned: dryRun ? 0 : undefined };
  try {
    for (const year of years) {
      for (const source of options.sources) {
        const kind = source === "cdep" ? "cdep-bills-year" : "senate-bills-year";
        const key = String(year);
        if (!options.refresh && (await cache.has(kind, key))) {
          result.cached += 1;
          continue;
        }
        if (dryRun) {
          result.planned! += source === "cdep" ? 1 : 2;
          continue;
        }
        try {
          let body: Buffer;
          let url: string;
          if (source === "cdep") {
            url = CDEP_BILLS_YEAR_URL(year);
            const response = await fetcher.get(url);
            result.requested += 1;
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            body = response.body;
            const parsed = parseDeputiesYearlyList(decodeOfficialBytes(body, response.contentType), url);
            if (!parsed.expectedCount && parsed.discoveries.length === 0) throw new Error("no bill rows and no record count in the answer");
            log(`CDEP bills ${year}: ${parsed.discoveries.length} rows (page says ${parsed.expectedCount ?? "?"})`);
          } else {
            const searchUrl = SENATE_BILLS_YEAR_URL(year);
            const first = await fetcher.get(searchUrl);
            result.requested += 1;
            if (first.status !== 200) throw new Error(`HTTP ${first.status}`);
            const { action, body: form } = senateYearSearchForm(decodeOfficialBytes(first.body, first.contentType), searchUrl, year);
            const headers: Record<string, string> = { referer: searchUrl };
            if (first.cookies.length) headers.cookie = first.cookies.join("; ");
            const response = await fetcher.post(action, form, headers);
            result.requested += 1;
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            body = response.body;
            url = searchUrl;
            const parsed = parseSenateYearlyList(decodeOfficialBytes(body, response.contentType), searchUrl);
            if (parsed.discoveries.length === 0) throw new Error("the Senate search returned no dossier rows");
            log(`Senate bills ${year}: ${parsed.discoveries.length} rows`);
          }
          await cache.write(kind, key, body, { url, status: 200 });
        } catch (error) {
          if (error instanceof FetchStoppedError) throw error;
          result.failures.push({ key: `${source} bills ${year}`, error: error instanceof Error ? error.message : String(error) });
          log(`${source} bills ${year}: FAILED ${result.failures.at(-1)!.error}`);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }
  return result;
}
