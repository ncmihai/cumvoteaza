import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getPresidents } from "./president-data";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * What the sitemap lists (D-050: search engines may index the site). One entry per page with the pages worth finding: a bill only once it has an official dossier (a bill made from a vote's
 * title alone has nothing to read), a member only with a mandate or recorded votes, a vote that has a date. The lists are read from the database once a day.
 */
export interface SitemapEntity { path: string; lastModified?: string }

const STATIC_PATHS = ["/", "/votes", "/bills", "/members", "/parties", "/compozitii", "/governments", "/ministries", "/motions", "/questions", "/leadership", "/elections", "/elections/map", "/finance", "/presidency", "/presidency/presidents", "/presidency/appointments", "/methodology"];

export const SITEMAP_LOCALES = ["ro", "en"] as const;

/** The sitemaps: the fixed pages, then one per kind of entity (votes one per year so no file nears the 50,000-address limit). */
export async function sitemapIds(): Promise<string[]> {
  const years = await voteYears();
  return ["pages", "bills", "members", "parties", ...years.map((year) => `votes-${year}`)];
}

const voteYears = unstable_cache(async (): Promise<number[]> => {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ year: number }>(sql`select distinct extract(year from held_on)::int as year from votes order by 1`))];
    return rows.map((row) => row.year);
  } catch {
    return [];
  } finally {
    await session.close();
  }
}, ["sitemap-vote-years-v1"], { revalidate: 86_400, tags: [CACHE_TAGS.votes] });

async function rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    return [...(await session.db.execute<T>(query))] as unknown as T[];
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

const entities = (id: string): Promise<SitemapEntity[]> => {
  if (id === "pages") {
    return Promise.all([
      rows<{ slug: string }>(sql`select slug from governments order by slug`),
      rows<{ slug: string }>(sql`select slug from ministries order by slug`),
      rows<{ id: string }>(sql`select id from parliamentary_motions order by id`),
      getPresidents().then((list) => list.map((item) => ({ slug: item.slug }))).catch(() => [])
    ]).then(([governments, ministries, motions, presidents]) => [
      ...STATIC_PATHS.map((path) => ({ path })),
      ...governments.map((row) => ({ path: `/governments/${row.slug}` })),
      ...ministries.map((row) => ({ path: `/ministries/${row.slug}` })),
      ...motions.map((row) => ({ path: `/motions/${row.id}` })),
      ...presidents.map((row) => ({ path: `/presidency/presidents/${row.slug}` }))
    ]);
  }
  if (id === "bills") {
    return rows<{ slug: string; day: string | null }>(sql`
      select b.slug, d.read_at::date::text as day from bills b join bill_dossiers d on d.bill_id = b.id
      where not exists (select 1 from id_aliases a where a.alias_id = b.id) order by b.slug`).then((list) => list.map((row) => ({ path: `/bills/${row.slug}`, ...(row.day ? { lastModified: row.day } : {}) })));
  }
  if (id === "members") {
    return rows<{ slug: string }>(sql`
      select m.slug from members m where exists (select 1 from member_mandates mm where mm.member_id = m.id) order by m.slug`).then((list) => list.map((row) => ({ path: `/members/${row.slug}` })));
  }
  if (id === "parties") {
    return rows<{ slug: string }>(sql`select slug from parties order by slug`).then((list) => list.map((row) => ({ path: `/parties/${row.slug}` })));
  }
  const year = /^votes-(\d{4})$/.exec(id)?.[1];
  if (year) {
    return rows<{ id: string; day: string }>(sql`select id, held_on::text as day from votes where extract(year from held_on) = ${Number(year)} order by held_on, id`).then((list) => list.map((row) => ({ path: `/votes/${row.id}`, lastModified: row.day })));
  }
  return Promise.resolve([]);
};

export const getSitemapEntities = unstable_cache(entities, ["sitemap-entities-v1"], { revalidate: 86_400, tags: [CACHE_TAGS.votes, CACHE_TAGS.bills, CACHE_TAGS.members] });
