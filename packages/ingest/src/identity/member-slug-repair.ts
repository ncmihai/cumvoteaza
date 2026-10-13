import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

const SOURCE_KEY = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * A member whose name another record also carries gets the record's id after the name ("emil-boc-deputies-2012-12"). The Senate members of 2020 to 2024 got the source's key
 * instead ("aurel-oprinoiu-senate-4fc59328-a7c5-40d2-ad99-27599b0bd880"), because the page that created them knew no other id. This is the slug the id gives; undefined for a slug that is fine.
 */
export function tidySlug(slug: string, id: string): string | undefined {
  const match = new RegExp(`^(.+)-(?:senate|deputies)-${SOURCE_KEY}$`).exec(slug);
  return match ? `${match[1]}-${id.replace(/^member-/, "")}` : undefined;
}

export interface MemberSlugRepairResult {
  persisted: boolean;
  slugs: Array<{ id: string; from: string; to: string }>;
  skipped: Array<{ id: string; slug: string; reason: string }>;
}

/** Renames those slugs and keeps the old address working: the old slug becomes a "member-slug" alias, which the member page answers with a permanent redirect. Dry run unless `persist`. */
export async function tidyMemberSlugs(db: DbClient, options: { persist: boolean }): Promise<MemberSlugRepairResult> {
  const rows = [...(await db.execute<{ id: string; slug: string }>(sql`select id, slug from members where slug ~ ${`-(senate|deputies)-${SOURCE_KEY}$`}`))];
  const taken = new Set([...(await db.execute<{ slug: string }>(sql`select slug from members`))].map((row) => row.slug));
  const result: MemberSlugRepairResult = { persisted: options.persist, slugs: [], skipped: [] };
  for (const row of rows) {
    const to = tidySlug(row.slug, row.id);
    if (!to) continue;
    if (taken.has(to)) { result.skipped.push({ id: row.id, slug: row.slug, reason: `the slug ${to} is taken` }); continue; }
    taken.add(to);
    result.slugs.push({ id: row.id, from: row.slug, to });
  }
  if (options.persist) {
    await db.transaction(async (tx) => {
      for (const item of result.slugs) {
        await tx.execute(sql`update members set slug = ${item.to} where id = ${item.id}`);
        await tx.execute(sql`insert into id_aliases (alias_id, canonical_id, kind, reason) values (${`slug:${item.from}`}, ${item.id}, 'member-slug', 'profile address tidied: the source key replaced by the record id') on conflict (alias_id) do nothing`);
      }
    });
  }
  return result;
}
