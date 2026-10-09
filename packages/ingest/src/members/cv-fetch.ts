import path from "node:path";
import { PoliteFetcher, FetchStoppedError } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { readProfilePages } from "./profile-facts";

/**
 * Sprint 13b (D-036): the Curriculum Vitae page a member files with the Chamber (`structura.mp?...&pag=0`). The profile pages already saved say which members link one
 * (260 of the 336 deputies of 2024, 20 of the 137 senators), so only those pages are requested: one at a time, `delayMs` apart, each saved byte for byte before it is read.
 */
export const cvKey = (profileKey: string) => profileKey.replace(/:/g, "-");

export interface CvTarget {
  profileKey: string;
  profileUrl: string;
  cvUrl: string;
}

export async function cvTargets(repoRoot: string, legislature = "2024"): Promise<CvTarget[]> {
  const pages = await readProfilePages(repoRoot, legislature);
  return pages.filter((page) => page.cvUrl).map((page) => ({ profileKey: page.profileKey, profileUrl: page.url, cvUrl: page.cvUrl! })).sort((a, b) => a.profileKey.localeCompare(b.profileKey, "en", { numeric: true }));
}

export interface FetchCvResult {
  targets: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: Array<{ key: string; error: string }>;
  stoppedBy?: string;
}

/** Without `live` nothing is requested; it only counts what is saved. */
export async function fetchCvPages(options: { repoRoot: string; live: boolean; limit: number; delayMs: number; log?: (line: string) => void }): Promise<FetchCvResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const targets = await cvTargets(options.repoRoot);
  const result: FetchCvResult = { targets: targets.length, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const todo: CvTarget[] = [];
  for (const target of targets) {
    if (await cache.has("member-cv", cvKey(target.profileKey))) result.cached += 1;
    else todo.push(target);
  }
  result.remaining = todo.length;
  if (!options.live) return result;
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 45_000, retries: 1 });
  try {
    for (const target of todo.slice(0, options.limit)) {
      try {
        const response = await fetcher.get(target.cvUrl);
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const html = decodeOfficialBytes(response.body, response.contentType);
        if (!/Curriculum Vitae/i.test(html)) throw new Error("the page is not a CV page");
        await cache.write("member-cv", cvKey(target.profileKey), response.body, { url: target.cvUrl, status: 200 });
        result.fetchedNow += 1;
        result.remaining -= 1;
        if (result.fetchedNow % 25 === 0) options.log?.(`${result.fetchedNow} CV pages saved`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push({ key: target.profileKey, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
