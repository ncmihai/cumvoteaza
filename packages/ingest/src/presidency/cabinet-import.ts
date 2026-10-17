import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { ministryCatalog } from "../ministry-catalog";
import { slugify } from "../parsers/utils";
import { replayCabinets, type CabinetRole, type DecreeInput, type GovernmentInput, type ReplayReport } from "./cabinet-replay";
import { classifyDecree } from "./decree-types";
import { readSavedDecrees } from "./decrees-import";
import { fold } from "./text";

/**
 * D-057 (Block 1a): the cabinet of every Government, read from the President's decrees that name and change it (the saved portal pages; nothing is requested), written as `government_roles` periods with the decree
 * that began each and the one that ended it. Governments whose cabinet is already curated from the official investiture decision (Ciolacu II, Bolojan) are left as they are; every other Government has only its
 * Prime Minister on record, whose post stays as it is. People are tied to the people we already have only when the name fits exactly one; a name that fits several is listed and its posts are not written.
 */
const ROLE_PREFIX = "decree-role-";
const SOURCE_PREFIX = "source-decree-";

/** The decrees that change a cabinet: the ones the register files under government, and any other whose title speaks of a minister or a member of the Government. */
export function isCabinetDecree(subject: string): boolean {
  const kind = classifyDecree(subject).kind;
  if (["promulgation", "decoration", "pm_designation", "presidential_staff", "state_bodies", "judiciary_leadership", "constitutional_court", "pardon", "military", "magistrates", "diplomacy", "parliament_and_referendum", "state_of_exception", "correction"].includes(kind)) return false;
  return kind === "government" || /membr\w* al Guvernului|numirea Guvernului|componen\w+ Guvernului|remaniere guvernamental|ministr/i.test(subject);
}

const tokensOf = (name: string) => fold(name).replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);

interface KnownPerson { id: string; displayName: string; tokens: string[] }

/** Whether the words of `small` appear in `large` in the same order (a given name left out is fine; "Mircea Dumitru" is not "Dumitru Mircea Coșea"). */
const inOrder = (small: string[], large: string[]) => {
  let at = 0;
  for (const word of small) {
    const found = large.indexOf(word, at);
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
};

/** The person a printed name is: one whose words are the same, or, failing that, the only one whose words contain all of the printed name's in order (a middle name the decree leaves out). */
export function resolvePerson(name: string, people: KnownPerson[]): { person?: KnownPerson; ambiguous?: KnownPerson[] } {
  const wanted = tokensOf(name);
  if (wanted.length < 2) return {};
  const key = [...wanted].sort().join(" ");
  const equal = people.filter((person) => [...person.tokens].sort().join(" ") === key);
  if (equal.length === 1) return { person: equal[0]! };
  if (equal.length > 1) return { ambiguous: equal };
  const containing = people.filter((person) => inOrder(wanted, person.tokens));
  if (containing.length === 1) return { person: containing[0]! };
  if (containing.length > 1) return { ambiguous: containing };
  // The decree prints more words than we have (a second given name): the only person whose words, at least two different ones, all appear in the printed name in order.
  const inside = people.filter((person) => new Set(person.tokens).size >= 2 && inOrder(person.tokens, wanted));
  if (inside.length === 1) return { person: inside[0]! };
  if (inside.length > 1) return { ambiguous: inside };
  return {};
}

const cedillaFix = (value: string) => value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");

/** Printed names that are not the MP whose longer name contains them (checked by hand): they are new people. */
const NEW_PEOPLE = new Set(["Sorin Stanescu", "Constantin Dudu Ionescu", "Constantin Dudu-Ionescu"]);

export interface CabinetImportResult {
  persisted: boolean;
  decreesRead: number;
  governments: Array<{ government: string; roles: number; people: number; carriedOver: number; skipped?: string }>;
  roles: number;
  people: { matched: number; created: number; ambiguous: Array<{ name: string; candidates: string[] }>; /** Matched to a person whose name has other words than the printed one: to be read before saving. */ looselyMatched: Array<{ printed: string; person: string }> };
  rolesNotWritten: number;
  report: Pick<ReplayReport, "unread" | "withoutOpenRole" | "suspensions"> & { posts: Array<{ post: string; ministry: string | undefined }> };
  written?: { roles: number; peopleCreated: number; sources: number; obsoleteRolesRemoved: number };
}

export async function importCabinets(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<CabinetImportResult> {
  const saved = await readSavedDecrees(options.repoRoot);
  const relevant = saved.decrees.filter((decree) => decree.text && isCabinetDecree(decree.subject));
  const inputs: DecreeInput[] = relevant.map((decree) => ({ id: `decree-${decree.year}-${decree.number}`, number: decree.number, year: decree.year, issuedOn: decree.issuedOn, subject: decree.subject, text: decree.text, portalUrl: decree.portalUrl }));

  const governmentRows = [...(await db.execute<{ id: string; slug: string; starts_on: string; ends_on: string | null; pm: string | null; others: string; pm_roles: string }>(sql`
    select g.id, g.slug, g.starts_on::text as starts_on, g.ends_on::text as ends_on, g.prime_minister_person_id as pm,
      (select count(*) from government_roles r where r.government_id = g.id and r.id not like ${ROLE_PREFIX + "%"} and r.title not ilike 'prim-ministru%') as others,
      (select count(*) from government_roles r where r.government_id = g.id and r.id not like ${ROLE_PREFIX + "%"} and r.title ilike 'prim-ministru%') as pm_roles
    from governments g order by g.starts_on`))];
  const namings = inputs.filter((decree) => /numirea Guvernului|componen\w+ Guvernului/i.test(decree.subject)).map((decree) => decree.issuedOn);
  const governments: GovernmentInput[] = [];
  let previousPm: string | null | undefined;
  governmentRows.forEach((row) => {
    const acting = /-acting-/.test(row.id);
    const next = governmentRows.find((candidate) => candidate.starts_on > row.starts_on && !/-acting-/.test(candidate.id));
    const named = namings.some((date) => date >= row.starts_on && (!next || date < next.starts_on));
    governments.push({
      id: row.id, slug: row.slug, startsOn: row.starts_on, ...(row.ends_on ? { endsOn: row.ends_on } : {}), acting, skip: Number(row.others) > 0,
      hasPrimeMinisterRole: Number(row.pm_roles) > 0, carryOver: !acting && !named && previousPm !== undefined && previousPm === row.pm
    });
    if (!acting) previousPm = row.pm;
  });

  const { roles, report } = replayCabinets(inputs, governments);

  // People: the printed names, tied to ours where exactly one fits.
  const people: KnownPerson[] = [...(await db.execute<{ id: string; display_name: string }>(sql`select id, display_name from people`))].map((row) => ({ id: row.id, displayName: row.display_name, tokens: tokensOf(row.display_name) }));
  const knownIds = new Set(people.map((person) => person.id));
  const resolution = new Map<string, { id: string; created: boolean; displayName: string } | { ambiguous: string[] }>();
  const createdHere = new Map<string, { id: string; displayName: string }>();
  for (const name of new Set(roles.map((role) => role.personName))) {
    if (NEW_PEOPLE.has(name)) {
      // Marked new by hand: tied only to the person an earlier run made for them.
      const earlier = people.find((person) => person.id === `person-${slugify(cedillaFix(name))}`);
      if (earlier) { resolution.set(name, { id: earlier.id, created: false, displayName: earlier.displayName }); continue; }
    }
    const found = NEW_PEOPLE.has(name) ? {} : resolvePerson(name, people);
    if (found.person) { resolution.set(name, { id: found.person.id, created: false, displayName: found.person.displayName }); continue; }
    if (found.ambiguous) { resolution.set(name, { ambiguous: found.ambiguous.map((person) => person.displayName) }); continue; }
    const displayName = cedillaFix(name).replace(/\s+/g, " ").trim();
    // Two spellings of one name (a diacritic left out, the words in another order) are one new person.
    const wordsKey = [...tokensOf(name)].sort().join(" ");
    const sameNewPerson = createdHere.get(wordsKey);
    if (sameNewPerson) { resolution.set(name, { id: sameNewPerson.id, created: false, displayName: sameNewPerson.displayName }); continue; }
    const id = `person-${slugify(displayName)}`;
    if (knownIds.has(id)) { resolution.set(name, { ambiguous: [id] }); continue; }
    resolution.set(name, { id, created: true, displayName });
    createdHere.set(wordsKey, { id, displayName });
    knownIds.add(id);
  }
  const ambiguous = [...resolution].flatMap(([name, value]) => ("ambiguous" in value ? [{ name, candidates: value.ambiguous }] : []));
  const writable = roles.filter((role) => !("ambiguous" in (resolution.get(role.personName) ?? { ambiguous: [] })));

  const governmentById = new Map(governments.map((government) => [government.id, government]));
  const perGovernment = governments.map((government) => {
    const own = writable.filter((role) => role.governmentId === government.id);
    return {
      government: government.slug, roles: own.length, people: new Set(own.map((role) => role.personName)).size, carriedOver: own.filter((role) => role.carried).length,
      ...(government.skip ? { skipped: "cabinet already curated" } : {})
    };
  });
  const result: CabinetImportResult = {
    persisted: options.persist,
    decreesRead: inputs.length,
    governments: perGovernment,
    roles: writable.length,
    people: { matched: [...resolution.values()].filter((value) => "id" in value && !value.created).length, created: [...resolution.values()].filter((value) => "id" in value && value.created).length, ambiguous, looselyMatched: [...resolution].flatMap(([name, value]) => ("id" in value && !value.created && ![...createdHere.values()].some((made) => made.id === value.id) && [...tokensOf(name)].sort().join(" ") !== [...tokensOf(value.displayName)].sort().join(" ") ? [{ printed: name, person: `${value.displayName} (${value.id})` }] : [])) },
    rolesNotWritten: roles.length - writable.length,
    report: { unread: report.unread, withoutOpenRole: report.withoutOpenRole, suspensions: report.suspensions, posts: [...report.posts].map(([post, ministry]) => ({ post, ministry })) }
  };
  if (!options.persist) return result;

  // Rows.
  const ministryNameBySlug = new Map(ministryCatalog.map((ministry) => [ministry.slug, ministry.name]));
  const decreeById = new Map(inputs.map((decree) => [decree.id, decree]));
  const sourceIds = new Set<string>();
  const sourceId = (decreeId: string) => { const id = `${SOURCE_PREFIX}${decreeId.replace(/^decree-/, "")}`; sourceIds.add(decreeId); return id; };
  const used = new Set<string>();
  const rows: Array<typeof schema.governmentRoles.$inferInsert> = writable.map((role: CabinetRole) => {
    const government = governmentById.get(role.governmentId)!;
    const resolved = resolution.get(role.personName) as { id: string };
    const base = `${ROLE_PREFIX}${government.slug}-${slugify(role.personName)}-${role.startsOn}-${slugify(role.post.title).slice(0, 48)}${role.interim ? "-interim" : ""}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return {
      id, governmentId: role.governmentId, personId: resolved.id, title: role.title,
      ministry: role.ministrySlug ? ministryNameBySlug.get(role.ministrySlug) ?? null : null,
      ministryId: role.ministrySlug ? `ministry-${role.ministrySlug}` : null,
      ministryIncarnationId: role.incarnationId ?? null,
      startsOn: role.startsOn, endsOn: role.endsOn ?? null,
      sourceSnapshotId: sourceId(role.start.id), endReason: role.endReason ?? null, endSourceSnapshotId: role.end ? sourceId(role.end.id) : null
    };
  });
  const now = new Date();
  const sourceRows: Array<typeof schema.sourceSnapshots.$inferInsert> = [...sourceIds].map((decreeId) => {
    const decree = decreeById.get(decreeId)!;
    return { id: `${SOURCE_PREFIX}${decreeId.replace(/^decree-/, "")}`, sourceUrl: decree.portalUrl, fetchedAt: now, contentHash: createHash("sha256").update(`cabinet-decree:${decreeId}:${decree.text}`).digest("hex"), parser: "cabinet-decree", parserVersion: "1", status: "parsed" as const, notes: decree.subject };
  });
  const newPeople = [...resolution].flatMap(([name, value]) => ("id" in value && value.created ? [{ name, ...value }] : []));
  const sourceUrlOfFirstRole = new Map<string, string>();
  for (const role of writable) if (!sourceUrlOfFirstRole.has(role.personName)) sourceUrlOfFirstRole.set(role.personName, role.start.portalUrl);

  let obsolete = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < sourceRows.length; i += 200) await tx.insert(schema.sourceSnapshots).values(sourceRows.slice(i, i + 200)).onConflictDoNothing();
    for (let i = 0; i < newPeople.length; i += 200) {
      await tx.insert(schema.people).values(newPeople.slice(i, i + 200).map((person) => ({ id: person.id, slug: person.id.replace(/^person-/, ""), displayName: person.displayName, normalizedName: person.id.replace(/^person-/, ""), sourceIds: { cabinetDecree: sourceUrlOfFirstRole.get(person.name) ?? "" } }))).onConflictDoNothing();
    }
    const keep = new Set(rows.map((row) => row.id));
    const existing = [...(await tx.execute<{ id: string }>(sql`select id from government_roles where id like ${ROLE_PREFIX + "%"}`))].map((row) => row.id);
    const stale = existing.filter((id) => !keep.has(id));
    for (let i = 0; i < stale.length; i += 500) await tx.execute(sql`delete from government_roles where id in (${sql.join(stale.slice(i, i + 500).map((id) => sql`${id}`), sql`, `)})`);
    obsolete = stale.length;
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(schema.governmentRoles).values(rows.slice(i, i + 200)).onConflictDoUpdate({
        target: schema.governmentRoles.id,
        set: {
          governmentId: sql`excluded.government_id`, personId: sql`excluded.person_id`, title: sql`excluded.title`, ministry: sql`excluded.ministry`, ministryId: sql`excluded.ministry_id`,
          ministryIncarnationId: sql`excluded.ministry_incarnation_id`, startsOn: sql`excluded.starts_on`, endsOn: sql`excluded.ends_on`, sourceSnapshotId: sql`excluded.source_snapshot_id`,
          endReason: sql`excluded.end_reason`, endSourceSnapshotId: sql`excluded.end_source_snapshot_id`
        }
      });
    }
  });
  result.written = { roles: rows.length, peopleCreated: newPeople.length, sources: sourceRows.length, obsoleteRolesRemoved: obsolete };
  return result;
}
