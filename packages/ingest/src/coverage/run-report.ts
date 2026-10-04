import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { COVERAGE_RAW_DIR } from "./run-fetch";
import { loadOfficialVotes } from "./load-official-votes";
import { RawCache } from "./raw-cache";
import { readUnsupportedRegistry, unsupportedKeys } from "./unsupported-registry";
import { buildVoteCoverage, renderCoverageMarkdown, type StoredVoteRow, type VoteCoverageReport } from "./vote-coverage";

export async function loadStoredVotes(from: string, to: string): Promise<StoredVoteRow[]> {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<{
      id: string;
      chamber: StoredVoteRow["chamber"];
      held_on: string;
      present: number;
      for_count: number;
      against: number;
      abstention: number;
      present_not_voting: number;
      source_url: string | null;
    }>(sql`
      select v.id, v.chamber::text as chamber, to_char(v.held_on, 'YYYY-MM-DD') as held_on,
             v.present, v.for_count, v.against, v.abstention, v.present_not_voting, s.source_url
      from votes v left join source_snapshots s on s.id = v.source_snapshot_id
      where v.held_on between ${from} and ${to}`);
    return rows.map((row) => ({
      id: row.id,
      chamber: row.chamber,
      heldOn: row.held_on,
      present: row.present,
      forCount: row.for_count,
      against: row.against,
      abstention: row.abstention,
      presentNotVoting: row.present_not_voting,
      sourceUrl: row.source_url
    }));
  } finally {
    await session.close();
  }
}

export interface CoverageReportResult {
  report: VoteCoverageReport;
  unreadable: Array<{ kind: string; key: string; error: string }>;
  files: { json: string; markdown: string };
}

/** Offline: the saved official lists against the votes in the database (read-only). */
export async function runCoverageReport(options: { repoRoot: string; from: string; to: string; today: string }): Promise<CoverageReportResult> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const official = await loadOfficialVotes(cache, options.from, options.to);
  const stored = await loadStoredVotes(options.from, options.to);
  const report = buildVoteCoverage({ official: official.records, stored, range: { from: options.from, to: options.to }, daysFetched: official.daysFetched, unsupported: unsupportedKeys(await readUnsupportedRegistry(options.repoRoot)) });
  const dir = path.join(options.repoRoot, "data", "coverage", "reports");
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, `votes-coverage-${options.from}_${options.to}`);
  await writeFile(`${base}.json`, `${JSON.stringify({ generatedAt: options.today, ...report, unreadable: official.unreadable }, null, 2)}\n`);
  await writeFile(`${base}.md`, renderCoverageMarkdown(report, options.today));
  return { report, unreadable: official.unreadable, files: { json: `${base}.json`, markdown: `${base}.md` } };
}
