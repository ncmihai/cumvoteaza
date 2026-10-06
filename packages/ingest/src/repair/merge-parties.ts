import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { classifyOrganisation, organisationIdentity, organisationKey, normalizeRomanian, type PartyKind } from "../parties/organisation";

export interface PartyRow {
  id: string;
  slug: string;
  shortName: string;
  name: string;
  color: string;
}

export interface MergeGroup {
  canonicalId: string;
  slug: string;
  name: string;
  shortName: string;
  color: string;
  kind: PartyKind;
  fullNameKnown: boolean;
  oldIds: string[];
  oldSlugs: string[];
  years: string[];
  /** Set when the organisation already has a curated row (a party the importer knows by name): the old rows fold into it. */
  intoCurated: boolean;
}

export interface PartyMergePlan {
  groups: MergeGroup[];
  /** Old formation id → canonical id. */
  idMap: Map<string, string>;
  slugCollisions: string[];
  /** Curated rows whose kind is not the default. */
  curatedKinds: Array<{ id: string; kind: PartyKind }>;
  abbreviationOnly: string[];
  /** Abbreviation-only organisations that look like a curated party (never merged by itself; the owner decides). */
  possibleDuplicates: Array<{ organisation: string; curated: string }>;
  kindCounts: Record<string, number>;
}

const FORMATION = /^party-formation-(\d{4})-(.+)$/;
const DEFAULT_COLOR = "#64748b";

/** knownSame: organisation id ("party-org-sos") → curated party id, proven by the members of the curated party's own groups (see mergeParties). */
export function planPartyMerge(rows: PartyRow[], knownSame: Map<string, string> = new Map()): PartyMergePlan {
  const curated = rows.filter((row) => !FORMATION.test(row.id));
  const curatedByKey = new Map(curated.map((row) => [organisationKey(row.name), row]));
  const curatedById = new Map(curated.map((row) => [row.id, row]));
  const curatedSlugs = new Set(curated.map((row) => row.slug));
  const byCanonical = new Map<string, { rows: Array<PartyRow & { year: string }>; identity: ReturnType<typeof organisationIdentity>; intoCurated?: PartyRow }>();

  for (const row of rows) {
    const match = FORMATION.exec(row.id);
    if (!match) continue;
    const identity = organisationIdentity(row.name, row.shortName);
    const existing = curatedByKey.get(organisationKey(row.name)) ?? curatedById.get(knownSame.get(identity.id) ?? "");
    const canonicalId = existing ? existing.id : identity.id;
    const entry = byCanonical.get(canonicalId) ?? { rows: [], identity, intoCurated: existing };
    entry.rows.push({ ...row, year: match[1]! });
    byCanonical.set(canonicalId, entry);
  }

  const groups: MergeGroup[] = [];
  const idMap = new Map<string, string>();
  const slugCollisions: string[] = [];
  const usedSlugs = new Set(curatedSlugs);
  for (const [canonicalId, entry] of [...byCanonical.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const latest = [...entry.rows].sort((a, b) => b.year.localeCompare(a.year))[0]!;
    const identity = organisationIdentity(latest.name, latest.shortName);
    const colors = new Map<string, number>();
    for (const row of entry.rows) if (row.color !== DEFAULT_COLOR) colors.set(row.color, (colors.get(row.color) ?? 0) + 1);
    const color = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_COLOR;
    let slug = entry.intoCurated ? entry.intoCurated.slug : identity.slug;
    if (!entry.intoCurated && usedSlugs.has(slug)) {
      slugCollisions.push(slug);
      slug = `org-${slug}`;
    }
    usedSlugs.add(slug);
    for (const row of entry.rows) idMap.set(row.id, canonicalId);
    groups.push({
      canonicalId,
      slug,
      name: identity.name,
      shortName: identity.shortName,
      color,
      kind: identity.kind,
      fullNameKnown: identity.fullNameKnown,
      oldIds: entry.rows.map((row) => row.id).sort(),
      oldSlugs: entry.rows.map((row) => row.slug).sort(),
      years: [...new Set(entry.rows.map((row) => row.year))].sort(),
      intoCurated: Boolean(entry.intoCurated)
    });
  }

  const curatedKinds = curated
    .map((row) => ({ id: row.id, kind: classifyOrganisation(row.name) }))
    .filter((row) => row.kind !== "party");
  const abbreviationOnly = groups.filter((group) => !group.fullNameKnown && !group.intoCurated).map((group) => group.shortName).sort();
  const possibleDuplicates: PartyMergePlan["possibleDuplicates"] = [];
  for (const group of groups.filter((candidate) => !candidate.fullNameKnown && !candidate.intoCurated)) {
    const abbreviation = normalizeRomanian(group.shortName).toLowerCase();
    for (const row of curated) {
      const names = [row.name, row.shortName].map((value) => normalizeRomanian(value).toLowerCase());
      if (names.some((value) => value === abbreviation || value.startsWith(`${abbreviation} `))) possibleDuplicates.push({ organisation: group.shortName, curated: `${row.id} (${row.name})` });
    }
  }
  const kindCounts: Record<string, number> = {};
  for (const group of groups) kindCounts[group.kind] = (kindCounts[group.kind] ?? 0) + 1;
  return { groups, idMap, slugCollisions, curatedKinds, abbreviationOnly, possibleDuplicates, kindCounts };
}

/** One stored "party logo" image of a member's profile, with the party the member was elected on (the first affiliation of that mandate). */
export interface LogoEvidence {
  assetId: string;
  contentHash: string;
  officialUrl: string | null;
  legislatureId: string;
  partyId: string | null;
}

export interface LogoPick {
  partyId: string;
  assetId: string;
  contentHash: string;
  officialUrl: string | null;
  legislatureId: string;
  profiles: number;
  share: number;
  confidence: "confident" | "weak";
}

export interface LogoPlan {
  picks: LogoPick[];
  /** Images carried by profiles of several parties (an alliance or list logo): never used as a party's logo. */
  mixed: Array<{ contentHash: string; officialUrl: string | null; legislatureId: string; parties: Record<string, number> }>;
}

/**
 * The Chamber shows a logo on each profile: the list the member was elected on (checked on 2024: 126 of 127 profiles with the PSD image were elected for the
 * PSD, all 31 with the POT image for the POT). A logo is trusted as a party's own only where one party carries it: at least 90% of the profiles that show it
 * and at least 3 profiles; a single profile counts only in the newest legislature and only if no other party uses the image (the one-member minority
 * organisations). Newest legislature first, so a party gets the logo the Chamber publishes now. Alliance and list logos from older legislatures are carried by
 * several parties and are skipped.
 */
export function planLogos(evidence: LogoEvidence[], mapParty: (id: string) => string = (id) => id): LogoPlan {
  const byLegislature = new Map<string, LogoEvidence[]>();
  for (const row of evidence) byLegislature.set(row.legislatureId, [...(byLegislature.get(row.legislatureId) ?? []), row]);
  const partiesOfHash = new Map<string, Set<string>>();
  for (const row of evidence) {
    if (!row.partyId) continue;
    partiesOfHash.set(row.contentHash, (partiesOfHash.get(row.contentHash) ?? new Set()).add(mapParty(row.partyId)));
  }
  const picks: LogoPick[] = [];
  const mixed: LogoPlan["mixed"] = [];
  const taken = new Set<string>();
  const newest = [...byLegislature.keys()].sort().reverse()[0];
  for (const legislatureId of [...byLegislature.keys()].sort().reverse()) {
    const byHash = new Map<string, LogoEvidence[]>();
    for (const row of byLegislature.get(legislatureId)!) byHash.set(row.contentHash, [...(byHash.get(row.contentHash) ?? []), row]);
    for (const [contentHash, rows] of byHash) {
      const counts = new Map<string, number>();
      for (const row of rows) if (row.partyId) counts.set(mapParty(row.partyId), (counts.get(mapParty(row.partyId)) ?? 0) + 1);
      const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
      if (total === 0) continue;
      const [partyId, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const share = count / total;
      const exclusive = (partiesOfHash.get(contentHash)?.size ?? 0) === 1;
      const confident = total >= 3 && share >= 0.9;
      const weak = !confident && total < 3 && share === 1 && exclusive && legislatureId === newest;
      if (!confident && !weak) {
        if (counts.size > 1) mixed.push({ contentHash, officialUrl: rows[0]!.officialUrl, legislatureId, parties: Object.fromEntries(counts) });
        continue;
      }
      if (taken.has(partyId)) continue;
      // The most profiles for this party wins among several images of the same legislature (a party that changed its logo).
      const better = picks.find((pick) => pick.partyId === partyId && pick.legislatureId === legislatureId);
      if (better && better.profiles >= count) continue;
      if (better) picks.splice(picks.indexOf(better), 1);
      picks.push({ partyId, assetId: rows.find((row) => row.partyId && mapParty(row.partyId) === partyId)!.assetId, contentHash, officialUrl: rows[0]!.officialUrl, legislatureId, profiles: count, share, confidence: confident ? "confident" : "weak" });
    }
    for (const pick of picks) taken.add(pick.partyId);
  }
  return { picks: picks.sort((a, b) => a.partyId.localeCompare(b.partyId)), mixed };
}

export interface PartyMergeResult {
  persisted: boolean;
  plan: {
    organisations: number;
    oldRowsMerged: number;
    mergedIntoCuratedParties: string[];
    kindCounts: Record<string, number>;
    curatedKinds: PartyMergePlan["curatedKinds"];
    abbreviationOnly: string[];
    possibleDuplicates: PartyMergePlan["possibleDuplicates"];
    mergedByEvidence: Array<{ organisation: string; curated: string; members: number; agree: number }>;
    slugCollisions: string[];
    organisationList: string[];
  };
  references: { memberAffiliations: number; groups: number; governmentAlignments: number; compositionEvents: number; affiliationIdCollisions: string[] };
  logos: { picks: LogoPick[]; mixedImages: number; partiesWithoutLogo: number };
}

const REFERENCES = [
  { table: "member_party_affiliations", key: "memberAffiliations" },
  { table: "parliamentary_groups", key: "groups" },
  { table: "government_party_alignments", key: "governmentAlignments" },
  { table: "composition_events", key: "compositionEvents" }
] as const;

/**
 * D-029: the parties table holds one row per organisation per legislature ("party-formation-2020-uniunea-armenilor-din-romania"); this folds them into
 * one row per organisation, gives each a kind, renames the affiliation ids that carry the old party id, keeps the old ids and slugs as aliases (the old
 * addresses redirect), and links each party to the Chamber's logo where one party clearly owns the image. Dry run unless persist.
 */
export async function mergeParties(db: DbClient, options: { persist: boolean }): Promise<PartyMergeResult> {
  const rows = [...(await db.execute<{ id: string; slug: string; short_name: string; name: string; color: string }>(sql`
    select id, slug, short_name, name, color from parties order by id`))].map((row) => ({ id: row.id, slug: row.slug, shortName: row.short_name, name: row.name, color: row.color }));
  let plan = planPartyMerge(rows);
  // An abbreviation-only organisation is folded into a curated party when the members of that party's own groups were elected on it (at least 5, at least 90%).
  const mergedByEvidence: PartyMergeResult["plan"]["mergedByEvidence"] = [];
  const knownSame = new Map<string, string>();
  for (const candidate of plan.possibleDuplicates) {
    const group = plan.groups.find((entry) => entry.shortName === candidate.organisation && !entry.fullNameKnown);
    const curatedId = candidate.curated.split(" ")[0]!;
    if (!group) continue;
    const olds = sql.join(group.oldIds.map((id) => sql`${id}`), sql`, `);
    const [evidence] = [...(await db.execute<{ members: number; agree: number }>(sql`
      with grp as (
        select distinct mgm.member_id from member_group_memberships mgm join parliamentary_groups g on g.id = mgm.group_id where g.party_id = ${curatedId}
      ), firsts as (
        select distinct on (member_id) member_id, party_id from member_party_affiliations order by member_id, starts_on
      )
      select count(*)::int as members, (count(*) filter (where f.party_id in (${olds})))::int as agree
      from grp join firsts f on f.member_id = grp.member_id`))];
    if (evidence && evidence.members >= 5 && evidence.agree / evidence.members >= 0.9) {
      knownSame.set(group.canonicalId, curatedId);
      mergedByEvidence.push({ organisation: group.shortName, curated: curatedId, members: evidence.members, agree: evidence.agree });
    }
  }
  if (knownSame.size > 0) plan = planPartyMerge(rows, knownSame);
  const oldIds = [...plan.idMap.keys()];
  const idList = oldIds.length > 0 ? sql.join(oldIds.map((id) => sql`${id}`), sql`, `) : sql`''`;

  const references = { memberAffiliations: 0, groups: 0, governmentAlignments: 0, compositionEvents: 0, affiliationIdCollisions: [] as string[] };
  for (const reference of REFERENCES) {
    const [row] = [...(await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(reference.table)} where party_id in (${idList})`))];
    references[reference.key] = row?.n ?? 0;
  }
  const affiliations = [...(await db.execute<{ id: string; party_id: string }>(sql`select id, party_id from member_party_affiliations where party_id in (${idList})`))];
  const existingIds = new Set([...(await db.execute<{ id: string }>(sql`select id from member_party_affiliations where party_id not in (${idList})`))].map((row) => row.id));
  const newAffiliationId = (row: { id: string; party_id: string }) => row.id.replace(row.party_id, plan.idMap.get(row.party_id)!);
  const seenNew = new Set<string>();
  for (const row of affiliations) {
    const next = newAffiliationId(row);
    if (seenNew.has(next) || existingIds.has(next)) references.affiliationIdCollisions.push(next);
    seenNew.add(next);
  }

  const evidence = [...(await db.execute<{ asset_id: string; content_hash: string; official_url: string | null; legislature_id: string; party_id: string | null }>(sql`
    select a.id as asset_id, a.content_hash, a.official_url, a.legislature_id,
      (select x.party_id from member_party_affiliations x where x.member_id = a.entity_id order by x.starts_on asc limit 1) as party_id
    from stored_assets a
    where a.asset_type = 'party_logo' and a.fetch_status = 'stored' and a.entity_type = 'member' and a.content_hash is not null and a.legislature_id is not null`))]
    .map((row) => ({ assetId: row.asset_id, contentHash: row.content_hash, officialUrl: row.official_url, legislatureId: row.legislature_id, partyId: row.party_id }));
  const logoPlan = planLogos(evidence, (id) => plan.idMap.get(id) ?? id);
  const allPartyIds = new Set([...rows.filter((row) => !plan.idMap.has(row.id)).map((row) => row.id), ...plan.groups.map((group) => group.canonicalId)]);

  const result: PartyMergeResult = {
    persisted: false,
    plan: {
      organisations: plan.groups.length,
      oldRowsMerged: oldIds.length,
      mergedIntoCuratedParties: plan.groups.filter((group) => group.intoCurated).map((group) => `${group.canonicalId} ← ${group.oldIds.length} rows`),
      kindCounts: plan.kindCounts,
      curatedKinds: plan.curatedKinds,
      abbreviationOnly: plan.abbreviationOnly,
      possibleDuplicates: plan.possibleDuplicates.filter((candidate) => !mergedByEvidence.some((merged) => merged.curated === candidate.curated.split(" ")[0])),
      mergedByEvidence,
      slugCollisions: plan.slugCollisions,
      organisationList: plan.groups.filter((group) => !group.intoCurated).map((group) => `${group.kind} · ${group.name}${group.fullNameKnown ? "" : " (abbreviation only)"} · ${group.years.join(", ")}`).sort()
    },
    references,
    logos: { picks: logoPlan.picks, mixedImages: logoPlan.mixed.length, partiesWithoutLogo: allPartyIds.size - logoPlan.picks.length }
  };
  if (!options.persist) return result;
  if (references.affiliationIdCollisions.length > 0) throw new Error(`Refusing to merge: ${references.affiliationIdCollisions.length} affiliation ids would collide (${references.affiliationIdCollisions.slice(0, 3).join(", ")})`);

  await db.transaction(async (tx) => {
    for (const group of plan.groups) {
      if (!group.intoCurated) {
        await tx.execute(sql`
          insert into parties (id, slug, short_name, name, color, kind, full_name_known)
          values (${group.canonicalId}, ${group.slug}, ${group.shortName}, ${group.name}, ${group.color}, ${group.kind}, ${group.fullNameKnown})
          on conflict (id) do update set slug = excluded.slug, short_name = excluded.short_name, name = excluded.name, color = excluded.color,
            kind = excluded.kind, full_name_known = excluded.full_name_known`);
      }
      for (const oldId of group.oldIds) {
        await tx.execute(sql`update member_party_affiliations set party_id = ${group.canonicalId}, id = replace(id, ${oldId}, ${group.canonicalId}) where party_id = ${oldId}`);
        await tx.execute(sql`update parliamentary_groups set party_id = ${group.canonicalId} where party_id = ${oldId}`);
        await tx.execute(sql`update government_party_alignments set party_id = ${group.canonicalId} where party_id = ${oldId}`);
        await tx.execute(sql`update composition_events set party_id = ${group.canonicalId} where party_id = ${oldId}`);
      }
      const aliases = [
        ...group.oldIds.map((id) => ({ aliasId: id, kind: "party" })),
        ...group.oldSlugs.map((slug) => ({ aliasId: `slug:${slug}`, kind: "party-slug" }))
      ];
      for (const alias of aliases) {
        await tx.execute(sql`
          insert into id_aliases (alias_id, canonical_id, kind, reason)
          values (${alias.aliasId}, ${group.canonicalId}, ${alias.kind}, 'one party row per organisation instead of per legislature (D-029)')
          on conflict (alias_id) do nothing`);
      }
    }
    if (oldIds.length > 0) await tx.execute(sql`delete from parties where id in (${idList})`);
    for (const { id, kind } of plan.curatedKinds) await tx.execute(sql`update parties set kind = ${kind} where id = ${id}`);
    for (const pick of logoPlan.picks) {
      await tx.execute(sql`update parties set logo_asset_id = ${pick.assetId}, logo_source_url = ${pick.officialUrl} where id = ${pick.partyId}`);
    }
  });
  result.persisted = true;
  return result;
}
