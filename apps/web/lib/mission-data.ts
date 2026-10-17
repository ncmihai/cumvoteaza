import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";
import { placeOf } from "./places";

/** D-059: Romania's missions abroad and who the Foreign Affairs ministry's own page of each names as head (tables `foreign_missions` and `mission_heads`), gathered by the place a country heading is. */
export interface MissionHeadView {
  missionId: string;
  missionName: string;
  missionKind: string;
  name: string;
  role: string;
  headKind: string;
  firstSeenOn: string;
  lastSeenOn: string;
  sourceUrl: string;
  /** Named on the latest reading of that mission's page (a person who is no longer on it keeps an older last day). */
  inLatestReading: boolean;
}

export interface PlaceMissions {
  readOn: string;
  missions: Array<{ id: string; name: string; kind: string; url?: string }>;
  coveredBy?: { text: string; url?: string };
  heads: MissionHeadView[];
}

async function load(): Promise<Record<string, PlaceMissions>> {
  if (!process.env.DATABASE_URL) return {};
  const session = createWebDbSession();
  try {
    const missions = [...(await session.db.execute<{ id: string; country_name: string; official_name: string | null; name: string; kind: string; url: string | null; read_on: string }>(sql`select id, country_name, official_name, name, kind, url, read_on::text as read_on from foreign_missions`))];
    const heads = [...(await session.db.execute<{ mission_id: string; name_text: string; role_text: string; head_kind: string; first_seen_on: string; last_seen_on: string; source_url: string }>(sql`select mission_id, name_text, role_text, head_kind, first_seen_on::text as first_seen_on, last_seen_on::text as last_seen_on, source_url from mission_heads`))];
    const missionById = new Map(missions.map((row) => [row.id, row]));
    const latestByMission = new Map<string, string>();
    for (const head of heads) if ((latestByMission.get(head.mission_id) ?? "") < head.last_seen_on) latestByMission.set(head.mission_id, head.last_seen_on);
    const result: Record<string, PlaceMissions> = {};
    const placeKey = (row: { country_name: string; official_name: string | null }) => (placeOf(row.country_name) ?? (row.official_name ? placeOf(row.official_name) : undefined))?.key;
    for (const row of missions) {
      const key = placeKey(row);
      if (!key) continue;
      const entry = result[key] ?? (result[key] = { readOn: row.read_on, missions: [], heads: [] });
      if (row.kind === "covered_by") entry.coveredBy = { text: row.name, ...(row.url ? { url: row.url } : {}) };
      else entry.missions.push({ id: row.id, name: row.name, kind: row.kind, ...(row.url ? { url: row.url } : {}) });
    }
    for (const head of heads) {
      const mission = missionById.get(head.mission_id);
      const key = mission ? placeKey(mission) : undefined;
      if (!mission || !key) continue;
      result[key]!.heads.push({ missionId: mission.id, missionName: mission.name, missionKind: mission.kind, name: head.name_text, role: head.role_text, headKind: head.head_kind, firstSeenOn: head.first_seen_on, lastSeenOn: head.last_seen_on, sourceUrl: head.source_url, inLatestReading: latestByMission.get(head.mission_id) === head.last_seen_on });
    }
    return result;
  } finally {
    await session.close();
  }
}

const cached = unstable_cache(() => timed("data.missions", load), ["mission-data-v1"], { revalidate: 3600, tags: [CACHE_TAGS.governments] });

export async function getMissionsByPlace(): Promise<Record<string, PlaceMissions>> {
  try {
    return await cached();
  } catch {
    return {};
  }
}
