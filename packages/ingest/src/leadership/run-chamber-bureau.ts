import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { COVERAGE_RAW_DIR } from "../coverage/run-fetch";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { persistLeadershipRoles } from "../persist";
import { snapshotFor } from "../parsers/utils";
import { bureauRoles } from "./bureau-roles";
import { parseChamberBureauPage, type BureauPeriod } from "./chamber-bureau";

const BASE = "https://www.cdep.ro/ords/pls/parlam/structura2015.bp";
export const BUREAU_PARSER = "cdep-bureau";
const INDEX_URL = `${BASE}?poz=0&cam=2&idl=1`;
const periodUrl = (session: number) => `${BASE}?ses=${session}&cam=2&leg=2024&idl=1&poz=0`;
const LEGISLATURE_2024 = { startsOn: "2024-12-21" };

/** The sessions the index page links ("sep 2026 - prezent", ..., "dec 2024 - feb 2025"). */
export function bureauSessionsFromIndex(html: string): number[] {
  return [...new Set([...html.matchAll(/structura2015\.bp\?ses=(\d+)&cam=2&leg=2024/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

export interface BureauFetchResult {
  sessions: number[];
  requested: number;
  cached: number;
  failures: Array<{ key: string; error: string }>;
  stopped?: string;
}

/** Fetches the index and one page per period (the newest is always refreshed: its members can change). Resumable. */
export async function fetchChamberBureau(options: { repoRoot: string; live: boolean; delayMs: number; maxRequests: number; log?: (line: string) => void }): Promise<BureauFetchResult> {
  const log = options.log ?? (() => {});
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs });
  const result: BureauFetchResult = { sessions: [], requested: 0, cached: 0, failures: [] };
  const get = async (url: string, key: string, refresh: boolean) => {
    const saved = refresh ? undefined : await cache.read("bureau-page", key);
    if (saved) {
      result.cached += 1;
      return saved;
    }
    if (!options.live) return undefined;
    const response = await fetcher.get(url);
    result.requested += 1;
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    await cache.write("bureau-page", key, response.body, { url, status: response.status });
    return response.body;
  };
  try {
    const index = await get(INDEX_URL, "cam2-index", true);
    if (!index) return result;
    result.sessions = bureauSessionsFromIndex(decodeOfficialBytes(index));
    const newest = result.sessions.at(-1);
    for (const session of result.sessions) {
      try {
        const body = await get(periodUrl(session), `cam2-leg2024-ses${session}`, session === newest);
        if (body) parseChamberBureauPage(decodeOfficialBytes(body), periodUrl(session));
        log(`bureau session ${session}: ok`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failures.push({ key: `session ${session}`, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }
  return result;
}

export interface BureauImportResult {
  persisted: boolean;
  periods: Array<{ label: string; seats: number }>;
  roles: number;
  unresolved: Array<{ idm: string; name: string; position: string }>;
  current: Array<{ position: string; name: string; since: string }>;
}

/** Offline: the saved period pages become dated roles. Members are found by CDEP's own number; nobody is matched by name. */
export async function importChamberBureau(options: { repoRoot: string; persist: boolean }): Promise<BureauImportResult> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const periods: BureauPeriod[] = [];
  const snapshots = new Map<number, ReturnType<typeof snapshotFor>>();
  for (const key of await cache.keys("bureau-page")) {
    const session = Number(key.match(/^cam2-leg2024-ses(\d+)$/)?.[1]);
    if (!session) continue;
    const html = decodeOfficialBytes((await cache.read("bureau-page", key))!);
    periods.push(parseChamberBureauPage(html, periodUrl(session)));
    snapshots.set(periods.length - 1, snapshotFor(BUREAU_PARSER, periodUrl(session), html, "parsed"));
  }
  if (periods.length === 0) throw new Error("No saved bureau pages: run leadership:bureau:fetch --live first.");

  const session = createDbSession();
  let known: Set<string>;
  try {
    known = new Set([...(await session.db.execute<{ id: string }>(sql`select id from members where id like 'member-deputies-%'`))].map((row) => row.id));
  } finally {
    await session.close();
  }
  const snapshotByPeriod = new Map(periods.map((period, index) => [period, snapshots.get(index)!]));
  const { roles, unresolved: notFound } = bureauRoles({
    periods,
    legislature: LEGISLATURE_2024,
    memberIdForIdm: (idm) => (known.has(`member-deputies-${idm}`) ? `member-deputies-${idm}` : undefined),
    sourceSnapshotId: (period) => snapshotByPeriod.get(period)?.id
  });
  // A role points at the newest page that lists the person, which is the snapshot whose parser run replaces it.
  if (options.persist) await persistLeadershipRoles({ kind: "bureau", chamber: "deputies", parsers: [BUREAU_PARSER], snapshots: [...snapshots.values()], roles });
  return {
    persisted: options.persist,
    periods: periods.map((period) => ({ label: period.label, seats: period.seats.length })),
    roles: roles.length,
    unresolved: notFound,
    current: roles.filter((role) => !role.endsOn).map((role) => ({ position: role.title, name: role.memberId, since: role.startsOn }))
  };
}
