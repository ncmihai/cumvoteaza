import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import type { DbClient } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import {
  type Bill,
  type ChamberId,
  type Legislature,
  type MemberGroupMembership,
  type MemberMandate,
  type ParliamentaryGroup,
  type SourceSnapshot,
  type Vote,
  type VoteChamber
} from "@cumsevoteaza/parliament-model";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";
import { dataUnavailable, requireDatabase } from "./data-availability";

export type SourceStatusFilter = "parsed" | "partial" | "failed";

export interface ExplorerFilters {
  year?: string;
  month?: string;
  chamber?: VoteChamber;
  sourceStatus?: SourceStatusFilter;
  q?: string;
  group?: string;
  legislature?: string;
}

export interface ExplorerQuery {
  limit?: number;
  cursor?: string;
  filters?: ExplorerFilters;
}

export interface VoteExplorerItem {
  vote: Vote;
  bill?: Bill;
  source?: SourceSnapshot;
  hotCount: number;
  groupBreakdown: VotePreviewGroup[];
}

export interface VotePreviewGroup {
  groupId: string;
  shortName: string;
  name: string;
  color: string;
  /** The party's own short name and logo where the group belongs to one party that owns an image (D-029). */
  partyShortName?: string;
  logoAssetId?: string;
  for: number;
  against: number;
  abstention: number;
  presentNotVoting: number;
}

export interface BillExplorerItem {
  bill: Bill;
  submittedOn?: string;
  latestEventOn?: string;
  source?: SourceSnapshot;
  voteCount: number;
  hotCount: number;
}

export interface ExplorerPageData<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  sourceKind: "database";
}

export interface DirectoryFilterOptions {
  groups: ParliamentaryGroup[];
  legislatures: Legislature[];
}

export interface HomeDashboardData {
  latestVotes: VoteExplorerItem[];
  latestBills: BillExplorerItem[];
  mostViewed: DashboardItem[];
  mostSearchedMembers: DashboardItem[];
  trendingVotes: DashboardItem[];
  trendingBills: DashboardItem[];
  sourceKind: "database";
}

export interface DashboardItem {
  entityType: "member" | "bill" | "vote" | "party" | "search";
  entityId?: string;
  title: string;
  href?: string;
  count: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export function parseExplorerFilters(input: Record<string, string | string[] | undefined>): ExplorerFilters {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const year = first(input.year)?.match(/^\d{4}$/)?.[0];
  const monthValue = first(input.month);
  const monthNumber = monthValue ? Number(monthValue) : undefined;
  const chamber = first(input.chamber);
  const sourceStatus = first(input.sourceStatus);
  const q = first(input.q)?.trim();
  const group = first(input.group)?.trim();
  const legislature = first(input.legislature)?.trim();

  return {
    ...(year ? { year } : {}),
    ...(monthNumber && monthNumber >= 1 && monthNumber <= 12 ? { month: String(monthNumber) } : {}),
    ...(chamber === "senate" || chamber === "deputies" || chamber === "joint" ? { chamber } : {}),
    ...(sourceStatus === "parsed" || sourceStatus === "partial" || sourceStatus === "failed" ? { sourceStatus } : {}),
    ...(q ? { q } : {}),
    ...(group ? { group } : {}),
    ...(legislature ? { legislature } : {})
  };
}

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor?: string): { date: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { date?: string; id?: string };
    return parsed.date && parsed.id ? { date: parsed.date, id: parsed.id } : undefined;
  } catch {
    return undefined;
  }
}

const getCachedDirectoryFilterOptions = unstable_cache(
  async (filters: Pick<ExplorerFilters, "chamber" | "legislature"> = {}) =>
    timed("explorer.filter-options", () => getDirectoryFilterOptionsUncached(filters)),
  ["directory-filter-options-integrity-v2"],
  { revalidate: 600, tags: [CACHE_TAGS.members, CACHE_TAGS.search] }
);

const getCachedVoteExplorerData = unstable_cache(
  async (query: ExplorerQuery = {}) => timed("explorer.votes", () => getVoteExplorerDataUncached(query)),
  ["vote-explorer-data-integrity-v3"],
  { revalidate: 600, tags: [CACHE_TAGS.votes] }
);

const getCachedBillExplorerData = unstable_cache(
  async (query: ExplorerQuery = {}) => timed("explorer.bills", () => getBillExplorerDataUncached(query)),
  ["bill-explorer-data-integrity-v2"],
  { revalidate: 600, tags: [CACHE_TAGS.bills] }
);

const getCachedHomeDashboardData = unstable_cache(
  async (locale: string) => timed(`explorer.home.${locale}`, () => getHomeDashboardDataUncached(locale)),
  ["home-dashboard-data"],
  { revalidate: 300, tags: [CACHE_TAGS.home, CACHE_TAGS.votes, CACHE_TAGS.bills, CACHE_TAGS.members, CACHE_TAGS.parties] }
);

export async function getDirectoryFilterOptions(filters: Pick<ExplorerFilters, "chamber" | "legislature"> = {}): Promise<DirectoryFilterOptions> {
  return getCachedDirectoryFilterOptions(filters);
}

async function getDirectoryFilterOptionsUncached(filters: Pick<ExplorerFilters, "chamber" | "legislature"> = {}): Promise<DirectoryFilterOptions> {
  requireDatabase();
  const session = createWebDbSession();
  try {
    const [groupRows, legislatureRows] = await Promise.all([
      session.db.execute<GroupRow>(groupOptionsSql(filters)),
      session.db.execute<LegislatureRow>(sql`
        select id, label, starts_on, ends_on
        from legislatures
        order by starts_on desc
      `)
    ]);
    const legislatures = legislatureRows.map(mapLegislatureRow);
    const groups = groupRows.map(mapGroupRow);
    return {
      groups,
      legislatures
    };
  } catch {
    return dataUnavailable();
  } finally {
    await session.close();
  }
}

export async function getVoteExplorerData(query: ExplorerQuery = {}): Promise<ExplorerPageData<VoteExplorerItem>> {
  return getCachedVoteExplorerData(query);
}

async function getVoteExplorerDataUncached(query: ExplorerQuery = {}): Promise<ExplorerPageData<VoteExplorerItem>> {
  requireDatabase();
  const limit = normalizedLimit(query.limit);

  const session = createWebDbSession();
  try {
    const filters = query.filters ?? {};
    const cursor = decodeCursor(query.cursor);
    const conditions = voteConditions(filters, cursor);
    const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
    const rows = await session.db.execute<VoteDirectoryRow>(sql`
      select
        v.id as vote_id,
        v.bill_id as vote_bill_id,
        v.chamber as vote_chamber,
        v.title as vote_title,
        v.held_on as vote_held_on,
        v.vote_type as vote_type,
        v.present as vote_present,
        v.for_count as vote_for_count,
        v.against as vote_against,
        v.abstention as vote_abstention,
        v.present_not_voting as vote_present_not_voting,
        v.absent as vote_absent,
        v.source_snapshot_id as vote_source_snapshot_id,
        b.id as bill_id,
        b.slug as bill_slug,
        b.title as bill_title,
        b.identifiers as bill_identifiers,
        b.chamber_of_origin as bill_chamber_of_origin,
        b.status as bill_status,
        b.law_type as bill_law_type,
        b.source_snapshot_ids as bill_source_snapshot_ids,
        ss.id as source_id,
        ss.source_url as source_url,
        ss.fetched_at as source_fetched_at,
        ss.content_hash as source_content_hash,
        ss.parser as source_parser,
        ss.parser_version as source_parser_version,
        ss.status as source_status,
        ss.notes as source_notes,
        coalesce(h.hot_count, 0)::int as hot_count,
        coalesce((
          select json_agg(json_build_object(
            'groupId', pg.id,
            'shortName', pg.short_name,
            'name', pg.name,
            'color', pg.color,
            'partyShortName', (select p.short_name from parties p where p.id = pg.party_id),
            'logoAssetId', (select p.logo_asset_id from parties p where p.id = pg.party_id),
            'for', grouped.for_count,
            'against', grouped.against,
            'abstention', grouped.abstention,
            'presentNotVoting', grouped.present_not_voting
          ) order by (grouped.for_count + grouped.against + grouped.abstention + grouped.present_not_voting) desc)
          from (
            select gvt.group_id, gvt.for_count, gvt.against, gvt.abstention, gvt.present_not_voting
            from group_vote_totals gvt
            where gvt.vote_id = v.id
            union all
            select coalesce(iv.group_id, membership.group_id) as group_id,
              count(*) filter (where iv.choice = 'for')::int,
              count(*) filter (where iv.choice = 'against')::int,
              count(*) filter (where iv.choice = 'abstention')::int,
              count(*) filter (where iv.choice = 'present_not_voting')::int
            from individual_votes iv
            left join lateral (
              select mgm.group_id
              from member_group_memberships mgm
              where mgm.member_id = iv.member_id
                and mgm.starts_on <= v.held_on
                and (mgm.ends_on is null or mgm.ends_on >= v.held_on)
              order by mgm.starts_on desc
              limit 1
            ) membership on true
            where iv.vote_id = v.id
              and coalesce(iv.group_id, membership.group_id) is not null
              and not exists (select 1 from group_vote_totals existing where existing.vote_id = v.id)
            group by coalesce(iv.group_id, membership.group_id)
          ) grouped
          join parliamentary_groups pg on pg.id = grouped.group_id
        ), '[]'::json) as group_breakdown
      from votes v
      left join bills b on b.id = v.bill_id
      left join source_snapshots ss on ss.id = v.source_snapshot_id
      left join (
        select entity_id, count(*)::int as hot_count
        from content_reactions
        where entity_type = 'vote' and reaction = 'hot'
        group by entity_id
      ) h on h.entity_id = v.id
      ${where}
      order by v.held_on desc, v.id desc
      limit ${limit + 1}
    `);

    const visible = rows.slice(0, limit).map(mapVoteDirectoryRow);
    const last = visible.at(-1);
    return {
      items: visible,
      nextCursor: rows.length > limit && last ? encodeCursor(last.vote.heldOn, last.vote.id) : undefined,
      hasMore: rows.length > limit,
      sourceKind: "database"
    };
  } catch {
    return dataUnavailable();
  } finally {
    await session.close();
  }
}

export async function getBillExplorerData(query: ExplorerQuery = {}): Promise<ExplorerPageData<BillExplorerItem>> {
  return getCachedBillExplorerData(query);
}

async function getBillExplorerDataUncached(query: ExplorerQuery = {}): Promise<ExplorerPageData<BillExplorerItem>> {
  requireDatabase();
  const limit = normalizedLimit(query.limit);

  const session = createWebDbSession();
  try {
    const filters = query.filters ?? {};
    const cursor = decodeCursor(query.cursor);
    const conditions = billConditions(filters, cursor);
    const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
    const rows = await session.db.execute<BillDirectoryRow>(sql`
      with hot_counts as (
        select entity_id, count(*)::int as hot_count
        from content_reactions
        where entity_type = 'bill' and reaction = 'hot'
        group by entity_id
      )
      select
        b.id as bill_id,
        b.slug as bill_slug,
        b.title as bill_title,
        b.identifiers as bill_identifiers,
        b.chamber_of_origin as bill_chamber_of_origin,
        b.status as bill_status,
        b.source_snapshot_ids as bill_source_snapshot_ids,
        bvs.submitted_on as submitted_on,
        bvs.latest_event_on as latest_event_on,
        coalesce(bvs.vote_count, 0)::int as vote_count,
        coalesce(hc.hot_count, 0)::int as hot_count,
        ss.id as source_id,
        ss.source_url as source_url,
        ss.fetched_at as source_fetched_at,
        ss.content_hash as source_content_hash,
        ss.parser as source_parser,
        ss.parser_version as source_parser_version,
        ss.status as source_status,
        ss.notes as source_notes
      from bills b
      left join bill_vote_summaries bvs on bvs.bill_id = b.id
      left join hot_counts hc on hc.entity_id = b.id
      left join source_snapshots ss on ss.id = b.source_snapshot_ids->>0
      ${where}
      order by coalesce(bvs.submitted_on, bvs.latest_event_on, date '0001-01-01') desc, b.id desc
      limit ${limit + 1}
    `);

    const visible = rows.slice(0, limit).map(mapBillDirectoryRow);
    const last = visible.at(-1);
    const cursorDate = last?.submittedOn ?? last?.latestEventOn;
    return {
      items: visible,
      nextCursor: rows.length > limit && last && cursorDate ? encodeCursor(cursorDate, last.bill.id) : undefined,
      hasMore: rows.length > limit,
      sourceKind: "database"
    };
  } catch {
    return dataUnavailable();
  } finally {
    await session.close();
  }
}

export async function getHotCount(entityType: "bill" | "vote", entityId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;

  const session = createWebDbSession();
  try {
    const rows = await session.db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from content_reactions
      where entity_type = ${entityType} and entity_id = ${entityId} and reaction = 'hot'
    `);
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  } finally {
    await session.close();
  }
}

export async function getHomeDashboardData(locale: string): Promise<HomeDashboardData> {
  return getCachedHomeDashboardData(locale);
}

async function getHomeDashboardDataUncached(locale: string): Promise<HomeDashboardData> {
  const [votes, bills] = await Promise.all([
    getVoteExplorerData({ limit: 5 }),
    getBillExplorerData({ limit: 5 })
  ]);

  if (!process.env.DATABASE_URL) {
    return {
      latestVotes: votes.items,
      latestBills: bills.items,
      mostViewed: [],
      mostSearchedMembers: [],
      trendingVotes: [],
      trendingBills: [],
      sourceKind: "database"
    };
  }

  const session = createWebDbSession();
  try {
    const [viewRows, searchRows, hotVoteRows, hotBillRows] = await Promise.all([
      session.db.execute<AggregateRow>(sql`
        select entity_type, entity_id, count(*)::int as count
        from engagement_events
        where event_type = 'page_view' and occurred_at >= date_trunc('month', now()) and entity_id is not null
        group by entity_type, entity_id
        order by count(*) desc
        limit 5
      `).catch(() => []),
      session.db.execute<AggregateRow>(sql`
        select 'member' as entity_type, query_text as entity_id, count(*)::int as count
        from engagement_events
        where event_type = 'search' and entity_type = 'member' and occurred_at >= date_trunc('month', now()) and query_text is not null
        group by query_text
        order by count(*) desc
        limit 5
      `).catch(() => []),
      session.db.execute<AggregateRow>(sql`
        select 'vote' as entity_type, entity_id, count(*)::int as count
        from content_reactions
        where entity_type = 'vote' and reaction = 'hot' and created_at >= now() - interval '30 days'
        group by entity_id
        order by count(*) desc
        limit 5
      `).catch(() => []),
      session.db.execute<AggregateRow>(sql`
        select 'bill' as entity_type, entity_id, count(*)::int as count
        from content_reactions
        where entity_type = 'bill' and reaction = 'hot' and created_at >= now() - interval '30 days'
        group by entity_id
        order by count(*) desc
        limit 5
      `).catch(() => [])
    ]);
    const [mostViewed, trendingVotes, trendingBills] = await Promise.all([
      resolveDashboardItems(session.db, viewRows, locale).catch(() => []),
      resolveDashboardItems(session.db, hotVoteRows, locale).catch(() => []),
      resolveDashboardItems(session.db, hotBillRows, locale).catch(() => [])
    ]);

    return {
      latestVotes: votes.items,
      latestBills: bills.items,
      mostViewed,
      mostSearchedMembers: searchRows.map((row) => ({
        entityType: "search",
        title: row.entity_id ?? "",
        href: `/${locale}/members?q=${encodeURIComponent(row.entity_id ?? "")}`,
        count: row.count
      })),
      trendingVotes,
      trendingBills,
      sourceKind: "database"
    };
  } catch {
    return {
      latestVotes: votes.items,
      latestBills: bills.items,
      mostViewed: [],
      mostSearchedMembers: [],
      trendingVotes: [],
      trendingBills: [],
      sourceKind: "database"
    };
  } finally {
    await session.close();
  }
}

function voteConditions(filters: ExplorerFilters, cursor?: { date: string; id: string }) {
  const conditions = [];
  const range = dateRange(filters);
  if (range) {
    conditions.push(sql`v.held_on >= ${range.start}::date`);
    conditions.push(sql`v.held_on < ${range.end}::date`);
  }
  if (filters.chamber) conditions.push(sql`v.chamber = ${filters.chamber}`);
  if (filters.legislature) {
    conditions.push(sql`exists (
      select 1
      from legislatures l
      where l.id = ${filters.legislature}
        and v.held_on >= l.starts_on
        and v.held_on < l.ends_on
    )`);
  }
  if (filters.sourceStatus) conditions.push(sql`ss.status = ${filters.sourceStatus}`);
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(sql`(v.title ilike ${pattern} or b.title ilike ${pattern} or b.identifiers::text ilike ${pattern})`);
  }
  if (filters.group) {
    conditions.push(sql`exists (
      select 1
      from group_vote_totals gvt
      left join parliamentary_groups pg on pg.id = gvt.group_id
      where gvt.vote_id = v.id and (gvt.group_id = ${filters.group} or pg.party_id = ${filters.group})
    )`);
  }
  if (cursor) conditions.push(sql`(v.held_on < ${cursor.date}::date or (v.held_on = ${cursor.date}::date and v.id < ${cursor.id}))`);
  return conditions;
}

function billConditions(filters: ExplorerFilters, cursor?: { date: string; id: string }) {
  const conditions = [];
  const sortDate = sql`coalesce(bvs.submitted_on, bvs.latest_event_on, date '0001-01-01')`;
  const range = dateRange(filters);
  if (range) {
    conditions.push(sql`${sortDate} >= ${range.start}::date`);
    conditions.push(sql`${sortDate} < ${range.end}::date`);
  }
  if (filters.chamber && filters.chamber !== "joint") conditions.push(sql`b.chamber_of_origin = ${filters.chamber}`);
  if (filters.legislature) {
    conditions.push(sql`exists (
      select 1
      from legislatures l
      where l.id = ${filters.legislature}
        and ${sortDate} >= l.starts_on
        and ${sortDate} < l.ends_on
    )`);
  }
  if (filters.sourceStatus) conditions.push(sql`ss.status = ${filters.sourceStatus}`);
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(sql`(b.title ilike ${pattern} or b.identifiers::text ilike ${pattern})`);
  }
  if (filters.group) {
    conditions.push(sql`exists (
      select 1
      from bill_sponsors bs
      join member_group_memberships mgm on mgm.member_id = bs.member_id
      left join parliamentary_groups pg on pg.id = mgm.group_id
      where bs.bill_id = b.id
        and mgm.starts_on <= ${sortDate}
        and (mgm.ends_on is null or mgm.ends_on >= ${sortDate})
        and (mgm.group_id = ${filters.group} or pg.party_id = ${filters.group})
    )`);
  }
  if (cursor) conditions.push(sql`(${sortDate} < ${cursor.date}::date or (${sortDate} = ${cursor.date}::date and b.id < ${cursor.id}))`);
  return conditions;
}

function dateRange(filters: ExplorerFilters): { start: string; end: string } | undefined {
  if (!filters.year) return undefined;
  const year = Number(filters.year);
  if (!Number.isInteger(year)) return undefined;
  const month = filters.month ? Number(filters.month) : undefined;
  if (month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { start, end: next };
  }
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

async function resolveDashboardItems(db: DbClient, rows: AggregateRow[], locale: string): Promise<DashboardItem[]> {
  return Promise.all(rows.map((row) => resolveDashboardItem(db, row, locale)));
}

async function resolveDashboardItem(db: DbClient, row: AggregateRow, locale: string): Promise<DashboardItem> {
  if (row.entity_type === "vote" && row.entity_id) {
    const records = await db.execute<{ id: string; title: string }>(sql`select id, title from votes where id = ${row.entity_id} limit 1`);
    return { entityType: "vote", entityId: row.entity_id, title: records[0]?.title ?? row.entity_id, href: `/${locale}/votes/${row.entity_id}`, count: row.count };
  }
  if (row.entity_type === "bill" && row.entity_id) {
    const records = await db.execute<{ slug: string; title: string }>(sql`select slug, title from bills where id = ${row.entity_id} limit 1`);
    return { entityType: "bill", entityId: row.entity_id, title: records[0]?.title ?? row.entity_id, href: `/${locale}/bills/${records[0]?.slug ?? row.entity_id}`, count: row.count };
  }
  if (row.entity_type === "member" && row.entity_id) {
    const records = await db.execute<{ slug: string; display_name: string }>(sql`select slug, display_name from members where id = ${row.entity_id} limit 1`);
    return { entityType: "member", entityId: row.entity_id, title: records[0]?.display_name ?? row.entity_id, href: `/${locale}/members/${records[0]?.slug ?? row.entity_id}`, count: row.count };
  }
  if (row.entity_type === "party" && row.entity_id) {
    const records = await db.execute<{ slug: string; short_name: string; name: string }>(sql`select slug, short_name, name from parties where id = ${row.entity_id} limit 1`);
    return { entityType: "party", entityId: row.entity_id, title: records[0]?.short_name ?? records[0]?.name ?? row.entity_id, href: `/${locale}/parties/${records[0]?.slug ?? row.entity_id}`, count: row.count };
  }
  return { entityType: "search", entityId: row.entity_id ?? undefined, title: row.entity_id ?? "-", count: row.count };
}

function normalizedLimit(limit = DEFAULT_LIMIT): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function mapVoteDirectoryRow(row: VoteDirectoryRow): VoteExplorerItem {
  const vote: Vote = {
    id: row.vote_id,
    billId: row.vote_bill_id ?? undefined,
    chamber: row.vote_chamber,
    title: row.vote_title,
    heldOn: dateString(row.vote_held_on),
    voteType: row.vote_type,
    totals: {
      present: Number(row.vote_present),
      for: Number(row.vote_for_count),
      against: Number(row.vote_against),
      abstention: Number(row.vote_abstention),
      presentNotVoting: Number(row.vote_present_not_voting),
      absent: row.vote_absent === null || row.vote_absent === undefined ? undefined : Number(row.vote_absent)
    },
    sourceSnapshotId: row.vote_source_snapshot_id
  };

  return {
    vote,
    bill: row.bill_id ? mapBillFromRow(row) : undefined,
    source: row.source_id ? mapSourceFromRow(row) : undefined,
    hotCount: Number(row.hot_count ?? 0),
    groupBreakdown: mapVotePreviewGroups(row.group_breakdown)
  };
}

function mapVotePreviewGroups(value: unknown): VotePreviewGroup[] {
  let rows = value;
  if (typeof value === "string") {
    try {
      rows = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      groupId: String(item.groupId ?? ""),
      shortName: String(item.shortName ?? item.groupId ?? "—"),
      name: String(item.name ?? item.shortName ?? item.groupId ?? "—"),
      color: String(item.color ?? "#64748b"),
      partyShortName: typeof item.partyShortName === "string" ? item.partyShortName : undefined,
      logoAssetId: typeof item.logoAssetId === "string" ? item.logoAssetId : undefined,
      for: Number(item.for ?? 0),
      against: Number(item.against ?? 0),
      abstention: Number(item.abstention ?? 0),
      presentNotVoting: Number(item.presentNotVoting ?? 0)
    };
  });
}

function mapBillDirectoryRow(row: BillDirectoryRow): BillExplorerItem {
  return {
    bill: {
      id: row.bill_id,
      slug: row.bill_slug,
      title: row.bill_title,
      identifiers: jsonRecord(row.bill_identifiers),
      chamberOfOrigin: row.bill_chamber_of_origin === "senate" || row.bill_chamber_of_origin === "deputies" ? row.bill_chamber_of_origin : "unknown",
      status: row.bill_status,
      sourceSnapshotIds: jsonStringArray(row.bill_source_snapshot_ids)
    },
    submittedOn: row.submitted_on ? dateString(row.submitted_on) : undefined,
    latestEventOn: row.latest_event_on ? dateString(row.latest_event_on) : undefined,
    source: row.source_id ? mapSourceFromRow(row) : undefined,
    voteCount: Number(row.vote_count ?? 0),
    hotCount: Number(row.hot_count ?? 0)
  };
}

function mapBillFromRow(row: VoteDirectoryRow): Bill {
  return {
    id: row.bill_id!,
    slug: row.bill_slug!,
    title: row.bill_title!,
    identifiers: jsonRecord(row.bill_identifiers),
    chamberOfOrigin: row.bill_chamber_of_origin === "senate" || row.bill_chamber_of_origin === "deputies" ? row.bill_chamber_of_origin : "unknown",
    status: row.bill_status!,
    lawType: lawTypeValue(row.bill_law_type),
    sourceSnapshotIds: jsonStringArray(row.bill_source_snapshot_ids)
  };
}

function lawTypeValue(value: string | null): Bill["lawType"] {
  return value === "ordinary" || value === "organic" || value === "constitutional" ? value : undefined;
}

function mapSourceFromRow(row: SourceColumns): SourceSnapshot {
  return {
    id: row.source_id!,
    sourceUrl: row.source_url!,
    fetchedAt: timestampString(row.source_fetched_at ?? new Date(0)),
    contentHash: row.source_content_hash!,
    parser: row.source_parser!,
    parserVersion: row.source_parser_version!,
    status: row.source_status!,
    notes: row.source_notes ?? undefined
  };
}

function mapGroupRow(row: GroupRow): ParliamentaryGroup {
  return {
    id: row.id,
    partyId: row.party_id ?? undefined,
    chamber: row.chamber,
    shortName: row.short_name,
    name: row.name,
    color: row.color
  };
}

function mapLegislatureRow(row: LegislatureRow): Legislature {
  return {
    id: row.id,
    label: row.label,
    startsOn: dateString(row.starts_on),
    endsOn: dateString(row.ends_on)
  };
}

function groupOptionsSql(filters: Pick<ExplorerFilters, "chamber" | "legislature">) {
  const conditions = [];
  if (filters.chamber && filters.chamber !== "joint") conditions.push(sql`pg.chamber = ${filters.chamber}`);

  if (filters.legislature) {
    conditions.push(sql`exists (
      select 1
      from member_group_memberships mgm
      join member_mandates mm on mm.member_id = mgm.member_id
      join legislatures l on l.id = mm.legislature_id
      where mgm.group_id = pg.id
        and l.id = ${filters.legislature}
        and mm.chamber = pg.chamber
        and mgm.starts_on <= coalesce(mm.ends_on, l.ends_on)
        and coalesce(mgm.ends_on, date '9999-12-31') >= mm.starts_on
    )`);
  }

  const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  return sql`
    select id, party_id, chamber, short_name, name, color
    from parliamentary_groups pg
    ${where}
    order by pg.chamber, pg.short_name
  `;
}

function filterGroupsForPeriod(
  groups: ParliamentaryGroup[],
  mandates: MemberMandate[],
  memberships: MemberGroupMembership[],
  legislatures: Legislature[],
  filters: Pick<ExplorerFilters, "chamber" | "legislature">
): ParliamentaryGroup[] {
  const legislature = filters.legislature ? legislatures.find((item) => item.id === filters.legislature) : undefined;
  if (!legislature && !filters.chamber) return groups;

  return groups.filter((group) => {
    if (filters.chamber && group.chamber !== filters.chamber) return false;
    if (!legislature) return true;
    return memberships.some((membership) => {
      if (membership.groupId !== group.id) return false;
      return mandates.some(
        (mandate) =>
          mandate.memberId === membership.memberId &&
          mandate.legislatureId === legislature.id &&
          mandate.chamber === group.chamber &&
          overlaps(membership.startsOn, membership.endsOn, mandate.startsOn, earliestDateForFilters(mandate.endsOn, legislature.endsOn))
      );
    });
  });
}

function mapMemberMandateForFilters(row: typeof schema.memberMandates.$inferSelect): MemberMandate {
  return {
    id: row.id,
    memberId: row.memberId,
    legislatureId: row.legislatureId,
    chamber: row.chamber,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    constituency: row.constituency ?? undefined,
    status: row.status as MemberMandate["status"],
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapMemberGroupMembershipForFilters(row: typeof schema.memberGroupMemberships.$inferSelect): MemberGroupMembership {
  return {
    id: row.id,
    memberId: row.memberId,
    groupId: row.groupId,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function overlaps(leftStart: string, leftEnd: string | undefined | null, rightStart: string, rightEnd: string | undefined | null): boolean {
  return leftStart <= (rightEnd ?? "9999-12-31") && (leftEnd ?? "9999-12-31") >= rightStart;
}

function earliestDateForFilters(...dates: Array<string | undefined | null>): string | undefined {
  return dates.filter((date): date is string => Boolean(date)).sort()[0];
}

function jsonRecord(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return value as Record<string, string>;
}

function jsonStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function dateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function timestampString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

interface SourceColumns {
  [key: string]: unknown;
  source_id?: string | null;
  source_url?: string | null;
  source_fetched_at?: string | Date | null;
  source_content_hash?: string | null;
  source_parser?: string | null;
  source_parser_version?: string | null;
  source_status?: "parsed" | "partial" | "failed" | null;
  source_notes?: string | null;
}

interface VoteDirectoryRow extends SourceColumns {
  [key: string]: unknown;
  vote_id: string;
  vote_bill_id: string | null;
  vote_chamber: VoteChamber;
  vote_title: string;
  vote_held_on: string | Date;
  vote_type: string;
  vote_present: number;
  vote_for_count: number;
  vote_against: number;
  vote_abstention: number;
  vote_present_not_voting: number;
  vote_absent: number | null;
  vote_source_snapshot_id: string;
  bill_id: string | null;
  bill_slug: string | null;
  bill_title: string | null;
  bill_identifiers: unknown;
  bill_chamber_of_origin: string | null;
  bill_status: string | null;
  bill_law_type: string | null;
  bill_source_snapshot_ids: unknown;
  hot_count: number;
  group_breakdown: unknown;
}

interface BillDirectoryRow extends SourceColumns {
  [key: string]: unknown;
  bill_id: string;
  bill_slug: string;
  bill_title: string;
  bill_identifiers: unknown;
  bill_chamber_of_origin: string;
  bill_status: string;
  bill_source_snapshot_ids: unknown;
  submitted_on: string | Date | null;
  latest_event_on: string | Date | null;
  vote_count: number;
  hot_count: number;
}

interface GroupRow {
  [key: string]: unknown;
  id: string;
  party_id: string | null;
  chamber: ChamberId;
  short_name: string;
  name: string;
  color: string;
}

interface LegislatureRow {
  [key: string]: unknown;
  id: string;
  label: string;
  starts_on: string | Date;
  ends_on: string | Date;
}

interface AggregateRow {
  [key: string]: unknown;
  entity_type: "member" | "bill" | "vote" | "party" | "search";
  entity_id: string | null;
  count: number;
}
