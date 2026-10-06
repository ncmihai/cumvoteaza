import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { chamberSeatCountsByLegislature } from "@cumsevoteaza/parliament-model";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export type CoverageStatus = "complete" | "partial" | "none";
export type CoveredChamber = "deputies" | "senate" | "joint";

export interface OfficialVoteTotals {
  generatedOn: string;
  rangeFrom: string;
  rangeTo: string;
  totals: Array<{ chamber: CoveredChamber; official: number; held: number; percent: number | null }>;
  /** The Chamber's own "vot test" ballots on the official lists: counted in neither figure. */
  tests?: number;
}

export interface OfficialBillRow { chamber: "deputies" | "senate"; year: number; official: number; held: number; percent: number | null }

export interface VoteCoverageRow {
  legislature: string;
  startsOn: string;
  chamber: CoveredChamber;
  votes: number;
  nominalVotes: number;
  firstOn?: string;
  lastOn?: string;
  status: CoverageStatus;
}

export interface SeatCoverageRow { legislature: string; chamber: "deputies" | "senate"; seats?: number; /** Only for the legislature in office: for a finished one, a mandate without an end date is a gap in the source, not a person sitting. */ openMandates?: number; mandatesEver: number }

export interface CoveragePageData {
  votes: VoteCoverageRow[];
  /** Legislatures with no vote held at all. */
  legislaturesWithoutVotes: string[];
  /** "vot test" ballots we hold (not counted above). */
  storedTests: number;
  seats: SeatCoverageRow[];
  officialVotes?: OfficialVoteTotals;
  officialBills?: { generatedOn: string; rows: OfficialBillRow[] };
  bills: { bills: number; withDossier: number; steps: number; promulgated: number; promulgatedWithGazette: number; sponsors: number; sponsorsLinked: number; lastReadAt?: string };
  lastUpdate: Array<{ chamber: CoveredChamber; lastVoteOn?: string; lastFetchedAt?: string }>;
  counts: { votes: number; bills: number; members: number; documents: number };
  /** The updater's last good catch-up (ISO), when there is one. */
  lastCatchUp?: string;
}

const THRESHOLD = 99;

/**
 * A legislature's votes are "complete" for a chamber only when the official lists were compared over the whole of it and we hold at least 99%
 * (D-026: everything else that holds votes is labelled partial, and a legislature without any is "none").
 */
export function voteCoverageStatus(input: { legislatureStartsOn: string; chamber: CoveredChamber; votes: number; official?: OfficialVoteTotals }): CoverageStatus {
  if (input.votes === 0) return "none";
  const { official } = input;
  if (!official || input.legislatureStartsOn < official.rangeFrom) return "partial";
  const total = official.totals.find((item) => item.chamber === input.chamber);
  return total && total.percent !== null && total.percent >= THRESHOLD ? "complete" : "partial";
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isChamber = (value: unknown): value is CoveredChamber => value === "deputies" || value === "senate" || value === "joint";
const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

/** Reads what `coverage:publish` wrote; anything that does not have the expected shape is ignored (the page then says it is not published). */
export function readSnapshots(rows: Array<{ id: string; generated_on: string; range_from: string | null; range_to: string | null; payload: unknown }>): Pick<CoveragePageData, "officialVotes" | "officialBills"> {
  const result: Pick<CoveragePageData, "officialVotes" | "officialBills"> = {};
  for (const row of rows) {
    if (!isObject(row.payload)) continue;
    if (row.id === "votes" && Array.isArray(row.payload.totals) && row.range_from && row.range_to) {
      const totals = row.payload.totals.flatMap((item) => (isObject(item) && isChamber(item.chamber) && typeof item.official === "number" && typeof item.held === "number" ? [{ chamber: item.chamber, official: item.official, held: item.held, percent: numberOrNull(item.percent) }] : []));
      result.officialVotes = { generatedOn: row.generated_on, rangeFrom: row.range_from, rangeTo: row.range_to, totals, ...(typeof row.payload.tests === "number" ? { tests: row.payload.tests } : {}) };
    }
    if (row.id === "bills" && Array.isArray(row.payload.rows)) {
      const rowsOut = row.payload.rows.flatMap((item): OfficialBillRow[] => (isObject(item) && (item.chamber === "deputies" || item.chamber === "senate") && typeof item.year === "number" && typeof item.official === "number" && typeof item.held === "number" ? [{ chamber: item.chamber, year: item.year, official: item.official, held: item.held, percent: numberOrNull(item.percent) }] : []));
      result.officialBills = { generatedOn: row.generated_on, rows: rowsOut };
    }
  }
  return result;
}

async function getCoveragePageDataUncached(): Promise<CoveragePageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const legislatures = [...(await session.db.execute<{ label: string; starts_on: string; current: boolean }>(sql`select label, starts_on::text as starts_on, (current_date between starts_on and ends_on) as current from legislatures order by starts_on desc`))];
    const voteRows = [...(await session.db.execute<{ label: string; chamber: CoveredChamber; votes: number; nominal: number; first_on: string; last_on: string }>(sql`
      select l.label, v.chamber::text as chamber, count(*)::int as votes, count(*) filter (where c.coverage_level = 'nominal')::int as nominal, min(v.held_on)::text as first_on, max(v.held_on)::text as last_on
      from legislatures l join votes v on v.held_on between l.starts_on and l.ends_on left join vote_coverage_summaries c on c.vote_id = v.id
      where lower(trim(v.title)) <> 'vot test'
      group by l.label, v.chamber`))];
    const testRow = [...(await session.db.execute<{ tests: number }>(sql`select count(*)::int as tests from votes where lower(trim(title)) = 'vot test'`))][0];
    const seatRows = [...(await session.db.execute<{ label: string; chamber: "deputies" | "senate"; open_mandates: number; mandates_ever: number }>(sql`
      select l.label, m.chamber::text as chamber, count(*) filter (where m.ends_on is null)::int as open_mandates, count(*)::int as mandates_ever
      from member_mandates m join legislatures l on l.id = m.legislature_id group by l.label, m.chamber`))];
    let snapshots: Array<{ id: string; generated_on: string; range_from: string | null; range_to: string | null; payload: unknown }> = [];
    try {
      snapshots = [...(await session.db.execute<{ id: string; generated_on: string; range_from: string | null; range_to: string | null; payload: unknown }>(sql`select id, generated_on::text as generated_on, range_from::text as range_from, range_to::text as range_to, payload from coverage_snapshots`))];
    } catch {
      snapshots = []; // the table arrives with migration 0040; before it, the page says the official comparison is not published yet
    }
    const official = readSnapshots(snapshots);
    const billRow = [...(await session.db.execute<{ bills: number; with_dossier: number; promulgated: number; with_gazette: number; last_read: string | null }>(sql`
      select count(*)::int as bills, count(d.bill_id)::int as with_dossier, count(*) filter (where d.outcome = 'promulgated')::int as promulgated,
             count(*) filter (where d.outcome = 'promulgated' and d.gazette_number is not null)::int as with_gazette, max(d.read_at)::text as last_read
      from bills b left join bill_dossiers d on d.bill_id = b.id`))][0];
    const stepRow = [...(await session.db.execute<{ steps: number }>(sql`select count(*)::int as steps from bill_procedure_steps where source is not null`))][0];
    const sponsorRow = [...(await session.db.execute<{ sponsors: number; linked: number }>(sql`select count(*)::int as sponsors, count(member_id)::int as linked from bill_sponsors where source is not null`))][0];
    const updateRows = [...(await session.db.execute<{ chamber: CoveredChamber; last_vote: string; last_fetched: string | null }>(sql`
      select v.chamber::text as chamber, max(v.held_on)::text as last_vote, max(s.fetched_at)::text as last_fetched
      from votes v left join source_snapshots s on s.id = v.source_snapshot_id group by v.chamber`))];
    const countRow = [...(await session.db.execute<{ votes: number; bills: number; members: number; documents: number }>(sql`
      select (select count(*) from votes)::int as votes, (select count(*) from bills)::int as bills, (select count(*) from members)::int as members, (select count(*) from documents)::int as documents`))][0];

    const votes: VoteCoverageRow[] = [];
    const legislaturesWithoutVotes: string[] = [];
    for (const legislature of legislatures) {
      const held = voteRows.filter((row) => row.label === legislature.label);
      if (held.length === 0 && !legislature.current) { legislaturesWithoutVotes.push(legislature.label); continue; }
      const chambers = new Set<CoveredChamber>(["deputies", "senate", ...held.map((row) => row.chamber)]);
      for (const chamber of ["deputies", "senate", "joint"] as const) {
        if (!chambers.has(chamber)) continue;
        const row = held.find((item) => item.chamber === chamber);
        if (!row && !legislature.current) continue; // a finished legislature that holds votes of one chamber only shows that chamber
        votes.push({ legislature: legislature.label, startsOn: legislature.starts_on, chamber, votes: row?.votes ?? 0, nominalVotes: row?.nominal ?? 0, firstOn: row?.first_on, lastOn: row?.last_on, status: voteCoverageStatus({ legislatureStartsOn: legislature.starts_on, chamber, votes: row?.votes ?? 0, official: official.officialVotes }) });
      }
    }
    const currentLabels = new Set(legislatures.filter((item) => item.current).map((item) => item.label));
    const seats: SeatCoverageRow[] = seatRows
      .map((row) => ({ legislature: row.label, chamber: row.chamber, seats: chamberSeatCountsByLegislature[row.label]?.[row.chamber], ...(currentLabels.has(row.label) ? { openMandates: row.open_mandates } : {}), mandatesEver: row.mandates_ever }))
      .sort((a, b) => b.legislature.localeCompare(a.legislature) || a.chamber.localeCompare(b.chamber));
    return {
      votes,
      legislaturesWithoutVotes,
      storedTests: testRow?.tests ?? 0,
      seats,
      ...official,
      bills: { bills: billRow?.bills ?? 0, withDossier: billRow?.with_dossier ?? 0, steps: stepRow?.steps ?? 0, promulgated: billRow?.promulgated ?? 0, promulgatedWithGazette: billRow?.with_gazette ?? 0, sponsors: sponsorRow?.sponsors ?? 0, sponsorsLinked: sponsorRow?.linked ?? 0, lastReadAt: billRow?.last_read ?? undefined },
      lastUpdate: (["deputies", "senate", "joint"] as const).map((chamber) => { const row = updateRows.find((item) => item.chamber === chamber); return { chamber, lastVoteOn: row?.last_vote, lastFetchedAt: row?.last_fetched ?? undefined }; }),
      counts: { votes: countRow?.votes ?? 0, bills: countRow?.bills ?? 0, members: countRow?.members ?? 0, documents: countRow?.documents ?? 0 },
      lastCatchUp: await getLastCatchUpUncached()
    };
  } finally {
    await session.close();
  }
}

const getCachedCoveragePageData = unstable_cache(() => timed("data.coverage", getCoveragePageDataUncached), ["coverage-page-data-v3"], { revalidate: 1800, tags: [CACHE_TAGS.coverage] });

export async function getCoveragePageData(): Promise<CoveragePageData | undefined> {
  return getCachedCoveragePageData();
}

/** When the updater last finished a catch-up that found its sources in order (a published run, or one that found nothing new), as an ISO time. */
async function getLastCatchUpUncached(): Promise<string | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ finished_at: string }>(sql`select finished_at::text as finished_at from updater_runs where status in ('published', 'nothing_new') and finished_at is not null order by finished_at desc limit 1`))];
    return rows[0]?.finished_at;
  } catch {
    return undefined; // the table arrives with migration 0041
  } finally {
    await session.close();
  }
}

const getCachedLastCatchUp = unstable_cache(() => timed("data.last-catch-up", getLastCatchUpUncached), ["last-catch-up-v1"], { revalidate: 900, tags: [CACHE_TAGS.coverage] });

export async function getLastCatchUp(): Promise<string | undefined> {
  return getCachedLastCatchUp();
}
