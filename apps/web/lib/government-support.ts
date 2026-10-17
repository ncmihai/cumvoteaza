import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";
import { memberPhotoUrls } from "./member-photos";

/**
 * The members of Parliament a government had: the people in the parliamentary groups of the parties our records place in the government (`government_party_alignments`, curated by hand, with their dates), during the
 * time both the party's place in the government and the person's membership of the group lasted, in the legislature that was sitting when the government took office (a government that outlives its legislature by
 * two days does not take the next legislature's members). It is who belonged to those groups, not how anyone voted: the investiture vote's own list is another thing and is shown where we hold it.
 */
export interface GovernmentSupporter {
  slug: string;
  name: string;
  chamber: "deputies" | "senate";
  photoUrl?: string;
  /** Set when the person joined the group after the government took office. */
  from?: string;
  /** Set when the person left the group, or the party left the government, before the government ended. */
  to?: string;
  atStart: boolean;
}

export interface GovernmentSupportParty {
  party: { shortName: string; slug?: string; color?: string };
  deputies: number;
  senators: number;
  /** Everyone who belonged during the government, and how many of them were there on the day it took office. */
  total: number;
  atStart: number;
  members: GovernmentSupporter[];
}

export interface GovernmentSupport {
  legislature: { id: string; label: string };
  governmentStartsOn: string;
  governmentEndsOn?: string;
  parties: GovernmentSupportParty[];
}

type Row = { member_id: string; person_key: string; slug: string; display_name: string; chamber: string; party_id: string; party_short: string; party_slug: string | null; party_color: string | null; from_on: string; to_on: string; at_start: boolean };

async function loadSupport(governmentSlug: string): Promise<GovernmentSupport | null> {
  if (!process.env.DATABASE_URL) return null;
  const session = createWebDbSession();
  try {
    const meta = [...(await session.db.execute<{ starts_on: string; ends_on: string | null; legislature_id: string | null; legislature_label: string | null; ends_cap: string }>(sql`
      select g.starts_on::text as starts_on, g.ends_on::text as ends_on, l.id as legislature_id, l.label as legislature_label, coalesce(g.ends_on, current_date)::text as ends_cap
      from governments g
      left join lateral (select id, label from legislatures where starts_on <= g.starts_on order by starts_on desc limit 1) l on true
      where g.slug = ${governmentSlug}`))][0];
    if (!meta || !meta.legislature_id) return null;
    const rows = [...(await session.db.execute<Row>(sql`
      with g as (select id, starts_on, coalesce(ends_on, current_date) as ends_on from governments where slug = ${governmentSlug}),
      win as (
        select a.party_id, p.short_name, p.slug, p.color, greatest(a.starts_on, g.starts_on) as w_from, least(coalesce(a.ends_on, g.ends_on), g.ends_on) as w_to, g.starts_on as g_start
        from government_party_alignments a join g on g.id = a.government_id join parties p on p.id = a.party_id
        where a.alignment in ('government', 'governing_support')
      ),
      hit as (
        select m.id as member_id, coalesce(m.person_id, m.id) as person_key, m.slug, m.display_name, pg.chamber::text as chamber, win.party_id, win.short_name as party_short, win.slug as party_slug, win.color as party_color, win.g_start,
               greatest(mgm.starts_on, win.w_from, mm.starts_on) as from_on,
               least(coalesce(mgm.ends_on, date '9999-12-31'), win.w_to, coalesce(mm.ends_on, date '9999-12-31'), coalesce(l.ends_on, date '9999-12-31')) as to_on
        from win
        join parliamentary_groups pg on pg.party_id = win.party_id
        join member_group_memberships mgm on mgm.group_id = pg.id
        join members m on m.id = mgm.member_id
        join member_mandates mm on mm.member_id = m.id and mm.legislature_id = ${meta.legislature_id}
        join legislatures l on l.id = mm.legislature_id
      )
      select member_id, person_key, slug, display_name, chamber, party_id, party_short, party_slug, party_color, from_on::text as from_on, to_on::text as to_on, (from_on <= g_start and to_on >= g_start) as at_start
      from hit where from_on <= to_on order by party_short, display_name`))];
    if (rows.length === 0) return null;
    const photos = await memberPhotoUrls(session.db, rows.map((row) => row.member_id));
    const endsOn = meta.ends_cap;
    const byParty = new Map<string, { party: GovernmentSupportParty["party"]; people: Map<string, GovernmentSupporter> }>();
    for (const row of rows) {
      const entry = byParty.get(row.party_id) ?? { party: { shortName: row.party_short, ...(row.party_slug ? { slug: row.party_slug } : {}), ...(row.party_color ? { color: row.party_color } : {}) }, people: new Map<string, GovernmentSupporter>() };
      byParty.set(row.party_id, entry);
      const key = `${row.person_key}:${row.chamber}`;
      const known = entry.people.get(key);
      const joined = row.from_on > meta.starts_on ? row.from_on : undefined;
      const left = row.to_on < endsOn ? row.to_on : undefined;
      if (known) {
        // The same person in the same party twice (two group memberships): the widest span.
        if (joined === undefined || (known.from !== undefined && joined < known.from)) delete known.from;
        if (left === undefined || (known.to !== undefined && left > known.to)) delete known.to;
        known.atStart = known.atStart || row.at_start;
        continue;
      }
      entry.people.set(key, { slug: row.slug, name: row.display_name, chamber: row.chamber === "senate" ? "senate" : "deputies", ...(photos.has(row.member_id) ? { photoUrl: photos.get(row.member_id)! } : {}), ...(joined ? { from: joined } : {}), ...(left ? { to: left } : {}), atStart: row.at_start });
    }
    const parties: GovernmentSupportParty[] = [...byParty.values()].map(({ party, people }) => {
      const members = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "ro"));
      return { party, deputies: members.filter((item) => item.atStart && item.chamber === "deputies").length, senators: members.filter((item) => item.atStart && item.chamber === "senate").length, total: members.length, atStart: members.filter((item) => item.atStart).length, members };
    }).sort((a, b) => b.atStart - a.atStart || b.total - a.total);
    return { legislature: { id: meta.legislature_id, label: meta.legislature_label ?? meta.legislature_id }, governmentStartsOn: meta.starts_on, ...(meta.ends_on ? { governmentEndsOn: meta.ends_on } : {}), parties };
  } finally {
    await session.close();
  }
}

const cachedSupport = unstable_cache((slug: string) => timed(`data.government-support.${slug}`, async () => (await loadSupport(slug)) ?? null), ["government-support-v1"], { revalidate: 1800, tags: [CACHE_TAGS.governments, CACHE_TAGS.members] });

export async function getGovernmentSupport(slug: string): Promise<GovernmentSupport | undefined> {
  try {
    return (await cachedSupport(slug)) ?? undefined;
  } catch {
    return undefined;
  }
}
