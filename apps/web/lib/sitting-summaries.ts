import { desc } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import { createWebDbSession } from "./server-db";

export type SittingSummary = {
  id: string;
  heldOn: string;
  chamber: "joint" | "deputies" | "senate";
  voteCount: number;
  officialUrl: string;
};

/** D-022: votes the site does not store one by one (a joint sitting's article, annex and amendment votes). */
export async function getSittingSummaries(): Promise<SittingSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = await session.db.select().from(schema.voteSittingSummaries).orderBy(desc(schema.voteSittingSummaries.heldOn));
    return rows.map((row) => ({ id: row.id, heldOn: row.heldOn, chamber: row.chamber, voteCount: row.voteCount, officialUrl: row.officialUrl }));
  } catch {
    // The table exists once migration 0036 is applied; until then the page simply has no such section.
    return [];
  } finally {
    await session.close();
  }
}
