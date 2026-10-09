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
  /** The signer was taken from the decrees signed just before and after, not read from this decree's own signature. */
  signerInferred: boolean;
  portalUrl: string;
  /** The people the decree names, for the kinds that concern a public office. */
  persons: Array<{ name: string; role: string; memberSlug?: string }>;
}

export interface SignerPeriod {
  signer: string;
  interim: boolean;
  decrees: number;
  inferred: number;
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
      db.execute<{ signer: string; interim: boolean; count: string; inferred: string; first: string; last: string }>(sql`select signer, signed_as_interim as interim, count(*)::text as count, count(*) filter (where signer_inferred)::text as inferred, min(issued_on)::text as first, max(issued_on)::text as last from presidential_decrees where signer is not null group by 1, 2 order by min(issued_on)`).catch(() => db.execute<{ signer: string; interim: boolean; count: string; inferred: string; first: string; last: string }>(sql`select signer, signed_as_interim as interim, count(*)::text as count, '0' as inferred, min(issued_on)::text as first, max(issued_on)::text as last from presidential_decrees where signer is not null group by 1, 2 order by min(issued_on)`)),
      db.execute<{ count: string }>(sql`select count(*)::text as count from presidential_decrees ${clause}`),
      db.execute<{ id: string; number: number; year: number; issued_on: string; subject: string; kind: string; action: string | null; gazette_number: string | null; gazette_on: string | null; signer: string | null; signed_as_interim: boolean; signer_inferred: boolean | null; portal_url: string }>(sql`
        select id, number, year, issued_on::text, subject, kind, action, gazette_number, gazette_on::text, signer, signed_as_interim, signer_inferred, portal_url
        from presidential_decrees ${clause} order by issued_on desc, number desc limit ${DECREES_PAGE_SIZE} offset ${(page - 1) * DECREES_PAGE_SIZE}`).catch(() => db.execute<any>(sql`
        select id, number, year, issued_on::text, subject, kind, action, gazette_number, gazette_on::text, signer, signed_as_interim, false as signer_inferred, portal_url
        from presidential_decrees ${clause} order by issued_on desc, number desc limit ${DECREES_PAGE_SIZE} offset ${(page - 1) * DECREES_PAGE_SIZE}`))
    ]);
    // The people named by the decrees on this page (a site deployed before the table exists simply shows none).
    const itemIds = [...itemRows].map((row) => row.id);
    const personRows = itemIds.length
      ? await db.execute<{ decree_id: string; position: number; name: string; role: string; member_slug: string | null }>(sql`
          select dp.decree_id, dp.position, dp.name, dp.role, (select m.slug from members m where m.person_id = dp.person_id order by m.num desc limit 1) as member_slug
          from presidential_decree_persons dp where dp.decree_id in (${sql.join(itemIds.map((id) => sql`${id}`), sql`, `)}) order by dp.decree_id, dp.position`).catch(() => [])
      : [];
    const personsOf = new Map<string, DecreeItem["persons"]>();
    for (const row of personRows) personsOf.set(row.decree_id, [...(personsOf.get(row.decree_id) ?? []), { name: row.name, role: row.role, ...(row.member_slug ? { memberSlug: row.member_slug } : {}) }]);
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
      signers: [...signerRows].map((row) => ({ signer: row.signer, interim: row.interim, decrees: Number(row.count), inferred: Number(row.inferred), first: row.first, last: row.last })),
      items: [...itemRows].map((row) => ({
        persons: personsOf.get(row.id) ?? [],
        signerInferred: Boolean(row.signer_inferred),
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
  ["presidency-view-v2"],
  { revalidate: 1800, tags: [CACHE_TAGS.governments] }
);

/** The decree catalog's summary and one page of it; undefined when none is imported. */
export function getPresidencyView(filter: PresidencyFilter): Promise<PresidencyView | undefined> {
  return cachedPresidencyView(filter);
}
