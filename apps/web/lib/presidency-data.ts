import { unstable_cache } from "next/cache";
import { sql, type SQL } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * The President's decrees (Sprint 14, D-037), read from `presidential_decrees`: the portal's catalog since 2014, each typed by its title and signed as the decree's own signature says.
 * Answers "nothing" when the table is not there yet (the deploy can come before the migration).
 */
export interface DecreeItem {
  id: string;
  number: number;
  year: number;
  issuedOn: string;
  subject: string;
  kind: string;
  action?: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  signer?: string;
  signedAsInterim: boolean;
  portalUrl: string;
}

export interface SignerPeriod {
  signer: string;
  interim: boolean;
  decrees: number;
  first: string;
  last: string;
}

export interface PresidencyFilter {
  kind?: string;
  year?: number;
  page?: number;
}

export interface PresidencyView {
  total: number;
  /** Matching the filters. */
  matching: number;
  /** Per year and type, over every decree. */
  grid: Array<{ year: number; kind: string; count: number }>;
  years: number[];
  signers: SignerPeriod[];
  items: DecreeItem[];
  page: number;
  pageSize: number;
  latestOn?: string;
  earliestOn?: string;
}

export const DECREES_PAGE_SIZE = 40;

async function queryPresidencyView(filter: PresidencyFilter): Promise<PresidencyView | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const db = session.db;
    const where: SQL[] = [];
    if (filter.kind) where.push(sql`kind = ${filter.kind}`);
    if (filter.year) where.push(sql`year = ${filter.year}`);
    const clause = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const [gridRows, signerRows, matchingRows, itemRows] = await Promise.all([
      db.execute<{ year: number; kind: string; count: string; latest: string; earliest: string }>(sql`select year, kind, count(*)::text as count, max(issued_on)::text as latest, min(issued_on)::text as earliest from presidential_decrees group by 1, 2`),
      db.execute<{ signer: string; interim: boolean; count: string; first: string; last: string }>(sql`select signer, signed_as_interim as interim, count(*)::text as count, min(issued_on)::text as first, max(issued_on)::text as last from presidential_decrees where signer is not null group by 1, 2 order by min(issued_on)`),
      db.execute<{ count: string }>(sql`select count(*)::text as count from presidential_decrees ${clause}`),
      db.execute<{ id: string; number: number; year: number; issued_on: string; subject: string; kind: string; action: string | null; gazette_number: string | null; gazette_on: string | null; signer: string | null; signed_as_interim: boolean; portal_url: string }>(sql`
        select id, number, year, issued_on::text, subject, kind, action, gazette_number, gazette_on::text, signer, signed_as_interim, portal_url
        from presidential_decrees ${clause} order by issued_on desc, number desc limit ${DECREES_PAGE_SIZE} offset ${(page - 1) * DECREES_PAGE_SIZE}`)
    ]);
    const grid = [...gridRows].map((row) => ({ year: Number(row.year), kind: row.kind, count: Number(row.count) }));
    if (grid.length === 0) return undefined;
    let latestOn: string | undefined;
    let earliestOn: string | undefined;
    for (const row of gridRows) {
      if (!latestOn || row.latest > latestOn) latestOn = row.latest;
      if (!earliestOn || row.earliest < earliestOn) earliestOn = row.earliest;
    }
    return {
      total: grid.reduce((sum, row) => sum + row.count, 0),
      matching: Number([...matchingRows][0]?.count ?? 0),
      grid,
      years: [...new Set(grid.map((row) => row.year))].sort((a, b) => b - a),
      signers: [...signerRows].map((row) => ({ signer: row.signer, interim: row.interim, decrees: Number(row.count), first: row.first, last: row.last })),
      items: [...itemRows].map((row) => ({
        id: row.id, number: row.number, year: row.year, issuedOn: row.issued_on, subject: row.subject, kind: row.kind,
        ...(row.action ? { action: row.action } : {}), ...(row.gazette_number ? { gazetteNumber: row.gazette_number } : {}), ...(row.gazette_on ? { gazetteOn: row.gazette_on } : {}),
        ...(row.signer ? { signer: row.signer } : {}), signedAsInterim: row.signed_as_interim, portalUrl: row.portal_url
      })),
      page,
      pageSize: DECREES_PAGE_SIZE,
      ...(latestOn ? { latestOn } : {}),
      ...(earliestOn ? { earliestOn } : {})
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

const cachedPresidencyView = unstable_cache(
  async (filter: PresidencyFilter) => queryPresidencyView(filter),
  ["presidency-view-v1"],
  { revalidate: 1800, tags: [CACHE_TAGS.governments] }
);

/** The decree catalog's summary and one page of it; undefined when none is imported. */
export function getPresidencyView(filter: PresidencyFilter): Promise<PresidencyView | undefined> {
  return cachedPresidencyView(filter);
}
