import { parseSenateDossier } from "../dossiers/senate-dossier";
import { parseDeputiesYearlyList, parseSenateYearlyList } from "../sync";
import { CDEP_BILLS_YEAR_URL, SENATE_BILLS_YEAR_URL } from "./fetch-bill-lists";
import { FetchStoppedError, type PoliteFetcher } from "./polite-fetcher";
import { decodeOfficialBytes, type RawCache, type RawCacheKind } from "./raw-cache";

export type DossierSource = "cdep" | "senate";

/** One bill page to fetch: the address the official yearly list gives, and the name it is saved under. */
export interface DossierItem {
  source: DossierSource;
  /** File name in the raw cache: `idp-22923` (Chamber) or `B542-2026` (Senate). */
  key: string;
  url: string;
  /** "PL-x 1/2026" or "B542/2026", as the list prints it. */
  officialId: string;
  year: number;
  /** Larger is newer inside one source and year (not comparable between sources); used to fetch the newest bills first. */
  rank: number;
}

const KIND: Record<DossierSource, RawCacheKind> = { cdep: "cdep-bill", senate: "senate-bill" };

/** What a real dossier page always contains; an answer without it (an error page, a form) is not saved. */
const PAGE_MARKER: Record<DossierSource, RegExp> = {
  cdep: /Urm[aă]rirea procesului legislativ/i,
  senate: /Derularea procedurii legislative/i
};

export function dossierKind(source: DossierSource): RawCacheKind {
  return KIND[source];
}

export function dossierPageIsReal(source: DossierSource, text: string): boolean {
  return PAGE_MARKER[source].test(text);
}

/** The bill pages named by the saved yearly lists of both chambers. Offline. */
export async function dossierItemsFromLists(cache: RawCache, years: number[], sources: DossierSource[]): Promise<{ items: DossierItem[]; missingLists: string[] }> {
  const items: DossierItem[] = [];
  const missingLists: string[] = [];
  for (const year of years) {
    if (sources.includes("cdep")) {
      const body = await cache.read("cdep-bills-year", String(year));
      if (!body) missingLists.push(`cdep ${year}`);
      else {
        for (const discovery of parseDeputiesYearlyList(decodeOfficialBytes(body), CDEP_BILLS_YEAR_URL(year)).discoveries) {
          const idp = discovery.sourceUrl.match(/[?&]idp=(\d+)/)?.[1];
          if (!idp || !discovery.officialId) continue;
          items.push({ source: "cdep", key: `idp-${idp}`, url: discovery.sourceUrl, officialId: discovery.officialId, year: Number(discovery.officialId.match(/\/(\d{4})$/)?.[1] ?? year), rank: Number(idp) });
        }
      }
    }
    if (sources.includes("senate")) {
      const body = await cache.read("senate-bills-year", String(year));
      if (!body) missingLists.push(`senate ${year}`);
      else {
        for (const discovery of parseSenateYearlyList(decodeOfficialBytes(body), SENATE_BILLS_YEAR_URL(year)).discoveries) {
          const id = discovery.officialId?.match(/^([A-Z]+)(\d+)\/(\d{4})$/i);
          if (!id) continue;
          items.push({ source: "senate", key: `${id[1]!.toUpperCase()}${id[2]}-${id[3]}`, url: discovery.sourceUrl, officialId: discovery.officialId!, year: Number(id[3]), rank: Number(id[2]) });
        }
      }
    }
  }
  const seen = new Set<string>();
  return { items: items.filter((item) => (seen.has(`${item.source}|${item.key}`) ? false : (seen.add(`${item.source}|${item.key}`), true))), missingLists };
}

/** "PL-x 56/2026", "Pl-x 56/2026" and "PLX56/2026" are one bill. */
export const chamberNumberKey = (value: string) => value.toLowerCase().replace(/pl-?x/, "plx").replace(/\s+/g, "");

/**
 * The Chamber bills whose Senate page we hold: a Senate page names the bill's Chamber number and prints the Chamber's steps too,
 * so the Chamber's own page adds only the exact initiator links and its summary. Offline.
 */
export async function chamberNumbersNamedBySenatePages(cache: RawCache): Promise<Set<string>> {
  const named = new Set<string>();
  for (const key of await cache.keys("senate-bill")) {
    const body = await cache.read("senate-bill", key);
    if (!body) continue;
    const registration = parseSenateDossier(decodeOfficialBytes(body), "").registrations.find((item) => item.body === "cdep");
    if (registration) named.add(chamberNumberKey(registration.number));
  }
  return named;
}

export interface DossierFetchPlan {
  /** Pages to request, newest first. */
  queue: DossierItem[];
  alreadySaved: number;
  /** Everything the lists name, per source. */
  listed: Record<DossierSource, number>;
}

export function planDossierFetch(input: { items: DossierItem[]; saved: Record<DossierSource, Set<string>>; limit?: number; only?: Set<string>; refresh?: boolean }): DossierFetchPlan {
  const listed: Record<DossierSource, number> = { cdep: 0, senate: 0 };
  for (const item of input.items) listed[item.source] += 1;
  const wanted = input.only ? input.items.filter((item) => input.only!.has(item.officialId.toLowerCase().replace(/\s+/g, "")) || input.only!.has(item.key.toLowerCase())) : input.items;
  const open = input.refresh ? wanted : wanted.filter((item) => !input.saved[item.source].has(item.key));
  const queue = [...open].sort((a, b) => b.year - a.year || a.source.localeCompare(b.source) || b.rank - a.rank);
  return { queue: input.limit === undefined ? queue : queue.slice(0, input.limit), alreadySaved: wanted.length - open.length, listed };
}

export interface DossierFetchOptions {
  cache: RawCache;
  fetcher: PoliteFetcher;
  years: number[];
  sources: DossierSource[];
  limit?: number;
  /** Official numbers or cache keys ("PL-x 56/2026", "L316/2025", "idp-22923") to fetch regardless of what is saved. */
  only?: string[];
  /** Fetch again pages that are already saved (the dossier of a bill still in progress changes). */
  refresh?: boolean;
  /** Skip the Chamber pages of bills whose Senate page is saved (see `chamberNumbersNamedBySenatePages`). */
  uncoveredOnly?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface DossierFetchResult {
  listed: Record<DossierSource, number>;
  alreadySaved: number;
  planned: number;
  requested: number;
  saved: number;
  failures: Array<{ key: string; error: string }>;
  missingLists: string[];
  /** Set when the run ended early; what was saved is kept and the next run resumes. */
  stopped?: string;
  /** Why: the request budget of this run was spent (normal: run again), the source pushed back or answered with a captcha (stop and wait), or failures piled up. */
  stoppedReason?: "budget" | "blocked" | "failures";
}

/** One request per bill dossier, saved raw before any reading. Resumable: saved pages are skipped. Newest bills first. */
export async function fetchBillDossiers(options: DossierFetchOptions): Promise<DossierFetchResult> {
  const { cache, fetcher } = options;
  const log = options.log ?? (() => {});
  const listed = await dossierItemsFromLists(cache, options.years, options.sources);
  const missingLists = listed.missingLists;
  const covered = options.uncoveredOnly ? await chamberNumbersNamedBySenatePages(cache) : undefined;
  const items = covered ? listed.items.filter((item) => item.source !== "cdep" || !covered.has(chamberNumberKey(item.officialId))) : listed.items;
  const saved: Record<DossierSource, Set<string>> = { cdep: new Set(await cache.keys("cdep-bill")), senate: new Set(await cache.keys("senate-bill")) };
  const only = options.only?.length ? new Set(options.only.map((value) => value.toLowerCase().replace(/\s+/g, ""))) : undefined;
  const plan = planDossierFetch({ items, saved, limit: options.limit, only, refresh: options.refresh });
  const result: DossierFetchResult = { listed: plan.listed, alreadySaved: plan.alreadySaved, planned: plan.queue.length, requested: 0, saved: 0, failures: [], missingLists };
  if (options.dryRun) return result;
  try {
    for (const item of plan.queue) {
      try {
        const response = await fetcher.get(item.url);
        result.requested += 1;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (!dossierPageIsReal(item.source, decodeOfficialBytes(response.body, response.contentType))) throw new Error("the answer is not a bill dossier page");
        await cache.write(KIND[item.source], item.key, response.body, { url: item.url, status: response.status });
        result.saved += 1;
        if (result.saved % 25 === 0) log(`${result.saved} of ${plan.queue.length} saved (newest was ${item.officialId})`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failures.push({ key: `${item.source} ${item.officialId}`, error: error instanceof Error ? error.message : String(error) });
        log(`${item.source} ${item.officialId}: FAILED ${result.failures.at(-1)!.error}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
    result.stoppedReason = error.reason;
  }
  return result;
}
