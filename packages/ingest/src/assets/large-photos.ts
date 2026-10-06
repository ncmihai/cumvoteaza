import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { indexProfiles } from "../repair/current-seat-links";
import type { AssetInventoryItem } from "../asset-import";

/** The larger portrait a profile page links from its photo ("/parlamentari/l2024/mari/Name.JPG"; the page itself shows a 150 px thumbnail). */
export function largePhotoPath(profileHtml: string): string | undefined {
  const match = /href=["'](\/parlamentari\/l\d{4}\/mari\/[^"']+\.(?:jpe?g|png))["']/i.exec(profileHtml);
  return match?.[1];
}

export interface LargePhotoPlan {
  items: AssetInventoryItem[];
  summary: { sitting: number; withLargeLink: number; withoutLargeLink: number; profileNotSaved: number; alreadyStored: number };
  outFile?: string;
}

/**
 * Sprint 11b: the Chamber publishes a 1200 x 1600 portrait of most members; we hold only the 150 px thumbnail. This lists the portraits to fetch for the
 * members of the legislature in office, from the profile pages already saved (no request is made here), as an inventory for `assets:import`. A member whose
 * large portrait is already stored is left out. The owner's run is then:
 *   npm run prod -- ingest:assets:import --assets=data/imports/large-photos-inventory.jsonl --photo-width=600 --photo-height=800 --delay-ms=3000 --persist
 */
export async function planLargePhotos(db: DbClient, options: { repoRoot: string; write: boolean }): Promise<LargePhotoPlan> {
  const sitting = [...(await db.execute<{ id: string; key: string | null; chamber: string; legislature_id: string }>(sql`
    select m.id, m.source_ids->>'cdepProfileKey' as key, mm.chamber::text as chamber, mm.legislature_id
    from members m join member_mandates mm on mm.member_id = m.id
    where mm.ends_on is null and mm.legislature_id = (select id from legislatures order by starts_on desc limit 1)`))];
  const stored = new Set([...(await db.execute<{ entity_id: string }>(sql`
    select entity_id from stored_assets where asset_type = 'photo' and variant = 'profile_600x800' and fetch_status = 'stored'`))].map((row) => row.entity_id));
  const profiles = await indexProfiles(options.repoRoot);
  const items: AssetInventoryItem[] = [];
  const summary = { sitting: sitting.length, withLargeLink: 0, withoutLargeLink: 0, profileNotSaved: 0, alreadyStored: 0 };
  for (const member of sitting) {
    if (stored.has(member.id)) { summary.alreadyStored += 1; continue; }
    const profile = member.key ? profiles.get(member.key) : undefined;
    if (!profile) { summary.profileNotSaved += 1; continue; }
    let html = "";
    try { html = await readFile(profile.htmlPath, "utf8"); } catch { summary.profileNotSaved += 1; continue; }
    const pathName = largePhotoPath(html);
    if (!pathName) { summary.withoutLargeLink += 1; continue; }
    summary.withLargeLink += 1;
    items.push({
      id: `asset-cdep-photo-large-${member.key}`,
      assetType: "photo",
      entityType: "member",
      entityId: member.id,
      legislatureId: member.legislature_id,
      chamber: member.chamber === "senate" ? "senate" : "deputies",
      officialUrl: `https://www.cdep.ro${pathName}`,
      sourceProfileUrl: profile.url
    });
  }
  const plan: LargePhotoPlan = { items, summary };
  if (options.write && items.length > 0) {
    const dir = path.join(options.repoRoot, "data", "imports");
    await mkdir(dir, { recursive: true });
    plan.outFile = path.join(dir, "large-photos-inventory.jsonl");
    await writeFile(plan.outFile, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`);
  }
  return plan;
}
