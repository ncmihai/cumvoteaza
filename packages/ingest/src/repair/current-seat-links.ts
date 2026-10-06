import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { organisationIdentity, normalizeRomanian } from "../parties/organisation";
import { RawCache } from "../coverage/raw-cache";
import { cleanText } from "../parsers/utils";

const fold = (value: string) => normalizeRomanian(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The group the official alphabetical roster lists next to each member (by the Chamber's own member number), for the members still in office. */
export function parseRosterGroups(html: string): Map<number, string> {
  const $ = cheerio.load(html);
  const groups = new Map<number, string>();
  $("tr").each((_, row) => {
    const profile = $(row).find('a[href*="structura.mp"]').first().attr("href");
    const idm = Number(profile?.match(/idm=(\d+)/)?.[1]);
    const group = cleanText($(row).find('a[href*="structura.gp"]').first().text());
    if (idm && group && !groups.has(idm)) groups.set(idm, group);
  });
  return groups;
}

/** A national-minority member's profile names the organisation that nominated them ("Organizatia minoritatilor nationale: ..."). */
export function parseMinorityOrganisation(profileHtml: string): string | undefined {
  const $ = cheerio.load(profileHtml);
  $("script, style").remove();
  const text = cleanText($.root().text());
  const match = /Organiza[tţț]ia\s+minorit[aăâ][tţț]ilor\s+na[tţț]ionale\s*:\s*(.+?)\s*Grupul\s+parlamentar\s*:/i.exec(text);
  const name = match?.[1] ? cleanText(match[1]) : "";
  return name || undefined;
}

export interface GroupRef {
  id: string;
  shortName: string;
  name: string;
}

/** The group of ours a roster label stands for: "Neafiliaţi" is the unaffiliated group, "Mino." the national minorities, anything else must equal a group's short name. */
export function matchGroup(label: string, groups: GroupRef[]): GroupRef | undefined {
  const text = fold(label);
  if (/^neafilia/.test(text)) return groups.find((group) => /^neafilia/.test(fold(group.shortName)));
  if (/^mino/.test(text)) return groups.find((group) => /^minorit/.test(fold(group.shortName)));
  return groups.find((group) => fold(group.shortName) === text || fold(group.name) === text);
}

export interface SeatLinkPlan {
  groupMemberships: Array<{ id: string; memberId: string; name: string; groupId: string; startsOn: string; rosterLabel: string }>;
  affiliations: Array<{ id: string; memberId: string; name: string; partyId: string; organisation: string; startsOn: string; newParty: boolean }>;
  skipped: Array<{ name: string; reason: string }>;
}

export interface SeatLinkResult extends SeatLinkPlan {
  persisted: boolean;
  summary: { sittingMembers: number; withoutGroup: number; groupsToAdd: number; organisationLinksToAdd: number; newOrganisations: number };
}

type SittingRow = {
  id: string;
  display_name: string;
  key: string | null;
  chamber: "deputies" | "senate";
  starts_on: string;
  open_groups: number;
  open_parties: number;
};

/** The profile pages we saved for the current legislature, found through the probe's sidecar files (the page's address is stored beside it). */
async function indexProfiles(repoRoot: string): Promise<Map<string, { htmlPath: string; contentHash: string; url: string; fetchedAt: string }>> {
  const dir = path.join(repoRoot, "data", "cdep-history", "raw");
  const index = new Map<string, { htmlPath: string; contentHash: string; url: string; fetchedAt: string }>();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return index;
  }
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    try {
      const meta = JSON.parse(await readFile(path.join(dir, name), "utf8")) as { url?: string; contentHash?: string; fetchedAt?: string };
      const url = meta.url ?? "";
      const match = /structura\.mp\?(?=.*\bidm=(\d+))(?=.*\bcam=(\d))(?=.*\bleg=(\d{4}))/.exec(url);
      if (!match || !meta.contentHash) continue;
      index.set(`leg${match[3]}:cam${match[2]}:idm${match[1]}`, { htmlPath: path.join(dir, `${name.slice(0, -5)}.html`), contentHash: meta.contentHash, url, fetchedAt: meta.fetchedAt ?? new Date().toISOString() });
    } catch {
      // not a page record
    }
  }
  return index;
}

const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

/**
 * Sprint 11a: two gaps in the current legislature that the new Home exposed. (1) A sitting member with no group: the official alphabetical roster lists the
 * group (Ioana Grosaru is "Neafiliaţi", while her profile leaves the group blank, so no row was imported); the membership starts with the mandate (the roster
 * gives no date, as for the group pages) and is marked as seen on the roster's date. (2) A national-minority member's profile names the organisation that
 * nominated them, which was not imported for this legislature, so the organisations had no sitting member (and no logo). Both only ever add rows, only for
 * members that have none, and only from pages we saved. Dry run unless persist.
 */
export async function fillCurrentSeatLinks(db: DbClient, options: { persist: boolean; repoRoot: string }): Promise<SeatLinkResult> {
  const legislature = [...(await db.execute<{ label: string; id: string }>(sql`select label, id from legislatures order by starts_on desc limit 1`))][0];
  if (!legislature) throw new Error("no legislature is recorded");
  const year = legislature.label.slice(0, 4);
  const sitting = [...(await db.execute<SittingRow>(sql`
    select m.id, m.display_name, m.source_ids->>'cdepProfileKey' as key, mm.chamber::text as chamber, mm.starts_on::text as starts_on,
      (select count(*)::int from member_group_memberships g where g.member_id = m.id and g.ends_on is null) as open_groups,
      (select count(*)::int from member_party_affiliations a where a.member_id = m.id and a.ends_on is null) as open_parties
    from members m join member_mandates mm on mm.member_id = m.id
    where mm.ends_on is null and mm.legislature_id = ${legislature.id}`))];
  const groups = [...(await db.execute<{ id: string; short_name: string; name: string; chamber: string }>(sql`select id, short_name, name, chamber::text as chamber from parliamentary_groups`))]
    .map((group) => ({ id: group.id, shortName: group.short_name, name: group.name, chamber: group.chamber }));
  const existingParties = new Map([...(await db.execute<{ id: string }>(sql`select id from parties`))].map((row) => [row.id, true]));

  const cache = new RawCache(path.join(options.repoRoot, "data", "coverage", "raw"));
  const rosters: Record<"deputies" | "senate", { groups: Map<number, string>; hash: string; url: string; fetchedOn: string } | undefined> = { deputies: undefined, senate: undefined };
  for (const chamber of ["deputies", "senate"] as const) {
    const body = await cache.read("cdep-roster", `${chamber}-${year}`);
    if (!body) continue;
    rosters[chamber] = {
      groups: parseRosterGroups(body.toString("utf8")),
      hash: sha(body),
      url: `https://www.cdep.ro/ords/pls/parlam/structura.de?leg=${year}${chamber === "senate" ? "&cam=1" : ""}`,
      fetchedOn: new Date().toISOString().slice(0, 10)
    };
  }
  const profiles = await indexProfiles(options.repoRoot);

  const plan: SeatLinkPlan = { groupMemberships: [], affiliations: [], skipped: [] };
  const snapshots = new Map<string, { id: string; url: string; fetchedAt: string; hash: string; note: string }>();
  const need = (kind: string, url: string, fetchedAt: string, hash: string, note: string) => {
    const id = `source-current-seat-links-${hash.slice(0, 12)}`;
    snapshots.set(id, { id, url, fetchedAt, hash, note });
    return id;
  };
  const snapshotOf = new Map<string, string>();
  const newOrganisations = new Map<string, ReturnType<typeof organisationIdentity>>();

  for (const row of sitting) {
    const idm = Number(row.key?.match(/idm(\d+)/)?.[1]);
    if (row.open_groups === 0) {
      const roster = rosters[row.chamber];
      const label = roster && idm ? roster.groups.get(idm) : undefined;
      const group = label ? matchGroup(label, groups.filter((candidate) => candidate.chamber === row.chamber)) : undefined;
      if (!label) plan.skipped.push({ name: row.display_name, reason: roster ? "the roster lists no group for this member" : `no saved ${row.chamber} roster page` });
      else if (!group) plan.skipped.push({ name: row.display_name, reason: `the roster group "${label}" is not one of our groups` });
      else {
        plan.groupMemberships.push({ id: `group-membership-${row.id}-${group.id}-${row.starts_on}`, memberId: row.id, name: row.display_name, groupId: group.id, startsOn: row.starts_on, rosterLabel: label });
        snapshotOf.set(`group:${row.id}`, need("roster", roster!.url, roster!.fetchedOn, roster!.hash, "official roster list"));
      }
    }
    if (row.open_parties === 0 && row.key) {
      const profile = profiles.get(row.key);
      if (!profile) continue;
      let organisation: string | undefined;
      try {
        organisation = parseMinorityOrganisation(await readFile(profile.htmlPath, "utf8"));
      } catch {
        organisation = undefined;
      }
      if (!organisation) continue;
      const identity = organisationIdentity(organisation, organisation.length <= 24 ? organisation : organisation.split(/\s+/).map((word) => word[0]).join("").toUpperCase().slice(0, 6));
      const newParty = !existingParties.has(identity.id);
      if (newParty) newOrganisations.set(identity.id, identity);
      plan.affiliations.push({ id: `party-affiliation-${row.id}-${identity.id}-${row.starts_on}`, memberId: row.id, name: row.display_name, partyId: identity.id, organisation: identity.name, startsOn: row.starts_on, newParty });
      snapshotOf.set(`party:${row.id}`, need("profile", profile.url, profile.fetchedAt, profile.contentHash, "profile page: organisation of a national-minority member"));
    }
  }

  const result: SeatLinkResult = {
    ...plan,
    persisted: false,
    summary: { sittingMembers: sitting.length, withoutGroup: sitting.filter((row) => row.open_groups === 0).length, groupsToAdd: plan.groupMemberships.length, organisationLinksToAdd: plan.affiliations.length, newOrganisations: newOrganisations.size }
  };
  if (!options.persist) return result;

  await db.transaction(async (tx) => {
    for (const snapshot of snapshots.values()) {
      await tx.execute(sql`
        insert into source_snapshots (id, source_url, fetched_at, content_hash, parser, parser_version, status, notes)
        values (${snapshot.id}, ${snapshot.url}, ${snapshot.fetchedAt}, ${snapshot.hash}, 'repair-current-seat-links', '1', 'parsed', ${snapshot.note})
        on conflict (content_hash) do nothing`);
    }
    const idOfHash = async (hash: string) => [...(await tx.execute<{ id: string }>(sql`select id from source_snapshots where content_hash = ${hash}`))][0]?.id;
    for (const identity of newOrganisations.values()) {
      await tx.execute(sql`
        insert into parties (id, slug, short_name, name, color, kind, full_name_known)
        values (${identity.id}, ${identity.slug}, ${identity.shortName}, ${identity.name}, '#64748b', ${identity.kind}, ${identity.fullNameKnown})
        on conflict (id) do nothing`);
    }
    for (const item of plan.groupMemberships) {
      const snapshotId = await idOfHash(snapshots.get(snapshotOf.get(`group:${item.memberId}`)!)!.hash);
      await tx.execute(sql`
        insert into member_group_memberships (id, member_id, group_id, starts_on, starts_on_precision, current_snapshot_on, source_snapshot_id)
        values (${item.id}, ${item.memberId}, ${item.groupId}, ${item.startsOn}, 'day', ${new Date().toISOString().slice(0, 10)}, ${snapshotId ?? null})
        on conflict (id) do nothing`);
    }
    for (const item of plan.affiliations) {
      const snapshotId = await idOfHash(snapshots.get(snapshotOf.get(`party:${item.memberId}`)!)!.hash);
      await tx.execute(sql`
        insert into member_party_affiliations (id, member_id, party_id, starts_on, starts_on_precision, source_snapshot_id)
        values (${item.id}, ${item.memberId}, ${item.partyId}, ${item.startsOn}, 'day', ${snapshotId ?? null})
        on conflict (id) do nothing`);
    }
  });
  result.persisted = true;
  return result;
}
