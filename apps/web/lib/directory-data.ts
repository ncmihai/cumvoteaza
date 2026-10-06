import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getCurrentCompositionData } from "./composition-data";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export interface PartyIndexEntry { slug: string; shortName: string; name: string; color: string }
export interface PartyIndex {
  /** Parties with seats in the legislature in office, largest first. */
  current: Array<PartyIndexEntry & { deputies: number; senators: number }>;
  /** Every other party the records hold (past members, past legislatures). */
  others: PartyIndexEntry[];
}

export interface GovernmentIndexEntry { slug: string; name: string; startsOn: string; endsOn?: string; primeMinister?: string; roles: number }

async function getPartyIndexUncached(): Promise<PartyIndex | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const parties = [...(await session.db.execute<{ slug: string; short_name: string; name: string; color: string }>(sql`select slug, short_name, name, color from parties order by short_name`))];
    const composition = await getCurrentCompositionData("official");
    const seats = new Map<string, { deputies: number; senators: number }>();
    for (const chamber of composition.chambers) {
      for (const group of chamber.groups) {
        if (!group.party) continue;
        const entry = seats.get(group.party.slug) ?? { deputies: 0, senators: 0 };
        if (chamber.chamber === "deputies") entry.deputies += group.seats;
        else if (chamber.chamber === "senate") entry.senators += group.seats;
        seats.set(group.party.slug, entry);
      }
    }
    const entry = (row: (typeof parties)[number]): PartyIndexEntry => ({ slug: row.slug, shortName: row.short_name, name: row.name, color: row.color });
    const current = parties.filter((row) => (seats.get(row.slug)?.deputies ?? 0) + (seats.get(row.slug)?.senators ?? 0) > 0).map((row) => ({ ...entry(row), deputies: seats.get(row.slug)!.deputies, senators: seats.get(row.slug)!.senators })).sort((a, b) => b.deputies + b.senators - (a.deputies + a.senators) || a.shortName.localeCompare(b.shortName, "ro"));
    const currentSlugs = new Set(current.map((row) => row.slug));
    return { current, others: parties.filter((row) => !currentSlugs.has(row.slug)).map(entry) };
  } finally {
    await session.close();
  }
}

async function getGovernmentIndexUncached(): Promise<GovernmentIndexEntry[] | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ slug: string; name: string; starts_on: string; ends_on: string | null; pm: string | null; roles: number }>(sql`
      select g.slug, g.name, g.starts_on::text as starts_on, g.ends_on::text as ends_on, p.display_name as pm,
             (select count(*)::int from government_roles r where r.government_id = g.id) as roles
      from governments g left join people p on p.id = g.prime_minister_person_id order by g.starts_on desc`))];
    return rows.map((row) => ({ slug: row.slug, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on ?? undefined, primeMinister: row.pm ?? undefined, roles: row.roles }));
  } finally {
    await session.close();
  }
}

const getCachedPartyIndex = unstable_cache(() => timed("data.party-index", getPartyIndexUncached), ["party-index-v1"], { revalidate: 900, tags: [CACHE_TAGS.parties, CACHE_TAGS.composition] });
const getCachedGovernmentIndex = unstable_cache(() => timed("data.government-index", getGovernmentIndexUncached), ["government-index-v1"], { revalidate: 900, tags: [CACHE_TAGS.governments] });

export const getPartyIndex = () => getCachedPartyIndex();
export const getGovernmentIndex = () => getCachedGovernmentIndex();
