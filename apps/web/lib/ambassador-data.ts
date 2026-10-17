import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";
import { buildTimelines, type AmbassadorRow, type TimelineResult } from "./ambassadors";

/** Every decree line that names an ambassador to a post or recalls one, read into a timeline for each post (see lib/ambassadors.ts for the rules and what they leave apart). */
async function load(today: string): Promise<TimelineResult & { decrees: number; firstYear?: number; lastOn?: string }> {
  if (!process.env.DATABASE_URL) return { timelines: [], unplaced: [], decrees: 0 };
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ name: string; action: string; title: string | null; decree_id: string; number: number; year: number; issued_on: string; portal_url: string; signer: string | null }>(sql`
      select p.name, p.action, p.title, d.id as decree_id, d.number, d.year, d.issued_on::text as issued_on, d.portal_url, d.signer
      from presidential_decree_persons p join presidential_decrees d on d.id = p.decree_id
      where p.office = 'ambassador' order by d.issued_on, d.number, p.position`))]
      .map((row): AmbassadorRow => ({ name: row.name, action: row.action, ...(row.title ? { title: row.title } : {}), decreeId: row.decree_id, decreeNumber: row.number, decreeYear: row.year, issuedOn: row.issued_on, portalUrl: row.portal_url, ...(row.signer ? { signer: row.signer } : {}) }));
    const built = buildTimelines(rows, today);
    return { ...built, decrees: new Set(rows.map((row) => row.decreeId)).size, ...(rows.length ? { firstYear: rows[0]!.decreeYear, lastOn: rows.at(-1)!.issuedOn } : {}) };
  } finally {
    await session.close();
  }
}

const cached = unstable_cache((today: string) => timed("data.ambassadors", () => load(today)), ["ambassador-timelines-v1"], { revalidate: 3600, tags: [CACHE_TAGS.governments] });

export async function getAmbassadorTimelines() {
  try {
    return await cached(new Date().toISOString().slice(0, 10));
  } catch {
    return undefined;
  }
}
