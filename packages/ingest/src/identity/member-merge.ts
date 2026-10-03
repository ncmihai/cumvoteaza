import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import type { Member } from "@cumsevoteaza/parliament-model";
import { resolveVoters, type SittingMember } from "./resolve-voters";

/**
 * One member record per mandate. Two kinds of duplicates exist:
 *  - the same seat imported from two sources (senat.ro GUID record + CDEP record, 2024 Senate);
 *  - "ghost voters": records created by vote imports that hold votes but no mandate.
 * Both are folded into the canonical (CDEP) record; the retired ID becomes an alias so no importer can recreate it.
 */
export type MemberMergePlan = {
  /**
   * Chamber votes of earlier legislatures recorded under the current legislature's ID scheme
   * (member-deputies-89 instead of member-deputies-2020-89). CDEP numbers deputies per legislature, so
   * these votes belong to that legislature's deputy with the same number (verified 2026-10-03: 100% of
   * rows match that deputy's group, 20% match the current namesake-by-number).
   */
  reattributions: Array<{ from: string; to: string; legislatureYear: string; votes: number }>;
  merges: Array<{ from: string; into: string; reason: string }>;
  /** Members with no mandate and nothing referencing them (e.g. leftover Wikipedia rows). */
  deletions: string[];
  /** Ghost voters whose votes could not be tied to exactly one sitting member. Left untouched. */
  unresolved: Array<{ memberId: string; displayName: string; votes: number }>;
};

export async function planMemberMerges(db: DbClient): Promise<MemberMergePlan> {
  const merges: MemberMergePlan["merges"] = [];
  const reattributions = (await db.execute<{ from_id: string; to_id: string; year: string; votes: number }>(sql`
    ${misattributedChamberVotes}
    select from_id, to_id, year, count(*)::int as votes from misattributed group by from_id, to_id, year order by from_id
  `)).map((row) => ({ from: row.from_id, to: row.to_id, legislatureYear: row.year, votes: row.votes }));

  // 1. Same seat, two sources: a non-CDEP record and a CDEP record of the same person, chamber and legislature.
  const sameSeat = await db.execute<{ from_id: string; into_id: string }>(sql`
    select other.id as from_id, cdep.id as into_id
    from members other
    join member_mandates om on om.member_id = other.id
    join members cdep on cdep.person_id = other.person_id and cdep.id <> other.id and cdep.source_ids ? 'cdepProfileKey'
    join member_mandates cm on cm.member_id = cdep.id and cm.legislature_id = om.legislature_id and cm.chamber = om.chamber
    where not (other.source_ids ? 'cdepProfileKey')
  `);
  const intoByFrom = new Map<string, Set<string>>();
  for (const row of sameSeat) intoByFrom.set(row.from_id, (intoByFrom.get(row.from_id) ?? new Set()).add(row.into_id));
  for (const [from, into] of intoByFrom) {
    if (into.size === 1) merges.push({ from, into: [...into][0]!, reason: "same seat imported from senat.ro and CDEP" });
  }

  // 2. Ghost voters: no mandate, but individual votes. Resolve each of their votes against the members sitting that day.
  const ghosts = await db.execute<{ id: string; display_name: string; source_ids: Record<string, string>; chamber: string; held_on: string; votes: number }>(sql`
    select m.id, m.display_name, m.source_ids, v.chamber, v.held_on::text, count(*)::int as votes
    from members m
    join individual_votes iv on iv.member_id = m.id
    join votes v on v.id = iv.vote_id
    where not exists (select 1 from member_mandates mm where mm.member_id = m.id)
    group by m.id, m.display_name, m.source_ids, v.chamber, v.held_on
  `);
  const sittingCache = new Map<string, SittingMember[]>();
  const targets = new Map<string, Set<string>>();
  const ghostInfo = new Map<string, { displayName: string; votes: number }>();
  for (const row of ghosts) {
    const key = `${row.chamber}|${row.held_on}`;
    if (!sittingCache.has(key)) sittingCache.set(key, await sittingMembers(db, row.chamber, row.held_on));
    const legislatureYear = await legislatureYearFor(db, row.held_on);
    const voter = { id: row.id, displayName: row.display_name, sourceIds: row.source_ids ?? {} } as Member;
    const result = resolveVoters({ chamber: row.chamber as "senate" | "deputies", legislatureYear, voters: [voter], aliases: new Map(), sitting: sittingCache.get(key)! });
    const target = result.canonicalByParsedId.get(row.id);
    targets.set(row.id, (targets.get(row.id) ?? new Set()).add(target ?? "?"));
    const info = ghostInfo.get(row.id) ?? { displayName: row.display_name, votes: 0 };
    ghostInfo.set(row.id, { ...info, votes: info.votes + row.votes });
  }
  const unresolved: MemberMergePlan["unresolved"] = [];
  for (const [ghost, into] of targets) {
    const only = [...into];
    if (only.length === 1 && only[0] !== "?") merges.push({ from: ghost, into: only[0]!, reason: "votes recorded under a secondary ID" });
    else unresolved.push({ memberId: ghost, ...ghostInfo.get(ghost)! });
  }

  // 3. Unreferenced members without mandates.
  const deletions = (await db.execute<{ id: string }>(sql`
    select m.id from members m
    where not exists (select 1 from member_mandates x where x.member_id = m.id)
      and not exists (select 1 from individual_votes x where x.member_id = m.id)
      and not exists (select 1 from bill_sponsors x where x.member_id = m.id)
      and not exists (select 1 from member_group_memberships x where x.member_id = m.id)
      and not exists (select 1 from member_party_affiliations x where x.member_id = m.id)
      and not exists (select 1 from member_committee_memberships x where x.member_id = m.id)
      and not exists (select 1 from member_roles x where x.member_id = m.id)
      and not exists (select 1 from composition_events x where x.member_id = m.id)
      and not exists (select 1 from member_governance_alignments x where x.member_id = m.id)
      and not exists (select 1 from member_mandate_relations x where x.related_member_id = m.id)
  `)).map((row) => row.id);

  return { reattributions, merges, deletions, unresolved };
}

/** Rows of earlier-legislature Chamber votes whose recorded member was not sitting, with the deputy who was. */
const misattributedChamberVotes = sql`
  with misattributed as (
    select iv.id as vote_row_id, iv.vote_id, iv.member_id as from_id, left(l.label, 4) as year,
           'member-deputies-' || left(l.label, 4) || '-' || substring(iv.member_id from '^member-deputies-([0-9]+)$') as to_id
    from individual_votes iv
    join votes v on v.id = iv.vote_id
    join legislatures l on v.held_on between l.starts_on and l.ends_on
    where v.chamber = 'deputies' and iv.member_id ~ '^member-deputies-[0-9]+$' and left(l.label, 4) <> '2024'
      and not exists (
        select 1 from member_mandates mm join legislatures ml on ml.id = mm.legislature_id
        where mm.member_id = iv.member_id and mm.chamber = 'deputies'
          and v.held_on >= mm.starts_on and v.held_on <= coalesce(mm.ends_on, ml.ends_on))
      and exists (
        select 1 from member_mandates mm join legislatures ml on ml.id = mm.legislature_id
        where mm.member_id = 'member-deputies-' || left(l.label, 4) || '-' || substring(iv.member_id from '^member-deputies-([0-9]+)$')
          and mm.chamber = 'deputies' and v.held_on >= mm.starts_on and v.held_on <= coalesce(mm.ends_on, ml.ends_on))
  )`;

/** Applies a plan inside the caller's transaction. */
export async function applyMemberMergePlan(db: DbClient, plan: MemberMergePlan) {
  if (plan.reattributions.length > 0) {
    await db.execute(sql`
      ${misattributedChamberVotes}
      update individual_votes iv set member_id = m.to_id, id = 'iv-' || m.vote_id || '-' || m.to_id
      from misattributed m where iv.id = m.vote_row_id`);
  }
  for (const merge of plan.merges) await mergeMember(db, merge.from, merge.into, merge.reason);
  for (let index = 0; index < plan.deletions.length; index += 500) {
    const batch = plan.deletions.slice(index, index + 500).map((id) => sql`${id}`);
    await db.execute(sql`delete from entity_search_index where entity_type = 'member' and entity_id in (${sql.join(batch, sql`, `)})`);
    await db.execute(sql`delete from member_legislature_activity where member_id in (${sql.join(batch, sql`, `)})`);
    await db.execute(sql`delete from members where id in (${sql.join(batch, sql`, `)})`);
  }
}

async function mergeMember(db: DbClient, from: string, into: string, reason: string) {
  const [both] = await db.execute<{ shared: number }>(sql`
    select count(*)::int as shared from individual_votes a join individual_votes b on a.vote_id = b.vote_id
    where a.member_id = ${from} and b.member_id = ${into}`);
  if (both!.shared > 0) throw new Error(`Cannot merge ${from} into ${into}: both voted in ${both!.shared} votes.`);

  // Vote rows are keyed iv-<vote>-<member>; rename them so a re-import upserts instead of duplicating.
  await db.execute(sql`update individual_votes set member_id = ${into}, id = 'iv-' || vote_id || '-' || ${into} where member_id = ${from}`);
  // Group/party history belongs to CDEP (one source per fact): the other source's copies are dropped, not moved.
  await db.execute(sql`delete from member_group_memberships where member_id = ${from}`);
  await db.execute(sql`delete from member_party_affiliations where member_id = ${from}`);
  for (const table of ["bill_sponsors", "member_committee_memberships", "member_roles", "member_governance_alignments", "composition_events"]) {
    await db.execute(sql`update ${sql.identifier(table)} set member_id = ${into} where member_id = ${from}`);
  }
  await db.execute(sql`update member_mandate_relations set related_member_id = ${into} where related_member_id = ${from}`);
  // Mandates: the surviving record's mandate for the same seat wins; relations follow it.
  await db.execute(sql`
    update member_mandate_relations r set mandate_id = keep.id
    from member_mandates drop_m join member_mandates keep
      on keep.member_id = ${into} and keep.legislature_id = drop_m.legislature_id and keep.chamber = drop_m.chamber
    where drop_m.member_id = ${from} and r.mandate_id = drop_m.id`);
  await db.execute(sql`
    delete from member_mandates drop_m using member_mandates keep
    where drop_m.member_id = ${from} and keep.member_id = ${into}
      and keep.legislature_id = drop_m.legislature_id and keep.chamber = drop_m.chamber`);
  await db.execute(sql`update member_mandates set member_id = ${into} where member_id = ${from}`);
  // Read models are rebuilt by refresh-read-models.
  await db.execute(sql`delete from member_legislature_activity where member_id = ${from}`);
  await db.execute(sql`delete from entity_search_index where entity_type = 'member' and entity_id = ${from}`);

  // Keep the senat.ro GUID as an official ID, and keep the cleaner public slug (no "-senate-81" suffix).
  const [fromRow] = await db.execute<{ slug: string; source_ids: Record<string, string> }>(sql`select slug, source_ids from members where id = ${from}`);
  const [intoRow] = await db.execute<{ slug: string }>(sql`select slug from members where id = ${into}`);
  const guid = fromRow?.source_ids?.senate && /^[0-9a-f]{8}-/i.test(fromRow.source_ids.senate) ? fromRow.source_ids.senate.toLowerCase() : undefined;
  await db.execute(sql`delete from members where id = ${from}`);
  if (guid) await db.execute(sql`update members set source_ids = source_ids || jsonb_build_object('senatRoGuid', ${guid}::text) where id = ${into}`);
  if (fromRow) {
    await db.execute(sql`
      update members set slug = ${fromRow.slug}
      where id = ${into} and slug like '%-' || replace(${into}, 'member-', '')
        and not exists (select 1 from members other where other.slug = ${fromRow.slug})`);
  }
  await db.execute(sql`
    insert into id_aliases (alias_id, canonical_id, kind, reason) values (${from}, ${into}, 'member', ${reason})
    on conflict (alias_id) do update set canonical_id = excluded.canonical_id`);
  // Old public URLs keep working: both previous slugs redirect to the surviving member.
  for (const slug of [fromRow?.slug, intoRow?.slug]) await recordRetiredSlug(db, slug, into);
}

/** Records a profile slug that no longer exists so /members/<slug> can redirect to the member's current page. */
export async function recordRetiredSlug(db: DbClient, slug: string | undefined, memberId: string) {
  if (!slug) return;
  await db.execute(sql`
    insert into id_aliases (alias_id, canonical_id, kind, reason)
    select ${`slug:${slug}`}, ${memberId}, 'member-slug', 'profile URL retired by identity repair'
    where not exists (select 1 from members where slug = ${slug})
    on conflict (alias_id) do update set canonical_id = excluded.canonical_id`);
}

async function sittingMembers(db: DbClient, chamber: string, heldOn: string): Promise<SittingMember[]> {
  const rows = await db.execute<{ id: string; display_name: string; source_ids: Record<string, string> }>(sql`
    select distinct m.id, m.display_name, m.source_ids
    from members m join member_mandates mm on mm.member_id = m.id
    join legislatures l on l.id = mm.legislature_id
    where mm.chamber = ${chamber} and l.starts_on <= ${heldOn} and l.ends_on >= ${heldOn}
      and mm.starts_on <= ${heldOn} and coalesce(mm.ends_on, l.ends_on) >= ${heldOn}
  `);
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, sourceIds: row.source_ids ?? {} }));
}

const legislatureYears = new Map<string, string>();
async function legislatureYearFor(db: DbClient, heldOn: string): Promise<string> {
  if (!legislatureYears.has(heldOn)) {
    const [row] = await db.execute<{ label: string }>(sql`select label from legislatures where starts_on <= ${heldOn} and ends_on >= ${heldOn} order by starts_on desc limit 1`);
    legislatureYears.set(heldOn, row?.label.slice(0, 4) ?? "");
  }
  return legislatureYears.get(heldOn)!;
}
