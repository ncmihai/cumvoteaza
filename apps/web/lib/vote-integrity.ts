import type { IndividualVote, VoteTotals } from "@cumsevoteaza/parliament-model";

/** Preserve a person once. Conflicting source rows must not select a winner. */
export function uniqueNominalVotes(rows: IndividualVote[]): IndividualVote[] {
  const members = new Map<string, IndividualVote>();
  for (const row of rows) {
    const previous = members.get(row.memberId);
    members.set(row.memberId, previous ? {
      ...previous,
      choice: previous.choice === row.choice ? row.choice : "unknown",
      groupId: previous.groupId === row.groupId ? row.groupId : undefined
    } : row);
  }
  return [...members.values()];
}

export function reconcileVoteSeats(rows: IndividualVote[], totals: VoteTotals, capacity?: number): boolean {
  if (!rows.length || new Set(rows.map((row) => row.memberId)).size !== rows.length) return false;
  if (rows.some((row) => row.choice === "unknown")) return false;
  if (capacity !== undefined && rows.length !== capacity) return false;
  const count = (choice: IndividualVote["choice"]) => rows.filter((row) => row.choice === choice).length;
  if (totals.absent !== undefined && count("absent") !== totals.absent) return false;
  const pairs = [[count("for"), totals.for], [count("against"), totals.against],
    [count("abstention"), totals.abstention], [count("present_not_voting"), totals.presentNotVoting],
    [count("for") + count("against") + count("abstention") + count("present_not_voting"), totals.present]];
  return pairs.every(([actual, expected]) => expected !== undefined && actual === expected);
}
