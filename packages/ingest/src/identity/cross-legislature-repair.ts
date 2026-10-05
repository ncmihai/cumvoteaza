import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";

export interface CrossLegislatureFinding {
  table: string;
  rows: number;
}

export interface CrossLegislatureRepair {
  persisted: boolean;
  currentLegislature: string;
  /** Members of an earlier legislature (id carries a year) that hold data dated in the current one. */
  members: Array<{ id: string; displayName: string }>;
  findings: CrossLegislatureFinding[];
}

/**
 * Finds and removes data written onto an earlier legislature's member that belongs to the current one. It happens when a
 * roster import follows an alias across legislatures (2026-10-05: deputy 336 of 2024 landed on the 2020 deputy numbered
 * 336). A member of an earlier legislature has no mandate, group, committee, role, count or vote in the current legislature,
 * so everything of that kind is, by definition, misplaced; re-importing the roster and the votes puts it where it belongs.
 */
export async function repairCrossLegislatureMembers(options: { persist: boolean }): Promise<CrossLegislatureRepair> {
  const session = createDbSession();
  try {
    return await session.db.transaction(async (tx) => {
      const current = [...(await tx.execute<{ id: string; starts_on: string }>(sql`select id, to_char(starts_on, 'YYYY-MM-DD') as starts_on from legislatures order by starts_on desc limit 1`))][0]!;
      const oldMembers = sql`(select id, num from members where id ~ '^member-(deputies|senate)-(19|20)[0-9]{2}-')`;
      const wrongMandates = sql`(select m.id from member_mandates m where m.member_id in (select id from ${oldMembers} o) and m.legislature_id = ${current.id})`;
      const steps: Array<{ table: string; count: ReturnType<typeof sql>; remove: ReturnType<typeof sql> }> = [
        {
          table: "individual_vote_rows",
          count: sql`select count(*)::int as n from individual_vote_rows r join votes v on v.num = r.vote_num where r.member_num in (select num from ${oldMembers} o) and v.held_on >= ${current.starts_on}`,
          remove: sql`delete from individual_vote_rows r using votes v where v.num = r.vote_num and r.member_num in (select num from ${oldMembers} o) and v.held_on >= ${current.starts_on}`
        },
        {
          table: "member_mandate_relations",
          count: sql`select count(*)::int as n from member_mandate_relations where mandate_id in ${wrongMandates} or related_member_id in (select id from ${oldMembers} o) and mandate_id in (select id from member_mandates where legislature_id = ${current.id})`,
          remove: sql`delete from member_mandate_relations where mandate_id in ${wrongMandates}`
        },
        ...(["member_group_memberships", "member_party_affiliations", "member_committee_memberships", "member_roles"] as const).map((table) => ({
          table,
          count: sql`select count(*)::int as n from ${sql.identifier(table)} where member_id in (select id from ${oldMembers} o) and starts_on >= ${current.starts_on}`,
          remove: sql`delete from ${sql.identifier(table)} where member_id in (select id from ${oldMembers} o) and starts_on >= ${current.starts_on}`
        })),
        {
          table: "member_official_activity",
          count: sql`select count(*)::int as n from member_official_activity where member_id in (select id from ${oldMembers} o) and legislature_id = ${current.id}`,
          remove: sql`delete from member_official_activity where member_id in (select id from ${oldMembers} o) and legislature_id = ${current.id}`
        },
        {
          // The import also merged the new member's ids into the old one: a "deputies:2024" key and the new member's career keys,
          // which would make the identity resolver merge two different people. The member's own profile key is its own career.
          table: "members.source_ids",
          count: sql`select count(*)::int as n from members where id in (select id from ${oldMembers} o) and (source_ids ? ${`deputies:${current.id.slice(4, 8)}`} or source_ids ? ${`senate:${current.id.slice(4, 8)}`})`,
          remove: sql`update members set source_ids = (source_ids - ${`deputies:${current.id.slice(4, 8)}`} - ${`senate:${current.id.slice(4, 8)}`}) || jsonb_build_object('cdepCareerKeys', source_ids->'cdepProfileKey')
                      where id in (select id from ${oldMembers} o) and (source_ids ? ${`deputies:${current.id.slice(4, 8)}`} or source_ids ? ${`senate:${current.id.slice(4, 8)}`})`
        },
        {
          table: "member_mandates",
          count: sql`select count(*)::int as n from member_mandates where id in ${wrongMandates}`,
          remove: sql`delete from member_mandates where id in ${wrongMandates}`
        }
      ];
      const findings: CrossLegislatureFinding[] = [];
      for (const step of steps) {
        const rows = [...(await tx.execute<{ n: number }>(step.count))][0]!.n;
        findings.push({ table: step.table, rows });
        if (options.persist && rows > 0) await tx.execute(step.remove);
      }
      const members = [...(await tx.execute<{ id: string; display_name: string }>(sql`
        select distinct m.id, m.display_name from members m join member_mandates mm on mm.member_id = m.id
        where m.id in (select id from ${oldMembers} o) and mm.legislature_id = ${current.id}`))].map((row) => ({ id: row.id, displayName: row.display_name }));
      return { persisted: options.persist, currentLegislature: current.id, members, findings };
    });
  } finally {
    await session.close();
  }
}
