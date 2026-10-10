import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession } from "./server-db";
import { getElections, type ElectionInfo } from "./election-data";
import type { MapArea, MapList } from "./election-map";

export type { MapArea, MapList } from "./election-map";

/**
 * Sprint 17 (D-041): the polling-station results added up per commune, for the election map. A commune is `k`, its SIRUTA code (or "abroad:<country>"); `c` is its circumscription (1 to 41,
 * Bucharest 42, abroad 43). `r` are the voters on the permanent lists, `p` the voters who came, `v` the valid votes and `i` the null votes; `l` and `x` are the lists (by code) and their votes,
 * the largest first. The votes by mail belong to no place and are in the circumscription totals of the elections page, not here. Answers "nothing" when the tables are not there yet.
 */
export interface ElectionMapData {
  election: ElectionInfo;
  elections: ElectionInfo[];
  chamber: "deputies" | "senate";
  lists: MapList[];
  areas: MapArea[];
}

async function queryElectionMap(electionId: string | undefined, chamberInput: string | undefined): Promise<ElectionMapData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const db = session.db;
    // Only the elections whose commune results are there.
    const held = new Set([...(await db.execute<{ election_id: string }>(sql`select distinct election_id from election_area_results`))].map((row) => row.election_id));
    const withAreas = (await getElections()).filter((item) => held.has(item.id));
    if (withAreas.length === 0) return undefined;
    const election = withAreas.find((item) => item.id === electionId) ?? withAreas[0]!;
    const chamber = chamberInput === "senate" ? "senate" as const : "deputies" as const;
    const listRows = [...(await db.execute<{ code: number; name: string; independents: boolean; slug: string | null; color: string | null }>(sql`
      select l.code, l.name, l.independents, p.slug, p.color from election_lists l left join parties p on p.id = l.party_id where l.election_id = ${election.id} and l.chamber = ${chamber} order by l.code`))];
    if (listRows.length === 0) return undefined;
    const areaRows = [...(await db.execute<{ area_key: string; circumscription_number: number; name: string; sections: number; registered: number; present: number; valid: number; invalid: number; list_codes: number[]; list_votes: number[] }>(sql`
      select area_key, circumscription_number, name, sections, registered, present, valid, invalid, list_codes, list_votes from election_area_results where election_id = ${election.id} and chamber = ${chamber} order by area_key`))];
    const areas: MapArea[] = areaRows.map((row) => ({ k: row.area_key, c: Number(row.circumscription_number), n: row.name, s: row.sections, r: row.registered, p: row.present, v: row.valid, i: row.invalid, l: row.list_codes, x: row.list_votes }));
    const totals = new Map<number, number>();
    for (const area of areas) area.l.forEach((code, index) => totals.set(code, (totals.get(code) ?? 0) + area.x[index]!));
    const lists: MapList[] = listRows.map((row) => ({ code: row.code, name: row.name, independents: row.independents, ...(row.slug ? { partySlug: row.slug } : {}), ...(row.color ? { color: row.color } : {}), votes: totals.get(row.code) ?? 0 }));
    return { election, elections: withAreas, chamber, lists, areas };
  } finally {
    await session.close();
  }
}

// A failed read throws inside the cache, so that a database that is busy or a table that is not there yet is not remembered for an hour; the caller turns it into "nothing".
const cachedElectionMap = unstable_cache(async (electionId: string | undefined, chamber: string | undefined) => (await queryElectionMap(electionId, chamber)) ?? null, ["election-map-v1"], { revalidate: 3600, tags: [CACHE_TAGS.parties] });

export async function getElectionMapData(electionId?: string, chamber?: string): Promise<ElectionMapData | undefined> {
  try {
    return (await cachedElectionMap(electionId, chamber)) ?? undefined;
  } catch {
    return undefined;
  }
}
