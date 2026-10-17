import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

/**
 * Who a ministry's own site lists as leading it (D-056): the people on its leadership page on the day the BC250 last read it, and the people listed on an earlier reading who are not any more. The days are those of
 * our readings, not the days anyone took or left a post; the page's own date, where it prints one, is shown as printed.
 */
export type LeadershipKind = "minister" | "state_secretary" | "undersecretary" | "secretary_general" | "secretary_general_deputy" | "chief_of_defence_staff";

export interface LeadershipPerson {
  name: string;
  role: string;
  kind: LeadershipKind;
  sinceText?: string;
  firstSeenOn: string;
  lastSeenOn: string;
  memberSlug?: string;
  photoUrl?: string;
}

export interface MinistryLeadership {
  sourceUrl: string;
  /** The day of the latest reading of the page. */
  readOn: string;
  listed: LeadershipPerson[];
  /** Listed on an earlier reading, not on the latest. */
  noLongerListed: LeadershipPerson[];
}

export const KIND_ORDER: LeadershipKind[] = ["minister", "chief_of_defence_staff", "state_secretary", "undersecretary", "secretary_general", "secretary_general_deputy"];

async function load(slug: string): Promise<MinistryLeadership | null> {
  if (!process.env.DATABASE_URL) return null;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ name_text: string; role_text: string; kind: LeadershipKind; since_text: string | null; first_seen_on: string; last_seen_on: string; source_url: string; member_slug: string | null; photo: string | null }>(sql`
      select l.name_text, l.role_text, l.kind, l.since_text, l.first_seen_on::text as first_seen_on, l.last_seen_on::text as last_seen_on, l.source_url,
        (select m.slug from members m where m.person_id = l.person_id order by m.num desc limit 1) as member_slug,
        (select s.id from stored_assets s join members m2 on m2.id = s.entity_id where m2.person_id = l.person_id and s.asset_type = 'photo' and s.fetch_status = 'stored' order by coalesce(s.width, 0) asc, s.created_at desc limit 1) as photo
      from ministry_leadership l join ministries mi on mi.id = l.ministry_id where mi.slug = ${slug}`))];
    if (rows.length === 0) return null;
    const readOn = rows.map((row) => row.last_seen_on).sort().at(-1)!;
    const rank = (kind: LeadershipKind) => KIND_ORDER.indexOf(kind);
    const people = rows.map((row): LeadershipPerson => ({
      name: row.name_text, role: row.role_text, kind: row.kind, ...(row.since_text ? { sinceText: row.since_text } : {}), firstSeenOn: row.first_seen_on, lastSeenOn: row.last_seen_on,
      ...(row.member_slug ? { memberSlug: row.member_slug } : {}), ...(row.photo ? { photoUrl: `/api/assets/${encodeURIComponent(row.photo)}` } : {})
    })).sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, "ro"));
    return { sourceUrl: rows[0]!.source_url, readOn, listed: people.filter((item) => item.lastSeenOn === readOn), noLongerListed: people.filter((item) => item.lastSeenOn !== readOn) };
  } finally {
    await session.close();
  }
}

const cached = unstable_cache((slug: string) => timed(`data.ministry-leadership.${slug}`, async () => (await load(slug)) ?? null), ["ministry-leadership-v1"], { revalidate: 3600, tags: [CACHE_TAGS.ministries] });

export async function getMinistryLeadership(slug: string): Promise<MinistryLeadership | undefined> {
  try {
    return (await cached(slug)) ?? undefined;
  } catch {
    return undefined;
  }
}
