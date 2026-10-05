import { sql } from "drizzle-orm";
import type { MemberRole } from "@cumsevoteaza/parliament-model";
import { createDbSession } from "@cumsevoteaza/db";
import { COVERAGE_RAW_DIR } from "../coverage/run-fetch";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { persistLeadershipRoles, persistOfficialActivity, type OfficialActivityRow } from "../persist";
import { slugify, snapshotFor } from "../parsers/utils";
import { parseSenateCard, type SenateBureauPosition } from "./senate-card";

export const SENATE_CARD_PARSER = "senate-card";
export const cardUrl = (guid: string) => `https://www.senat.ro/FisaSenator.aspx?ParlamentarID=${guid}`;

interface Senator {
  memberId: string;
  guid: string;
  displayName: string;
}

async function senatorsOfCurrentLegislature(): Promise<{ legislatureId: string; senators: Senator[] }> {
  const session = createDbSession();
  try {
    const legislature = [...(await session.db.execute<{ id: string }>(sql`select id from legislatures order by starts_on desc limit 1`))][0]!.id;
    const rows = await session.db.execute<{ id: string; guid: string; display_name: string }>(sql`
      select m.id, m.source_ids->>'senatRoGuid' as guid, m.display_name
      from members m join member_mandates mm on mm.member_id = m.id
      where mm.chamber = 'senate' and mm.legislature_id = ${legislature} and m.source_ids ? 'senatRoGuid'
      order by m.display_name`);
    return { legislatureId: legislature, senators: [...rows].map((row) => ({ memberId: row.id, guid: row.guid.toLowerCase(), displayName: row.display_name })) };
  } finally {
    await session.close();
  }
}

export interface CardFetchResult {
  senators: number;
  requested: number;
  cached: number;
  failures: Array<{ key: string; error: string }>;
  stopped?: string;
}

/** One request per senator, saved raw before parsing; resumable. Without `live` it only counts what is saved. */
export async function fetchSenateCards(options: { repoRoot: string; live: boolean; delayMs: number; maxRequests: number; refresh?: boolean; log?: (line: string) => void }): Promise<CardFetchResult> {
  const log = options.log ?? (() => {});
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs });
  const { senators } = await senatorsOfCurrentLegislature();
  const result: CardFetchResult = { senators: senators.length, requested: 0, cached: 0, failures: [] };
  try {
    for (const senator of senators) {
      if (!options.refresh && (await cache.has("senate-card", senator.guid))) {
        result.cached += 1;
        continue;
      }
      if (!options.live) continue;
      try {
        const response = await fetcher.get(cardUrl(senator.guid));
        result.requested += 1;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const parsed = parseSenateCard(decodeOfficialBytes(response.body, response.contentType));
        if (parsed.metrics.length === 0) throw new Error("the page has no activity counts (not a senator card?)");
        await cache.write("senate-card", senator.guid, response.body, { url: cardUrl(senator.guid), status: 200 });
        log(`card ${senator.displayName}: ${parsed.metrics.length} counts, ${parsed.bureau.length} bureau stretches`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failures.push({ key: senator.displayName, error: error instanceof Error ? error.message : String(error) });
        log(`card ${senator.displayName}: FAILED ${result.failures.at(-1)!.error}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }
  return result;
}

const TITLES: Record<SenateBureauPosition, string> = {
  "Președinte": "Președinte al Senatului",
  "Vicepreședinte": "Vicepreședinte al Senatului",
  "Secretar": "Secretar al Biroului permanent",
  "Chestor": "Chestor al Biroului permanent"
};

export interface CardImportResult {
  persisted: boolean;
  cardsRead: number;
  missingCards: number;
  activityRows: number;
  bureauRoles: number;
  currentBureau: Array<{ name: string; position: string; since: string }>;
  asOf: { oldest?: string; newest?: string };
}

/** Offline: saved cards become official counts and dated Permanent Bureau roles of the Senate. */
export async function importSenateCards(options: { repoRoot: string; persist: boolean }): Promise<CardImportResult> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const { legislatureId, senators } = await senatorsOfCurrentLegislature();
  const activity: OfficialActivityRow[] = [];
  const roles: MemberRole[] = [];
  const snapshots = [];
  const current: CardImportResult["currentBureau"] = [];
  const dates: string[] = [];
  let read = 0;
  for (const senator of senators) {
    const body = await cache.read("senate-card", senator.guid);
    if (!body) continue;
    read += 1;
    const html = decodeOfficialBytes(body);
    const url = cardUrl(senator.guid);
    const entry = await cache.lastEntry("senate-card", senator.guid);
    const asOf = (entry?.fetchedAt ?? new Date().toISOString()).slice(0, 10);
    dates.push(asOf);
    const snapshot = snapshotFor(SENATE_CARD_PARSER, url, html, "parsed");
    snapshots.push(snapshot);
    const parsed = parseSenateCard(html);
    for (const metric of parsed.metrics) {
      activity.push({ id: `activity-${senator.memberId}-${legislatureId}-${metric.metric}`, memberId: senator.memberId, legislatureId, chamber: "senate", metric: metric.metric, value: metric.value, outOf: metric.outOf, detail: metric.detail, asOf, sourceUrl: url, sourceSnapshotId: snapshot.id });
    }
    for (const stretch of parsed.bureau) {
      roles.push({ id: `role-bureau-${senator.memberId}-${slugify(stretch.position)}-${stretch.since}`, memberId: senator.memberId, title: TITLES[stretch.position], chamber: "senate", kind: "bureau", startsOn: stretch.since, endsOn: stretch.until, sourceSnapshotId: snapshot.id });
      if (!stretch.until) current.push({ name: senator.displayName, position: TITLES[stretch.position], since: stretch.since });
    }
  }
  if (options.persist && read > 0) {
    await persistOfficialActivity(activity, snapshots);
    await persistLeadershipRoles({ kind: "bureau", chamber: "senate", parsers: [SENATE_CARD_PARSER], snapshots: [], roles });
  }
  dates.sort();
  return { persisted: options.persist, cardsRead: read, missingCards: senators.length - read, activityRows: activity.length, bureauRoles: roles.length, currentBureau: current, asOf: { oldest: dates[0], newest: dates.at(-1) } };
}
