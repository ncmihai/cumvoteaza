import { sql, type SQL } from "drizzle-orm";
import { createDbSession, type DbClient } from "@cumsevoteaza/db";

/**
 * Data integrity checks. Every check is a query that returns offending rows; zero rows means pass.
 * "error" checks gate publication (D-008). "warning" checks are listed for review but do not block.
 */
type Check = { name: string; severity: "error" | "warning"; description: string; query: SQL };

const CURRENT_LEGISLATURE = sql`(select id from legislatures order by starts_on desc limit 1)`;

export const checks: Check[] = [
  {
    name: "overlapping_group_memberships",
    severity: "error",
    description: "A member is in two parliamentary groups at the same time.",
    query: sql`
      select a.member_id, a.group_id, a.starts_on::text, a.ends_on::text, b.group_id as other_group, b.starts_on::text as other_start
      from member_group_memberships a join member_group_memberships b
        on a.member_id = b.member_id and a.id < b.id
       and a.starts_on < coalesce(b.ends_on, '9999-12-31') and b.starts_on < coalesce(a.ends_on, '9999-12-31')`
  },
  {
    name: "overlapping_party_affiliations",
    severity: "error",
    description: "A member belongs to two parties at the same time.",
    query: sql`
      select a.member_id, a.party_id, a.starts_on::text, a.ends_on::text, b.party_id as other_party, b.starts_on::text as other_start
      from member_party_affiliations a join member_party_affiliations b
        on a.member_id = b.member_id and a.id < b.id
       and a.starts_on < coalesce(b.ends_on, '9999-12-31') and b.starts_on < coalesce(a.ends_on, '9999-12-31')`
  },
  {
    name: "group_membership_outside_mandates",
    severity: "error",
    description: "A group membership starts outside every mandate the member holds.",
    query: sql`
      select g.member_id, g.group_id, g.starts_on::text
      from member_group_memberships g
      where not exists (
        select 1 from member_mandates mm join legislatures l on l.id = mm.legislature_id
        where mm.member_id = g.member_id and g.starts_on >= mm.starts_on and g.starts_on <= coalesce(mm.ends_on, l.ends_on))`
  },
  {
    name: "person_in_two_seats_at_once",
    severity: "error",
    description: "One person holds two mandates at the same time (more than a month of overlap).",
    query: sql`
      select m1.person_id, a.member_id, a.legislature_id, a.chamber, b.member_id as other_member, b.legislature_id as other_legislature, b.chamber as other_chamber
      from member_mandates a join members m1 on m1.id = a.member_id join legislatures la on la.id = a.legislature_id
      join member_mandates b on b.id > a.id join members m2 on m2.id = b.member_id and m2.person_id = m1.person_id
      join legislatures lb on lb.id = b.legislature_id
      where least(coalesce(a.ends_on, la.ends_on), coalesce(b.ends_on, lb.ends_on)) - greatest(a.starts_on, b.starts_on) > 31`
  },
  {
    name: "same_seat_recorded_twice",
    severity: "error",
    description: "Two member records hold the same chamber and legislature for the same person (one seat imported twice).",
    query: sql`
      select m.person_id, mm.legislature_id, mm.chamber, count(*)::int as records, string_agg(m.id, ', ') as members
      from member_mandates mm join members m on m.id = mm.member_id
      group by m.person_id, mm.legislature_id, mm.chamber having count(*) > 1`
  },
  {
    name: "member_with_mandate_without_person",
    severity: "error",
    description: "A member holding a mandate is not linked to a person.",
    query: sql`select m.id, m.display_name from members m where m.person_id is null and exists (select 1 from member_mandates x where x.member_id = m.id)`
  },
  {
    name: "vote_by_member_not_sitting",
    severity: "error",
    description: "A recorded vote belongs to a member who had no mandate in that chamber on that date.",
    query: sql`
      select iv.vote_id, iv.member_id, v.held_on::text
      from individual_votes iv join votes v on v.id = iv.vote_id
      where not exists (
        select 1 from member_mandates mm join legislatures l on l.id = mm.legislature_id
        where mm.member_id = iv.member_id and mm.chamber = v.chamber
          and v.held_on >= mm.starts_on and v.held_on <= coalesce(mm.ends_on, l.ends_on))`
  },
  {
    name: "mass_mandate_end_same_day",
    severity: "error",
    description: "Many mandates of the current legislature end on the same day (the 2026-09-12 failure mode).",
    query: sql`
      select chamber, ends_on::text, count(*)::int as mandates from member_mandates
      where legislature_id = ${CURRENT_LEGISLATURE} and ends_on is not null
      group by chamber, ends_on having count(*) > 10`
  },
  {
    name: "current_seat_count_out_of_range",
    severity: "error",
    description: "Active mandates in the current legislature fall outside a plausible range for the chamber.",
    query: sql`
      select chamber, count(*)::int as active from member_mandates
      where legislature_id = ${CURRENT_LEGISLATURE} and ends_on is null
      group by chamber
      having (chamber = 'senate' and count(*) not between 125 and 140) or (chamber = 'deputies' and count(*) not between 315 and 335)`
  },
  {
    name: "office_title_in_name",
    severity: "error",
    description: "A parliamentary office is stored as part of a person's name.",
    query: sql`
      select 'member' as kind, id, display_name from members where display_name ~* ',\\s*(pre[sşș]edinte|vicepre[sşș]edinte|chestor|secretar)'
      union all
      select 'person', id, display_name from people where display_name ~* ',\\s*(pre[sşș]edinte|vicepre[sşș]edinte|chestor|secretar)'`
  },
  {
    name: "orphan_people",
    severity: "warning",
    description: "People with no member record and no government role.",
    query: sql`
      select p.id, p.display_name from people p
      where not exists (select 1 from members m where m.person_id = p.id)
        and not exists (select 1 from government_roles r where r.person_id = p.id)
        and not exists (select 1 from governments g where g.prime_minister_person_id = p.id)
        and not exists (select 1 from composition_events e where e.person_id = p.id)`
  },
  {
    name: "members_without_mandate",
    severity: "warning",
    description: "Member records that hold no mandate.",
    query: sql`select m.id, m.display_name from members m where not exists (select 1 from member_mandates x where x.member_id = m.id)`
  },
  {
    name: "mandate_starts_before_legislature",
    severity: "warning",
    description: "A mandate starts more than a month before its legislature (likely a parsing error).",
    query: sql`
      select mm.member_id, mm.legislature_id, mm.starts_on::text, l.starts_on::text as legislature_start
      from member_mandates mm join legislatures l on l.id = mm.legislature_id
      where mm.starts_on < l.starts_on - 31`
  }
];

export type CheckResult = { name: string; severity: "error" | "warning"; description: string; count: number; sample: unknown[] };

export async function runIntegrityChecks(db?: DbClient): Promise<CheckResult[]> {
  const session = db ? undefined : createDbSession();
  const client = db ?? session!.db;
  try {
    const results: CheckResult[] = [];
    for (const check of checks) {
      const rows = await client.execute(sql`select * from (${check.query}) as offending limit 1000`);
      results.push({ name: check.name, severity: check.severity, description: check.description, count: rows.length, sample: rows.slice(0, 5) });
    }
    return results;
  } finally {
    await session?.close();
  }
}
