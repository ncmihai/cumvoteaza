import path from "node:path";
import { PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";
import { ELECTION_SOURCES } from "./sources";

export interface FetchElectionFilesResult {
  files: number;
  cached: number;
  fetchedNow: number;
  failed: string[];
}

/** Saves each election file that is not saved yet, one at a time, 3 s apart. Without `live` nothing is requested. */
export async function fetchElectionFiles(options: { repoRoot: string; live: boolean; log?: (line: string) => void }): Promise<FetchElectionFilesResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const fetcher = new PoliteFetcher({ maxRequests: 40, delayMs: 3000, timeoutMs: 180_000, retries: 1 });
  const result: FetchElectionFilesResult = { files: 0, cached: 0, fetchedNow: 0, failed: [] };
  for (const election of ELECTION_SOURCES) {
    for (const file of election.files) {
      result.files += 1;
      if (await cache.has(file.kind, file.key)) {
        result.cached += 1;
        continue;
      }
      if (!options.live) continue;
      try {
        const response = await fetcher.get(file.url);
        if (response.status !== 200 || response.body.byteLength < 200) throw new Error(`HTTP ${response.status}, ${response.body.byteLength} bytes`);
        await cache.write(file.kind, file.key, response.body, { url: file.url, status: 200 });
        result.fetchedNow += 1;
        options.log?.(`${file.key}: ${Math.round(response.body.byteLength / 1024)} KB`);
      } catch (error) {
        result.failed.push(`${file.key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return result;
}
