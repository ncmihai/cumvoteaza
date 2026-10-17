import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

/** The official photo we hold for each of these members (the smallest stored size, as the member pages use), as an address on our own asset route. Members without one are simply absent. */
export async function memberPhotoUrls(db: DbClient, memberIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return new Map();
  const rows = [...(await db.execute<{ entity_id: string; id: string }>(sql`
    select distinct on (entity_id) entity_id, id from stored_assets
    where entity_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and asset_type = 'photo' and fetch_status = 'stored'
    order by entity_id, coalesce(width, 0) asc, created_at desc`))];
  return new Map(rows.map((row) => [row.entity_id, `/api/assets/${encodeURIComponent(row.id)}`]));
}
