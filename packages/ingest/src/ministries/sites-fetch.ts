import path from "node:path";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

/**
 * D-056: the pages of the ministries' own sites that say who leads each ministry, and the Foreign Affairs list of missions, saved byte for byte under `data/coverage/raw/ministry-site`. The addresses are the ones each
 * site's own home page links (checked 17 October 2026, `lib/ministry-sites.ts` in the web app). One request at a time on a site, the sites one after the other with `delayMs` between requests (at least 6 seconds), and
 * mae.ro's own 10 seconds between two of its pages; a 403, a 429 or a page that is a security check stops the requests to that site and the run goes on with the others (nothing is bypassed). The Ministry of Justice
 * is not here: its site answers a program with a browser check. Without `live` nothing is requested; it only counts what is saved.
 */
export interface MinistryPage {
  slug: string;
  page: string;
  url: string;
}

export const MINISTRY_PAGES: MinistryPage[] = [
  { slug: "externe", page: "leadership", url: "https://mae.ro/node/1965" },
  { slug: "externe", page: "missions", url: "https://mae.ro/romanian-missions" },
  { slug: "interne", page: "leadership", url: "https://www.mai.gov.ro/category/conducere/" },
  { slug: "aparare", page: "leadership", url: "https://www.mapn.ro/conducere/index.php" },
  { slug: "cultura", page: "leadership", url: "https://www.cultura.ro/conducere/" },
  { slug: "dezvoltare", page: "leadership", url: "https://www.mdlpa.ro/pages/conducere" },
  { slug: "economie", page: "leadership", url: "https://economie.gov.ro/conducere/" },
  { slug: "educatie", page: "leadership", url: "https://edu.ro/echipa_conducere" },
  { slug: "finante", page: "leadership", url: "https://mfinante.gov.ro/ro/despre-minister/conducere" },
  { slug: "fonduri-europene", page: "leadership", url: "https://mfe.gov.ro/minister/conducere/" },
  { slug: "mediu", page: "leadership", url: "https://mmediu.ro/despre-noi/conducere/" },
  { slug: "sanatate", page: "leadership", url: "https://ms.ro/minister/conducere/" },
  { slug: "transporturi", page: "leadership", url: "https://mt.ro/despre-noi/conducere/minister" }
];

/** A site's own request to wait between two of its pages, where it states one (its robots.txt). */
const SITE_DELAY_MS: Record<string, number> = { "mae.ro": 10_000 };

export const pageKey = (page: MinistryPage) => `${page.slug}--${page.page}`;

export interface FetchMinistryPagesResult {
  pages: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: Array<{ key: string; error: string }>;
  /** The sites on which a block ended the requests, with the reason. */
  stopped: Array<{ site: string; reason: string }>;
}

export async function fetchMinistryPages(options: {
  repoRoot: string; live: boolean; limit: number; delayMs: number; refresh?: boolean; log?: (line: string) => void;
  pages?: MinistryPage[]; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}): Promise<FetchMinistryPagesResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const pages = options.pages ?? MINISTRY_PAGES;
  const result: FetchMinistryPagesResult = { pages: pages.length, cached: 0, fetchedNow: 0, remaining: 0, failed: [], stopped: [] };
  const todo: MinistryPage[] = [];
  for (const page of pages) {
    if (!options.refresh && (await cache.has("ministry-site", pageKey(page)))) result.cached += 1;
    else todo.push(page);
  }
  result.remaining = todo.length;
  if (!options.live) return result;

  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const fetchers = new Map<string, PoliteFetcher>();
  const stopped = new Set<string>();
  let requested = 0;
  for (const page of todo) {
    if (requested >= options.limit) break;
    const site = new URL(page.url).host;
    if (stopped.has(site)) continue;
    if (requested > 0) await sleep(Math.max(options.delayMs, 6000));
    let fetcher = fetchers.get(site);
    if (!fetcher) {
      fetcher = new PoliteFetcher({ maxRequests: 4, delayMs: Math.max(options.delayMs, SITE_DELAY_MS[site] ?? 0), timeoutMs: 45_000, retries: 0, sleep, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
      fetchers.set(site, fetcher);
    }
    requested += 1;
    try {
      const response = await fetcher.get(page.url);
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      await cache.write("ministry-site", pageKey(page), response.body, { url: page.url, status: 200 });
      result.fetchedNow += 1;
      result.remaining -= 1;
      options.log?.(`${pageKey(page)} saved (${response.body.byteLength} bytes)`);
    } catch (error) {
      if (error instanceof FetchStoppedError) {
        stopped.add(site);
        result.stopped.push({ site, reason: error.message });
        continue;
      }
      result.failed.push({ key: pageKey(page), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
