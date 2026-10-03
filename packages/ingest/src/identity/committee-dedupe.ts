import { sql, type SQL } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

/**
 * One source per committee membership. Two importers read the same committees:
 *  - Chamber: the CDEP history probe and the current CDEP roster read the same profile page; the probe keeps
 *    CDEP's dates and roles, so it wins.
 *  - Senate: senat.ro is the Senate's own record and wins; CDEP adds joint committees senat.ro does not list.
 * A row is a duplicate when a better-ranked source holds the same member, committee name and role over an
 * overlapping period. Names are compared without case or Romanian diacritics.
 */
const normalizedName = (alias: string) =>
  sql.raw(`regexp_replace(lower(translate(${alias}.committee_name, 'şţșțŞŢȘȚăâîĂÂÎ', 'ststststaaiaai')), '\\s+', ' ', 'g')`);
const role = (alias: string) => sql.raw(`coalesce(nullif(${alias}.role, ''), 'Membru')`);
const sourceRank = (membership: string, snapshot: string) => sql.raw(`
  case when ${membership}.chamber = 'deputies'
    then case ${snapshot}.parser when 'cdep-history-probe' then 0 when 'deputies-member-profile' then 1 else 2 end
    else case ${snapshot}.parser when 'senate-member-profile' then 0 when 'cdep-history-probe' then 1 else 2 end
  end`);

/** True for a row `l` (joined to its snapshot `ls`) that a better-ranked source already covers. */
export function committeeDuplicateCondition(): SQL {
  return sql`exists (
    select 1 from member_committee_memberships w join source_snapshots ws on ws.id = w.source_snapshot_id
    where w.member_id = l.member_id and w.id <> l.id and w.chamber = l.chamber
      and ${normalizedName("w")} = ${normalizedName("l")} and ${role("w")} = ${role("l")}
      and ${sourceRank("w", "ws")} < ${sourceRank("l", "ls")}
      and w.starts_on <= coalesce(l.ends_on, '9999-12-31') and l.starts_on <= coalesce(w.ends_on, '9999-12-31')
  )`;
}

/** drizzle expands an array into separate parameters, so the filter is an explicit IN list. */
function memberFilter(memberIds?: string[]): SQL {
  return memberIds ? sql`and l.member_id in (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})` : sql``;
}

export async function findDuplicateCommitteeMemberships(db: DbClient, memberIds?: string[]) {
  if (memberIds?.length === 0) return [];
  return db.execute<{ id: string; member_id: string; committee_name: string; parser: string }>(sql`
    select l.id, l.member_id, l.committee_name, ls.parser
    from member_committee_memberships l join source_snapshots ls on ls.id = l.source_snapshot_id
    where ${committeeDuplicateCondition()} ${memberFilter(memberIds)}
  `);
}

export async function deleteDuplicateCommitteeMemberships(db: DbClient, memberIds?: string[]): Promise<number> {
  if (memberIds?.length === 0) return 0;
  const rows = await db.execute<{ id: string }>(sql`
    delete from member_committee_memberships l using source_snapshots ls
    where ls.id = l.source_snapshot_id and ${committeeDuplicateCondition()} ${memberFilter(memberIds)}
    returning l.id
  `);
  return rows.length;
}
