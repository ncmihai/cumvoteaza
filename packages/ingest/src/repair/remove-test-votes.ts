import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

export interface TestVoteRemoval {
  votes: Array<{ id: string; num: number; heldOn: string; title: string; chamber: string; present: number }>;
  counts: { individualRows: number; groupTotals: number; coverageSummaries: number; explanations: number };
  backupFile?: string;
}

/**
 * The Chamber's own "vot test" ballots (system tests of the voting machine) were imported before the vote gate learned to leave them out. They are
 * not parliamentary acts, yet they count in every member's activity and show in the lists. This lists them (dry run) or removes them with everything that
 * hangs on them, after saving the rows to a file under data/imports so the removal can be undone by hand. Run `refresh-read-models` afterwards.
 */
export async function removeTestVotes(db: DbClient, options: { persist: boolean; repoRoot: string }): Promise<TestVoteRemoval> {
  const votes = [...(await db.execute<{ id: string; num: number; held_on: string; title: string; chamber: string; present: number }>(sql`
    select id, num, held_on::text, title, chamber::text, present from votes where lower(trim(title)) = 'vot test' order by held_on, num`))];
  const result: TestVoteRemoval = { votes: votes.map((vote) => ({ id: vote.id, num: vote.num, heldOn: vote.held_on, title: vote.title, chamber: vote.chamber, present: vote.present })), counts: { individualRows: 0, groupTotals: 0, coverageSummaries: 0, explanations: 0 } };
  if (votes.length === 0) return result;
  const ids = sql.join(votes.map((vote) => sql`${vote.id}`), sql`, `);
  const nums = sql.join(votes.map((vote) => sql`${vote.num}`), sql`, `);
  const count = async (query: ReturnType<typeof sql>) => [...(await db.execute<{ n: number }>(query))][0]?.n ?? 0;
  result.counts = {
    individualRows: await count(sql`select count(*)::int as n from individual_vote_rows where vote_num in (${nums})`),
    groupTotals: await count(sql`select count(*)::int as n from group_vote_totals where vote_id in (${ids})`),
    coverageSummaries: await count(sql`select count(*)::int as n from vote_coverage_summaries where vote_id in (${ids})`),
    explanations: await count(sql`select count(*)::int as n from vote_explanations where vote_id in (${ids})`)
  };
  if (!options.persist) return result;

  const backup = {
    removedAt: new Date().toISOString(),
    votes: [...(await db.execute(sql`select * from votes where id in (${ids})`))],
    individualVoteRows: [...(await db.execute(sql`select * from individual_vote_rows where vote_num in (${nums})`))],
    groupVoteTotals: [...(await db.execute(sql`select * from group_vote_totals where vote_id in (${ids})`))],
    voteCoverageSummaries: [...(await db.execute(sql`select * from vote_coverage_summaries where vote_id in (${ids})`))],
    voteExplanations: [...(await db.execute(sql`select * from vote_explanations where vote_id in (${ids})`))]
  };
  const dir = path.join(options.repoRoot, "data", "imports");
  await mkdir(dir, { recursive: true });
  result.backupFile = path.join(dir, `removed-test-votes-${backup.removedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(result.backupFile, JSON.stringify(backup, null, 2));
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from individual_vote_rows where vote_num in (${nums})`);
    await tx.execute(sql`delete from group_vote_totals where vote_id in (${ids})`);
    await tx.execute(sql`delete from vote_coverage_summaries where vote_id in (${ids})`);
    await tx.execute(sql`delete from vote_explanations where vote_id in (${ids})`);
    await tx.execute(sql`delete from votes where id in (${ids})`);
  });
  return result;
}
