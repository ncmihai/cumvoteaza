import { sql } from "drizzle-orm";
import type { IndividualVote } from "@cumsevoteaza/parliament-model";

interface Executor {
  execute: (query: ReturnType<typeof sql>) => PromiseLike<ArrayLike<unknown>>;
}

/** One choice per member per vote; when an importer repeats a pair, the last one wins (as the old id-keyed upsert did). */
export function dedupeIndividualVotes(votes: IndividualVote[]): IndividualVote[] {
  const byPair = new Map<string, IndividualVote>();
  for (const vote of votes) byPair.set(`${vote.voteId}\u0000${vote.memberId}`, vote);
  return [...byPair.values()];
}

const BATCH = 1000;

/**
 * Writes individual votes to the compact table (D-023). Votes, members and groups are looked up by their text
 * ids; a row whose vote or member does not exist fails the import, as the foreign key did before.
 */
export async function upsertIndividualVoteRows(db: Executor, votes: IndividualVote[]): Promise<number> {
  const rows = dedupeIndividualVotes(votes);
  let written = 0;
  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);
    const payload = JSON.stringify(batch.map((vote) => ({ vote_id: vote.voteId, member_id: vote.memberId, group_id: vote.groupId ?? null, choice: vote.choice, vote_method: vote.voteMethod ?? null })));
    const result = await db.execute(sql`
      insert into individual_vote_rows (vote_num, member_num, group_num, choice, vote_method)
      select v.num, m.num, g.num, d.choice::vote_choice, d.vote_method
      from jsonb_to_recordset(${payload}::jsonb) as d(vote_id text, member_id text, group_id text, choice text, vote_method text)
      join votes v on v.id = d.vote_id
      join members m on m.id = d.member_id
      left join parliamentary_groups g on g.id = d.group_id
      on conflict (vote_num, member_num) do update
        set group_num = excluded.group_num, choice = excluded.choice, vote_method = excluded.vote_method
      returning vote_num`);
    if (result.length !== batch.length) {
      throw new Error(`Individual votes: wrote ${result.length} of ${batch.length} rows; a vote or member in the batch does not exist.`);
    }
    written += result.length;
  }
  return written;
}
