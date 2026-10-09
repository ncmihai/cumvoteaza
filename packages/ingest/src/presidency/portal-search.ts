import path from "node:path";
import * as cheerio from "cheerio";
import { PoliteFetcher, FetchStoppedError } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";
import type { DecreeRecord } from "./decrees";
import { fold } from "./text";

/**
 * Sprint 14 (D-037): the President's decrees from the legislative portal's public search page, which counts them (16,886 signed since 1 January 2014) and lists them 50 to a page. The web
 * service the first version used loses decrees (its pages shuffle); this list does not need a session, takes the criteria in the address and says how many documents match, so a month
 * can be checked: the decrees read must be as many as the portal counts. Type 3 is DECRET and issuer 49 is the President of Romania in the portal's own lists.
 *
 *   https://legislatie.just.ro/Public/RezultateCautare?rezultatePerPagina=5&page=1&tipdoc=3&sectiuneact=49&semnatinceputtext=2025/09/01&semnatsfarsittext=2025/09/30
 *
 * `rezultatePerPagina` is 1 to 5 for 10 to 50 results. Results are sorted by the date of signature, so decrees of one day can change places between requests; a month whose decrees do not
 * add up to the portal's count is read again with another page size, which moves the page boundaries.
 */
const BASE = "https://legislatie.just.ro/Public/RezultateCautare";
const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };

export const decreeListUrl = (year: number, month: number, page: number, sizeCode: number) => {
  const mm = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${BASE}?rezultatePerPagina=${sizeCode}&page=${page}&tipdoc=3&sectiuneact=49&semnatinceputtext=${year}/${mm}/01&semnatsfarsittext=${year}/${mm}/${String(last).padStart(2, "0")}`;
};

export const listKey = (year: number, month: number, sizeCode: number, page: number) => `m${year}-${String(month).padStart(2, "0")}-s${sizeCode}-p${page}`;

export interface DecreeListPage {
  /** The portal's count of documents matching the month. */
  total: number;
  decrees: DecreeRecord[];
}

/** One page of the result list. A decree here has no text (the list prints the title and the gazette only), so no signer. */
export function parseDecreeList(html: string): DecreeListPage {
  const $ = cheerio.load(html);
  const total = Number(/(\d+)\s*document\(e\)\s*g[aă]sit/i.exec($("body").text().replace(/\s+/g, " "))?.[1] ?? 0);
  const decrees: DecreeRecord[] = [];
  $(".search_result_item").each((_, element) => {
    const link = $(element).find("a[href^='/Public/DetaliiDocument/']").first();
    const portalId = /DetaliiDocument\/(\d+)/.exec(link.attr("href") ?? "")?.[1];
    // Tags separate words ("... 2025<br>privind ..."), so each <br> becomes a space before the text is read.
    const block = $(element).find("p").eq(1).clone();
    block.find("br").replaceWith(" ");
    const text = block.text().replace(/[\u00a0\ufeff]/g, " ").replace(/\s+/g, " ").trim();
    const head = /DECRET\s+nr\.\s*([\d.]+)\s*\*{0,2}\)?\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţĂÂÎȘŞȚŢ]+)\s+(\d{4})\s*(.*?)\s*(?:EMITENT|$)/s.exec(text);
    if (!head || !portalId) return;
    const month = MONTHS[fold(head[3]!)];
    const number = Number(head[1]!.replace(/\./g, ""));
    if (!month || !Number.isFinite(number)) return;
    const published = /PUBLICAT\s+[ÎI]N:?\s*MONITORUL OFICIAL\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(text);
    const publishedMonth = published ? MONTHS[fold(published[3]!)] : undefined;
    decrees.push({
      number,
      year: Number(head[4]),
      issuedOn: `${head[4]}-${month}-${head[2]!.padStart(2, "0")}`,
      subject: head[5]!.replace(/\s+/g, " ").trim(),
      ...(published && publishedMonth ? { gazetteNumber: published[1]!, gazetteOn: `${published[4]}-${publishedMonth}-${published[2]!.padStart(2, "0")}` } : {}),
      portalUrl: `http://legislatie.just.ro/Public/DetaliiDocument/${portalId}`,
      portalId,
      text: ""
    });
  });
  return { total, decrees };
}

export interface FetchDecreeMonthsResult {
  months: number;
  complete: number;
  incomplete: string[];
  requested: number;
  fetchedNow: number;
  stoppedBy?: string;
}

async function readMonth(cache: RawCache, year: number, month: number): Promise<{ total: number; unique: number }> {
  const seen = new Set<string>();
  let total = 0;
  for (let sizeCode = 5; sizeCode >= 1; sizeCode -= 1) {
    for (let page = 1; page <= 60; page += 1) {
      const saved = await cache.read("legislatie-decree-list", listKey(year, month, sizeCode, page));
      if (!saved) break;
      const parsed = parseDecreeList(saved.toString("utf8"));
      total = Math.max(total, parsed.total);
      for (const decree of parsed.decrees) seen.add(`${decree.year}-${decree.number}`);
    }
  }
  return { total, unique: seen.size };
}

/**
 * Saves every month's result pages (50 to a page) from `from` ("2014-01") to `to`, then, for a month whose decrees do not add up to the portal's count, the same month at 40, 30, 20 and 10 to a page
 * until they do. Each page is saved byte for byte; a saved page is not requested again. Without `live` nothing is requested.
 */
export async function fetchDecreeMonths(options: { repoRoot: string; live: boolean; from: string; to: string; limit: number; delayMs: number; log?: (line: string) => void }): Promise<FetchDecreeMonthsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 90_000, retries: 1 });
  const [fromYear, fromMonth] = options.from.split("-").map(Number) as [number, number];
  const [toYear, toMonth] = options.to.split("-").map(Number) as [number, number];
  const result: FetchDecreeMonthsResult = { months: 0, complete: 0, incomplete: [], requested: 0, fetchedNow: 0 };
  try {
    for (let year = fromYear, month = fromMonth; year < toYear || (year === toYear && month <= toMonth); month = month === 12 ? (year += 1, 1) : month + 1) {
      result.months += 1;
      for (let sizeCode = 5; sizeCode >= 1; sizeCode -= 1) {
        const perPage = sizeCode * 10;
        for (let page = 1; page <= 60; page += 1) {
          const key = listKey(year, month, sizeCode, page);
          let body = await cache.read("legislatie-decree-list", key);
          if (!body) {
            if (!options.live) break;
            const response = await fetcher.get(decreeListUrl(year, month, page, sizeCode));
            result.requested += 1;
            if (response.status !== 200) throw new Error(`The portal answered ${response.status} for ${key}`);
            await cache.write("legislatie-decree-list", key, response.body, { url: decreeListUrl(year, month, page, sizeCode), status: 200 });
            result.fetchedNow += 1;
            body = response.body;
          }
          const parsed = parseDecreeList(body.toString("utf8"));
          if (page * perPage >= parsed.total) break;
        }
        const check = await readMonth(cache, year, month);
        if (check.total > 0 && check.unique >= check.total) { result.complete += 1; break; }
        if (!options.live) break;
        if (sizeCode === 1) result.incomplete.push(`${year}-${String(month).padStart(2, "0")} (${check.unique} of ${check.total})`);
      }
      if (result.fetchedNow > 0 && result.fetchedNow % 25 === 0) options.log?.(`up to ${year}-${String(month).padStart(2, "0")} (${result.fetchedNow} pages saved)`);
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
