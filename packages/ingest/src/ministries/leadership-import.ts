import path from "node:path";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { RawCache, decodeOfficialBytes } from "../coverage/raw-cache";
import { MINISTRY_PAGES, pageKey } from "./sites-fetch";
import { parseLeadership } from "./leadership-parse";

/**
 * D-056: the saved leadership pages of the ministries read into `ministry_leadership`. Nothing is requested. A row is "the ministry's page listed this person in this post on this day": reading the same page again
 * moves `last_seen_on` forward and never `first_seen_on` back, and a person who is no longer on the page keeps the older `last_seen_on`, which is how a change shows. A person is tied to a `people` row only when the
 * printed name has exactly the words of one person's name (in any order); otherwise the row has no person and the name stays as printed.
 */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The words of a name, in alphabetical order, so that "Munteanu Codrin-Dumitru" and "Codrin Dumitru Munteanu" are one key. */
export const nameKey = (name: string) => fold(name).split(" ").filter(Boolean).sort().join(" ");

export const leadershipId = (ministrySlug: string, name: string, kind: string) => `mlead-${ministrySlug}-${createHash("sha256").update(`${nameKey(name)}|${kind}`).digest("hex").slice(0, 12)}`;

export interface ImportLeadershipResult {
  persisted: boolean;
  pages: number;
  entries: number;
  tiedToAPerson: number;
  byMinistry: Array<{ ministry: string; readOn: string; entries: number; postsWithoutName: number }>;
  rowsWritten: number;
}

export async function importMinistryLeadership(db: DbClient, options: { repoRoot: string; persist: boolean; log?: (line: string) => void }): Promise<ImportLeadershipResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: ImportLeadershipResult = { persisted: options.persist, pages: 0, entries: 0, tiedToAPerson: 0, byMinistry: [], rowsWritten: 0 };
  const ministries = new Map([...(await db.execute<{ id: string; slug: string }>(sql`select id, slug from ministries`))].map((row) => [row.slug, row.id]));
  const people = new Map<string, string[]>();
  for (const row of await db.execute<{ id: string; display_name: string }>(sql`select id, display_name from people`)) {
    const key = nameKey(row.display_name);
    people.set(key, [...(people.get(key) ?? []), row.id]);
  }
  const entriesByPage = await cache.entries("ministry-site");

  const rows: Array<typeof schema.ministryLeadership.$inferInsert> = [];
  const readAt = new Date();
  for (const page of MINISTRY_PAGES.filter((item) => item.page === "leadership")) {
    const ministryId = ministries.get(page.slug);
    const key = pageKey(page);
    const saved = await cache.read("ministry-site", key);
    const manifest = entriesByPage.get(key);
    if (!ministryId || !saved || !manifest) continue;
    const html = decodeOfficialBytes(saved);
    const parsed = parseLeadership(html);
    result.pages += 1;
    const readOn = manifest.fetchedAt.slice(0, 10);
    result.byMinistry.push({ ministry: page.slug, readOn, entries: parsed.entries.length, postsWithoutName: parsed.postsWithoutName });
    for (const entry of parsed.entries) {
      result.entries += 1;
      const candidates = people.get(nameKey(entry.name)) ?? [];
      const personId = candidates.length === 1 ? candidates[0]! : null;
      if (personId) result.tiedToAPerson += 1;
      rows.push({
        id: leadershipId(page.slug, entry.name, entry.kind), ministryId, nameText: entry.name, personId, roleText: entry.role, kind: entry.kind, sinceText: entry.since ?? null,
        firstSeenOn: readOn, lastSeenOn: readOn, sourceUrl: page.url, contentHash: manifest.sha256, readAt
      });
    }
  }
  if (!options.persist) return result;

  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    await db.insert(schema.ministryLeadership).values(chunk).onConflictDoUpdate({
      target: schema.ministryLeadership.id,
      set: {
        nameText: sql`excluded.name_text`, personId: sql`coalesce(excluded.person_id, ministry_leadership.person_id)`, roleText: sql`excluded.role_text`, kind: sql`excluded.kind`, sinceText: sql`excluded.since_text`,
        firstSeenOn: sql`least(ministry_leadership.first_seen_on, excluded.first_seen_on)`, lastSeenOn: sql`greatest(ministry_leadership.last_seen_on, excluded.last_seen_on)`,
        sourceUrl: sql`excluded.source_url`, contentHash: sql`excluded.content_hash`, readAt: sql`excluded.read_at`
      }
    });
    result.rowsWritten += chunk.length;
  }
  options.log?.(`${result.rowsWritten} rows written`);
  return result;
}
