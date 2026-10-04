import path from "node:path";
import { fetchCdepLists, type ListFetchResult } from "./fetch-cdep-lists";
import { fetchSenateLists } from "./fetch-senate-lists";
import { PoliteFetcher } from "./polite-fetcher";
import { RawCache } from "./raw-cache";

export interface CoverageFetchOptions {
  repoRoot: string;
  from: string;
  to: string;
  sources: Array<"cdep" | "senate">;
  /** Without this the command only prints what it would request. */
  live: boolean;
  maxRequests: number;
  delayMs: number;
  refreshSince?: string;
  allDays?: boolean;
  log?: (line: string) => void;
}

export const COVERAGE_RAW_DIR = (repoRoot: string) => path.join(repoRoot, "data", "coverage", "raw");

export async function runCoverageFetch(options: CoverageFetchOptions): Promise<Record<string, ListFetchResult & { source: string }>> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs });
  const results: Record<string, ListFetchResult & { source: string }> = {};
  for (const source of options.sources) {
    const common = { from: options.from, to: options.to, cache, fetcher, refreshSince: options.refreshSince, dryRun: !options.live, log: options.log };
    const result = source === "cdep" ? await fetchCdepLists({ ...common, allDays: options.allDays }) : await fetchSenateLists({ ...common, allDays: options.allDays });
    results[source] = { source, ...result };
    if (result.stopped) break;
  }
  return results;
}
