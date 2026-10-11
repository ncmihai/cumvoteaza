import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { OFFICES, type OfficeKey } from "@cumsevoteaza/parliament-model";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * Sprint 18 (D-042): the Presidents and what their decrees did, read from `presidential_decrees` and `presidential_decree_persons` (Sprint 14). A President is a signer, from the first decree
 * we hold to the last, so the dates are those of the decrees and not of the term itself; the elections a President won are the second rounds in `election_list_results` whose winner has the
 * signer's name. Every function answers "nothing" when a table is not there yet (the deploy can come before the migration).
 */
const slugOf = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const foldName = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface PresidentElection {
  id: string;
  label: { ro: string; en: string };
  heldOn: string;
  votes: number;
  share: number;
  /** False for a round we know only by its national totals (2019): there is no map to link to. */
  hasMap: boolean;
}

export interface PresidentSummary {
  slug: string;
  /** As the signature prints it: "KLAUS-WERNER IOHANNIS". */
  name: string;
  interim: boolean;
  decrees: number;
  inferred: number;
  first: string;
  last: string;
  /** The runs of decrees this signer signed one after the other: a President who returned (Iliescu, 1992 to 1996 and 2000 to 2004) has two, with another signer's decrees between them. */
  periods: Array<{ first: string; last: string }>;
  /** The presidential elections whose second round this President won, in our data. */
  elections: PresidentElection[];
}

export interface DecreeCount {
  kind: string;
  count: number;
}

export interface AppointmentCount {
  office: OfficeKey;
  action: string;
  count: number;
}

export interface Holding {
  name: string;
  memberSlug?: string;
  /** The Chamber's or the Senate's own photograph of the member this name is, where we hold one. */
  photoAssetId?: string;
  action: string;
  office: OfficeKey;
  title?: string;
  decreeId: string;
  decreeNumber: number;
  decreeYear: number;
  issuedOn: string;
  portalUrl: string;
  signer?: string;
  signedAsInterim: boolean;
}

export interface ServiceRankCount {
  service: "sri" | "sie" | "spp" | "sts" | "defence" | "interior" | "other";
  count: number;
}

export interface PresidentPage extends PresidentSummary {
  byKind: DecreeCount[];
  byYear: Array<{ year: number; count: number }>;
  appointments: AppointmentCount[];
  /** The people named to the offices the plan puts first (Constitutional Court, heads of the prosecution, prime-minister candidates), newest first. */
  keyHoldings: Holding[];
  serviceRanks: ServiceRankCount[];
}

async function querySigners(): Promise<PresidentSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const db = session.db;
    const signers = [...(await db.execute<{ signer: string; interim: boolean; count: string; inferred: string; first: string; last: string }>(sql`
      select signer, bool_or(signed_as_interim) as interim, count(*)::text as count, count(*) filter (where signer_inferred)::text as inferred, min(issued_on)::text as first, max(issued_on)::text as last
      from presidential_decrees where signer is not null group by signer order by min(issued_on)`))];
    const runs = [...(await db.execute<{ signer: string; first: string; last: string }>(sql`
      with signed as (select signer, issued_on, number from presidential_decrees where signer is not null),
           flagged as (select signer, issued_on, number, case when signer is distinct from lag(signer) over (order by issued_on, number) then 1 else 0 end as change from signed),
           grouped as (select signer, issued_on, sum(change) over (order by issued_on, number rows unbounded preceding) as run from flagged)
      select signer, min(issued_on)::text as first, max(issued_on)::text as last from grouped group by signer, run order by min(issued_on)`))];
    const winners = [...(await db.execute<{ id: string; label_ro: string; label_en: string; held_on: string; list_name: string; votes: string; total: string; has_map: boolean }>(sql`
      with t as (select election_id, list_name, sum(votes) as v from election_list_results where election_id like 'pres-%-r2' group by 1, 2),
           tot as (select election_id, sum(v) as total from t group by 1),
           ranked as (select t.*, tot.total, rank() over (partition by t.election_id order by t.v desc) as rk from t join tot using (election_id))
      select e.id, e.label_ro, e.label_en, e.held_on::text as held_on, r.list_name, r.v::text as votes, r.total::text as total, exists (select 1 from election_area_results a where a.election_id = e.id) as has_map from ranked r join elections e on e.id = r.election_id where r.rk = 1 order by e.held_on`).catch(() => []))];
    return signers.map((row) => ({
      slug: slugOf(row.signer),
      name: row.signer,
      interim: row.interim,
      decrees: Number(row.count),
      inferred: Number(row.inferred),
      first: row.first,
      last: row.last,
      periods: runs.filter((run) => run.signer === row.signer).map((run) => ({ first: run.first, last: run.last })),
      elections: winners.filter((winner) => foldName(winner.list_name) === foldName(row.signer)).map((winner) => ({ id: winner.id, label: { ro: winner.label_ro, en: winner.label_en }, heldOn: winner.held_on, votes: Number(winner.votes), share: Number(winner.total) ? Number(winner.votes) / Number(winner.total) : 0, hasMap: Boolean(winner.has_map) }))
    }));
  } finally {
    await session.close();
  }
}

const cachedSigners = unstable_cache(async () => querySigners(), ["presidents-v4"], { revalidate: 1800, tags: [CACHE_TAGS.governments] });

// A failed read throws inside the cache (so that it is not remembered) and the callers turn it into "nothing".
/** The signers of the decree catalog, oldest first. */
export async function getPresidents(): Promise<PresidentSummary[]> {
  try {
    return await cachedSigners();
  } catch {
    return [];
  }
}

const KEY_OFFICES: OfficeKey[] = ["ccr-judge", "prosecutor-general", "dna-chief", "diicot-chief", "iccj-president", "pm-candidate"];

async function queryPresidentPage(slug: string): Promise<PresidentPage | undefined> {
  const president = (await getPresidents()).find((item) => item.slug === slug);
  if (!president) return undefined;
  const session = createWebDbSession();
  try {
    const db = session.db;
    const [kinds, years, appointments, holdings, ranks] = await Promise.all([
      db.execute<{ kind: string; count: string }>(sql`select kind, count(*)::text as count from presidential_decrees where signer = ${president.name} group by 1 order by count(*) desc`),
      db.execute<{ year: number; count: string }>(sql`select year, count(*)::text as count from presidential_decrees where signer = ${president.name} group by 1 order by 1`),
      db.execute<{ office: string; action: string; count: string }>(sql`
        select p.office, p.action, count(*)::text as count from presidential_decree_persons p join presidential_decrees d on d.id = p.decree_id where d.signer = ${president.name} and p.office is not null group by 1, 2`).catch(() => []),
      db.execute<HoldingRow>(sql`
        select p.name, p.action, p.office, p.title, d.id as decree_id, d.number, d.year, d.issued_on::text as issued_on, d.portal_url, d.signer, d.signed_as_interim,
          (select m.slug from members m where m.person_id = p.person_id order by m.num desc limit 1) as member_slug,
          (select s.id from stored_assets s join members m2 on m2.id = s.entity_id where m2.person_id = p.person_id and s.asset_type = 'photo' and s.fetch_status = 'stored' order by coalesce(s.width, 0) asc, s.created_at desc limit 1) as photo_asset_id
        from presidential_decree_persons p join presidential_decrees d on d.id = p.decree_id
        where d.signer = ${president.name} and p.office in (${sql.join(KEY_OFFICES.map((office) => sql`${office}`), sql`, `)}) order by d.issued_on desc, p.position`).catch(() => []),
      db.execute<{ service: string; count: string }>(sql`
        select case
          when lower(subject) ~ 'serviciul rom.n de informa.ii' then 'sri'
          when lower(subject) ~ 'serviciul de informa.ii externe' then 'sie'
          when lower(subject) ~ 'serviciul de protec.ie .i pa.z.' then 'spp'
          when lower(subject) ~ 'serviciul de telecomunica.ii speciale' then 'sts'
          when lower(subject) ~ 'ministerul ap.r.rii na.ionale' then 'defence'
          when lower(subject) ~ 'ministerul afacerilor interne' then 'interior'
          else 'other' end as service, count(*)::text as count
        from presidential_decrees where signer = ${president.name} and kind = 'military' group by 1 order by count(*) desc`)
    ]);
    return {
      ...president,
      byKind: [...kinds].map((row) => ({ kind: row.kind, count: Number(row.count) })),
      byYear: [...years].map((row) => ({ year: Number(row.year), count: Number(row.count) })),
      appointments: [...appointments].filter((row) => row.office in OFFICES).map((row) => ({ office: row.office as OfficeKey, action: row.action, count: Number(row.count) })),
      keyHoldings: [...holdings].map(toHolding),
      serviceRanks: [...ranks].map((row) => ({ service: row.service as ServiceRankCount["service"], count: Number(row.count) }))
    };
  } finally {
    await session.close();
  }
}

type HoldingRow = { name: string; action: string; office: string; title: string | null; decree_id: string; number: number; year: number; issued_on: string; portal_url: string; signer: string | null; signed_as_interim: boolean; member_slug: string | null; photo_asset_id: string | null };

const toHolding = (row: HoldingRow): Holding => ({
  name: row.name,
  action: row.action,
  office: (row.office in OFFICES ? row.office : "other") as OfficeKey,
  decreeId: row.decree_id,
  decreeNumber: row.number,
  decreeYear: row.year,
  issuedOn: row.issued_on,
  portalUrl: row.portal_url,
  signedAsInterim: row.signed_as_interim,
  ...(row.title ? { title: row.title } : {}),
  ...(row.member_slug ? { memberSlug: row.member_slug } : {}),
  ...(row.photo_asset_id ? { photoAssetId: row.photo_asset_id } : {}),
  ...(row.signer ? { signer: row.signer } : {})
});

const cachedPresidentPage = unstable_cache(async (slug: string) => (await queryPresidentPage(slug)) ?? null, ["president-page-v4"], { revalidate: 1800, tags: [CACHE_TAGS.governments] });

export async function getPresidentPage(slug: string): Promise<PresidentPage | undefined> {
  try {
    return (await cachedPresidentPage(slug)) ?? undefined;
  } catch {
    return undefined;
  }
}

export interface OfficeSummary {
  office: OfficeKey;
  appointments: number;
  releases: number;
  people: number;
  first?: string;
  last?: string;
}

async function queryOfficeSummaries(): Promise<OfficeSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ office: string; appointments: string; releases: string; people: string; first: string; last: string }>(sql`
      select p.office,
        count(*) filter (where p.action in ('appointment', 'reappointment', 'interim', 'designation'))::text as appointments,
        count(*) filter (where p.action in ('release', 'resignation', 'dismissal', 'recall'))::text as releases,
        count(distinct p.name)::text as people, min(d.issued_on)::text as first, max(d.issued_on)::text as last
      from presidential_decree_persons p join presidential_decrees d on d.id = p.decree_id where p.office is not null group by 1`))];
    return rows.filter((row) => row.office in OFFICES).map((row) => ({ office: row.office as OfficeKey, appointments: Number(row.appointments), releases: Number(row.releases), people: Number(row.people), first: row.first, last: row.last }));
  } finally {
    await session.close();
  }
}

const cachedOfficeSummaries = unstable_cache(async () => queryOfficeSummaries(), ["office-summaries-v2"], { revalidate: 1800, tags: [CACHE_TAGS.governments] });

export async function getOfficeSummaries(): Promise<OfficeSummary[]> {
  try {
    return await cachedOfficeSummaries();
  } catch {
    return [];
  }
}

async function queryOfficeHoldings(office: string): Promise<Holding[]> {
  if (!process.env.DATABASE_URL || !(office in OFFICES)) return [];
  const session = createWebDbSession();
  try {
    return [...(await session.db.execute<HoldingRow>(sql`
      select p.name, p.action, p.office, p.title, d.id as decree_id, d.number, d.year, d.issued_on::text as issued_on, d.portal_url, d.signer, d.signed_as_interim,
        (select m.slug from members m where m.person_id = p.person_id order by m.num desc limit 1) as member_slug,
          (select s.id from stored_assets s join members m2 on m2.id = s.entity_id where m2.person_id = p.person_id and s.asset_type = 'photo' and s.fetch_status = 'stored' order by coalesce(s.width, 0) asc, s.created_at desc limit 1) as photo_asset_id
      from presidential_decree_persons p join presidential_decrees d on d.id = p.decree_id
      where p.office = ${office} order by d.issued_on desc, d.number desc, p.position limit 600`))].map(toHolding);
  } finally {
    await session.close();
  }
}

const cachedOfficeHoldings = unstable_cache(async (office: string) => queryOfficeHoldings(office), ["office-holdings-v3"], { revalidate: 1800, tags: [CACHE_TAGS.governments] });

/** Every decree that names someone to, or removes someone from, this office, newest first (the most recent 600). */
export async function getOfficeHoldings(office: string): Promise<Holding[]> {
  try {
    return await cachedOfficeHoldings(office);
  } catch {
    return [];
  }
}

export interface ParliamentHolding {
  office: OfficeKey;
  /** parliament (the chambers in joint sitting), chamber or senate. */
  body: "parliament" | "chamber" | "senate";
  /** As the decision prints it, often the surname first; empty for a decision that only declares a vacancy. */
  name: string;
  memberSlug?: string;
  action: string;
  number: number;
  year: number;
  adoptedOn: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  portalUrl: string;
}

async function queryParliamentAppointments(): Promise<ParliamentHolding[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    return [...(await session.db.execute<{ office: string; body: string; person_name: string | null; action: string; number: number; year: number; adopted_on: string; gazette_number: string | null; gazette_on: string | null; portal_url: string; member_slug: string | null }>(sql`
      select a.office, a.body, a.person_name, a.action, a.number, a.year, a.adopted_on::text as adopted_on, a.gazette_number, a.gazette_on::text as gazette_on, a.portal_url,
        (select m.slug from members m where m.person_id = a.person_id order by m.num desc limit 1) as member_slug
      from parliament_appointments a order by a.adopted_on desc, a.number desc, a.position`))]
      .filter((row) => row.office in OFFICES)
      .map((row) => ({
        office: row.office as OfficeKey, body: (row.body === "chamber" || row.body === "senate" ? row.body : "parliament") as ParliamentHolding["body"], name: row.person_name ?? "", action: row.action, number: row.number, year: row.year, adoptedOn: row.adopted_on, portalUrl: row.portal_url,
        ...(row.gazette_number ? { gazetteNumber: row.gazette_number } : {}), ...(row.gazette_on ? { gazetteOn: row.gazette_on } : {}), ...(row.member_slug ? { memberSlug: row.member_slug } : {})
      }));
  } finally {
    await session.close();
  }
}

const cachedParliamentAppointments = unstable_cache(async () => queryParliamentAppointments(), ["parliament-appointments-v1"], { revalidate: 1800, tags: [CACHE_TAGS.governments] });

/** The decisions of Parliament that name or release someone in the offices the President proposes or shares, newest first (all offices; the caller filters). */
export async function getParliamentAppointments(office?: string): Promise<ParliamentHolding[]> {
  try {
    const all = await cachedParliamentAppointments();
    return office ? all.filter((row) => row.office === office) : all;
  } catch {
    return [];
  }
}
