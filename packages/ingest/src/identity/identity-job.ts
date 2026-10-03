import { readFile } from "node:fs/promises";
import { createDbSession, type DbClient } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import { sql } from "drizzle-orm";
import { resolvePeople, type IdentityDecisions, type IdentityMember, type ResolveResult } from "./resolve-people";

export const DEFAULT_DECISIONS_PATH = new URL("../../../../data/curated/identity-decisions.json", import.meta.url);

export type IdentityPlan = ResolveResult & {
  membersConsidered: number;
  peopleBefore: number;
  /** Person IDs that lose all members and are referenced elsewhere: they become aliases of the new ID. */
  aliases: Array<{ aliasId: string; canonicalId: string }>;
  /** People with no members and no references: safe to delete. */
  orphanPeople: string[];
};

/**
 * Plans (and with persist=true applies) person assignments for every member that holds a mandate.
 * careerKeys lets a dry run use CDEP career links from the local probe output before they are stored in the DB.
 */
export async function runIdentityJob(options: {
  persist?: boolean;
  decisionsPath?: string | URL;
  careerKeys?: Map<string, string[]>;
  db?: DbClient;
}): Promise<IdentityPlan> {
  const session = options.db ? undefined : createDbSession();
  const db = options.db ?? session!.db;
  try {
    const decisions = await loadDecisions(options.decisionsPath ?? DEFAULT_DECISIONS_PATH);
    const members = await loadIdentityMembers(db, options.careerKeys);
    const references = await loadPersonReferences(db);
    const result = resolvePeople({ members, protectedPersonIds: references, decisions });
    const allPeople = (await db.execute<{ id: string }>(sql`select id from people`)).map((row) => row.id);
    const plan = { ...result, ...planPeopleChanges(members, result, allPeople, references), membersConsidered: members.length, peopleBefore: allPeople.length };
    if (result.conflicts.length > 0) throw new Error(`Identity decisions conflict with official evidence:\n${result.conflicts.join("\n")}`);
    if (options.persist) await db.transaction((tx) => applyIdentityPlan(tx as unknown as DbClient, plan));
    return plan;
  } finally {
    await session?.close();
  }
}

export async function loadDecisions(path: string | URL): Promise<IdentityDecisions> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<IdentityDecisions>;
    return { same: parsed.same ?? [], different: parsed.different ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { same: [], different: [] };
    throw error;
  }
}

async function loadIdentityMembers(db: DbClient, careerKeys?: Map<string, string[]>): Promise<IdentityMember[]> {
  const rows = await db.execute<{
    id: string; person_id: string | null; display_name: string; source_ids: Record<string, string>;
    legislature_id: string; chamber: string; constituency: string | null; starts_on: string; ends_on: string | null;
  }>(sql`
    select m.id, m.person_id, m.display_name, m.source_ids, mm.legislature_id, mm.chamber, mm.constituency,
           mm.starts_on::text,
           -- Past mandates are often stored without an end; they end with their legislature at the latest.
           coalesce(mm.ends_on, l.ends_on)::text as ends_on
    from members m
    join member_mandates mm on mm.member_id = m.id
    join legislatures l on l.id = mm.legislature_id
    order by m.id, mm.starts_on
  `);
  const byId = new Map<string, IdentityMember>();
  for (const row of rows) {
    const sourceIds = { ...row.source_ids };
    const profileKey = sourceIds.cdepProfileKey;
    if (profileKey && !sourceIds.cdepCareerKeys && careerKeys?.has(profileKey)) sourceIds.cdepCareerKeys = careerKeys.get(profileKey)!.join(",");
    const member = byId.get(row.id) ?? { id: row.id, personId: row.person_id, displayName: row.display_name, sourceIds, mandates: [] };
    member.mandates.push({ legislatureId: row.legislature_id, chamber: row.chamber, constituency: row.constituency, startsOn: row.starts_on, endsOn: row.ends_on });
    byId.set(row.id, member);
  }
  return [...byId.values()];
}

/** Person IDs referenced outside the members table. */
async function loadPersonReferences(db: DbClient): Promise<Set<string>> {
  const rows = await db.execute<{ person_id: string }>(sql`
    select person_id from government_roles
    union select prime_minister_person_id from governments where prime_minister_person_id is not null
    union select person_id from composition_events where person_id is not null
  `);
  return new Set(rows.map((row) => row.person_id));
}

function planPeopleChanges(members: IdentityMember[], result: ResolveResult, allPeople: string[], references: Set<string>) {
  const stillUsed = new Set(result.personByMember.values());
  const aliases: IdentityPlan["aliases"] = [];
  for (const personId of new Set(members.map((m) => m.personId).filter(Boolean) as string[])) {
    if (stillUsed.has(personId)) continue;
    const targets = new Set(members.filter((m) => m.personId === personId).map((m) => result.personByMember.get(m.id)!));
    if (targets.size === 1) aliases.push({ aliasId: personId, canonicalId: [...targets][0]! });
  }
  const aliased = new Set(aliases.map((a) => a.aliasId));
  const orphanPeople = allPeople.filter((id) => !stillUsed.has(id) && !references.has(id) && !aliased.has(id) && !members.some((m) => m.personId === id));
  return { aliases, orphanPeople };
}

async function applyIdentityPlan(db: DbClient, plan: IdentityPlan) {
  for (const person of plan.newPeople) {
    await db.insert(schema.people).values({
      id: person.id,
      slug: person.id.replace(/^person-/, ""),
      displayName: person.displayName,
      normalizedName: person.id.replace(/^person-/, ""),
      sourceIds: {}
    }).onConflictDoNothing();
  }
  for (const change of plan.changes) {
    await db.execute(sql`update members set person_id = ${change.to} where id = ${change.memberId}`);
  }
  for (const alias of plan.aliases) {
    await db.insert(schema.idAliases).values({ aliasId: alias.aliasId, canonicalId: alias.canonicalId, kind: "person", reason: "identity resolver merge" })
      .onConflictDoUpdate({ target: schema.idAliases.aliasId, set: { canonicalId: alias.canonicalId } });
    // Everything that pointed at the retired ID now points at the surviving one.
    await db.execute(sql`update government_roles set person_id = ${alias.canonicalId} where person_id = ${alias.aliasId}`);
    await db.execute(sql`update governments set prime_minister_person_id = ${alias.canonicalId} where prime_minister_person_id = ${alias.aliasId}`);
    await db.execute(sql`update composition_events set person_id = ${alias.canonicalId} where person_id = ${alias.aliasId}`);
    await db.execute(sql`update member_legislature_activity set person_id = ${alias.canonicalId} where person_id = ${alias.aliasId}`);
  }
  // Aliases are only useful if the retired row is gone; nothing references it any more.
  const retired = [...plan.aliases.map((a) => a.aliasId), ...plan.orphanPeople];
  for (let index = 0; index < retired.length; index += 500) {
    const batch = retired.slice(index, index + 500);
    await db.execute(sql`delete from people where id in (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})
      and not exists (select 1 from members where person_id = people.id)
      and not exists (select 1 from government_roles where person_id = people.id)
      and not exists (select 1 from governments where prime_minister_person_id = people.id)
      and not exists (select 1 from composition_events where person_id = people.id)
      and not exists (select 1 from member_legislature_activity where person_id = people.id)`);
  }
}

/** Resolve a person ID derived from a name (e.g. by the government importer) to the surviving ID. */
export async function canonicalPersonIds(db: DbClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute<{ alias_id: string; canonical_id: string }>(sql`
    select alias_id, canonical_id from id_aliases where kind = 'person' and alias_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((row) => [row.alias_id, row.canonical_id]));
}
