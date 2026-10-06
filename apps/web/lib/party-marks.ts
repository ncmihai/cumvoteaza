import { sql } from "drizzle-orm";
import { createWebDbSession } from "./server-db";

export interface GroupMark {
  shortName: string;
  color: string;
  logoAssetId?: string;
}

/**
 * The mark of each parliamentary group: its party's logo where one party clearly owns an image (D-029), otherwise a monogram in the group's colour.
 * A group with no party (the unaffiliated, the national minorities) has no logo and keeps its own name and colour.
 */
export async function getGroupMarks(groups: Array<{ id: string; partyId?: string; shortName: string; color: string }>): Promise<Record<string, GroupMark>> {
  const marks: Record<string, GroupMark> = Object.fromEntries(groups.map((group) => [group.id, { shortName: group.shortName, color: group.color }]));
  const partyIds = [...new Set(groups.map((group) => group.partyId).filter((id): id is string => Boolean(id)))];
  if (partyIds.length === 0 || !process.env.DATABASE_URL) return marks;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ id: string; short_name: string; logo_asset_id: string | null }>(sql`
      select id, short_name, logo_asset_id from parties where id in (${sql.join(partyIds.map((id) => sql`${id}`), sql`, `)})`))];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const group of groups) {
      const party = group.partyId ? byId.get(group.partyId) : undefined;
      if (party) marks[group.id] = { shortName: party.short_name, color: group.color, logoAssetId: party.logo_asset_id ?? undefined };
    }
    return marks;
  } catch {
    return marks;
  } finally {
    await session.close();
  }
}
