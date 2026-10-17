import path from "node:path";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { slugify } from "../parsers/utils";
import { nameKey } from "./leadership-import";
import { headedMissions, parseMissionHead, parseMissionList } from "./missions-parse";
import { pageKey } from "./sites-fetch";

/**
 * D-059 (Block 1c): the saved list of Romania's missions and the saved page of each embassy, permanent mission and consulate general, read into `foreign_missions` and `mission_heads`. Nothing is requested. A head is "the
 * ministry's page named this person in this post on this day": reading again moves `last_seen_on` forward and never `first_seen_on` back, and a person no longer on a page keeps the older `last_seen_on`.
 */
export interface ImportMissionsResult {
  persisted: boolean;
  listReadOn?: string;
  countries: number;
  missions: Array<{ kind: string; count: number }>;
  coveredCountries: number;
  headedMissions: number;
  pagesSaved: number;
  headsRead: number;
  tiedToAPerson: number;
  byHeadKind: Array<{ kind: string; count: number }>;
  /** Saved pages that name no one: a vacant post or a layout the reader does not know. */
  pagesWithoutHead: Array<{ country: string; mission: string }>;
  rowsWritten: { missions: number; heads: number };
}

export const headId = (missionId: string, name: string, kind: string) => `mhead-${missionId}-${createHash("sha256").update(`${nameKey(name)}|${kind}`).digest("hex").slice(0, 12)}`;

export async function importMissions(db: DbClient, options: { repoRoot: string; persist: boolean; log?: (line: string) => void }): Promise<ImportMissionsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: ImportMissionsResult = { persisted: options.persist, countries: 0, missions: [], coveredCountries: 0, headedMissions: 0, pagesSaved: 0, headsRead: 0, tiedToAPerson: 0, byHeadKind: [], pagesWithoutHead: [], rowsWritten: { missions: 0, heads: 0 } };
  const entries = await cache.entries("ministry-site");
  const listKey = pageKey({ slug: "externe", page: "missions", url: "" });
  const listBytes = await cache.read("ministry-site", listKey);
  const listEntry = entries.get(listKey);
  if (!listBytes || !listEntry) return result;
  const readOn = listEntry.fetchedAt.slice(0, 10);
  result.listReadOn = readOn;
  const countries = parseMissionList(decodeOfficialBytes(listBytes));
  result.countries = countries.length;

  const missionRows: Array<typeof schema.foreignMissions.$inferInsert> = [];
  const kinds = new Map<string, number>();
  for (const country of countries) {
    for (const mission of country.missions) {
      missionRows.push({ id: `mission-${mission.id}`, countryName: country.name, officialName: country.officialName ?? null, name: mission.name, kind: mission.kind, url: mission.url, readOn });
      kinds.set(mission.kind, (kinds.get(mission.kind) ?? 0) + 1);
    }
    if (country.coveredBy) {
      result.coveredCountries += 1;
      missionRows.push({ id: `covered-${slugify(country.name)}`, countryName: country.name, officialName: country.officialName ?? null, name: country.coveredBy.text, kind: "covered_by", url: country.coveredBy.id ? `https://mae.ro/romanian-missions/${country.coveredBy.id}` : null, readOn });
    }
  }
  result.missions = [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);

  const people = new Map<string, string[]>();
  for (const row of await db.execute<{ id: string; display_name: string }>(sql`select id, display_name from people`)) {
    const key = nameKey(row.display_name);
    people.set(key, [...(people.get(key) ?? []), row.id]);
  }
  const headed = headedMissions(countries);
  result.headedMissions = headed.length;
  const headRows: Array<typeof schema.missionHeads.$inferInsert> = [];
  const headKinds = new Map<string, number>();
  const readAt = new Date();
  for (const mission of headed) {
    const key = pageKey({ slug: "externe", page: `mission-${mission.id}`, url: mission.url });
    const bytes = await cache.read("ministry-site", key);
    const manifest = entries.get(key);
    if (!bytes || !manifest) continue;
    result.pagesSaved += 1;
    const head = parseMissionHead(decodeOfficialBytes(bytes));
    if (!head) { result.pagesWithoutHead.push({ country: mission.country, mission: mission.name }); continue; }
    result.headsRead += 1;
    headKinds.set(head.kind, (headKinds.get(head.kind) ?? 0) + 1);
    const candidates = people.get(nameKey(head.name)) ?? [];
    const personId = candidates.length === 1 ? candidates[0]! : null;
    if (personId) result.tiedToAPerson += 1;
    const seenOn = manifest.fetchedAt.slice(0, 10);
    headRows.push({ id: headId(mission.id, head.name, head.kind), missionId: `mission-${mission.id}`, countryName: mission.country, nameText: head.name, personId, roleText: head.role, headKind: head.kind, firstSeenOn: seenOn, lastSeenOn: seenOn, sourceUrl: mission.url, contentHash: manifest.sha256, readAt });
  }
  result.byHeadKind = [...headKinds].map(([kind, count]) => ({ kind, count }));
  if (!options.persist) return result;

  for (let start = 0; start < missionRows.length; start += 200) {
    const chunk = missionRows.slice(start, start + 200);
    await db.insert(schema.foreignMissions).values(chunk).onConflictDoUpdate({
      target: schema.foreignMissions.id,
      set: { countryName: sql`excluded.country_name`, officialName: sql`excluded.official_name`, name: sql`excluded.name`, kind: sql`excluded.kind`, url: sql`excluded.url`, readOn: sql`excluded.read_on` }
    });
    result.rowsWritten.missions += chunk.length;
  }
  for (let start = 0; start < headRows.length; start += 100) {
    const chunk = headRows.slice(start, start + 100);
    await db.insert(schema.missionHeads).values(chunk).onConflictDoUpdate({
      target: schema.missionHeads.id,
      set: {
        nameText: sql`excluded.name_text`, personId: sql`coalesce(excluded.person_id, mission_heads.person_id)`, roleText: sql`excluded.role_text`, headKind: sql`excluded.head_kind`,
        firstSeenOn: sql`least(mission_heads.first_seen_on, excluded.first_seen_on)`, lastSeenOn: sql`greatest(mission_heads.last_seen_on, excluded.last_seen_on)`,
        sourceUrl: sql`excluded.source_url`, contentHash: sql`excluded.content_hash`, readAt: sql`excluded.read_at`
      }
    });
    result.rowsWritten.heads += chunk.length;
  }
  options.log?.(`${result.rowsWritten.missions} missions and ${result.rowsWritten.heads} heads written`);
  return result;
}
