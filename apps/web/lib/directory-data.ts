import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getCurrentCompositionData } from "./composition-data";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export type PartyKind = "party" | "minority_organisation" | "minority_group" | "independent" | "unaffiliated";

export interface PartyDirectoryEntry {
  slug: string;
  shortName: string;
  name: string;
  color: string;
  kind: PartyKind;
  /** False when the Chamber prints only the abbreviation: the page then says the full name is not recorded. */
  fullNameKnown: boolean;
  logoAssetId?: string;
  /** Sitting members now: parties by their group's seats, organisations and the rest by the members' own affiliation. */
  deputies: number;
  senators: number;
  /** Labels of the legislatures in which the party had members ("2024-2028"), newest first. */
  legislatures: string[];
}

export interface PartyDirectory {
  entries: PartyDirectoryEntry[];
  /** Every legislature that has at least one party, newest first; the first is the one in office. */
  legislatures: string[];
}

export interface GovernmentIndexEntry { slug: string; name: string; startsOn: string; endsOn?: string; primeMinister?: string; roles: number }

async function getPartyDirectoryUncached(): Promise<PartyDirectory | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const parties = [...(await session.db.execute<{ id: string; slug: string; short_name: string; name: string; color: string; kind: string; full_name_known: boolean; logo_asset_id: string | null }>(sql`
      select id, slug, short_name, name, color, kind, full_name_known, logo_asset_id from parties order by short_name`))];
    const labelRows = [...(await session.db.execute<{ party_id: string; labels: string[] }>(sql`
      select a.party_id, array_agg(distinct l.label order by l.label desc) as labels
      from member_party_affiliations a
      join member_mandates mm on mm.member_id = a.member_id
      join legislatures l on l.id = mm.legislature_id
      group by a.party_id`))];
    const labelsById = new Map(labelRows.map((row) => [row.party_id, row.labels]));
    const legislatures = [...(await session.db.execute<{ label: string }>(sql`select label from legislatures order by starts_on desc`))].map((row) => row.label);
    const affiliationSeats = new Map<string, { deputies: number; senators: number }>();
    for (const row of [...(await session.db.execute<{ party_id: string; chamber: string; n: number }>(sql`
      select a.party_id, mm.chamber::text as chamber, count(distinct mm.member_id)::int as n
      from member_party_affiliations a join member_mandates mm on mm.member_id = a.member_id
      where a.ends_on is null and mm.ends_on is null and mm.legislature_id = (select id from legislatures order by starts_on desc limit 1)
      group by a.party_id, mm.chamber`))]) {
      const entry = affiliationSeats.get(row.party_id) ?? { deputies: 0, senators: 0 };
      if (row.chamber === "deputies") entry.deputies = row.n;
      else if (row.chamber === "senate") entry.senators = row.n;
      affiliationSeats.set(row.party_id, entry);
    }
    const composition = await getCurrentCompositionData("official");
    const groupSeats = new Map<string, { deputies: number; senators: number }>();
    for (const chamber of composition.chambers) {
      for (const group of chamber.groups) {
        if (!group.party) continue;
        const entry = groupSeats.get(group.party.id) ?? { deputies: 0, senators: 0 };
        if (chamber.chamber === "deputies") entry.deputies += group.seats;
        else if (chamber.chamber === "senate") entry.senators += group.seats;
        groupSeats.set(group.party.id, entry);
      }
    }
    const entries = parties.map((row): PartyDirectoryEntry => {
      const kind = row.kind as PartyKind;
      const seats = (kind === "party" ? groupSeats.get(row.id) : affiliationSeats.get(row.id)) ?? { deputies: 0, senators: 0 };
      return { slug: row.slug, shortName: row.short_name, name: row.name, color: row.color, kind, fullNameKnown: row.full_name_known, logoAssetId: row.logo_asset_id ?? undefined, deputies: seats.deputies, senators: seats.senators, legislatures: labelsById.get(row.id) ?? [] };
    });
    return { entries, legislatures };
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

const getCachedPartyDirectory = unstable_cache(() => timed("data.party-directory", getPartyDirectoryUncached), ["party-directory-v1"], { revalidate: 900, tags: [CACHE_TAGS.parties, CACHE_TAGS.composition] });
const getCachedGovernmentIndex = unstable_cache(() => timed("data.government-index", getGovernmentIndexUncached), ["government-index-v1"], { revalidate: 900, tags: [CACHE_TAGS.governments] });

export const getPartyDirectory = () => getCachedPartyDirectory();
export const getGovernmentIndex = () => getCachedGovernmentIndex();

export interface PartyCurrentMember {
  slug: string;
  name: string;
  chamber: "deputies" | "senate";
  constituency?: string;
  photoAssetId?: string;
}

/** The members of the legislature in office who belong to a party now: through their own affiliation, or through a group that is the party's. */
async function getPartyCurrentMembersUncached(partyId: string): Promise<PartyCurrentMember[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ slug: string; display_name: string; chamber: string; constituency: string | null; photo: string | null }>(sql`
      select distinct m.slug, m.display_name, mm.chamber::text as chamber, mm.constituency,
        (select s.id from stored_assets s where s.entity_id = m.id and s.asset_type = 'photo' and s.fetch_status = 'stored' order by coalesce(s.width, 0) asc, s.created_at desc limit 1) as photo
      from members m
      join member_mandates mm on mm.member_id = m.id and mm.ends_on is null and mm.legislature_id = (select id from legislatures order by starts_on desc limit 1)
      where exists (select 1 from member_party_affiliations a where a.member_id = m.id and a.party_id = ${partyId} and a.ends_on is null)
         or exists (select 1 from member_group_memberships g join parliamentary_groups pg on pg.id = g.group_id where g.member_id = m.id and g.ends_on is null and pg.party_id = ${partyId})
      order by m.display_name`))];
    return rows.map((row) => ({ slug: row.slug, name: row.display_name, chamber: row.chamber === "senate" ? "senate" as const : "deputies" as const, constituency: row.constituency ?? undefined, photoAssetId: row.photo ?? undefined }));
  } finally {
    await session.close();
  }
}

const getCachedPartyCurrentMembers = unstable_cache((partyId: string) => timed(`data.party-members.${partyId}`, () => getPartyCurrentMembersUncached(partyId)), ["party-current-members-v2"], { revalidate: 900, tags: [CACHE_TAGS.parties, CACHE_TAGS.members] });
export const getPartyCurrentMembers = (partyId: string) => getCachedPartyCurrentMembers(partyId);
