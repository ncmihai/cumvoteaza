import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { runBillCoverageReport } from "./run-bills-seats";
import { runCoverageReport } from "./run-report";

export interface CoverageSnapshotRow { id: "votes" | "bills"; rangeFrom: string; rangeTo: string; payload: unknown }

/**
 * Sprint 8: what the official lists say against what we hold (votes since the start of the legislature, bills of the given years), read from the saved
 * official lists and the database, optionally written to `coverage_snapshots` for the methodology page. Offline apart from the database.
 */
export async function publishCoverage(options: { repoRoot: string; today: string; from: string; years: number[]; persist: boolean }): Promise<CoverageSnapshotRow[]> {
  const { today, from, years } = options;
  const votes = await runCoverageReport({ repoRoot: options.repoRoot, from, to: today, today });
  const bills = await runBillCoverageReport({ repoRoot: options.repoRoot, years, today });
  const snapshots: CoverageSnapshotRow[] = [
    { id: "votes", rangeFrom: from, rangeTo: today, payload: { totals: votes.report.totals, months: votes.report.rows.map((row) => ({ month: row.month, chamber: row.chamber, official: row.official, held: row.held, missing: row.missing, percent: row.percent })), daysFetched: votes.report.daysFetched, tests: votes.report.rows.reduce((sum, row) => sum + (row.tests ?? 0), 0), totalsMismatches: votes.report.totalsMismatches.length, storedNotOnOfficialList: votes.report.storedNotOnOfficialList.length, storedUnverifiable: votes.report.storedUnverifiable.count } },
    { id: "bills", rangeFrom: `${years[0]}-01-01`, rangeTo: `${years.at(-1)}-12-31`, payload: { rows: bills.report.rows.map((row) => ({ chamber: row.chamber, year: row.year, official: row.official, held: row.held, missing: row.missing, percent: row.percent })), listCountMismatches: bills.report.listCountMismatches.length, missingLists: bills.missingLists } }
  ];
  if (options.persist) {
    const session = createDbSession();
    try {
      for (const item of snapshots) {
        await session.db.execute(sql`
          insert into coverage_snapshots (id, generated_on, range_from, range_to, payload, published_at)
          values (${item.id}, ${today}::date, ${item.rangeFrom}::date, ${item.rangeTo}::date, ${JSON.stringify(item.payload)}::jsonb, now())
          on conflict (id) do update set generated_on = excluded.generated_on, range_from = excluded.range_from, range_to = excluded.range_to, payload = excluded.payload, published_at = excluded.published_at`);
      }
    } finally {
      await session.close();
    }
  }
  return snapshots;
}
