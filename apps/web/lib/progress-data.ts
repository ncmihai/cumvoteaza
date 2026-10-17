import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getCoveragePageData } from "./coverage-data";
import { buildProgress, type ProgressArea, type ProgressInput } from "./progress";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

/** The posts whose page names a head (the same kinds `missions-parse.ts` reads). */
const HEADED_KINDS = sql`('embassy', 'representation_office', 'permanent_mission', 'consulate_general', 'consulate')`;

async function getProgressUncached(): Promise<ProgressArea[] | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const coverage = await getCoveragePageData();
  if (!coverage) return undefined;
  const session = createWebDbSession();
  try {
    const rows = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => [...(await session.db.execute<T>(query))];
    const legislatures = await rows<{ label: string; starts_on: string }>(sql`select label, starts_on::text as starts_on from legislatures order by starts_on`);
    const memberRow = (await rows<{ current: number; with_birth: number; with_cv: number }>(sql`
      with cur as (select id from legislatures where current_date between starts_on and ends_on),
      cm as (select distinct m.person_id from members m join member_mandates mm on mm.member_id = m.id where mm.ends_on is null and mm.legislature_id in (select id from cur) and m.person_id is not null)
      select (select count(*) from cm)::int as current,
             (select count(*) from cm join person_biographies b on b.person_id = cm.person_id where b.birth_date is not null)::int as with_birth,
             (select count(distinct cm.person_id) from cm join member_cv_entries c on c.person_id = cm.person_id)::int as with_cv`))[0];
    const elections = await rows<{ kind: string; held_on: string; legislature_year: string }>(sql`select kind, held_on::text as held_on, legislature_year from elections`);
    const governments = await rows<{ slug: string; name: string; roles: number }>(sql`
      select g.slug, g.name, count(r.id)::int as roles from governments g left join government_roles r on r.government_id = g.id group by g.id order by g.starts_on`);
    const ministries = await rows<{ slug: string; name: string; has_leadership: boolean }>(sql`
      select m.slug, m.name, exists (select 1 from ministry_leadership l where l.ministry_id = m.id) as has_leadership from ministries m order by m.slug`);
    const decrees = await rows<{ year: number; held: number; highest: number }>(sql`select year, count(distinct number)::int as held, max(number)::int as highest from presidential_decrees group by year order by year`);
    const missionRow = (await rows<{ headed: number; with_head: number; honorary: number; cultural: number }>(sql`
      select count(*) filter (where kind in ${HEADED_KINDS})::int as headed,
             count(*) filter (where kind in ${HEADED_KINDS} and exists (select 1 from mission_heads h where h.mission_id = foreign_missions.id))::int as with_head,
             count(*) filter (where kind = 'honorary_consulate')::int as honorary, count(*) filter (where kind = 'cultural_institute')::int as cultural
      from foreign_missions`))[0];
    const documentRow = (await rows<{ linked: number; proposals: number; proposals_stored: number; reports: number; opinions: number }>(sql`
      select count(*)::int as linked, count(*) filter (where document_kind = 'proposal')::int as proposals,
             count(*) filter (where document_kind = 'proposal' and text_status = 'stored')::int as proposals_stored,
             count(*) filter (where document_kind = 'committee_report')::int as reports, count(*) filter (where document_kind = 'committee_opinion')::int as opinions
      from documents`))[0];
    const financeRow = (await rows<{ first_year: number | null; last_year: number | null; annual: number; campaign: number }>(sql`
      select (select min(year) from party_finance_years)::int as first_year, (select max(year) from party_finance_years)::int as last_year,
             (select count(*) from party_finance_years)::int as annual, (select count(*) from party_campaign_finance)::int as campaign`))[0];
    const questionRows = await rows<{ chamber: string; label: string; n: number }>(sql`
      select q.chamber::text as chamber, l.label, count(*)::int as n from parliamentary_questions q join legislatures l on q.registered_on between l.starts_on and l.ends_on group by 1, 2`);
    const motionRows = await rows<{ label: string; n: number }>(sql`select l.label, count(*)::int as n from parliamentary_motions m join legislatures l on l.id = m.legislature_id group by 1`);

    const byLegislature = (chamber: "deputies" | "senate") => Object.fromEntries(questionRows.filter((row) => row.chamber === chamber).map((row) => [row.label, row.n]));
    const input: ProgressInput = {
      legislatures: legislatures.map((row) => ({ label: row.label, startsOn: row.starts_on })),
      votes: coverage.votes,
      officialVotes: coverage.officialVotes,
      officialBills: coverage.officialBills,
      bills: coverage.bills,
      seats: coverage.seats,
      members: { current: memberRow?.current ?? 0, withBirthDate: memberRow?.with_birth ?? 0, withCv: memberRow?.with_cv ?? 0 },
      elections: elections.flatMap((row) => (row.kind === "parliamentary" || row.kind === "presidential" ? [{ kind: row.kind, heldOn: row.held_on, legislatureYear: row.legislature_year }] : [])),
      governments,
      ministries: ministries.map((row) => ({ slug: row.slug, name: row.name, hasLeadership: row.has_leadership })),
      decreesByYear: decrees,
      missions: { headed: missionRow?.headed ?? 0, withHead: missionRow?.with_head ?? 0, honorary: missionRow?.honorary ?? 0, cultural: missionRow?.cultural ?? 0 },
      documents: { linked: documentRow?.linked ?? 0, proposals: documentRow?.proposals ?? 0, proposalsStored: documentRow?.proposals_stored ?? 0, reports: documentRow?.reports ?? 0, opinions: documentRow?.opinions ?? 0 },
      finance: { ...(financeRow?.first_year ? { firstYear: financeRow.first_year } : {}), ...(financeRow?.last_year ? { lastYear: financeRow.last_year } : {}), annualReports: financeRow?.annual ?? 0, campaignReports: financeRow?.campaign ?? 0 },
      questions: { deputies: byLegislature("deputies"), senate: byLegislature("senate") },
      motions: Object.fromEntries(motionRows.map((row) => [row.label, row.n]))
    };
    return buildProgress(input);
  } finally {
    await session.close();
  }
}

const getCachedProgress = unstable_cache(() => timed("data.progress", getProgressUncached), ["progress-areas-v1"], { revalidate: 1800, tags: [CACHE_TAGS.coverage] });

/** The progress areas for the methodology page (D-060), read from the database and cached with the coverage figures; a purge of the "coverage" tag renews it. */
export async function getProgress(): Promise<ProgressArea[] | undefined> {
  return getCachedProgress();
}
