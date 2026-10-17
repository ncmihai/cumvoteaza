import path from "node:path";
import { PoliteFetcher, FetchStoppedError } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";

/**
 * D-052: "Sancțiuni aplicate deputaților", the Chamber's own list of disciplinary sanctions: one page per legislature, three requests in all. Each is saved byte for byte before it is read.
 * The Senate's page of the same address is empty (checked 15 Oct 2026).
 */
export const SANCTION_LEGISLATURES = ["2024", "2020", "2016"] as const;
export const sanctionsUrl = (legislature: string) => `https://www.cdep.ro/ords/pls/parlam/sanctiuni_parlam.lista_sanctionati?leg=${legislature}&cam=2`;
export const sanctionsKey = (legislature: string) => `leg-${legislature}`;

export interface FetchSanctionsResult {
  targets: number;
  cached: number;
  fetchedNow: number;
  failed: Array<{ key: string; error: string }>;
  stoppedBy?: string;
}

/** Without `live` nothing is requested; it only counts what is saved. `refresh` requests pages again even when saved (the newest legislature changes). */
export async function fetchSanctionPages(options: { repoRoot: string; live: boolean; refresh: boolean; delayMs: number; log?: (line: string) => void }): Promise<FetchSanctionsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchSanctionsResult = { targets: SANCTION_LEGISLATURES.length, cached: 0, fetchedNow: 0, failed: [] };
  const todo: string[] = [];
  for (const legislature of SANCTION_LEGISLATURES) {
    if (!options.refresh && (await cache.has("member-sanctions", sanctionsKey(legislature)))) result.cached += 1;
    else todo.push(legislature);
  }
  if (!options.live) return result;
  const fetcher = new PoliteFetcher({ maxRequests: SANCTION_LEGISLATURES.length, delayMs: options.delayMs, timeoutMs: 45_000, retries: 1 });
  try {
    for (const legislature of todo) {
      try {
        const response = await fetcher.get(sanctionsUrl(legislature));
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const html = decodeOfficialBytes(response.body, response.contentType);
        if (!/Sanc[tţț]iuni/i.test(html)) throw new Error("the page is not the sanctions list");
        await cache.write("member-sanctions", sanctionsKey(legislature), response.body, { url: sanctionsUrl(legislature), status: 200 });
        result.fetchedNow += 1;
        options.log?.(`saved ${sanctionsKey(legislature)}`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push({ key: sanctionsKey(legislature), error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
